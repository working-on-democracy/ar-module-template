// Who may make new objects with Sloyd, and how (see sandbox/docs/WORKSHOP.md):
//   code  an access code from the workshop team: jobs go through the plant's Sloyd
//         broker (proxy/worker.js), which holds the key and counts the objects per code;
//         a participant code ("teilnehmer") makes at most its limit and plants only its
//         own objects, an admin code has no limit and plants everything
//   key   our own Sloyd key in .env.local (the team): straight to Sloyd, no limit
//   none  neither: the objects page asks for a code
// The code is kept in sandbox-objects/zugang.json (gitignored) with what the broker last said.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FILE = join(process.env.PLANT_OBJECTS_DIR ?? join(ROOT, "sandbox-objects"), "zugang.json");

/** The broker's address once it is set up (proxy/wrangler.toml); PLANT_PROXY_URL overrides it. */
export const DEFAULT_PROXY = "https://pflanze-sloyd.workingondemocracy.workers.dev";
export const proxyUrl = () => (process.env.PLANT_PROXY_URL ?? DEFAULT_PROXY).replace(/\/+$/, "");

export interface Access {
  mode: "code" | "key" | "none";
  code?: string;
  role?: "teilnehmer" | "admin";
  label?: string;
  used?: number;
  limit?: number | null;
  error?: string; // the broker could not be asked, or refused the code
}

const stored = (): Access | null => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : null);
const ownKey = () => {
  const env = join(ROOT, ".env.local");
  return existsSync(env) && /^SLOYD_CLIENT_ID=\S+/m.test(readFileSync(env, "utf8")) && /^SLOYD_CLIENT_SECRET=\S+/m.test(readFileSync(env, "utf8"));
};

/** What the broker says about a code. */
async function ask(code: string): Promise<Access> {
  if (!proxyUrl()) return { mode: "code", code, error: "Der Sloyd-Vermittler ist noch nicht eingerichtet (PLANT_PROXY_URL)." };
  try {
    const res = await fetch(`${proxyUrl()}/v1/me`, { headers: { "x-plant-code": code } });
    const me = await res.json();
    if (!res.ok) return { mode: "code", code, error: me.error ?? `Fehler ${res.status}` };
    return { mode: "code", code: me.code, role: me.role, label: me.label, used: me.used, limit: me.limit };
  } catch (e) {
    return { ...(stored() ?? {}), mode: "code", code, error: `Der Sloyd-Vermittler antwortet nicht (${(e as Error).message}).` };
  }
}

/** The access now, the code's count fresh from the broker. */
export async function access(): Promise<Access> {
  const s = stored();
  if (s?.code) {
    const a = await ask(s.code);
    if (!a.error) writeFileSync(FILE, JSON.stringify(a, null, 2));
    return a.error ? { ...s, error: a.error } : a;
  }
  return { mode: ownKey() ? "key" : "none" };
}

/** Takes a code if the broker knows it. Returns an error text or null. */
export async function setCode(code: string): Promise<string | null> {
  const a = await ask(String(code).trim().toUpperCase());
  if (a.error) return a.error;
  writeFileSync(FILE, JSON.stringify(a, null, 2));
  return null;
}

export const forgetCode = () => rmSync(FILE, { force: true });

/** The role as last known (without asking): a participant plants only their own objects. */
export const knownRole = () => stored()?.role ?? null;

/** For scripts/sloyd-generate.ts: with a code, through the broker. */
export function sloydEnv(): Record<string, string> {
  const s = stored();
  return s?.code ? { PLANT_ACCESS_CODE: s.code, PLANT_PROXY_URL: proxyUrl() } : {};
}

/** Whether a new object may be started now (a quick check; the broker counts for real). */
export function mayCreate(pending: number): string | null {
  const s = stored();
  if (s?.code) return s.limit !== null && s.limit !== undefined && (s.used ?? 0) + pending >= s.limit ? `Mit diesem Zugangscode sind schon ${s.limit} Objekte erstellt oder in Arbeit.` : null;
  return ownKey() ? null : "Bitte zuerst einen Zugangscode eingeben.";
}
