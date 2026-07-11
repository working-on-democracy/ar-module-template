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

// Mobile browsers start the Web Audio context suspended until a genuine user
// gesture resumes it. We first try to piggyback on whatever gesture the user
// makes anywhere on the page (e.g. the tap that starts the AR session); if
// the context is still suspended shortly after mount, we fall back to an
// explicit "tap to enable sound" overlay.
const mainEntity = ref<any>(null);
const mainSoundEntity = ref<any>(null);
const seed1Entity = ref<any>(null);
const seed2Entity = ref<any>(null);
const seed3Entity = ref<any>(null);

let overlayEl: HTMLDivElement | null = null;
let overlayTimer: ReturnType<typeof setTimeout> | null = null;
let unlocked = false;

function soundEntities(): any[] {
  return [mainSoundEntity.value, seed1Entity.value, seed2Entity.value, seed3Entity.value].filter(Boolean);
}

function getAudioContext(): AudioContext | null {
  for (const el of soundEntities()) {
    const ctx = el.sceneEl?.audioListener?.context;
    if (ctx) return ctx;
  }
  return null;
}

// All 4 clips loop and share the same ~58s duration, each with a quiet
// stretch at its start/end — starting them all from position 0 makes every
// one go silent at once, which reads as a glitch rather than ambience.
// Staggering each one's *starting position within its own clip* (not a delay
// before it starts playing) spreads those quiet stretches out, and keeps
// them that way forever: `THREE.Audio.play()` only consults `.offset` for
// the very first play — after that, the native Web Audio loop just wraps
// 0→duration, so a one-time offset is a permanent phase shift as long as
// every clip is the same length (verified: all 4 are 58.05s).
const SOUND_OFFSETS: [() => any, number][] = [
  [() => mainSoundEntity.value, 0],
  [() => seed1Entity.value, 10],
  [() => seed2Entity.value, 20],
  [() => seed3Entity.value, 30]
];

// `.offset` has to be set *before* the underlying THREE.Audio's first
// `.play()` call — once playing, it's inert until the sound is stopped and
// restarted. The `pool` it lives on (built by the `sound` component's own
// update(), not init()) isn't reliably ready by the time Vue's onMounted
// fires, so poll a few frames instead of assuming the timing — `autoplay` is
// off in the template specifically so nothing can start (from offset 0)
// while we wait.
function waitForSoundPool(el: any, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const pool = el?.components?.sound?.pool;
      if (pool?.children?.length) { resolve(pool); return; }
      if (performance.now() - start > timeoutMs) { resolve(null); return; }
      requestAnimationFrame(check);
    };
    check();
  });
}

// Starts each sound exactly once, offset into its own clip. Safe to call
// while the AudioContext is still suspended — a source can be scheduled on a
// suspended context, it just stays silent (with no drift once resumed,
// since a suspended context's clock doesn't advance) until
// unlockAudioContext() below resumes it.
async function startStaggeredSounds() {
  await Promise.all(SOUND_OFFSETS.map(async ([getEl, offset]) => {
    const el = getEl();
    if (!el) return;
    const pool = await waitForSoundPool(el);
    if (!pool) return;
    pool.children.forEach((audio: any) => { audio.offset = offset; });
    try {
      el.components?.sound?.playSound();
    } catch { /* sound component not initialised yet */ }
  }));
}

function clearOverlayTimer() {
  if (overlayTimer) {
    clearTimeout(overlayTimer);
    overlayTimer = null;
  }
}

function removeOverlay() {
  overlayEl?.remove();
  overlayEl = null;
}

function showSoundOverlay() {
  if (overlayEl || unlocked) return;
  const el = document.createElement('div');
  el.textContent = '🔊 Tap to enable sound';
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: '32px',
    transform: 'translateX(-50%)',
    background: 'rgba(15, 23, 42, 0.85)',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: '999px',
    fontFamily: 'sans-serif',
    fontSize: '14px',
    zIndex: '1000',
    cursor: 'pointer'
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  overlayEl = el;
}

// Only resumes the AudioContext — playback itself is already scheduled (see
// startStaggeredSounds), this just makes it audible. Only marks `unlocked`
// once resume is *confirmed*, not merely attempted: calling `.resume()`
// outside a real user gesture can silently fail to actually resume, and
// marking unlocked / tearing down the listeners regardless would strand the
// page with sound permanently stuck silent.
function unlockAudioContext() {
  if (unlocked) return;
  const ctx = getAudioContext();
  if (!ctx) return; // sound components not ready yet; a later gesture retries

  const confirmUnlocked = () => {
    unlocked = true;
    clearOverlayTimer();
    document.removeEventListener('pointerdown', unlockAudioContext, true);
    document.removeEventListener('keydown', unlockAudioContext, true);
    removeOverlay();
  };
  if (ctx.state === 'running') confirmUnlocked();
  else ctx.resume().then(() => { if (ctx.state === 'running') confirmUnlocked(); });
}

onMounted(() => {
  startStaggeredSounds();
  document.addEventListener('pointerdown', unlockAudioContext, {capture: true});
  document.addEventListener('keydown', unlockAudioContext, {capture: true});
  // In case the context is already running (e.g. a prior gesture elsewhere
  // on the page already unlocked it) — avoids waiting for a second gesture.
  unlockAudioContext();
  overlayTimer = setTimeout(() => {
    if (!unlocked) showSoundOverlay();
  }, 1500);
});

onUnmounted(() => {
  clearOverlayTimer();
  document.removeEventListener('pointerdown', unlockAudioContext, true);
  document.removeEventListener('keydown', unlockAudioContext, true);
  removeOverlay();
});

// Thin top-of-screen progress bar for the manifest's own assets (the glbs and
// mp3s) — see asset-loading-overlay.ts. This is the phase that's actually
// visible to users: the host's dynamic import() of this module's own JS
// happens before any of this code runs, so it can't be tracked from here;
// this covers the (usually much larger) asset payload that streams in after
// the module has already mounted. Inline styles only — a <style> block never
// ships to the host (see README "Caveats").
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
       them here by id (file name without extension): `jellyfish-video.mp4` → id
       "jellyfish-video". Do NOT declare your own <a-assets> here. -->
  <!-- Position includes a compensating offset of "0 -0.65 0.8" on top of the
       original "0 -2 0": this branch doesn't set manifest.camera, so the host's
       real default camera ("0 0.35 0.8", confirmed from the deployed
       oplooi.uber.space/an-alle/ bundle) is what actually applies in
       production, not the "0 1 0" this module's own lib/preview-ar.ts used to
       mock. The offset keeps this content at the same position relative to the
       camera that the standalone build showed. Untested on-device — nudge if
       the framing looks off. -->
  <a-entity
      position="0 -2.65 0.8"
      no-frustum-cull
      :visible="assetsLoaded"
  >

    <!-- Directional light that casts shadows onto the ground plane. Positioned
         above the scene; with no explicit `target` it points at the origin, so
         the fish and octahedron below cast shadows. -->
    <a-entity
        position="1 50 15"
        light="
                    type: directional;
                    intensity: 1;
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

    <a-light type="ambient" intensity="0.2"></a-light>

        <a-light type="point" position="5 10 -7" intensity="1"></a-light>

    <a-light type="point" position="-5 1 5" intensity="0.2"></a-light>


    <a-entity
        id="mainEntity"
        ref="mainEntity"
        gltf-model="#MainCharacter3"
        scale="2 2 2"
        rotation="0 0 0"
        position="0 0 -10"
        trim-loop-clip="timeScale: 0.4; loop: pingpong"
        shadow>
    </a-entity>

    <!-- Carries the main character's sound source, positioned to continuously
         track the "shapekey_object" node's animated position within
         MainCharacter3's glTF (see src/a-frame-components/follow-node.ts)
         rather than sitting fixed at mainEntity's static transform. -->
    <a-entity
        ref="mainSoundEntity"
        follow-node="target: #mainEntity; node: shapekey_object"
        sound="src: #Main; autoplay: false; loop: true; positional: true; volume: 1; distanceModel: exponential; refDistance: 1.5; rolloffFactor: 1; maxDistance: 20">
    </a-entity>

        <a-entity
            ref="seed1Entity"
            gltf-model="#Seed1"
            scale="2 2 2"
            position="-5 0.5 -6"
            trim-loop-clip="timeScale: 0.5; loop: pingpong"
            wander-in-band="center: #mainEntity; innerRadius: 6; outerRadius: 12; floatIntensity: 0.05; speed: 0.35; chaos: 0.15"
            sound="src: #seed1; autoplay: false; loop: true; positional: true; volume: 1; distanceModel: linear; refDistance: 3.5; rolloffFactor: 1; maxDistance: 8"
            shadow>
        </a-entity>

    <a-entity
        ref="seed2Entity"
        gltf-model="#Seed2"
        scale="2 2 2"
        position="-5 0.5 -2"
        trim-loop-clip="timeScale: 0.4; loop: pingpong"
        wander-in-band="center: #mainEntity; innerRadius: 6; outerRadius: 12; floatIntensity: 0.05; speed: 0.4; chaos: 0.1"
        sound="src: #seed2; autoplay: false; loop: true; positional: true; volume: 1; distanceModel: linear; refDistance: 3.5; rolloffFactor: 1; maxDistance: 8"
        shadow>
    </a-entity>



    <a-entity
        ref="seed3Entity"
        gltf-model="#Seed3"
        scale="2 2 2"
        position="10 0.5 -4"
        trim-loop-clip="timeScale: 0.3; loop: pingpong"
        wander-in-band="center: #mainEntity; innerRadius: 6; outerRadius: 12; floatIntensity: 0.05; speed: 0.3; chaos: 0.21"
        sound="src: #seed3; autoplay: false; loop: true; positional: true; volume: 1; distanceModel: linear; refDistance: 3.5; rolloffFactor: 1; maxDistance: 8"
        shadow>
    </a-entity>



    <!-- example primitive (plane) as ground -->
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
