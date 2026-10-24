// Sloyd broker for the plant (Cloudflare Worker): holds the Sloyd key, so it
// never reaches the sandboxes on participants' devices. A sandbox sends its
// Sloyd job here with an access code; the worker checks the code and its
// quota and passes the job on with the key and our fixed settings. The
// finished file comes straight from Sloyd's public storage, no key needed.
// Later the plant's server takes this role (same codes, same rights).
//
//   GET  /v1/me                      the code's role and count
//   POST /v1/jobs/text-to-3d         { prompt }                → { jobId }
//   POST /v1/jobs/image-to-3d        the image as body (image/png, image/jpeg, image/webp) → { jobId }
//   GET  /v1/jobs/<jobId>            Sloyd's job status (only the code's own jobs)
//   GET  /admin                      the admin page; its API (x-admin-password):
//   GET|POST /v1/admin/codes, PATCH|DELETE /v1/admin/codes/<code>
//
// Codes live in KV (binding CODES) as code:<CODE> → { role, label, limit, used,
// blocked, createdAt, jobs }, their list as index:codes. Roles: "teilnehmer" (limit objects, plants only
// their own), "admin" (no limit, plants everything).
//
// Secrets: SLOYD_CLIENT_ID, SLOYD_CLIENT_SECRET, ADMIN_PASSWORD.
// Vars (wrangler.toml): SLOYD_FACES, SLOYD_TEXTURE, DEFAULT_LIMIT.
import ADMIN_PAGE from "./admin.html";

const SLOYD = "https://api.sloyd.ai/api";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
});
const fail = (status, error) => json({ error }, status);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "");
    if (req.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-plant-code, x-admin-password", "access-control-allow-methods": "GET, POST, PATCH, DELETE" } });
    try {
      if (path === "/admin" || path === "") return new Response(ADMIN_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
      if (path.startsWith("/v1/admin/")) return admin(req, env, path);
      if (path.startsWith("/v1/")) return participant(req, env, path);
      return fail(404, "unbekannt");
    } catch (e) {
      return fail(500, String(e && e.message || e));
    }
  },
};

// ---------------------------------------------------------------- codes

const normal = (code) => String(code || "").trim().toUpperCase();
const load = async (env, code) => { const v = await env.CODES.get(`code:${normal(code)}`); return v ? JSON.parse(v) : null; };
const save = (env, code, data) => env.CODES.put(`code:${normal(code)}`, JSON.stringify(data));
// The admin's list of codes. KV's own list() lags up to a minute behind writes (a deleted
// code still listed, a new one missing), a single key is current where it was written.
async function index(env) {
  const v = await env.CODES.get("index:codes");
  if (v) return JSON.parse(v);
  const codes = []; // first use: from list()
  let cursor;
  do {
    const page = await env.CODES.list({ prefix: "code:", cursor });
    codes.push(...page.keys.map((k) => k.name.slice(5)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  await setIndex(env, codes);
  return codes;
}
const setIndex = (env, codes) => env.CODES.put("index:codes", JSON.stringify([...new Set(codes)]));
const view = (code, c) => ({ code, role: c.role, label: c.label, limit: c.limit, used: c.used, blocked: c.blocked, createdAt: c.createdAt });

/** PFL-XXXX-XXXX from an alphabet without look-alikes */
function newCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = crypto.getRandomValues(new Uint8Array(8));
  const s = [...b].map((x) => abc[x % abc.length]).join("");
  return `PFL-${s.slice(0, 4)}-${s.slice(4)}`;
}

// ---------------------------------------------------------------- participants (sandboxes)

async function participant(req, env, path) {
  const code = normal(req.headers.get("x-plant-code"));
  const c = code && await load(env, code);
  if (!c) return fail(401, "Unbekannter Zugangscode.");
  if (c.blocked) return fail(403, "Dieser Zugangscode ist gesperrt.");
  if (path === "/v1/me" && req.method === "GET") return json(view(code, c));

  const job = path.match(/^\/v1\/jobs\/([\w-]+)$/);
  if (job && req.method === "GET") {
    if (c.role !== "admin" && !c.jobs.includes(job[1])) return fail(403, "Nicht dein Auftrag.");
    return sloyd(env, `/jobs/${job[1]}`);
  }

  if (path === "/v1/jobs/text-to-3d" || path === "/v1/jobs/image-to-3d") {
    if (req.method !== "POST") return fail(405, "POST");
    if (c.limit !== null && c.used >= c.limit) return fail(429, `Mit diesem Zugangscode sind schon ${c.used} von ${c.limit} Objekten erstellt.`);
    // our settings, whatever the sandbox asks for: a job always costs the same
    let init;
    if (path.endsWith("text-to-3d")) {
      const { prompt } = await req.json();
      if (!prompt || String(prompt).length > 1000) return fail(400, "Bitte eine Beschreibung schicken.");
      init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: String(prompt), targetFaceCount: Number(env.SLOYD_FACES), textureResolution: env.SLOYD_TEXTURE, topology: "auto", tPose: false }) };
    } else {
      const type = req.headers.get("content-type") || "";
      if (!/^image\/(png|jpeg|webp)$/.test(type)) return fail(400, "Bitte ein Bild (PNG, JPEG oder WebP) schicken.");
      const form = new FormData();
      form.append("file", new Blob([await req.arrayBuffer()], { type }), `bild.${type.split("/")[1]}`);
      form.append("targetFaceCount", String(env.SLOYD_FACES));
      form.append("textureResolution", env.SLOYD_TEXTURE);
      form.append("topology", "auto");
      init = { method: "POST", body: form };
    }
    const res = await sloyd(env, path.replace("/v1", ""), init);
    if (!res.ok) return res;
    const { jobId } = await res.clone().json();
    c.used += 1;
    c.jobs = [...c.jobs, jobId].slice(-200);
    await save(env, code, c);
    await env.CODES.put(`job:${jobId}`, code);
    return json({ jobId, used: c.used, limit: c.limit });
  }
  return fail(404, "unbekannt");
}

/** A request to Sloyd with our key; its answer passed on (402: not enough credits). */
async function sloyd(env, path, init = {}) {
  const res = await fetch(`${SLOYD}${path}`, { ...init, headers: { ...(init.headers || {}), "x-client-id": env.SLOYD_CLIENT_ID, "x-client-secret": env.SLOYD_CLIENT_SECRET } });
  const body = await res.text();
  if (res.status === 402) return fail(402, "Im Sloyd-Konto sind nicht genug Credits. Bitte bei der Workshop-Leitung melden.");
  return new Response(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json", "access-control-allow-origin": "*" } });
}

// ---------------------------------------------------------------- admin

async function admin(req, env, path) {
  const given = req.headers.get("x-admin-password") || "";
  if (!env.ADMIN_PASSWORD || !(await same(given, env.ADMIN_PASSWORD))) return fail(401, "Falsches Admin-Passwort.");
  if (path === "/v1/admin/codes" && req.method === "GET") {
    const codes = [], known = await index(env);
    for (const code of known) { const c = await load(env, code); if (c) codes.push(view(code, c)); }
    if (codes.length < known.length) await setIndex(env, codes.map((c) => c.code)); // gone meanwhile
    codes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ codes });
  }
  if (path === "/v1/admin/codes" && req.method === "POST") {
    const { count = 1, role = "teilnehmer", label = "", limit } = await req.json();
    const n = Math.max(1, Math.min(200, Number(count) || 1));
    const made = [];
    for (let i = 0; i < n; i++) {
      const code = newCode();
      const c = { role: role === "admin" ? "admin" : "teilnehmer", label: n > 1 && label ? `${label} ${i + 1}` : String(label), limit: role === "admin" ? null : Number(limit ?? env.DEFAULT_LIMIT), used: 0, blocked: false, createdAt: new Date().toISOString(), jobs: [] };
      await save(env, code, c);
      made.push(view(code, c));
    }
    await setIndex(env, [...(await index(env)), ...made.map((m) => m.code)]);
    return json({ codes: made });
  }
  const one = path.match(/^\/v1\/admin\/codes\/([\w-]+)$/);
  if (one) {
    const code = normal(one[1]), c = await load(env, code);
    if (!c) return fail(404, "Unbekannter Code.");
    if (req.method === "DELETE") {
      await env.CODES.delete(`code:${code}`);
      await setIndex(env, (await index(env)).filter((x) => x !== code));
      return json({ deleted: code });
    }
    if (req.method === "PATCH") {
      const p = await req.json();
      if ("blocked" in p) c.blocked = !!p.blocked;
      if ("used" in p) c.used = Math.max(0, Number(p.used) || 0);
      if ("limit" in p && c.role !== "admin") c.limit = Math.max(0, Number(p.limit) || 0);
      if ("label" in p) c.label = String(p.label);
      await save(env, code, c);
      return json(view(code, c));
    }
  }
  return fail(404, "unbekannt");
}

/** Comparison in constant time (the password is not guessable by timing). */
async function same(a, b) {
  const enc = new TextEncoder(), [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}
