AFRAME.registerComponent('no-frustrum-cull', {
  init() {
    const models = this.el.querySelectorAll('[gltf-model]')
    models.forEach((el) => {
      el.addEventListener('model-loaded', () => {
        el.object3D.traverse((object) => {
          object.frustumCulled = false
        })
      })
    })
  },
})

AFRAME.registerComponent('unlit-material', {
  schema: {
    keepEmissive: {type: 'boolean', default: true} // Emissive-Farbe als Basisfarbe übernehmen, falls vorhanden
  },

  init: function () {
    this.el.addEventListener('model-loaded', () => {
      const mesh = this.el.getObject3D('mesh');
      if (!mesh) return;

      mesh.traverse((node) => {
        if (!node.isMesh) return;

        const mats = Array.isArray(node.material) ? node.material : [node.material];
        const newMats = mats.map((oldMat) => {
          const basicMat = new THREE.MeshBasicMaterial({
            map: oldMat.map || null,
            color: oldMat.color ? oldMat.color.clone() : new THREE.Color(0xffffff),
            transparent: oldMat.transparent,
            opacity: oldMat.opacity,
            side: oldMat.side,
            alphaTest: oldMat.alphaTest,
            depthWrite: oldMat.depthWrite,
            vertexColors: oldMat.vertexColors
          });

          // Falls das Original ein Emissive-Glühen hatte, als Farbe übernehmen,
          // damit der visuelle Effekt (z.B. Neon-Leuchten) erhalten bleibt
          if (this.data.keepEmissive && oldMat.emissive && oldMat.emissiveIntensity > 0) {
            basicMat.color.lerp(oldMat.emissive, Math.min(oldMat.emissiveIntensity, 1));
          }

          return basicMat;
        });

        node.material = Array.isArray(node.material) ? newMats : newMats[0];
        node.castShadow = false;   // unlit-Objekte werfen sinnvollerweise keinen Schatten
        node.receiveShadow = false; // ... und empfangen auch keinen
      });
    });
  }
});

AFRAME.registerComponent('render-order', {
  schema: {type: 'number', default: 0},
  init: function () {
    this.el.addEventListener('model-loaded', () => {
      const mesh = this.el.getObject3D('mesh');
      if (!mesh) return;
      mesh.traverse(node => {
        if (node.isMesh) node.renderOrder = this.data;
      });
    });
  }
});


AFRAME.registerComponent('billboard', {
  init: function () {
    this.camWorldPos = new THREE.Vector3();
    this.localCamPos = new THREE.Vector3();
  },

  tick: function () {
    const camera = this.el.sceneEl.camera;
    if (!camera) return;

    const obj = this.el.object3D;
    if (!obj.parent) return;

    camera.getWorldPosition(this.camWorldPos);

    // Kamera-Weltposition in den lokalen Koordinatenraum des Parents umrechnen.
    // Dadurch wird jede Rotation/Position/Skalierung des Parents automatisch
    // berücksichtigt (z.B. ein gekippter Leuchtstab-Transform) -- die lokale
    // Y-Achse bleibt dabei die Rotationsachse, egal wie schief sie im Weltraum steht.
    this.localCamPos.copy(this.camWorldPos);
    obj.parent.worldToLocal(this.localCamPos);

    const dx = this.localCamPos.x - obj.position.x;
    const dz = this.localCamPos.z - obj.position.z;

    obj.rotation.y = Math.atan2(dx, dz);
  }
});

AFRAME.registerComponent('lod-object', {
  schema: {
    nearDistance: {type: 'number', default: 15},
    farDistance: {type: 'number', default: 25},
    fadeSpeed: {type: 'number', default: 3}
  },

  init: function () {
    this.nearDistance = this.data.nearDistance;
    this.farDistance = this.data.farDistance;
    this.nearDistanceSq = this.nearDistance * this.nearDistance;
    this.farDistanceSq = this.farDistance * this.farDistance;
    this.fadeSpeed = this.data.fadeSpeed;
    this.currentBlend = 1;

    this.meshEls = Array.from(this.el.querySelectorAll('.lod-mesh'));
    this.billboardEl = this.el.querySelector('.lod-billboard');
    this.meshGroupObj = this.el.querySelector('.lod-mesh-group').object3D;

    this.meshMaterials = [];  // Teile OHNE eigene Schwellenwerte
    this.overrides = [];      // Teile MIT eigenen Schwellenwerten (data-lod-near/-far)

    this.billboardObj = null;
    this.billboardMaterials = [];   // Array statt Einzelmaterial (glb kann mehrere haben)

    this.meshEls.forEach((el) => {
      const nearAttr = el.getAttribute('data-lod-near');
      const farAttr = el.getAttribute('data-lod-far');
      const hasOverride = nearAttr !== null && farAttr !== null;

      let overrideEntry = null;
      if (hasOverride) {
        const near = parseFloat(nearAttr);
        const far = parseFloat(farAttr);
        overrideEntry = {
          nearDistance: near,
          farDistance: far,
          nearDistanceSq: near * near,
          farDistanceSq: far * far,
          currentBlend: 1,
          fadeSpeed: this.fadeSpeed,
          materials: []
        };
        this.overrides.push(overrideEntry);
      }

      el.addEventListener('model-loaded', () => {
        const mesh = el.getObject3D('mesh');
        mesh.traverse((node) => {
          if (node.isMesh) {
            node.material = Array.isArray(node.material)
                ? node.material.map(m => m.clone())
                : node.material.clone();
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach(m => {
              m.transparent = true;
              if (hasOverride) {
                overrideEntry.materials.push(m);
              } else {
                this.meshMaterials.push(m);
              }
            });
          }
        });
      });
    });

    // Billboard ist ein glb (Plane + PNG aus Blender), kein A-Frame-Primitive
    this.billboardEl.addEventListener('model-loaded', () => {
      this.billboardObj = this.billboardEl.getObject3D('mesh'); // Group, kein einzelnes Mesh
      this.billboardMaterials = [];
      this.billboardObj.traverse((node) => {
        if (node.isMesh) {
          node.material = Array.isArray(node.material)
              ? node.material.map(m => m.clone())
              : node.material.clone();
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach(m => {
            m.transparent = true;
            m.alphaTest = 0;                     // verhindert binäres Cutout-Verhalten während des Fades
            m.depthWrite = false;                // verhindert Depth-Sortier-Popping bei Überlappung
            m.opacity = 1 - this.currentBlend;   // sofort korrekt statt Default-Opazität
            this.billboardMaterials.push(m);
          });
        }
      });
      this.billboardObj.visible = this.currentBlend < 0.99; // sofort korrekt statt Default "true"
    });

    this.el.sceneEl.systems['lod-manager'].register(this);
  },

  remove: function () {
    this.el.sceneEl.systems['lod-manager'].unregister(this);
  }
});

AFRAME.registerSystem('lod-manager', {
  schema: {
    chunksPerCycle: {type: 'number', default: 6}
  },

  init: function () {
    this.objects = [];
    this.camera = null;
    this.camPos = new THREE.Vector3();
    this.tmpWorldPos = new THREE.Vector3();
    this.frameCounter = 0;
  },

  register: function (obj) {
    this.objects.push(obj);
  },

  unregister: function (obj) {
    const idx = this.objects.indexOf(obj);
    if (idx !== -1) this.objects.splice(idx, 1);
  },

  tick: function (time, delta) {
    if (!this.camera) {
      this.camera = this.el.sceneEl.camera;
      if (!this.camera) return;
    }

    this.camera.getWorldPosition(this.camPos);
    this.frameCounter++;

    const chunkIndex = this.frameCounter % this.data.chunksPerCycle;
    const len = this.objects.length;

    for (let i = 0; i < len; i++) {
      if (i % this.data.chunksPerCycle !== chunkIndex) continue;

      const obj = this.objects[i];
      obj.el.object3D.getWorldPosition(this.tmpWorldPos);
      const distSq = this.tmpWorldPos.distanceToSquared(this.camPos);
      obj._lastDistSq = distSq;

      if (distSq <= obj.nearDistanceSq) {
        this.applyBlend(obj, 1, delta);
        continue;
      }
      if (distSq >= obj.farDistanceSq) {
        this.applyBlend(obj, 0, delta);
        continue;
      }

      const dist = Math.sqrt(distSq);
      const target = 1 - (dist - obj.nearDistance) / (obj.farDistance - obj.nearDistance);
      this.applyBlend(obj, target, delta);
    }
  },

  applyBlend: function (obj, groupTarget, delta) {
    const speed = obj.fadeSpeed * (delta / 1000) * this.data.chunksPerCycle;
    const newGroupBlend = obj.currentBlend + (groupTarget - obj.currentBlend) * Math.min(speed, 1);
    const groupChanged = Math.abs(newGroupBlend - obj.currentBlend) >= 0.001;
    if (groupChanged) obj.currentBlend = newGroupBlend;

    const meshVisible = obj.currentBlend > 0.01;
    const billboardVisible = obj.currentBlend < 0.99;

    obj.meshGroupObj.visible = meshVisible;

    if (meshVisible) {
      if (groupChanged) {
        for (let m of obj.meshMaterials) m.opacity = obj.currentBlend;
      }

      for (let ov of obj.overrides) {
        let ovTarget;
        if (obj._lastDistSq <= ov.nearDistanceSq) {
          ovTarget = 1;
        } else if (obj._lastDistSq >= ov.farDistanceSq) {
          ovTarget = 0;
        } else {
          const dist = Math.sqrt(obj._lastDistSq);
          ovTarget = 1 - (dist - ov.nearDistance) / (ov.farDistance - ov.nearDistance);
        }

        const ovSpeed = ov.fadeSpeed * (delta / 1000) * this.data.chunksPerCycle;
        ov.currentBlend = ov.currentBlend + (ovTarget - ov.currentBlend) * Math.min(ovSpeed, 1);

        const finalOpacity = ov.currentBlend * obj.currentBlend;
        for (let m of ov.materials) m.opacity = finalOpacity;
      }
    }

    // Billboard: jetzt Array von Materialien statt Einzelmaterial
    if (obj.billboardObj) {
      obj.billboardObj.visible = billboardVisible;
      if (billboardVisible) {
        for (let m of obj.billboardMaterials) m.opacity = 1 - obj.currentBlend;
      }
    }
  }
});

AFRAME.registerComponent('ground-decal', {
  schema: {
    groundY: {type: 'number', default: 0}, // Welt-Y-Höhe des Bodens
    live: {type: 'boolean', default: false} // true = jeden Frame neu berechnen (bei bewegten/rotierten Parents)
  },

  init: function () {
    // Ziel-Weltrotation: flach, Textur nach oben.
    // -90° um X dreht eine Standard-Plane (Normale zeigt default +Z) so, dass sie +Y (nach oben) zeigt.
    // Falls deine Plane aus Blender/anderem Export eine andere Ausgangsausrichtung hat,
    // diesen Wert entsprechend anpassen (z.B. +90 statt -90, falls sie kopfüber liegt).
    this.desiredWorldQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

    this.parentWorldQuat = new THREE.Quaternion();
    this.parentWorldPos = new THREE.Vector3();
    this.desiredWorldPos = new THREE.Vector3();

    this.applied = false;

    // Fog-Ausschluss: sobald das glb geladen ist, alle Materialien von der
    // Scene-Fog-Berechnung ausnehmen, damit die Decal nicht mit der Entfernung
    // ausgeblendet wird.
    this.el.addEventListener('model-loaded', () => {
      const mesh = this.el.getObject3D('mesh');
      if (!mesh) return;
      mesh.traverse((node) => {
        if (node.isMesh) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach(m => {
            m.fog = false;
          });
        }
      });
    });
  },

  tick: function () {
    if (!this.data.live && this.applied) return; // im "static"-Modus nur einmal anwenden

    const obj = this.el.object3D;
    const parent = obj.parent;
    if (!parent) return;

    // --- Rotation: unabhängig von der Parent-Rotation immer flach ---
    parent.getWorldQuaternion(this.parentWorldQuat);
    obj.quaternion.copy(this.parentWorldQuat).invert().multiply(this.desiredWorldQuat);

    // --- Position: exakt unter dem Parent-Pivot, auf fixer Bodenhöhe ---
    parent.getWorldPosition(this.parentWorldPos);
    this.desiredWorldPos.set(this.parentWorldPos.x, this.data.groundY, this.parentWorldPos.z);
    parent.worldToLocal(this.desiredWorldPos); // Vector3 wird in lokale Koordinaten umgerechnet
    obj.position.copy(this.desiredWorldPos);

    this.applied = true;
  }
});