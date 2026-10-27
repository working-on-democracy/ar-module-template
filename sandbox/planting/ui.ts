// The planting scene's screen overlay: plain DOM with inline styles (no <style>
// block, no framework), so the same code runs in the sandbox viewer and in the
// AR test scene (a module's <style> never reaches the host).

const FONT = '"Barlow", "Helvetica Neue", Arial, sans-serif';
export const C = {
  ink: "#1c221e", muted: "#5f6a63", panel: "rgba(255,255,255,0.94)", line: "#d3d8cf",
  accent: "#2e6a4c", ok: "#2f9e5a", bad: "#d64545", shade: "rgba(15,20,17,0.55)",
};

type Style = Partial<CSSStyleDeclaration>;
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, style: Style = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A full-screen layer that lets touches through except on its own controls (data-plant-ui). */
export function layer(z = 1000): HTMLDivElement {
  return el("div", { position: "fixed", inset: "0", pointerEvents: "none", zIndex: String(z), fontFamily: FONT, color: C.ink, fontSize: "15px", lineHeight: "1.35" });
}

/** Marks an element as a control: it takes touches, and gestures starting on it are ignored. */
export function control<T extends HTMLElement>(e: T): T {
  e.dataset.plantUi = "1";
  e.style.pointerEvents = "auto";
  return e;
}

export function button(label: string, kind: "primary" | "plain" | "danger" = "plain"): HTMLButtonElement {
  const fill = kind === "primary" ? C.accent : kind === "danger" ? C.bad : null; // danger: something that can't be undone
  const b = control(el("button", {
    font: `600 16px ${FONT}`, padding: "12px 18px", borderRadius: "10px", cursor: "pointer", minHeight: "48px",
    border: `1px solid ${fill ?? C.line}`,
    background: fill ?? "#fff", color: fill ? "#fff" : C.ink,
    flex: "1 1 0", touchAction: "manipulation",
  }, label));
  b.type = "button";
  return b;
}

export function setEnabled(b: HTMLButtonElement, on: boolean) {
  b.disabled = !on;
  b.style.opacity = on ? "1" : "0.4";
  b.style.cursor = on ? "pointer" : "default";
}

/** The bottom sheet every state shows its controls in. */
export function sheet(): HTMLDivElement {
  return control(el("div", {
    position: "absolute", left: "0", right: "0", bottom: "0", margin: "0 auto", maxWidth: "560px",
    background: C.panel, borderRadius: "16px 16px 0 0", boxShadow: "0 -4px 24px rgba(0,0,0,0.18)",
    padding: "14px 16px calc(14px + env(safe-area-inset-bottom))", display: "grid", gap: "12px", boxSizing: "border-box",
  }));
}

export function row(...children: HTMLElement[]): HTMLDivElement {
  const r = el("div", { display: "flex", gap: "10px" });
  r.append(...children);
  return r;
}

/** A modal question with two answers; resolves true for yes. */
export function confirmDialog(root: HTMLElement, title: string, text: string, yes: string, no = "Zurück", danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const shade = control(el("div", { position: "absolute", inset: "0", background: C.shade, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }));
    const box = el("div", { background: "#fff", borderRadius: "14px", padding: "20px", maxWidth: "380px", width: "100%", display: "grid", gap: "12px", boxShadow: "0 8px 40px rgba(0,0,0,0.3)" });
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    const h = el("div", { font: `600 19px ${FONT}` }, title);
    const p = el("div", { color: C.muted }, text);
    const bNo = button(no), bYes = button(yes, danger ? "danger" : "primary");
    const close = (v: boolean) => { shade.remove(); resolve(v); };
    bNo.onclick = () => close(false);
    bYes.onclick = () => close(true);
    box.append(h, p, row(bNo, bYes));
    shade.append(box);
    root.append(shade);
    (danger ? bNo : bYes).focus(); // Enter on a warning keeps things as they are
  });
}

/** A short notice that fades out by itself (not a dialog). */
export function toast(root: HTMLElement, text: string, ms = 4000) {
  const t = el("div", {
    position: "absolute", left: "50%", top: "calc(20px + env(safe-area-inset-top))", transform: "translateX(-50%)",
    background: "rgba(28,34,30,0.86)", color: "#fff", padding: "10px 16px", borderRadius: "999px", fontSize: "15px",
    maxWidth: "calc(100% - 32px)", textAlign: "center", transition: "opacity 0.5s ease", opacity: "0",
  }, text);
  t.setAttribute("role", "status");
  root.append(t);
  requestAnimationFrame(() => { t.style.opacity = "1"; });
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 600); }, ms);
}

/** Saves a file on the visitor's device (a download; on a phone the share or save sheet). */
export function saveFile(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { display: "none" });
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** The loading screen before the simulation: a note and a progress bar. */
export function loadingScreen(root: HTMLElement, text = "Die Pflanze wird vorbereitet") {
  const shade = control(el("div", { position: "absolute", inset: "0", background: "rgba(20,24,21,0.92)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "24px", transition: "opacity 0.4s ease" }));
  const label = el("div", { font: `600 20px ${FONT}`, textAlign: "center" }, text);
  const sub = el("div", { color: "rgba(255,255,255,0.7)", fontSize: "14px", textAlign: "center" }, "Einen Moment, es wird geladen …");
  const track = el("div", { width: "min(320px, 80vw)", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.2)", overflow: "hidden" });
  const fill = el("div", { width: "0%", height: "100%", background: "#fff", transition: "width 0.2s ease" });
  track.setAttribute("role", "progressbar");
  track.append(fill);
  shade.append(label, track, sub);
  root.append(shade);
  return {
    progress(f: number, note?: string) {
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
      track.setAttribute("aria-valuenow", String(Math.round(f * 100)));
      if (note) sub.textContent = note;
    },
    done() { shade.style.opacity = "0"; setTimeout(() => shade.remove(), 450); },
  };
}
