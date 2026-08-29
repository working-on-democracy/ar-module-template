// Declarative control descriptors for GuiPanel.vue — an AN ALLE!-specific
// shared GUI baustein (Zwischen-Basis, s. archive-of-practice
// projects/an-alle/concepts/zwischen-basis.md), not a feature_template
// building block, though the author intends to eventually propose it back
// there. A scene's own script owns all state; each control's `onInput`/
// `onSelect`/`onIncrement` etc. callback is where the caller applies the
// change to whatever A-Frame entity/attribute it actually drives — this
// file and GuiPanel.vue know nothing about A-Frame at all.

export interface SliderControl {
  type: "slider";
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  // Appended after the numeric readout, e.g. "%" or "m".
  unit?: string;
  onInput: (value: number) => void;
}

// Same rendering as SliderControl — the "proportional composite" case from
// projects/an-alle/concepts/proximity-effekte.md (one slider scaling several
// underlying attributes together, e.g. a set of proximity distances that
// keep a fixed ratio to each other) is a plain SliderControl whose onInput
// recomputes multiple attributes at once. Nothing GuiPanel.vue needs to know
// about specially.

export interface RangeSliderControl {
  type: "range-slider";
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  valueLow: number;
  valueHigh: number;
  unit?: string;
  onInput: (low: number, high: number) => void;
}

export interface SwitchControl {
  type: "switch";
  id: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onSelect: (value: string) => void;
}

export interface UpDownControl {
  type: "updown";
  id: string;
  label: string;
  // Whatever the caller wants displayed between the two buttons — a plain
  // number (e.g. a render-order value) or a short string.
  value: number | string;
  onDecrement: () => void;
  onIncrement: () => void;
}

export interface TransportControl {
  type: "transport";
  id: string;
  buttons: { id: string; label: string; active?: boolean; onClick: () => void }[];
}

export type GuiControl =
  | SliderControl
  | RangeSliderControl
  | SwitchControl
  | UpDownControl
  | TransportControl;
