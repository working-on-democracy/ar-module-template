<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';
import GuiPanel from './GuiPanel.vue';
import InfoOverlay from './InfoOverlay.vue';
import type { GuiControl } from './gui-controls';

interface ArModuleData {
  id: string;
  text: string;
  url: string;
  author: string;
  location: { lat: number; lng: number };
  assets?: { id: string; src: string }[];
  components?: { name: string; url: string }[];
  createdAt: string;
}

// arModule isn't read by this placeholder scene, but the prop must stay
// declared — it's the real shape the host passes to every module.
defineProps<{ arModule: ArModuleData }>();

// Template-baseline loading UI: a thin top-of-screen progress bar plus a
// centre-screen spinner, shown while this module's own manifest assets
// (glbs, images, sounds, ...) are still streaming in, so the visitor sees
// feedback instead of an empty/popping-in scene. Two parts:
//
//   1. Progress tracking (this block) — trackAssetLoading (see
//      asset-loading-overlay.ts) watches the DOM asset elements the host
//      injects into <a-assets> before this module mounts, and reports
//      loaded/total as each one settles.
//   2. Hiding the 3D content until ready (see the template below) — the
//      root <a-entity> is bound :visible="assetsLoaded", so nothing pops in
//      piecemeal; it keeps loading in the background the whole time
//      (visible:false doesn't pause loading) and only appears once
//      everything's ready, all at once.
//
// This is deliberately NOT an A-Frame component: it's screen-space 2D UI
// that has to exist and be visible *before* any 3D entity is ready, driven
// by this Vue wrapper's own onMounted/onUnmounted lifecycle rather than
// any entity's — there's no 3D content for a component to attach to until
// the very thing this UI is covering for has already finished. See
// QUICK_START_GUIDE.md for the short version of why this lives here rather
// than in src/a-frame-components/.
const loadProgress = ref(0);
const assetsLoaded = ref(false);
let stopAssetTracking: (() => void) | null = null;

const loadBarTrackStyle = computed(() => ({
  position: 'fixed' as const,
  top: '0',
  left: '0',
  width: '100%',
  height: '3px',
  background: 'rgba(255,255,255,0.15)',
  zIndex: '9999',
  pointerEvents: 'none' as const,
  opacity: assetsLoaded.value ? '0' : '1',
  transition: 'opacity 0.4s ease-out'
}));

const loadBarFillStyle = computed(() => ({
  height: '100%',
  width: `${Math.round(loadProgress.value * 100)}%`,
  background: 'rgba(255,255,255,0.9)',
  transition: 'width 0.2s ease-out'
}));

// Centre-screen spinner + backdrop, shown/hidden by the same assetsLoaded
// state as the top bar. The spin animation is SMIL (<animateTransform>)
// rather than a CSS @keyframes rule, since a <style> block never ships to
// the host (see README "Caveats") — this needs to work from inline
// markup/styles alone.
const loadSpinnerBackdropStyle = computed(() => ({
  position: 'fixed' as const,
  inset: '0',
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  background: 'rgba(0,0,0,0.55)',
  zIndex: '9998',
  pointerEvents: 'none' as const,
  opacity: assetsLoaded.value ? '0' : '1',
  transition: 'opacity 0.4s ease-out'
}));

onMounted(() => {
  stopAssetTracking = trackAssetLoading(
    manifest.assets ?? [],
    (loaded, total) => { loadProgress.value = loaded / total; },
    () => { assetsLoaded.value = true; }
  );
});

onUnmounted(() => {
  stopAssetTracking?.();
});

// AN ALLE! Proximity-Effekte (archive-of-practice
// projects/an-alle/concepts/proximity-effekte.md) — three house elements,
// each driven by a different proximity technique (grobe Zuordnung,
// Entscheidung 29.08.2026): Außenwände=Fade, Erster Stock (Gitter)=Cutout,
// verteilte Objekte (Innen/Küche)=Wave-Group. Assets copied read-only from
// Madleen_module (s. concept doc) — a real, already-working combination of
// these components on the same house geometry, not newly authored ones.
//
// Fade-Start/-Ende and Cutout-`radius` are NOT exposed as separate sliders
// (Entscheidung, s. zwischen-basis.md "Bausteine") — one `distanceScale`
// slider scales all three together, keeping their authored ratio. This is
// a plain `SliderControl` whose onInput recomputes three attribute strings
// at once (s. gui-controls.ts comment on the "proportional composite" case)
// — GuiPanel.vue needs no special-casing for it.
const BASE_FADE_OUT_START = 6;
const BASE_FADE_OUT_END = 3;
const BASE_CUTOUT_RADIUS = 2;

const distanceScale = ref(1); // 0.5–1.5, multiplies the three bases above
const cutoutFeather = ref(0.3); // own slider, Entscheidung: eng kuratierte Spanne
const waveSpeed = ref(3); // own slider, Entscheidung: eng kuratierte Spanne

const fadeAttr = computed(
  () => `fadeOutStart: ${(BASE_FADE_OUT_START * distanceScale.value).toFixed(2)}; ` +
        `fadeOutEnd: ${(BASE_FADE_OUT_END * distanceScale.value).toFixed(2)}; target: 0 0 0`
);
const cutoutAttr = computed(
  () => `radius: ${(BASE_CUTOUT_RADIUS * distanceScale.value).toFixed(2)}; feather: ${cutoutFeather.value.toFixed(2)}`
);
// waveNear/waveFar/waveIntensity/idleRadius stay fixed — only waveSpeed is a
// GUI parameter per the concept doc's decision.
const waveGroupAttr = computed(
  () => `waveNear: 2; waveFar: 5; waveIntensity: 15; waveSpeed: ${waveSpeed.value.toFixed(2)}; idleRadius: 0.02`
);

const guiControls = computed<GuiControl[]>(() => [
  {
    type: 'slider',
    id: 'distance-scale',
    label: 'Abstand (Fade/Cutout)',
    min: 50,
    max: 150,
    step: 5,
    value: Math.round(distanceScale.value * 100),
    unit: '%',
    onInput: (value) => { distanceScale.value = value / 100; }
  },
  {
    type: 'slider',
    id: 'cutout-feather',
    label: 'Cutout-Weichzeichnung',
    min: 0.1,
    max: 0.6,
    step: 0.05,
    value: cutoutFeather.value,
    onInput: (value) => { cutoutFeather.value = value; }
  },
  {
    type: 'slider',
    id: 'wave-speed',
    label: 'Wellen-Tempo',
    min: 1,
    max: 6,
    step: 0.5,
    value: waveSpeed.value,
    onInput: (value) => { waveSpeed.value = value; }
  }
]);
</script>

<template>

  <!-- Assets are declared in the manifest (derived from src/assets/) and injected
       into the scene's <a-assets> by the host before this module mounts. Reference
       them here by id (file name without extension): `jellyfish-video.mp4` → id
       "jellyfish-video". Do NOT declare your own <a-assets> here. -->
  <!-- AN ALLE! Zwischen-Basis: all five Themenfeld modules anchor to a printed
       image target (archive-of-practice
       projects/an-alle/concepts/zwischen-basis.md, Entscheidung 1) — "video-target"
       is still the template's placeholder descriptor (s. manifest.ts) until the
       real AN ALLE! target image is designed and compiled. Only works in the real
       AR preview (npm run dev:ar) or the host, per
       guides/IMAGE-TRACKING-FEATURE-GUIDE.md. -->
  <xrextras-named-image-target name="video-target">
    <a-entity
        position="0 -2 0"
        no-frustum-cull
        :visible="assetsLoaded"
    >
      <!-- What the directional light below aims at — move this entity to
           redirect the light (and the shadows it casts) instead of having to
           re-aim the light itself. -->
      <a-entity id="lightTarget" position="0 0 -3"></a-entity>

      <!-- Directional light that casts shadows onto the ground plane below.
           Positioned above the scene, aimed at #lightTarget above. -->
      <a-entity
          position="1 20 10"
          light="
                      type: directional;
                      intensity: 1;
                      target: #lightTarget;
                      castShadow: true;
                      shadowMapHeight:2048;
                      shadowMapWidth:2048;
                      shadowCameraTop: 80;
                      shadowCameraBottom: -80;
                      shadowCameraRight: 80;
                      shadowCameraLeft: -80;
                      shadowRadius: 12"
          shadow>
      </a-entity>

      <a-light type="ambient" intensity="0.7"></a-light>

      <!-- Attach-To (archive-of-practice
           projects/an-alle/concepts/proximity-effekte.md, Entscheidung
           "Attach-To"): a point light that follows the shared camera every
           tick, independent of the three house elements below — no shared
           entity/material with proximity-wave-group, so no conflict with
           attach-to's own "don't combine on the same entity" rule (s.
           ATTACH-TO-FEATURE-GUIDE.md §4). "#camera" is the id the host/
           preview assigns the shared camera (s. examples/attach-to-usage.html). -->
      <a-entity light="type: point; intensity: 0.6" attach-to="target: #camera; offset: 0 1 0"></a-entity>

      <!-- Haus (Madleen_module-Assets, read-only Referenz — s. Konzeptdokument).
           Ein "scene-content"-Wrapper wie im Original, hier ohne dessen
           kameraspezifische Positionskorrektur (dieser Branch setzt noch
           kein eigenes manifest.camera). -->
      <a-entity id="scene-content" position="0 0.5 -8" rotation="0 135 0" scale="1.4 1.4 1.4">

        <!-- 1. Außenwände — Proximity Fade: verschwindet vollständig, sobald
             die Kamera sich `target` nähert (nur fadeOut, kein fadeIn — "ganzes
             Verschwinden ab bestimmtem Abstand", nicht ein Erscheinen-und-
             Verschwinden-Fenster). model-loaded bubbelt von jedem Kind-Modell
             hoch, eine Component-Instanz patcht alle 5. -->
        <a-entity id="aussenwaende" position="0 0 0" :proximity-fade="fadeAttr">
          <a-entity gltf-model="#Aussen1" position="0 0 0" shadow></a-entity>
          <a-entity gltf-model="#Aussen2" position="0 0 0" shadow></a-entity>
          <a-entity gltf-model="#Aussen3" position="0 0 0" shadow></a-entity>
          <a-entity gltf-model="#Aussen4" position="0 0 0" shadow></a-entity>
          <a-entity gltf-model="#Aussen5" position="0 0 0" shadow></a-entity>
        </a-entity>

        <!-- 2. Erster Stock (Gitter) — Proximity Cutout: Loch folgt der Kamera
             beim Hineingehen, statt auf einen Schlag zu verschwinden. -->
        <a-entity id="erster-stock" position="0 0 0" :proximity-cutout="cutoutAttr">
          <a-entity gltf-model="#Gitter2" position="0 0 0" shadow></a-entity>
          <a-entity gltf-model="#Gitter3" position="0 0 0" shadow></a-entity>
          <a-entity gltf-model="#Gitter4" position="0 0 0" shadow></a-entity>
          <a-entity gltf-model="#Gitter5" position="0 0 0" shadow></a-entity>
        </a-entity>

        <!-- 3. Verteilte Objekte im Haus — Proximity Wave Group: gemeinsame
             Werte, individuelle Phase pro Instanz (proximity-wave-group lässt
             jedes Kind unabhängig voneinander schwingen/floaten). -->
        <a-entity id="verteilte-objekte" position="0 0 0" :proximity-wave-group="waveGroupAttr">
          <a-entity gltf-model="#Innen_ganz" position="0 0 0" shadow></a-entity>
          <a-entity gltf-model="#Kueche_packed" position="0.05 0 -0.02" rotation="0 -2 0" shadow></a-entity>
        </a-entity>

      </a-entity>

      <!-- Ground plane. Renders ONLY the
           shadows cast onto it (material="shader: shadow"), not a visible
           surface of its own, so it stays invisible until something above
           actually casts a shadow onto it. A good baseline to build a scene
           on top of. -->
      <a-plane
          id="ground"
          rotation="-90 0 0"
          position="-50 0 -50"
          width="500"
          height="500"
          material="shader: shadow"
          shadow
      ></a-plane>

    </a-entity>
  </xrextras-named-image-target>

  <!-- 2D loading-progress overlay — screen-space, not part of the 3D scene
       (a second root node, sibling to the <a-entity> above). Fades out once
       every manifest asset has loaded; see the <script> block above for why
       this is plain Vue/DOM rather than an A-Frame component. -->
  <div :style="loadBarTrackStyle">
    <div :style="loadBarFillStyle"></div>
  </div>

  <!-- Centre-screen spinner, shown while the 3D content above stays hidden
       (:visible="assetsLoaded" on its root) so nothing pops in piecemeal. -->
  <div :style="loadSpinnerBackdropStyle">
    <svg viewBox="0 0 50 50" width="48" height="48">
      <circle cx="25" cy="25" r="20" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-dasharray="90 150">
        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  </div>

  <!-- AN ALLE! Zwischen-Basis: shared GUI baustein (archive-of-practice
       projects/an-alle/concepts/zwischen-basis.md) — each Themenfeld branch
       replaces `guiControls` above with its own attribute wiring, GuiPanel.vue
       itself is not meant to be forked. -->
  <GuiPanel :controls="guiControls" />

  <!-- AN ALLE! Zwischen-Basis: shared info button + overlay, replacing the
       raycast-driven context-text idea for every Themenfeld except
       Sound-Player (s. projects/an-alle/concepts/sound-player.md). Each
       branch passes its own scene-specific explanation text. -->
  <InfoOverlay text="Ein verschachteltes Haus: Die Außenwände verschwinden, je näher du kommst, im ersten Stock öffnet sich ein Loch, das dir folgt, und die Objekte im Inneren schwingen sanft. Ein Licht begleitet dich dabei." />
</template>
