<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';

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

const props = defineProps<{ arModule: ArModuleData }>();

const label = computed(
    () => `${props.arModule.author}: ${props.arModule.text}`
);

// 2D sound-control GUI (start/stop/play-pause). It lives outside the A-Frame
// scene graph entirely (see the template's second root node), so it can't read
// sound-button-manager's state directly — the manager emits "sound-state-changed"
// on the root entity (see notifyStateChange() there) and this listens for it.
type SoundStatus = "idle" | "playing" | "paused";

const rootEntity = ref<HTMLElement | null>(null);
const soundStatus = ref<SoundStatus>("idle");

function onSoundStateChanged(e: Event) {
  soundStatus.value = (e as CustomEvent).detail.status;
}

function getManager(): any {
  return (rootEntity.value as any)?.components?.["sound-button-manager"];
}

function onStart() {
  getManager()?.restartActive();
}

function onStop() {
  getManager()?.stopActive();
}

function onPlayPause() {
  getManager()?.togglePlayPause();
}

// The four control icons are plain PNGs in src/assets/, auto-injected as
// <img id="..."> into <a-assets> by the host (same pipeline as every other
// asset) before this module mounts — reuse that already-resolved URL rather
// than guessing the host's asset base path ourselves.
function iconSrc(id: string): string {
  return (document.getElementById(id) as HTMLImageElement | null)?.src ?? "";
}

// Inline styles, not a <style> block: the library build extracts SFC styles
// into a CSS file the host never loads (README "Caveats") — an ArModule only
// ships as JS. Inline styles compile into the render function itself, so they
// work in the real host, not just the local previews. The panel stays mounted
// at all times and fades via a bound `opacity` + `transition` — no v-if, so
// the CSS transition has something to animate between.
const panelVisible = computed(() => soundStatus.value !== "idle");

const panelStyle = computed(() => ({
  position: "fixed",
  left: "50%",
  bottom: "10%",
  transform: "translateX(-50%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6%",
  maxWidth: "66%",
  zIndex: 1000,
  opacity: panelVisible.value ? 1 : 0,
  pointerEvents: panelVisible.value ? "auto" : "none",
  transition: "opacity 0.35s ease"
} as const));

const buttonStyle = {
  flex: "0 0 auto",
  margin: 0,
  padding: 0,
  border: "none",
  background: "none",
  cursor: "pointer"
} as const;

// White square behind each icon — the PNGs have real alpha transparency, not a
// white background baked in. The <img> below is a normal DOM child of this
// span, so it always paints above the span's own background; no z-index
// needed for that ordering.
const squareStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "16vw",
  height: "16vw",
  maxWidth: "64px",
  maxHeight: "64px",
  background: "#ffffff",
  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.35)"
} as const;

const iconStyle = {
  display: "block",
  width: "70%",
  height: "70%",
  objectFit: "contain"
} as const;

onMounted(() => {
  rootEntity.value?.addEventListener("sound-state-changed", onSoundStateChanged);
});

onUnmounted(() => {
  rootEntity.value?.removeEventListener("sound-state-changed", onSoundStateChanged);
});

// Thin top-of-screen progress bar for the manifest's own assets (the glbs,
// mp3s, and icon images) — see asset-loading-overlay.ts. This is the phase
// that's actually visible to users: the host's dynamic import() of this
// module's own JS happens before any of this code runs, so it can't be
// tracked from here; this covers the (usually much larger) asset payload
// that streams in after the module has already mounted. Inline styles only —
// a <style> block never ships to the host (see README "Caveats").
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
// state as the top bar. The 3D content below is bound :visible="assetsLoaded"
// so models don't pop in one by one as their glbs finish — they keep loading
// in the background (visible:false doesn't pause loading) and only appear
// once everything's ready, all at once. The spin animation is SMIL
// (<animateTransform>) rather than a CSS @keyframes rule, since a <style>
// block never ships to the host — this needs to work from inline
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
</script>

<template>

  <!-- Assets are declared in the manifest (derived from src/assets/) and injected
       into the scene's <a-assets> by the host before this module mounts. Reference
       them here by id (file name without extension): `Wand1.glb` → id "Wand1".
       Do NOT declare your own <a-assets> here. -->
  <!-- position is a compensating offset: this branch doesn't set
       manifest.camera, so the host's real default camera ("0 0.35 0.8",
       confirmed from the deployed oplooi.uber.space/an-alle/ bundle) is what
       actually applies in production, not the "0 1 0" this module's own
       lib/preview-ar.ts used to mock. The offset keeps this content (and the
       church/wands it contains) at the same position relative to the camera
       that the standalone build showed. Untested on-device — nudge if the
       framing looks off. -->
  <a-entity ref="rootEntity" position="0 -2.25 2.8" no-frustum-cull force-shadow-map sound-button-manager :visible="assetsLoaded">


     <a-light type="ambient" intensity="0.3"></a-light>

    <!-- Casts the Wands' shadows onto the ground plane. Aimed at
         WandChurch's own origin via `target`. See SHADOWS.md for how to
         tune position/shadow-camera bounds/shadowBias. -->
    <a-entity
        light="type: directional; intensity: 1; castShadow: true; shadowMapHeight: 2048; shadowMapWidth: 2048; shadowCameraTop: 30; shadowCameraBottom: -30; shadowCameraLeft: -30; shadowCameraRight: 30; shadowRadius: 8; shadowBias: -0.001; target: #wand-church-anchor"
        position="0 2 -3">
    </a-entity>


    <!-- Wand models — ids come from the file names in src/assets/ (Wand1.glb →
         "Wand1"). The no-frustum-cull component on the root entity keeps any
         animated skinned meshes from being culled once they move. -->
    <a-entity
        gltf-model="#Wand1"
        scale="0.9 0.9 0.9"
        rotation="0 40 0"
        position="-3.2 -0.01 -2.5"
        shadow>
      <a-entity id="eng_sound_left" sound="src: #English_wand_1; autoplay: false" position="0 1 0"></a-entity>
      <a-entity id="ger_sound_left" sound="src: #Deutsch_wand1; autoplay: false" position="0 1 0"></a-entity>
        <!-- near/far (metres) control when these buttons fade in as the visitor
             approaches; pulse is the uniform x/y scale bump (0.15 = +15%) applied
             while a button is being looked at. Tune per-Wand here. -->
        <a-entity sound-button-group="near: 2.5; far: 4; pulse: 0.15" position="1.6 0.15 0.85" rotation="-10 -4 0">
          <a-plane id="eng_left" sound-button="sound: #eng_sound_left" src="#Readittome" material="shader:flat; transparent: true; alpha-test: 0.8" width="1" height="0.24" position="0 0.28 0">
            <!-- Invisible, wider/taller raycast target — extends the gaze/tap-
                 active area 1 unit left/right and (this being the top button of
                 the pair) 0.4 units upward, without enlarging the visible icon. -->
            <a-plane class="sound-button-hit-area" material="opacity: 0; transparent: true; depthWrite: false" width="2.8" height="0.6" position="0 0.2 0"></a-plane>
          </a-plane>
          <a-plane id="ger_left" sound-button="sound: #ger_sound_left" src="#liesesmirvor" material="shader:flat; transparent: true; alpha-test: 0.8" width="1" height="0.24" position="0 0.05 0">
            <!-- Bottom button of the pair — extends downward instead. -->
            <a-plane class="sound-button-hit-area" material="opacity: 0; transparent: true; depthWrite: false" width="2.8" height="0.6" position="0 -0.2 0"></a-plane>
          </a-plane>
        </a-entity>
    </a-entity>

    <a-entity
        id="wand-church-anchor"
        gltf-model="#WandChurch"
        scale="0.9 0.9 0.9"
        rotation="0 4 0"
        position="0 -0.01 -3.8"
        shadow>
    </a-entity>

    <a-entity
        gltf-model="#Wand2"
        scale="0.9 0.9 0.9"
        rotation="0 -36 0"
        position="3.2 -0.01 -2.5"
        shadow>
      <a-entity id="eng_sound_right" sound="src: #English_Wand2_OF; autoplay: false" position="0 1 0"></a-entity>
      <a-entity id="ger_sound_right" sound="src: #Deutsch_Wand2_OF; autoplay: false" position="0 1 0"></a-entity>
      <a-entity sound-button-group="near: 2.5; far: 4; pulse: 0.15" position="1.6 0.15 0.85" rotation="-10 -4 0">
        <a-plane id="eng_right" sound-button="sound: #eng_sound_right" src="#Readittome" material="shader:flat; transparent: true; alpha-test: 0.8" width="1" height="0.24" position="0 0.28 0">
          <a-plane class="sound-button-hit-area" material="opacity: 0; transparent: true; depthWrite: false" width="2.8" height="0.6" position="0 0.2 0"></a-plane>
        </a-plane>
        <a-plane id="ger_right" sound-button="sound: #ger_sound_right" src="#liesesmirvor" material="shader:flat; transparent: true; alpha-test: 0.8" width="1" height="0.24" position="0 0.05 0">
          <a-plane class="sound-button-hit-area" material="opacity: 0; transparent: true; depthWrite: false" width="2.8" height="0.6" position="0 -0.2 0"></a-plane>
        </a-plane>
      </a-entity>
    </a-entity>


    <!-- Invisible except where a shadow falls; a real AR camera feed shows
         through the rest. See SHADOWS.md for the light/shadow setup. -->
    <a-plane
        id="ground"
        rotation="-90 0 0"
        position="-50 -0.01 -50"
        width="500"
        height="500"
        material="shader: shadow"
        shadow
    ></a-plane>



  </a-entity>

  <!-- 2D sound-control GUI — screen-space overlay, NOT part of the 3D scene.
       Always mounted (so the opacity transition below has something to
       animate between); visible only while a sound is playing or paused, and
       faded out again once back to idle. Order: restart-from-start, stop,
       play/pause toggle. Styling is all inline — see the comment above
       panelStyle for why this can't be a <style> block. -->
  <div :style="panelStyle">
    <button :style="buttonStyle" type="button" aria-label="Restart from beginning" @click.stop="onStart">
      <span :style="squareStyle"><img :style="iconStyle" :src="iconSrc('start')" alt="" /></span>
    </button>
    <button :style="buttonStyle" type="button" aria-label="Stop" @click.stop="onStop">
      <span :style="squareStyle"><img :style="iconStyle" :src="iconSrc('stop')" alt="" /></span>
    </button>
    <button
        :style="buttonStyle"
        type="button"
        :aria-label="soundStatus === 'playing' ? 'Pause' : 'Play'"
        @click.stop="onPlayPause">
      <span :style="squareStyle">
        <img :style="iconStyle" :src="iconSrc(soundStatus === 'playing' ? 'pause' : 'play')" alt="" />
      </span>
    </button>
  </div>

  <!-- 2D loading-progress overlay — screen-space, not part of the 3D scene.
       Fades out once every manifest asset has loaded. -->
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
</template>
