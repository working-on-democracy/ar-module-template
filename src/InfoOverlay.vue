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
import { ref } from "vue";

defineProps<{ text: string }>();
const open = ref(false);

const buttonStyle = {
  position: "fixed",
  top: "4%",
  right: "4%",
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  border: "none",
  background: "rgba(0, 0, 0, 0.6)",
  color: "#ffffff",
  fontFamily: "serif",
  fontStyle: "italic" as const,
  fontSize: "18px",
  cursor: "pointer",
  zIndex: 1000
} as const;

const backdropStyle = {
  position: "fixed",
  inset: "0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0, 0, 0, 0.7)",
  zIndex: 1001
} as const;

const panelStyle = {
  maxWidth: "80%",
  padding: "6vw",
  borderRadius: "12px",
  background: "#ffffff",
  color: "#000000",
  fontFamily: "sans-serif",
  fontSize: "15px",
  lineHeight: "1.4"
} as const;

const closeButtonStyle = {
  display: "block",
  marginTop: "4vw",
  marginLeft: "auto",
  border: "none",
  borderRadius: "6px",
  padding: "2vw 4vw",
  background: "#000000",
  color: "#ffffff",
  cursor: "pointer"
} as const;
</script>

<template>
  <button type="button" aria-label="Erklärung anzeigen" :style="buttonStyle" @click="open = true">i</button>
  <div v-if="open" :style="backdropStyle" @click="open = false">
    <div :style="panelStyle" @click.stop>
      <p style="margin: 0">{{ text }}</p>
      <button type="button" :style="closeButtonStyle" @click="open = false">Schließen</button>
    </div>
  </div>
</template>