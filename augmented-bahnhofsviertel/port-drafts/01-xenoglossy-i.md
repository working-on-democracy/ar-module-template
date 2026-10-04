# Port-Entwurf #1 Xenoglossy I (Tina Kohlmann)

Generiert von `npm run abv:port -- 1` aus `Projektordner_alt/kohlmann-xenoglossy/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-01-xenoglossy-i` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `gesicht` | `assets/Gesicht_v31-1.gltf` | `xenoglossy-i-Gesicht_v31-1.glb` | `#xenoglossy-i-Gesicht_v31-1` | converted |

In `<a-assets>` deklariert, aber nirgends referenziert (nicht importiert):
- (keine)

Nicht von der Szene referenziert (nicht importiert, ggf. Varianten/Geschwister-Werke prüfen):
- `assets/model.glb`

Aus JS referenzierte Assets (nicht importiert, manuell prüfen):
- (keine)

## Manuell zu entscheiden

### Szenen-Attribute (`<a-scene>`, gehören dem Host)
- `xrextras-almost-there`
- `xrextras-loading`
- `xrextras-runtime-error`
- `xrextras-gesture-detector`
- `xrweb`
- `id="scene"`
- `image-target-ui="skip-marker: true; recenter-button:true; reset-button: false"`
- `recenter`

### Kamera (`<a-camera>`, gehört dem Host)
- `id="camera"`
- `position="0 8 8"`
- `raycaster="objects: .cantap"`
- `cursor="fuse: false; rayOrigin: mouse;"`

### Komponenten in der Szene, die das Template nicht registriert
- `env-map-white`
- `image-target` — im alten Projekt selbst definiert

Im alten Projekt registrierte Komponenten: `image-target`, `image-target-ui`

### `xrextras-attach` → `attach-to`
- `xrextras-attach="target: camera; offset: 20 30 14"`

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `legacy-attach` mit gleichem Schema ersetzen — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `model`
- `ground`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `xenoglossy-i-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

### UI-Texte aus dem alten Projekt
- „Richte die Kamera auf die Euro-Skulptur und tippe auf“

### HTML-Fehler in body.html
- (keine)

### Image-Targets im Export
- `marker.json` — laut Entscheidung nicht verwendet (SLAM wie im Original, siehe PORTING-GUIDE.md).

## Szene (alt, Asset-Referenzen umgeschrieben)

Ohne `<a-assets>` und `<a-camera>`. Koordinaten noch im alten System (Kamera auf `0 8 8`) — Umrechnung siehe PORTING-GUIDE.md.

```html
<a-entity
      image-target
      position="0 0 -10"
      >
    <a-entity
          id="model"
          visible="false"
          gltf-model="#xenoglossy-i-Gesicht_v31-1"
          position="5 0 -4"
          rotation="0 -70 0"
          scale="25 25 25"
          xrextras-hold-drag
          xrextras-two-finger-rotate 
          xrextras-pinch-scale 
          class="cantap" 
          env-map-white
          shadow="recieve: false"
          animation-mixer="clip: animation_0"></a-entity>
    </a-entity>

<a-entity
    light="
      type: directional;
      intensity: 1.3;
      castShadow: true;
      shadowMapHeight:2048;
      shadowMapWidth:2048;
      shadowCameraTop: 40;
      shadowCameraBottom: -40;
      shadowCameraRight: 40;
      shadowCameraLeft: -40;
      target: #camera"
    xrextras-attach="target: camera; offset: 20 30 14"
    position="1 4.3 2.5"
    shadow>
  </a-entity>

<a-light type="ambient" intensity="0.8"></a-light>

<a-box
    id="ground"
    scale="10000 2 10000"
    position="0 -1 0"
    material="shader: shadow; transparent: true; opacity: 0.4"
    shadow>
  </a-box>
```
