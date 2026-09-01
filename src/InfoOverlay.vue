<script setup lang="ts">
// Info button + explanation overlay — shared across all five AN ALLE!
// Themenfeld modules (archive-of-practice
// projects/an-alle/concepts/zwischen-basis.md), replacing the raycast-driven
// contextual-text idea for four of the five (kept only in the Sound-Player
// branch, which already has a tap-button system to extend). The author
// intends this to be proposed back into feature_template as a generic,
// reusable building block — unlike most of the AN ALLE!-specific pieces in
// this branch, that backport has real priority, not just "if there's time".
//
// Plain screen-space Vue UI, not an A-Frame component or entity — no gaze/
// raycast, no 3D placement, just a fixed 2D button toggling a fixed overlay.
import { computed, ref } from "vue";

// `fontFamily` (optional, 01.09.2026) — an AN ALLE! Themenfeld branch may
// pass its own project-wide font (see e.g. animationssystem-wanderer's own
// ArModule.vue, TUTORIAL_FONT_FAMILY) so every visible text/GUI element
// shares one look; defaults to the original plain system stack so any
// branch that doesn't pass it keeps its exact previous appearance.
// `heading` (optional, 01.09.2026) — an AN ALLE! Themenfeld branch may pass
// a short title shown above `text` (e.g. "Wandernde Soundelemente AR
// Demo"); omitted entirely (no empty heading space reserved) for any
// branch that doesn't pass one.
const props = defineProps<{ text: string; fontFamily?: string; heading?: string }>();
const open = ref(false);
const textFontFamily = computed(() => props.fontFamily ?? "sans-serif");
const iconFontFamily = computed(() => props.fontFamily ?? "serif");

const buttonStyle = computed(() => ({
  // Top-CENTRED (01.09.2026, Autor-Entscheidung, backported from
  // animationssystem-wanderer as the new shared default alongside the rest
  // of this component's own gold-standard usability polish — was top-right).
  position: "fixed" as const,
  top: "4%",
  left: "50%",
  transform: "translateX(-50%)",
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  border: "none",
  background: "rgba(0, 0, 0, 0.6)",
  color: "#ffffff",
  fontFamily: iconFontFamily.value,
  fontStyle: "italic" as const,
  fontSize: "18px",
  cursor: "pointer",
  zIndex: 1000
}));

const backdropStyle = {
  position: "fixed",
  inset: "0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0, 0, 0, 0.7)",
  zIndex: 1001
} as const;

const panelStyle = computed(() => ({
  maxWidth: "80%",
  padding: "6vw",
  borderRadius: "12px",
  background: "#ffffff",
  color: "#000000",
  fontFamily: textFontFamily.value,
  fontSize: "15px",
  lineHeight: "1.4"
}));

// pre-line (01.09.2026): lets a caller structure `text` into distinct
// sections (e.g. gesture controls, then a scene summary) via a literal
// blank line in the passed string, without needing to change this
// component's own template into multiple <p> tags.
const textStyle = { margin: "0", whiteSpace: "pre-line" as const };

const headingStyle = computed(() => ({
  margin: "0 0 3vw 0",
  fontFamily: textFontFamily.value,
  fontSize: "5.5vw",
  fontWeight: 700 as const,
  textAlign: "center" as const
}));

const closeButtonStyle = computed(() => ({
  display: "block",
  marginTop: "4vw",
  marginLeft: "auto",
  border: "none",
  borderRadius: "6px",
  padding: "2vw 4vw",
  background: "#000000",
  color: "#ffffff",
  fontFamily: textFontFamily.value,
  cursor: "pointer"
}));
</script>

<template>
  <button type="button" aria-label="Erklärung anzeigen" :style="buttonStyle" @click="open = true">i</button>
  <div v-if="open" :style="backdropStyle" @click="open = false">
    <div :style="panelStyle" @click.stop>
      <h2 v-if="heading" :style="headingStyle">{{ heading }}</h2>
      <p :style="textStyle">{{ text }}</p>
      <button type="button" :style="closeButtonStyle" @click="open = false">Schließen</button>
    </div>
  </div>
</template>