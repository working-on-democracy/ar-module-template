// The upload page for new objects (sandbox/objects/workshop.ts does the work):
// image or prompt, a name, then back to the empty form with a short notice; the
// list below follows every object until all its Keimling variants are ready.
import type { ObjectStatus } from "../objects/workshop";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let kind: "image" | "text" = "image";
let image: { data: string; name: string } | null = null;

function setKind(k: typeof kind) {
  kind = k;
  $("kind-image").setAttribute("aria-pressed", String(k === "image"));
  $("kind-text").setAttribute("aria-pressed", String(k === "text"));
  $("image-field").hidden = k !== "image";
  $("text-field").hidden = k !== "text";
  note();
}
$("kind-image").onclick = () => setKind("image");
$("kind-text").onclick = () => setKind("text");

let settings = { faces: 20000, texture: 2048, target: 7500 };
// Sloyd's API prices (https://www.sloyd.ai/api/pricing, checked 2026-10-24): textured image
// to 3D 20 credits, from a text +5; credits are bought in US dollars, 75 for 1 USD. Euros
// at about 0.9 per dollar, so the amount is only a rough guide.
const CREDITS = { image: 20, text: 25 };
const CREDITS_PER_USD = 75, EUR_PER_USD = 0.9;
function note() {
  const credits = CREDITS[kind], eur = (credits / CREDITS_PER_USD) * EUR_PER_USD;
  $("note").textContent = `Sloyd mit ${settings.faces.toLocaleString("de-DE")} Flächen und ${settings.texture} px Textur, danach auf ${settings.target.toLocaleString("de-DE")} Dreiecke reduziert. Kostet ${credits} Sloyd-Credits, ungefähr ${eur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €.`;
}

// image: click, keyboard or drop
const file = $<HTMLInputElement>("file"), drop = $("drop");
drop.onclick = () => file.click();
drop.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } };
drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = "var(--accent)"; };
drop.ondragleave = () => { drop.style.borderColor = ""; };
drop.ondrop = (e) => { e.preventDefault(); drop.style.borderColor = ""; if (e.dataTransfer?.files[0]) take(e.dataTransfer.files[0]); };
file.onchange = () => { if (file.files?.[0]) take(file.files[0]); };
function take(f: File) {
  const reader = new FileReader();
  reader.onload = () => {
    image = { data: String(reader.result), name: f.name };
    const img = $<HTMLImageElement>("preview");
    img.src = image.data; img.hidden = false;
    $("drop-text").textContent = f.name;
  };
  reader.readAsDataURL(f);
}

$<HTMLFormElement>("form").onsubmit = async (e) => {
  e.preventDefault();
  const err = $("error"), btn = $<HTMLButtonElement>("submit");
  err.hidden = true;
  btn.disabled = true;
  const label = $<HTMLInputElement>("label").value.trim();
  const body = kind === "image" ? { kind, label, image: image?.data, imageName: image?.name } : { kind, label, prompt: $<HTMLTextAreaElement>("prompt").value };
  try {
    const res = await fetch("/api/objects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const answer = await res.json();
    if (!res.ok) throw new Error(answer.error);
    // back to the start: an empty form and a short notice
    $<HTMLFormElement>("form").reset();
    image = null;
    $<HTMLImageElement>("preview").hidden = true;
    $("drop-text").textContent = "Bild wählen oder hierher ziehen (PNG, JPEG, WebP)";
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast(`„${label}“ wird verarbeitet und in die Datenbank übernommen.`);
    refresh();
    setTimeout(loadAccess, 15000); // the count, once the job went out
  } catch (x) {
    err.textContent = (x as Error).message || "Das hat nicht geklappt.";
    err.hidden = false;
  }
  btn.disabled = !mayCreate;
};

function toast(text: string) {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 600); }, 5000);
}

// ---------------------------------------------------------------- access: an access code, or our own Sloyd key

interface Access { mode: "code" | "key" | "none"; code?: string; role?: "teilnehmer" | "admin"; label?: string; used?: number; limit?: number | null; error?: string }
let mayCreate = false;
function showAccess(a: Access) {
  const state = $("access-state"), form = $("code-form");
  form.hidden = a.mode !== "none" && !a.error;
  if (a.mode === "key") { state.textContent = "Eigener Sloyd-Zugang (.env.local), ohne Begrenzung."; mayCreate = true; }
  else if (a.mode === "none") { state.textContent = "Um Objekte zu erstellen, brauchst du einen Zugangscode vom Workshop-Team."; mayCreate = false; }
  else {
    const left = a.limit === null || a.limit === undefined ? null : a.limit - (a.used ?? 0);
    mayCreate = !a.error && (left === null || left > 0);
    state.innerHTML = a.error ? `Zugangscode <b>${esc(a.code ?? "")}</b>: <span class="error">${esc(a.error)}</span>` :
      `Zugangscode <b>${esc(a.code ?? "")}</b>${a.label ? ` (${esc(a.label)})` : ""}: ` +
      (a.role === "admin" ? "Admin, ohne Begrenzung." : `${a.used} von ${a.limit} Objekten erstellt${left === 0 ? ", es sind keine mehr übrig" : ""}. Gepflanzt werden nur eigene Objekte, mindestens 3.`) +
      ` <button type="button" class="link" id="code-change">anderen Code eingeben</button>`;
    $("code-change")?.addEventListener("click", async () => showAccess(await (await fetch("/api/access", { method: "DELETE" })).json()));
  }
  $<HTMLButtonElement>("submit").disabled = !mayCreate;
}
$<HTMLFormElement>("code-form").onsubmit = async (e) => {
  e.preventDefault();
  const err = $("code-error");
  err.hidden = true;
  const res = await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: $<HTMLInputElement>("code").value }) });
  const a = await res.json();
  if (!res.ok) { err.textContent = a.error; err.hidden = false; return; }
  $<HTMLInputElement>("code").value = "";
  showAccess(a);
};
const loadAccess = async () => { try { showAccess(await (await fetch("/api/access")).json()); } catch { /* server restarting */ } };

const STATE: Record<ObjectStatus["state"], string> = {
  sloyd: "bei Sloyd", arbeitsfassung: "Arbeitsfassung", varianten: "Varianten", fertig: "fertig", fehler: "Fehler",
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function refresh() {
  try {
    const { objects, settings: s } = await (await fetch("/api/objects")).json() as { objects: ObjectStatus[]; settings: typeof settings };
    settings = s;
    note();
    $("objects").innerHTML = objects.length ? objects.map((o) => {
      const done = o.steps.filter((x) => x.state === "fertig").length, failed = o.steps.filter((x) => x.state === "fehler");
      const inPlanting = o.state === "varianten" || o.state === "fertig";
      return `<div class="object">
        <div><b>${esc(o.label)}</b> <span class="muted">${esc(o.name)}</span><span class="state ${o.state}">${STATE[o.state]}</span></div>
        <div class="muted">${o.kind === "image" ? "Bild" : "Text"}: ${esc(o.input)}${inPlanting ? " · in der Pflanzliste" : ""}</div>
        ${o.error ? `<div class="error">${esc(o.error.split("\n")[0])}</div>` : ""}
        ${o.steps.length ? `<div class="bar" title="Keimling-Varianten"><i style="width:${Math.round((done / o.steps.length) * 100)}%"></i></div>
        <details><summary>Varianten: ${done} von ${o.steps.length} fertig${failed.length ? `, ${failed.length} mit Fehler` : ""}</summary>
          ${o.steps.map((x) => `<div>${x.state === "fertig" ? "✓" : x.state === "läuft" ? "…" : x.state === "fehler" ? "✗" : "·"} ${esc(x.label)}${x.triangles ? ` (${x.triangles.toLocaleString("de-DE")} Dreiecke)` : ""}${x.error ? ` <span class="error">${esc(x.error.split("\n")[0])}</span>` : ""}</div>`).join("")}
        </details>` : ""}
      </div>`;
    }).join("") : `<span class="muted">noch keine</span>`;
  } catch { /* server restarting */ }
}
refresh();
setInterval(refresh, 3000);
setKind("image");
loadAccess();
