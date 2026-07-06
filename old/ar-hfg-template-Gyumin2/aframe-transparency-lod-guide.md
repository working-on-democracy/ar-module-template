# A-Frame Guide: Transparency Sorting & LOD-Billboard-System für Leuchtstäbe

Dieser Guide beschreibt zwei zusammenhängende Themen:

1. **Transparency Sorting** in A-Frame/Three.js – warum es Probleme gibt und wie man sie mit einer Renderorder-Component in den Griff bekommt.
2. **Gruppen-basiertes LOD-System** für die 25 Leuchtstab-Modelle (je 4 glbs, 5 Kopien pro Design = 125 Instanzen), inklusive Billboard-Crossfade und einem zentralen Performance-Manager.

Am Ende folgt ein **optionaler, separater Schritt**: ein InstancedMesh + Texture-Atlas-Setup für die Billboards mit Per-Instance-Opacity, für den Fall dass die einfache Billboard-Lösung zum GPU-Bottleneck wird.

---

## 1. Transparency Sorting in A-Frame/Three.js

### 1.1 Warum es Probleme gibt

WebGL hat kein eingebautes Order-Independent-Transparency. Three.js verwendet eine Painter's-Algorithm-Näherung, die sich **innerhalb** eines Meshes und **zwischen** Objekten unterschiedlich verhält:

- **Zwischen Objekten**: Three.js sortiert transparente `Object3D`s grob nach Distanz Kamera → Bounding-Sphere-Zentrum. Das ist nur eine Annäherung und schlägt fehl, wenn sich Bounding Spheres überlappen oder Objekte groß/konkav sind.
- **Innerhalb eines Meshes**: Three.js sortiert Dreiecke **nie**. Sie werden in der Reihenfolge des Index-Buffers gezeichnet. Bei überlappenden transparenten Flächen in einem Mesh gibt es dafür keine automatische Korrektur.

### 1.2 Lösung: Renderorder-Component (pro Entity steuerbar)

Diese Component erlaubt es, für jede Entity (bzw. jedes Mesh darin) eine explizite Zeichenreihenfolge festzulegen. Niedrigere Werte werden zuerst gezeichnet.

```js
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
```

**Verwendung:**

```html
<a-entity gltf-model="#glassOuter" render-order="1"></a-entity>
<a-entity gltf-model="#liquidInner" render-order="0"></a-entity>
```

### 1.3 Weitere Maßnahmen gegen Sortierartefakte

| Maßnahme | Wann einsetzen |
|---|---|
| `material.alphaTest = 0.5; material.transparent = false;` | Bei binärer Transparenz (Cutouts, Laub, Gitter) – wird wie opak behandelt, keine Sortierung nötig |
| `material.depthWrite = false` | Bei echten Blend-Materialien, verhindert dass transparente Fragmente sich gegenseitig blockieren |
| `material.side = THREE.FrontSide` | Vermeidet doppelte Sortierprobleme durch Backfaces, wenn Rückseite nicht sichtbar sein muss |
| Mesh in Blender aufteilen | Ermöglicht individuelles `renderOrder` pro Teilobjekt statt einem unsortierbaren Gesamtmesh |

### 1.4 Prävention beim Blender-Export

- Blend Mode **Alpha Clip** statt **Alpha Blend** für hart-kantige Transparenz verwenden (exportiert als glTF `MASK`-Modus).
- Transparente Flächen als **separate Objekte** exportieren, nicht mit opaken/anderen transparenten Meshes zusammenführen.
- **„Show Backface"** deaktivieren, wenn Rückseiten nicht sichtbar sein müssen (Blender-Standardmaterial ist oft doppelseitig).
- Blend Mode konsequent auf **Opaque** setzen für alles, was nicht wirklich durchsichtig ist (verhindert unnötiges Einsortieren in die transparente Render-Queue).
- Bei Booleans/Merges: transparente Objekte separat halten, wenn später individuelle Sortierkontrolle nötig ist.

---

## 2. LOD-System für die Leuchtstäbe

### 2.1 Ausgangslage

- 25 individuelle Leuchtstab-Designs
- Jedes Design besteht aus **4 glbs** (wegen Material-/Transparenzkonflikten in einem einzigen Mesh)
- Jedes Design existiert **5x** in der Szene → 125 Leuchtstab-Instanzen, 500 glb-Entities insgesamt (100 unique glb-Dateien, mehrfach referenziert)
- Jede Gruppe aus 4 glbs muss:
  - gemeinsam ein-/ausgeblendet werden
  - über einen gemeinsamen Parent-Transform bewegbar sein
  - im LOD-System **als eine Einheit** durch **ein** Billboard ersetzt werden (nicht 4 einzelne)

### 2.2 HTML-Struktur pro Leuchtstab-Instanz

```html
<a-entity class="lightstick-instance"
          lod-object="nearDistance: 12; farDistance: 28"
          position="3 0 -15">

  <a-entity class="lod-mesh-group" visible="true">
    <a-entity class="lod-mesh" gltf-model="#stick03_part1" render-order="0"></a-entity>
    <a-entity class="lod-mesh" gltf-model="#stick03_part2" render-order="1"></a-entity>
    <a-entity class="lod-mesh" gltf-model="#stick03_part3" render-order="2"></a-entity>
    <a-entity class="lod-mesh" gltf-model="#stick03_part4" render-order="3"></a-entity>
  </a-entity>

  <a-entity class="lod-billboard" gltf-model="#stick03_billboard" billboard></a-entity>
</a-entity>
```

Wichtig:
- `.lightstick-instance` ist der **gemeinsame Transform** – Position/Rotation/Scale hier bewegt Mesh-Gruppe und Billboard zusammen.
- `.lod-mesh-group` bündelt die 4 Teile, damit sie über ein einziges `visible`-Flag gemeinsam ein-/ausgeblendet werden können (Three.js respektiert `visible` rekursiv für Kinder).
- `render-order` (aus Kapitel 1.2) direkt an den 4 Teilen gesetzt, um Sortierkonflikte **innerhalb** der Gruppe zu vermeiden.
- Da alle 5 Kopien eines Designs dieselben glb-URLs referenzieren, cached A-Frame das Parsen intern – die Datei wird nur einmal geladen, aber jede Entity bekommt einen eigenen Szenengraph-Klon (wichtig für unabhängiges Fading pro Instanz).
- **Billboard als glb statt A-Frame-Primitive**: Das Billboard ist hier keine `geometry="primitive: plane"` mehr, sondern eine in Blender angelegte Plane mit dem PNG als Textur, exportiert als eigenes glb (`#stick03_billboard`). Das gibt volle Kontrolle über Blend Mode, Normalenausrichtung und Backface Culling direkt in Blender (siehe Kapitel 1.4 und die Hinweise unten zu 2.3). Dadurch ändert sich, wie `lod-object` auf das Billboard-Material zugreift – Details dazu im nächsten Abschnitt.

### 2.3 `lod-object` Component (Gruppen-fähig, kein eigenes `tick()`)

Diese Component ist bewusst leichtgewichtig – sie sammelt beim Laden die Materialien aller 4 Teile, meldet sich beim zentralen Manager an und übernimmt selbst **keine** Berechnung pro Frame.

Standardmäßig teilen sich alle Teile einer Gruppe denselben Blend-Wert (Mesh-Gruppe ↔ Billboard). Optional kann ein einzelnes Teil **eigene near/far-Schwellenwerte** bekommen (z. B. ein Glow-Layer, der schon früher ausfaden soll) – dafür reicht ein Datenattribut direkt am jeweiligen `.lod-mesh`:

```html
<a-entity class="lod-mesh-group" visible="true">
  <a-entity class="lod-mesh" gltf-model="#stick03_part1"></a-entity>
  <a-entity class="lod-mesh" gltf-model="#stick03_part2"
            data-lod-near="8" data-lod-far="18"></a-entity>
  <a-entity class="lod-mesh" gltf-model="#stick03_part3"></a-entity>
  <a-entity class="lod-mesh" gltf-model="#stick03_part4"></a-entity>
</a-entity>
```

Teile ohne `data-lod-near`/`data-lod-far` verhalten sich wie bisher (folgen 1:1 dem Gruppen-Blend). Teile mit diesen Attributen bekommen einen eigenen, unabhängigen Blend-Wert, der am Ende **mit dem Gruppen-Blend multipliziert** wird – so kann ein Sub-Mesh nie sichtbarer sein als die Gruppe selbst, auch wenn sein eigener Distanzbereich das eigentlich erlauben würde.

```js
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
    this.billboardMaterials = [];   // Array statt Einzelmaterial (glb kann mehrere Materialien haben)

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
          fadeSpeed: this.fadeSpeed, // optional auch per eigenem data-Attribut individualisierbar
          materials: []
        };
        this.overrides.push(overrideEntry);
      }

      el.addEventListener('model-loaded', () => {
        const mesh = el.getObject3D('mesh');
        mesh.traverse((node) => {
          if (node.isMesh) {
            // Materialien klonen, damit jede Instanz unabhängig faden kann
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

    // Billboard ist jetzt ein glb (Blender-Plane + PNG), kein A-Frame-Primitive mehr.
    // Dafür gilt "model-loaded" statt "materialtextureloaded", und getObject3D('mesh')
    // liefert eine Group (die geladene glb-Szene), kein einzelnes Mesh mit .material.
    this.billboardEl.addEventListener('model-loaded', () => {
      this.billboardObj = this.billboardEl.getObject3D('mesh');
      this.billboardMaterials = [];
      this.billboardObj.traverse((node) => {
        if (node.isMesh) {
          node.material = Array.isArray(node.material)
            ? node.material.map(m => m.clone())
            : node.material.clone();
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach(m => {
            m.transparent = true;
            this.billboardMaterials.push(m);
          });
        }
      });
    });

    this.el.sceneEl.systems['lod-manager'].register(this);
  },

  remove: function () {
    this.el.sceneEl.systems['lod-manager'].unregister(this);
  }
});
```

**Zu beachten (Sub-Mesh-Overrides):**
- Sub-Mesh-`nearDistance`/`farDistance` sollten innerhalb des Gruppenbereichs liegen (z. B. Gruppe 12–28, Glow-Teil 8–18). Ein Bereich, der über den Gruppenbereich hinausreicht, hat keinen sichtbaren Effekt, weil die Gruppe vorher schon komplett zum Billboard gewechselt ist.
- Mehrere Sub-Meshes mit unterschiedlichen Overrides funktionieren direkt, da `overrides` ein Array ist – jedes bekommt seinen eigenen `currentBlend`-State.
- `render-order` (Kapitel 1.2) bleibt unabhängig davon wichtig, gerade weil jetzt mehrere unterschiedliche Opacity-Werte innerhalb einer Gruppe gleichzeitig aktiv sein können.

**Zu beachten (glb-Billboard, Blender-Export):**
- Blend Mode am Billboard-Material auf **Alpha Blend** setzen (nicht Alpha Clip), sonst poppt die Kante beim Crossfade statt weich zu faden.
- **Backface Culling** (siehe Kapitel 1.4) aktivieren, wenn nur die Vorderseite sichtbar sein muss – spart Fragment-Berechnungen. In aktuellen Blender-Versionen liegt die Option je nach Version an unterschiedlichen Stellen (Material Properties → Settings/Viewport Display, Unteroption „Camera"); im Zweifel nach dem Export direkt im glb-Viewer oder in A-Frame prüfen, ob die Rückseite tatsächlich unsichtbar ist.
- **Origin der Plane** auf ihr Zentrum setzen (`Object > Set Origin > Origin to Geometry`), damit sich das Billboard beim `lookAt` sauber um die Mitte statt um eine Ecke dreht.
- **Alle Transforms anwenden** (`Ctrl+A > All Transforms`) vor Export, damit Breite/Höhe nicht unerwartet von der Blender-Objektskalierung abhängen.

### 2.4 Billboard-Component (Ausrichtung zur Kamera)

```js
AFRAME.registerComponent('billboard', {
  tick: function () {
    const camera = this.el.sceneEl.camera;
    if (!camera) return;
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    this.el.object3D.lookAt(camPos);
  }
});
```

> Hinweis: Bei 125 Instanzen läuft dieses `tick()` derzeit noch pro Billboard-Entity. Wer hier zusätzlich Overhead sparen will, kann die Ausrichtung ebenfalls in den zentralen Manager verlagern (gleiches Staggering-Prinzip wie beim LOD-Blend). Für den Start ist das meist nicht nötig, da reine `lookAt`-Aufrufe günstig sind.

### 2.5 Zentraler `lod-manager` (System)

Verwaltet **alle** registrierten Leuchtstab-Gruppen in einem einzigen `tick()`, mit Staggering (nicht jedes Objekt jeden Frame prüfen) und quadrierten Distanzen zur Vermeidung unnötiger `sqrt()`-Aufrufe. Diese Version berücksichtigt zusätzlich die optionalen Sub-Mesh-Overrides aus 2.3: Jede Gruppe hat einen **Gruppen-Blend** (Mesh-Gruppe ↔ Billboard), und Sub-Meshes mit eigenen `data-lod-near`/`data-lod-far`-Werten bekommen einen **zweiten, multiplikativ kombinierten Blend-Wert**.

```js
AFRAME.registerSystem('lod-manager', {
  schema: {
    chunksPerCycle: {type: 'number', default: 6} // Objekte werden auf N Frames verteilt geprüft
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
      obj._lastDistSq = distSq; // für Sub-Mesh-Overrides in applyBlend verfügbar machen

      if (distSq <= obj.nearDistanceSq) {
        this.applyBlend(obj, 1, delta);
        continue;
      }
      if (distSq >= obj.farDistanceSq) {
        this.applyBlend(obj, 0, delta);
        continue;
      }

      // Nur im Übergangsbereich wird die echte Distanz gebraucht
      const dist = Math.sqrt(distSq);
      const target = 1 - (dist - obj.nearDistance) / (obj.farDistance - obj.nearDistance);
      this.applyBlend(obj, target, delta);
    }
  },

  applyBlend: function (obj, groupTarget, delta) {
    // --- Gruppen-Blend (Mesh-Gruppe <-> Billboard) ---
    const speed = obj.fadeSpeed * (delta / 1000) * this.data.chunksPerCycle;
    const newGroupBlend = obj.currentBlend + (groupTarget - obj.currentBlend) * Math.min(speed, 1);
    const groupChanged = Math.abs(newGroupBlend - obj.currentBlend) >= 0.001;
    if (groupChanged) obj.currentBlend = newGroupBlend;

    const meshVisible = obj.currentBlend > 0.01;
    const billboardVisible = obj.currentBlend < 0.99;

    obj.meshGroupObj.visible = meshVisible;

    if (meshVisible) {
      // Normale Teile bekommen einfach den Gruppen-Blend
      if (groupChanged) {
        for (let m of obj.meshMaterials) m.opacity = obj.currentBlend;
      }

      // --- Sub-Meshes mit eigenen near/far-Werten (aus 2.3) ---
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

        // Sub-Mesh-Blend * Gruppen-Blend: Sub-Mesh kann nie sichtbarer sein als die Gruppe
        const finalOpacity = ov.currentBlend * obj.currentBlend;
        for (let m of ov.materials) m.opacity = finalOpacity;
      }
    }

    // Billboard: Array von Materialien statt Einzelmaterial (glb kann mehrere haben)
    if (obj.billboardObj) {
      obj.billboardObj.visible = billboardVisible;
      if (billboardVisible) {
        for (let m of obj.billboardMaterials) m.opacity = 1 - obj.currentBlend;
      }
    }
  }
});
```

**Performance-Hinweis:** Die zusätzliche Schleife über `obj.overrides` läuft nur für Objekte, die im aktuellen Frame ohnehin schon per Staggering geprüft werden, und nur wenn überhaupt Overrides definiert sind (leeres Array = keine Zusatzkosten für Gruppen ohne Sub-Mesh-Overrides).

### 2.6 Einbindung in die Szene

```html
<a-scene lod-manager="chunksPerCycle: 6">

  <!-- 125 Instanzen, jeweils Struktur wie in 2.2 -->
  <a-entity class="lightstick-instance" lod-object="nearDistance: 12; farDistance: 28" position="...">
    ...
  </a-entity>
  <!-- ... -->

</a-scene>
```

### 2.7 Checkliste für den Umsetzungsprozess

1. **Blender-Export vorbereiten**: Pro Leuchtstab-Design die 4 Teile als separate glbs exportieren, Ursprünge korrekt setzen (siehe vorherige Diskussion zu Origins), Blend Modes korrekt konfigurieren (Kapitel 1.4).
2. **Billboard-Plane in Blender bauen**: PNG mit transparentem Hintergrund aus typischer Betrachterperspektive rendern (Blender: Film → Transparent), auf eine Plane legen, Origin zentrieren, Transforms anwenden, Alpha Blend + Backface Culling setzen, als eigenes glb exportieren (siehe Hinweise in 2.3).
3. **Assets registrieren**: 100 Mesh-glbs + 25 Billboard-glbs als `<a-asset-item>` in `<a-assets>` einbinden.
4. **Components/Systems registrieren**: `render-order`, `billboard`, `lod-object`, `lod-manager` global einbinden (z. B. in einer `components.js`).
5. **125 Instanzen aufbauen**: Struktur aus 2.2 pro Instanz generieren (idealerweise per Script/Loop statt Copy-Paste, um Tippfehler bei den 100 Asset-Referenzen zu vermeiden).
6. **RenderOrder pro Teil setzen**: Reihenfolge innerhalb jeder Gruppe konsistent mit der Blender-Exportreihenfolge festlegen.
7. **LOD-Distanzen testen**: `nearDistance`/`farDistance` an die tatsächliche Bühnen-/Zuschauergeometrie anpassen, `chunksPerCycle` bei Bedarf erhöhen, falls FPS-Einbrüche auftreten.
8. **Performance messen**: Erst nach diesem Basissetup prüfen, ob der optionale Schritt 3 (InstancedMesh-Billboards) überhaupt nötig ist.

---

## 3. Optional: InstancedMesh + Texture-Atlas-Billboards mit Per-Instance-Opacity

> **Dieser Schritt ist optional und unabhängig vom Rest des Guides.** Er lohnt sich nur, wenn im Test tatsächlich ein GPU-Bottleneck durch die vielen einzelnen Billboard-Draw-Calls in der Ferne-Ansicht auftritt (z. B. wenn viele der 125 Leuchtstäbe gleichzeitig im reinen Billboard-Zustand sind). Ohne diesen Schritt funktioniert das System aus Kapitel 2 vollständig – es rendert nur bis zu 125 einzelne Billboard-Draw-Calls statt einem.

### 3.1 Idee

- Alle 25 Billboard-PNGs werden zu einem **Texture-Atlas** zusammengefasst (z. B. 5×5 Raster).
- Alle Billboards werden als **ein einziges `THREE.InstancedMesh`** gerendert (ein Draw Call für bis zu 125 Instanzen).
- Da Standard-Materialien keine Per-Instance-Opacity unterstützen, wird das Material per `onBeforeCompile` um ein zusätzliches Instance-Attribut für Alpha erweitert.
- UV-Offsets ins Atlas werden ebenfalls per Instance-Attribut übergeben, damit jede Instanz das richtige Ausschnittsbild zeigt.

### 3.2 Atlas vorbereiten

- 25 Billboard-PNGs in ein 5×5-Grid packen (z. B. via Bildbearbeitung oder einem kleinen Build-Script mit `sharp`/Canvas).
- Jede Kachel bekommt eine UV-Range: `uOffset = (index % 5) / 5`, `vOffset = Math.floor(index / 5) / 5`, Kachelgröße `1/5 x 1/5`.

### 3.3 Setup-Code

```js
AFRAME.registerComponent('instanced-billboards', {
  schema: {
    atlasSrc: {type: 'asset'},
    gridSize: {type: 'number', default: 5}, // 5x5 Atlas
    maxCount: {type: 'number', default: 125}
  },

  init: function () {
    this.instances = []; // { position, designIndex, opacity }
    this.dummy = new THREE.Object3D();

    const geometry = new THREE.PlaneGeometry(0.3, 1.2);

    // Per-Instance Attribute für UV-Offset und Opacity
    const uvOffsets = new Float32Array(this.data.maxCount * 2);
    const opacities = new Float32Array(this.data.maxCount).fill(1);

    geometry.setAttribute('instanceUvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
    geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(opacities, 1));

    const texture = new THREE.TextureLoader().load(this.data.atlasSrc);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    });

    // Shader um Per-Instance UV-Offset + Opacity erweitern
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `
        attribute vec2 instanceUvOffset;
        attribute float instanceOpacity;
        varying float vInstanceOpacity;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `
        #include <uv_vertex>
        vUv = vUv / ${this.data.gridSize.toFixed(1)} + instanceUvOffset;
        vInstanceOpacity = instanceOpacity;
        `
      );

      shader.fragmentShader = `
        varying float vInstanceOpacity;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphamap_fragment>',
        `
        #include <alphamap_fragment>
        diffuseColor.a *= vInstanceOpacity;
        `
      );
    };

    this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.data.maxCount);
    this.instancedMesh.frustumCulled = false; // da wir Positionen dynamisch setzen
    this.el.sceneEl.object3D.add(this.instancedMesh);

    this.uvOffsetAttr = geometry.attributes.instanceUvOffset;
    this.opacityAttr = geometry.attributes.instanceOpacity;
  },

  // Wird vom lod-manager pro Instanz aufgerufen statt eigener Billboard-Entity
  setInstance: function (index, position, designIndex, opacity, camera) {
    this.dummy.position.copy(position);
    this.dummy.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    this.dummy.updateMatrix();
    this.instancedMesh.setMatrixAt(index, this.dummy.matrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;

    const gridSize = this.data.gridSize;
    this.uvOffsetAttr.setXY(
      index,
      (designIndex % gridSize) / gridSize,
      Math.floor(designIndex / gridSize) / gridSize
    );
    this.uvOffsetAttr.needsUpdate = true;

    this.opacityAttr.setX(index, opacity);
    this.opacityAttr.needsUpdate = true;
  }
});
```

### 3.4 Integration in den `lod-manager`

Statt pro Instanz eine eigene `.lod-billboard`-Entity zu togglen, würde `applyBlend` im Manager stattdessen `instancedBillboards.setInstance(index, worldPos, designIndex, 1 - newBlend, camera)` aufrufen. Das erfordert:

- Jeder `lod-object` bekommt einen festen `instanceIndex` (0–124) beim Registrieren zugewiesen.
- Jeder `lod-object` kennt seinen `designIndex` (welches der 25 Designs, für den Atlas-Lookup).
- Die einzelnen `.lod-billboard`-Entities aus Kapitel 2.2 entfallen komplett zugunsten des einen globalen InstancedMesh.

### 3.5 Abwägung

| Aspekt | Einfache Billboards (Kapitel 2) | InstancedMesh + Atlas (optional) |
|---|---|---|
| Draw Calls (Ferne-Ansicht) | bis zu 125 | 1 |
| Implementierungsaufwand | gering | hoch (Custom-Shader-Patch) |
| Wartbarkeit | einfach anzupassen | Änderungen am Shader nötig bei z. B. Farbfilter/Tint |
| Empfehlung | Standard-Startpunkt | Nur nachrüsten bei nachgewiesenem GPU-Bottleneck |

**Empfehlung:** Mit Kapitel 1 und 2 starten, Szene mit allen 125 Instanzen im Zielgerät (v. a. mobile VR/AR-Hardware, falls relevant) testen, und erst bei tatsächlich gemessenen Performance-Problemen auf das InstancedMesh-Setup aus Kapitel 3 wechseln.
