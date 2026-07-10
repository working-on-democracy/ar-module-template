<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';

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
// gesture resumes it, so the `sound` components' `autoplay` below can go out
// silently. We first try to piggyback on whatever gesture the user makes
// anywhere on the page (e.g. the tap that starts the AR session); if the
// context is still suspended shortly after mount, we fall back to an explicit
// "tap to enable sound" overlay.
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

function unlockSound() {
  if (unlocked) return;
  unlocked = true;
  clearOverlayTimer();
  document.removeEventListener('pointerdown', unlockSound, true);
  document.removeEventListener('keydown', unlockSound, true);

  const ctx = getAudioContext();
  const finish = () => {
    soundEntities().forEach((el) => {
      try {
        el.components?.sound?.playSound();
      } catch { /* sound component not initialised yet */ }
    });
    removeOverlay();
  };
  if (ctx && ctx.state !== 'running') ctx.resume().then(finish, finish);
  else finish();
}

onMounted(() => {
  document.addEventListener('pointerdown', unlockSound, {capture: true});
  document.addEventListener('keydown', unlockSound, {capture: true});
  // Give an already-in-flight gesture (e.g. the tap that starts the AR
  // session) a moment to land before nagging the user with our own prompt.
  overlayTimer = setTimeout(() => {
    if (!unlocked) showSoundOverlay();
  }, 1500);
});

onUnmounted(() => {
  clearOverlayTimer();
  document.removeEventListener('pointerdown', unlockSound, true);
  document.removeEventListener('keydown', unlockSound, true);
  removeOverlay();
});
</script>

<template>

  <!-- Assets are declared in the manifest (derived from src/assets/) and injected
       into the scene's <a-assets> by the host before this module mounts. Reference
       them here by id (file name without extension): `jellyfish-video.mp4` → id
       "jellyfish-video". Do NOT declare your own <a-assets> here. -->
  <a-entity
      position="0 -2 0"
      no-frustum-cull
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
        sound="src: #Main; autoplay: true; loop: true; positional: true; volume: 1; distanceModel: exponential; refDistance: 1.5; rolloffFactor: 1; maxDistance: 20">
    </a-entity>

        <a-entity
            ref="seed1Entity"
            gltf-model="#Seed1"
            scale="2 2 2"
            position="-5 0.5 -6"
            trim-loop-clip="timeScale: 0.5; loop: pingpong"
            wander-in-band="center: #mainEntity; innerRadius: 6; outerRadius: 12; floatIntensity: 0.05; speed: 0.35; chaos: 0.15"
            sound="src: #seed1; autoplay: true; loop: true; positional: true; volume: 1; distanceModel: linear; refDistance: 3.5; rolloffFactor: 1; maxDistance: 8"
            shadow>
        </a-entity>

    <a-entity
        ref="seed2Entity"
        gltf-model="#Seed2"
        scale="2 2 2"
        position="-5 0.5 -2"
        trim-loop-clip="timeScale: 0.4; loop: pingpong"
        wander-in-band="center: #mainEntity; innerRadius: 6; outerRadius: 12; floatIntensity: 0.05; speed: 0.4; chaos: 0.1"
        sound="src: #seed2; autoplay: true; loop: true; positional: true; volume: 1; distanceModel: linear; refDistance: 3.5; rolloffFactor: 1; maxDistance: 8"
        shadow>
    </a-entity>



    <a-entity
        ref="seed3Entity"
        gltf-model="#Seed3"
        scale="2 2 2"
        position="10 0.5 -4"
        trim-loop-clip="timeScale: 0.3; loop: pingpong"
        wander-in-band="center: #mainEntity; innerRadius: 6; outerRadius: 12; floatIntensity: 0.05; speed: 0.3; chaos: 0.21"
        sound="src: #seed3; autoplay: true; loop: true; positional: true; volume: 1; distanceModel: linear; refDistance: 3.5; rolloffFactor: 1; maxDistance: 8"
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
</template>
