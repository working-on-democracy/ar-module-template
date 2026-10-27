<script setup lang="ts">
// The plant's AR test scene. On the platform the plant is a host feature, not a
// module (AGENTS.md); this module is only the vehicle for testing it on a phone
// with the host runtime (npm run dev:ar). It talks to the sandbox server
// (npm run sandbox), which dev:ar proxies under /api and /run:
//
//   1. planting  — if the sandbox waits for a planting: pick 3 to 5 objects and
//                  place them on the ground (sandbox/planting/scene.ts, the same
//                  scene as in the sandbox viewer)
//   2. loading   — the planting goes to the sandbox, which starts the run; only
//                  the models of the first answer are loaded
//   3. the plant — shown live from GET /api/plant (src/plant-live.ts)
//
// Positions are in metres with the ground at y = 0: the AR preview runs 8th
// Wall with absolute scale (lib/preview-ar.ts). Everything is added to the
// scene itself (world frame), not under the host's module position.
import { onMounted, onUnmounted } from 'vue';
import type * as T from 'three';
import { PlantingScene, removeObject } from '../sandbox/planting/scene';
import { layer, loadingScreen, saveFile, toast } from '../sandbox/planting/ui';
import type { CatalogItem, PlantRules, Planting } from '../sandbox/planting/rules';
import type { Vec3 } from '../sandbox/sim/types';
import { LivePlant } from './plant-live';

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
type SceneEl = HTMLElement & { object3D: T.Scene; camera: T.Camera; renderer: T.WebGLRenderer };

let world: Entity | null = null; // the world frame (ground y = 0), on the scene itself
let ui: HTMLDivElement | null = null;
let planting: PlantingScene | null = null;
let live: LivePlant | null = null;
let stopped = false;

onMounted(() => {
  begin().catch((e) => {
    console.error(e);
    if (ui) toast(ui, `Keine Verbindung zur Sandbox (${(e as Error).message}). Läuft npm run sandbox?`, 15000);
  });
});

onUnmounted(() => {
  stopped = true;
  planting?.dispose();
  live?.stop();
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
  // ground that only shows shadows, so the planted objects stand on something
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.3 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.object3D.add(ground);
  // hides what is below the ground (growing out of it, sinking after death): writes depth only, so the
  // camera image stays; drawn before the plant's opaque objects so they fail the depth test below y = 0
  const hider = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ colorWrite: false }));
  hider.rotation.x = -Math.PI / 2;
  hider.renderOrder = -1;
  world.object3D.add(hider);

  const info = await (await fetch('/api/planting')).json() as { waiting: boolean; catalog: CatalogItem[]; rules: PlantRules; plantingPoint: Vec3 | null };
  if (!info.waiting) {
    toast(ui, 'Die Sandbox hat schon eine Pflanze, sie wird hier gezeigt. Für eine neue Pflanzung die Sandbox neu starten.', 7000);
    await showPlant(info.plantingPoint ?? [0, 0, 0]);
    return;
  }
  const Loader = (THREE as unknown as { GLTFLoader: new () => { loadAsync(u: string, progress?: (e: ProgressEvent) => void): Promise<{ scene: T.Object3D }> } }).GLTFLoader;
  planting = new PlantingScene({
    THREE, root: world.object3D, camera: scene.camera, renderer: scene.renderer, ui, desktop: false,
    fetchCatalog: async () => ((await (await fetch('/api/planting')).json()) as { catalog: CatalogItem[] }).catalog,
    removeItem: removeObject,
    loadModel: async (item, progress) => castsShadow((await new Loader().loadAsync(`/api/planting/models/${item.glb}`, (e) => progress?.(e.loaded, e.lengthComputable ? e.total : 0))).scene),
    onFinish: (plants, seed) => { plant(plants, seed).catch((e) => { console.error(e); toast(ui!, `Die Pflanzung ging nicht durch: ${(e as Error).message}`, 15000); }); },
  }, info.catalog, info.rules);
  const aim = () => { if (stopped || !planting) return; planting.update(); requestAnimationFrame(aim); };
  requestAnimationFrame(aim);
}

/** The lights are the platform's (A-Frame's defaults = ArScene.vue's #host-lights): its directional light casts
 *  shadows with A-Frame's default shadow camera; the objects only cast them (receiving would stripe them, bias 0). */
function castsShadow(model: T.Object3D) {
  model.traverse((n) => { if ((n as T.Mesh).isMesh) n.castShadow = true; });
  return model;
}

/** Hands the planting (and its seed) to the sandbox, saves the file to start the same run again, then shows the plant. */
async function plant(plants: Planting[], seed: number) {
  const res = await fetch('/api/planting', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plants, seed }) });
  const answer = await res.json();
  if (!res.ok) throw new Error(answer.error);
  saveFile(answer.file, JSON.stringify(answer.values, null, 2));
  await showPlant(answer.plantingPoint);
}

/** Loading screen while the first answer's models load; then the plant, live. */
async function showPlant(plantingPoint: Vec3) {
  const load = loadingScreen(ui!);
  load.progress(0.1, 'Die Pflanze wird geladen …');
  const root = document.createElement('a-entity') as Entity;
  world!.appendChild(root);
  root.object3D.position.set(plantingPoint[0], 0, plantingPoint[2]); // positions in the answers are from the planting point
  live = new LivePlant(root);
  await live.prepare((f, note) => load.progress(0.1 + 0.9 * f, note));
  planting?.dispose(); // the planted copies make way for the live plant
  planting = null;
  live.start();
  load.done();
}
</script>

<template>
  <!-- Nothing here: the plant's content is added to the scene itself in script
       (world frame, ground at y = 0), not under the host's module position. No
       lights of its own either: the plant is lit by the platform's light alone
       (ambient #BBB + directional 0.6, ArScene.vue's #host-lights; the AR preview
       gets the same from A-Frame's default lights). -->
</template>
