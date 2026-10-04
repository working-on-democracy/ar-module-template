<script lang="ts">
// One control in the overlay's centre column. `html` is trusted, static
// markup from the port (label text, an inline <svg> icon, or
// ACTION_BUTTON_HTML). The control disappears once tapped unless `keep`.
export interface LegacyControl {
  id: string;
  html: string;
  onClick?: () => void;
  keep?: boolean;
}
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RECENTER_ICON } from "./legacy-ui-icons";

// The old 8th Wall projects' 2D UI (ui.js/ui.css + image-target-ui.js),
// rebuilt as a Vue overlay inside the module: a centre column of controls
// (start/audio/video buttons with their hint text) and an optional recenter
// button top right. Same look as the original CSS — fonts, colours, sizes,
// positions — but with inline styles, since a <style> block never reaches
// the host (README "Caveats").
//
// The recenter button sends `legacy-space-place` to the work's legacy-space
// hull, i.e. it re-places only this module (the original emitted a global
// XR8 `recenter`, see augmented-bahnhofsviertel/PORTING-GUIDE.md §6).
// Controls appear once the hull has been placed — the stand-in for the
// original's `realityready` — and while `ready` (e.g. assets loaded).
const props = withDefaults(
  defineProps<{
    hullId: string;
    center?: LegacyControl[];
    recenterButton?: boolean;
    ready?: boolean;
  }>(),
  { center: () => [], recenterButton: false, ready: true }
);

const placed = ref(false);
const dismissed = ref<string[]>([]);
let hull: HTMLElement | null = null;
const onPlaced = () => { placed.value = true; };

onMounted(() => {
  hull = document.getElementById(props.hullId);
  if ((hull as any)?.components?.["legacy-space"]?.placed) placed.value = true;
  hull?.addEventListener("legacy-space-placed", onPlaced);
});

onUnmounted(() => {
  hull?.removeEventListener("legacy-space-placed", onPlaced);
});

const visible = computed(() => props.ready && placed.value);
const centerControls = computed(() => props.center.filter((c) => !dismissed.value.includes(c.id)));

function tap(control: LegacyControl) {
  control.onClick?.();
  if (!control.keep) dismissed.value = [...dismissed.value, control.id];
}

function recenter() {
  hull?.dispatchEvent(new CustomEvent("legacy-space-place"));
}

// ui.css: #center-controls, #center-controls button, .action
const centerColumnStyle = {
  position: "fixed" as const,
  width: "200px",
  top: "30%",
  left: "calc(50% - 100px)",
  zIndex: "1000"
};
const centerButtonStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
  marginBottom: "1em",
  padding: "0",
  background: "transparent",
  border: "none",
  outline: "none",
  color: "#fff",
  fontFamily: "arial, sans-serif",
  fontSize: "18px",
  fontWeight: "bold",
  textTransform: "uppercase" as const,
  textAlign: "center" as const,
  cursor: "pointer"
};
// ui.css: #topright-controls, .marker-recenter
const topRightStyle = {
  position: "fixed" as const,
  top: "15px",
  right: "15px",
  zIndex: "1000"
};
const recenterButtonStyle = {
  display: "inline-block",
  width: "40px",
  height: "40px",
  padding: "0",
  background: "transparent",
  border: "none",
  outline: "none",
  cursor: "pointer",
  lineHeight: "0"
};
</script>

<template>
  <div v-if="visible && centerControls.length" :style="centerColumnStyle">
    <button
        v-for="control in centerControls"
        :key="control.id"
        type="button"
        :style="centerButtonStyle"
        @click="tap(control)"
        v-html="control.html"
    ></button>
  </div>
  <div v-if="visible && recenterButton" :style="topRightStyle">
    <button type="button" :style="recenterButtonStyle" aria-label="Recenter" @click="recenter" v-html="RECENTER_ICON"></button>
  </div>
</template>
