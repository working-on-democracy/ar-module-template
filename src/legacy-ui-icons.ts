// Icons of the old 8th Wall projects' 2D UI (src/assets/ui/*.svg there),
// inlined as strings so LegacyOverlay.vue can render them without shipping
// them as manifest assets (everything in src/assets/ is injected into the
// host's <a-assets>) and without extra build config for raw imports.
//
// recenter.svg is byte-identical in all 17 projects that have it. Icons that
// vary per work (play/unlock buttons) live with the work instead.

export const RECENTER_ICON = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\" viewBox=\"0 0 40 40\">\n  <g id=\"recenter\" transform=\"translate(-42 -164.89)\">\n    <path id=\"Pfad_94\" data-name=\"Pfad 94\" d=\"M60.281,164.89h3.437v5.055a15,15,0,0,1,13.227,13.226H82v3.438H76.945a15,15,0,0,1-13.226,13.227v5.055H60.281v-5.056a15,15,0,0,1-13.227-13.226H42v-3.437h5.055a15,15,0,0,1,13.226-13.227Zm1.726,32.435a12.537,12.537,0,0,0,12.408-11.531A12.406,12.406,0,0,0,53.567,175.8a12.436,12.436,0,0,0,8.44,21.524Z\" transform=\"translate(0 0)\" fill=\"#fff\"/>\n    <path id=\"Pfad_95\" data-name=\"Pfad 95\" d=\"M218.824,348.4a6.667,6.667,0,1,1,6.665-6.551A6.636,6.636,0,0,1,218.824,348.4Z\" transform=\"translate(-156.831 -156.832)\" fill=\"#fff\"/>\n  </g>\n</svg>";

/**
 * The old blue "Start" button inside a hint label (ui.css `.action-button`),
 * as inline-styled markup for a LegacyControl's `html` — the old labels used
 * `<div class="action-button">Start</div>`, but class styles can't reach the
 * host (no <style> block there).
 */
export function actionButtonHtml(label: string): string {
  return `<div style="padding: .5em; background: #1d1eff; margin-top: .5em;">${label}</div>`;
}
