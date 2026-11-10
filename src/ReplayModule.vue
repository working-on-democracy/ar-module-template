<script setup lang="ts">
// A recorded plant in AR, without any server (npm run dev:replay / build:replay):
// the recording (sandbox/replay-export.ts) and its models and photos are plain
// files next to the page, under aufzeichnung/. The plant stands in front of
// where the phone was when it had loaded and runs at the platform's pace;
// holding a finger on the left of the screen winds it back, on the right
// forward, about four calendar days a minute (src/plant-replay.ts); a tap on the
// timeline jumps to that day, a tap in the middle hides the bar below and shows it again.
//
// Same AR preview as the test scene (lib/preview-ar.ts: 8th Wall with absolute
// scale, the host's lights, fog and renderer); positions in metres, ground at y = 0.
import { onMounted, onUnmounted } from 'vue';
import type * as T from 'three';
import { control, el, layer, loadingScreen, toast } from '../sandbox/planting/ui';
import { addGround } from './plant-ground';
import { ReplayPlant, type Recording } from './plant-replay';

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

// arModule isn't read here, but the prop must stay declared — it's the real
// shape the host passes to every module.
defineProps<{ arModule: ArModuleData }>();

declare const AFRAME: { THREE: typeof T };
type Entity = HTMLElement & { object3D: T.Object3D };
type SceneEl = HTMLElement & { object3D: T.Scene; camera: T.Camera };

const BASE = 'aufzeichnung/'; // the recording, next to the page
const REAL_TIME = 1 / 86400; // calendar days per second: the platform's pace
const WIND = 4 / 60; // calendar days per second while a finger holds: about four days a minute
// ?tag=12 starts at that calendar day, ?tempo=0.5 runs at that many calendar days a minute instead of real time
const query = new URLSearchParams(location.search);
const startDay = Number(query.get('tag') ?? 0) || 0;
const pace = query.has('tempo') ? Number(query.get('tempo')) / 60 || REAL_TIME : REAL_TIME;

let world: Entity | null = null;
let ui: HTMLDivElement | null = null;
let replay: ReplayPlant | null = null;
let stopped = false;

onMounted(() => {
  begin().catch((e) => {
    console.error(e);
    if (ui) toast(ui, `Die Aufzeichnung lädt nicht (${(e as Error).message}).`, 15000);
  });
});

onUnmounted(() => {
  stopped = true;
  replay?.stop();
  world?.remove();
  ui?.remove();
});

async function begin() {
  const THREE = AFRAME.THREE;
  const scene = document.querySelector('a-scene') as SceneEl;
  world = document.createElement('a-entity') as Entity;
  scene.appendChild(world);
  ui = layer(500);
  document.body.append(ui);
  const load = loadingScreen(ui, 'Die Pflanze wird geladen');
  load.progress(0.05, 'Die Aufzeichnung …');
  const res = await fetch(`${BASE}aufzeichnung.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rec = (await res.json()) as Recording;

  // the planting point in front of the phone, far enough off to see the whole plant
  const camera = new THREE.Vector3(), ahead = new THREE.Vector3();
  scene.camera.getWorldPosition(camera);
  scene.camera.getWorldDirection(ahead);
  ahead.y = 0;
  if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, -1);
  ahead.normalize().multiplyScalar(Math.min(8, Math.max(2, rec.radius + 1.5)));
  addGround(THREE, world.object3D); // shadows, and hides what is below the ground
  const root = document.createElement('a-entity') as Entity;
  world.appendChild(root);
  root.object3D.position.set(camera.x + ahead.x, 0, camera.z + ahead.z);

  replay = new ReplayPlant(root, rec, BASE);
  replay.day = Math.min(rec.days, Math.max(0, startDay));
  replay.pace = pace;
  // everything first: until then the loading screen covers the controls
  await replay.download((f, note) => load.progress(0.05 + 0.9 * f, note));
  if (stopped) return;
  load.progress(0.95, 'Die ersten Modelle …');
  await replay.prepare((f) => load.progress(0.95 + 0.05 * f));
  if (stopped) return;
  replay.start();
  load.done();
  controls(rec);
}

/** Holding left winds back, holding right forward, a tap in the middle hides or shows the bar; below, the day and the phase. */
function controls(rec: Recording) {
  const zone = (left: string, width: string) => {
    const z = control(el('div', { position: 'absolute', top: '0', bottom: '0', left, width, touchAction: 'none', userSelect: 'none', transition: 'background 0.15s ease' }));
    z.style.setProperty('-webkit-user-select', 'none');
    z.style.setProperty('-webkit-touch-callout', 'none'); // no magnifier or menu on a long press in Safari
    z.addEventListener('contextmenu', (e) => e.preventDefault());
    ui!.append(z);
    return z;
  };
  const sides = [
    { side: 'back' as const, half: zone('0', '35%') },
    { side: 'forward' as const, half: zone('65%', '35%') },
  ];
  let hidden = false;
  const held = new Map<number, 'back' | 'forward'>(); // finger → side
  const steer = () => {
    const all = [...held.values()], side = all[all.length - 1]; // the last finger down
    replay!.pace = side === 'back' ? -WIND : side === 'forward' ? WIND : pace;
    for (const h of sides) h.half.style.background = h.side === side && !hidden ? 'linear-gradient(to ' + (side === 'back' ? 'right' : 'left') + ', rgba(255,255,255,0.14), rgba(255,255,255,0))' : 'transparent';
  };
  for (const { side, half } of sides) {
    half.addEventListener('pointerdown', (e) => { half.setPointerCapture(e.pointerId); held.set(e.pointerId, side); steer(); e.preventDefault(); });
    for (const end of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) half.addEventListener(end, (e) => { if (held.delete(e.pointerId)) steer(); });
  }
  const middle = zone('35%', '30%');
  middle.addEventListener('pointerdown', (e) => e.preventDefault());
  middle.addEventListener('click', () => {
    hidden = !hidden;
    bar.style.opacity = hidden ? '0' : '1';
    seek.style.pointerEvents = hidden ? 'none' : 'auto';
    steer();
  });

  const bar = el('div', { position: 'absolute', left: '16px', right: '16px', bottom: 'calc(16px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 14px', borderRadius: '12px', background: 'rgba(20,24,21,0.72)', color: '#fff', pointerEvents: 'none', transition: 'opacity 0.2s ease' });
  const line = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', fontSize: '13px' });
  const back = el('span', { opacity: '0.7', whiteSpace: 'nowrap' }, '◀◀ halten');
  const day = el('span', { fontWeight: '600', fontSize: '15px', fontVariantNumeric: 'tabular-nums', textAlign: 'center', whiteSpace: 'nowrap' });
  const forward = el('span', { opacity: '0.7', whiteSpace: 'nowrap' }, 'halten ▶▶');
  line.append(back, day, forward);
  const track = el('div', { height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.2)', overflow: 'hidden' });
  const fill = el('div', { width: '0%', height: '100%', background: '#fff' });
  track.append(fill);
  // tapping the timeline jumps to that day, dragging along it scrubs; the touch area is taller than the line
  const seek = control(el('div', { padding: '12px 0', margin: '-12px 0', touchAction: 'none', cursor: 'pointer' }));
  seek.append(track);
  const jump = (e: PointerEvent) => {
    const r = track.getBoundingClientRect();
    replay!.day = rec.days * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  seek.addEventListener('pointerdown', (e) => { seek.setPointerCapture(e.pointerId); jump(e); e.preventDefault(); });
  seek.addEventListener('pointermove', (e) => { if (seek.hasPointerCapture(e.pointerId)) jump(e); });
  bar.append(line, seek);
  ui!.append(bar);

  const PHASE: Record<string, string> = { wachstum: 'Wachstum', plateau: 'Plateau', abstieg: 'Abstieg', verfall: 'Verfall', ende: 'vergangen' };
  const show = () => {
    if (stopped || !replay) return;
    const d = replay.day;
    day.textContent = `Tag ${d.toFixed(1).replace('.', ',')} · ${PHASE[replay.phase] ?? replay.phase}`;
    fill.style.width = `${(100 * d) / Math.max(1e-6, rec.days)}%`;
    back.style.opacity = replay.pace < 0 ? '1' : '0.7';
    forward.style.opacity = replay.pace === WIND ? '1' : '0.7';
    requestAnimationFrame(show);
  };
  requestAnimationFrame(show);
}
</script>

<template>
  <!-- Nothing here: the plant is added to the scene itself in script (world
       frame, ground at y = 0), lit by the platform's lights alone, as in the
       AR test scene (ArModule.vue). -->
</template>
