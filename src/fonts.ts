// AN ALLE! Zwischen-Basis (archive-of-practice
// projects/an-alle/concepts/zwischen-basis.md) — extracted from
// animationssystem-wanderer's own ArModule.vue (01.09.2026) into a shared
// module, since the author named it the gold standard for all five
// Themenfeld demos' tutorial/info-panel look. Google-Fonts-hosted
// "Atkinson Hyperlegible Next" — confirmed as the same font the "AN ALLE"
// heading on https://an-alle.net/ itself uses, from that site's own
// bundled CSS (`font-family:Atkinson Hyperlegible Next,Arial,Helvetica,
// sans-serif`).
//
// Injected via a plain <link>, NOT a component <style> block (s.
// README.md's own "Caveats" section — SFC <style> never ships to the
// host; a dynamically appended <link rel="stylesheet"> is plain DOM/JS,
// unaffected by that constraint). Guarded by its own id so calling this
// from more than one mounted module in the same host session (or
// re-mounting the same one) doesn't inject it twice.
export const TUTORIAL_FONT_FAMILY = "'Atkinson Hyperlegible Next', Arial, Helvetica, sans-serif";

export function ensureTutorialFontLoaded(): void {
  if (document.getElementById("an-alle-tutorial-font")) return;
  const link = document.createElement("link");
  link.id = "an-alle-tutorial-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@500;700&display=swap";
  document.head.appendChild(link);
}
