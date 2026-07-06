import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Central driver for every lod-object beneath it — placed on the module root.
//
// In the original prototype this was an `AFRAME.registerSystem`; the new module
// system registers everything the manifest declares as a *component* (see
// host-runtime.registerManifestComponents), so it's ported to a component and
// mounted on the root entity. lod-object instances resolve it by walking up to
// the nearest `[lod-manager]` ancestor and call register()/unregister().
//
// Each frame it processes only a fraction of the registered objects
// (round-robin, `chunksPerCycle` buckets) to spread the cost, cross-fading each
// object's detailed mesh group against its billboard stand-in by camera distance.
export default {
  schema: {
    chunksPerCycle: { type: "number", default: 6 }
  },

  init() {
    const self = this as any;
    self.objects = [];
    self.camera = null;
    self.camPos = new THREE.Vector3();
    self.tmpWorldPos = new THREE.Vector3();
    self.frameCounter = 0;
  },

  register(obj: any) {
    (this as any).objects.push(obj);
  },

  unregister(obj: any) {
    const objects = (this as any).objects;
    const idx = objects.indexOf(obj);
    if (idx !== -1) objects.splice(idx, 1);
  },

  tick(_time: number, delta: number) {
    const self = this as any;
    if (!self.camera) {
      self.camera = self.el.sceneEl.camera;
      if (!self.camera) return;
    }

    self.camera.getWorldPosition(self.camPos);
    self.frameCounter++;

    const chunksPerCycle = self.data.chunksPerCycle;
    const chunkIndex = self.frameCounter % chunksPerCycle;
    const len = self.objects.length;

    for (let i = 0; i < len; i++) {
      if (i % chunksPerCycle !== chunkIndex) continue;

      const obj = self.objects[i];
      obj.el.object3D.getWorldPosition(self.tmpWorldPos);
      const distSq = self.tmpWorldPos.distanceToSquared(self.camPos);
      obj._lastDistSq = distSq;

      if (distSq <= obj.nearDistanceSq) {
        self.applyBlend(obj, 1, delta);
        continue;
      }
      if (distSq >= obj.farDistanceSq) {
        self.applyBlend(obj, 0, delta);
        continue;
      }

      const dist = Math.sqrt(distSq);
      const target = 1 - (dist - obj.nearDistance) / (obj.farDistance - obj.nearDistance);
      self.applyBlend(obj, target, delta);
    }
  },

  applyBlend(obj: any, groupTarget: number, delta: number) {
    const self = this as any;
    const chunksPerCycle = self.data.chunksPerCycle;
    const speed = obj.fadeSpeed * (delta / 1000) * chunksPerCycle;
    const newGroupBlend = obj.currentBlend + (groupTarget - obj.currentBlend) * Math.min(speed, 1);
    const groupChanged = Math.abs(newGroupBlend - obj.currentBlend) >= 0.001;
    if (groupChanged) obj.currentBlend = newGroupBlend;

    const meshVisible = obj.currentBlend > 0.01;
    const billboardVisible = obj.currentBlend < 0.99;

    obj.meshGroupObj.visible = meshVisible;

    if (meshVisible) {
      if (groupChanged) {
        for (const m of obj.meshMaterials) m.opacity = obj.currentBlend;
      }

      // Parts with their own data-lod-near/-far thresholds fade independently,
      // then get multiplied by the group blend so they never exceed it.
      for (const ov of obj.overrides) {
        let ovTarget;
        if (obj._lastDistSq <= ov.nearDistanceSq) {
          ovTarget = 1;
        } else if (obj._lastDistSq >= ov.farDistanceSq) {
          ovTarget = 0;
        } else {
          const dist = Math.sqrt(obj._lastDistSq);
          ovTarget = 1 - (dist - ov.nearDistance) / (ov.farDistance - ov.nearDistance);
        }

        const ovSpeed = ov.fadeSpeed * (delta / 1000) * chunksPerCycle;
        ov.currentBlend = ov.currentBlend + (ovTarget - ov.currentBlend) * Math.min(ovSpeed, 1);

        const finalOpacity = ov.currentBlend * obj.currentBlend;
        for (const m of ov.materials) m.opacity = finalOpacity;
      }
    }

    if (obj.billboardObj) {
      obj.billboardObj.visible = billboardVisible;
      if (billboardVisible) {
        for (const m of obj.billboardMaterials) m.opacity = 1 - obj.currentBlend;
      }
    }
  }
} as ComponentDefinition;
