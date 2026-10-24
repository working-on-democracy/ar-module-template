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
function note() {
  $("note").textContent = `Sloyd mit ${settings.faces.toLocaleString("de-DE")} Flächen und ${settings.texture} px Textur, danach auf ${settings.target.toLocaleString("de-DE")} Dreiecke reduziert. Kostet etwa ${kind === "image" ? 20 : 25} Sloyd-Credits.`;
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
  } catch (x) {
    err.textContent = (x as Error).message || "Das hat nicht geklappt.";
    err.hidden = false;
  }
  btn.disabled = false;
};

function toast(text: string) {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 600); }, 5000);
}

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
