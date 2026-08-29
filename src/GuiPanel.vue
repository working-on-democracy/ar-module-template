<script setup lang="ts">
// Shared 2D parameter panel for AN ALLE!'s five Themenfeld modules — kept
// visually/behaviourally consistent across all of them per
// archive-of-practice projects/an-alle/concepts/zwischen-basis.md (decision
// 2: "GUI-Parameter/Ranges ... für jedes Themenfeld gemeinsam mit dem Autor
// entschieden"). A downstream branch imports this component as-is and only
// authors its own `controls` array — no fork of this file expected.
//
// A <style> block never ships to the host (see README "Caveats"), which
// rules out the usual CSS-pseudo-element trick for a two-thumb range slider
// (::-webkit-slider-thumb { pointer-events: auto } can't be expressed as an
// inline style — pseudo-elements have no DOM node an inline `style` attribute
// could target). The range-slider control below is therefore a from-scratch
// pointer-driven implementation, not two overlapping native <input
// type="range">s.
import { reactive } from "vue";
import type { GuiControl, RangeSliderControl } from "./gui-controls";

defineProps<{ controls: GuiControl[] }>();

const trackEls = reactive<Record<string, HTMLElement>>({});

function setTrackEl(id: string, el: Element | null) {
  if (el) trackEls[id] = el as HTMLElement;
}

function fmt(value: number, unit?: string): string {
  const rounded = Math.round(value * 100) / 100;
  return unit ? `${rounded}${unit}` : `${rounded}`;
}

function pctOf(value: number, min: number, max: number): number {
  return ((value - min) / (max - min)) * 100;
}

function valueAtClientX(control: RangeSliderControl, clientX: number): number {
  const track = trackEls[control.id];
  const rect = track.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const step = control.step ?? 1;
  const raw = control.min + ratio * (control.max - control.min);
  return Math.round(raw / step) * step;
}

// setPointerCapture on the thumb itself means pointermove/pointerup keep
// firing on that exact element for the rest of the drag, wherever the
// pointer physically goes — no document-level listener needed.
function onThumbPointerDown(e: PointerEvent) {
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onLowThumbMove(control: RangeSliderControl, e: PointerEvent) {
  if (e.buttons === 0) return;
  const value = Math.min(valueAtClientX(control, e.clientX), control.valueHigh);
  control.onInput(value, control.valueHigh);
}

function onHighThumbMove(control: RangeSliderControl, e: PointerEvent) {
  if (e.buttons === 0) return;
  const value = Math.max(valueAtClientX(control, e.clientX), control.valueLow);
  control.onInput(control.valueLow, value);
}

const panelStyle = {
  position: "fixed",
  left: "50%",
  bottom: "4%",
  transform: "translateX(-50%)",
  display: "flex",
  flexDirection: "column",
  gap: "3vw",
  width: "90%",
  maxWidth: "420px",
  padding: "4vw",
  borderRadius: "12px",
  background: "rgba(0, 0, 0, 0.6)",
  color: "#ffffff",
  fontFamily: "sans-serif",
  fontSize: "14px",
  boxSizing: "border-box" as const,
  zIndex: 1000
} as const;

const rowStyle = { display: "flex", flexDirection: "column" as const, gap: "1.5vw" };
const labelRowStyle = { display: "flex", justifyContent: "space-between" as const };
const buttonBaseStyle = {
  border: "none",
  borderRadius: "6px",
  padding: "1.5vw 3vw",
  background: "rgba(255, 255, 255, 0.15)",
  color: "#ffffff",
  cursor: "pointer"
} as const;
const activeButtonStyle = { ...buttonBaseStyle, background: "rgba(255, 255, 255, 0.9)", color: "#000000" };

const trackStyle = {
  position: "relative" as const,
  height: "4px",
  borderRadius: "2px",
  background: "rgba(255, 255, 255, 0.25)",
  margin: "3vw 0"
};

function thumbStyle(pct: number) {
  return {
    position: "absolute" as const,
    top: "50%",
    left: `${pct}%`,
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    background: "#ffffff",
    transform: "translate(-50%, -50%)",
    touchAction: "none" as const,
    cursor: "pointer"
  };
}
</script>

<template>
  <div :style="panelStyle">
    <div v-for="control in controls" :key="control.id" :style="rowStyle">

      <template v-if="control.type === 'slider'">
        <div :style="labelRowStyle">
          <span>{{ control.label }}</span>
          <span>{{ fmt(control.value, control.unit) }}</span>
        </div>
        <input
            type="range"
            :min="control.min"
            :max="control.max"
            :step="control.step ?? 1"
            :value="control.value"
            style="width: 100%"
            @input="control.onInput(Number(($event.target as HTMLInputElement).value))"
        />
      </template>

      <template v-else-if="control.type === 'range-slider'">
        <div :style="labelRowStyle">
          <span>{{ control.label }}</span>
          <span>{{ fmt(control.valueLow, control.unit) }} – {{ fmt(control.valueHigh, control.unit) }}</span>
        </div>
        <div :style="trackStyle" :ref="(el) => setTrackEl(control.id, el as Element | null)">
          <div
              :style="thumbStyle(pctOf(control.valueLow, control.min, control.max))"
              @pointerdown="onThumbPointerDown"
              @pointermove="onLowThumbMove(control, $event)"
          ></div>
          <div
              :style="thumbStyle(pctOf(control.valueHigh, control.min, control.max))"
              @pointerdown="onThumbPointerDown"
              @pointermove="onHighThumbMove(control, $event)"
          ></div>
        </div>
      </template>

      <template v-else-if="control.type === 'switch'">
        <span>{{ control.label }}</span>
        <div style="display: flex; gap: 2vw">
          <button
              v-for="option in control.options"
              :key="option.value"
              type="button"
              :style="option.value === control.value ? activeButtonStyle : buttonBaseStyle"
              @click="control.onSelect(option.value)"
          >{{ option.label }}</button>
        </div>
      </template>

      <template v-else-if="control.type === 'updown'">
        <div :style="labelRowStyle">
          <span>{{ control.label }}</span>
          <div style="display: flex; align-items: center; gap: 2vw">
            <button type="button" :style="buttonBaseStyle" @click="control.onDecrement()">−</button>
            <span>{{ control.value }}</span>
            <button type="button" :style="buttonBaseStyle" @click="control.onIncrement()">+</button>
          </div>
        </div>
      </template>

      <template v-else-if="control.type === 'transport'">
        <div style="display: flex; justify-content: center; gap: 2vw">
          <button
              v-for="button in control.buttons"
              :key="button.id"
              type="button"
              :style="button.active ? activeButtonStyle : buttonBaseStyle"
              @click="button.onClick()"
          >{{ button.label }}</button>
        </div>
      </template>

    </div>
  </div>
</template>