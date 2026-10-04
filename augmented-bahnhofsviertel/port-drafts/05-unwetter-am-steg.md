# Port-Entwurf #5 Unwetter am Steg (Parastou Forouhar)

Generiert von `npm run abv:port -- 5` aus `Projektordner_alt/forouhar-unwetter/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-05-unwetter-am-steg` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `wolke` | `assets/Wolke_v05.gltf` | `unwetter-am-steg-Wolke_v05.glb` | `#unwetter-am-steg-Wolke_v05` | converted |
| `posx` | `assets/cubemap-static/posx.jpg` | `unwetter-am-steg-posx.jpg` | `#unwetter-am-steg-posx` | imported |
| `posy` | `assets/cubemap-static/posy.jpg` | `unwetter-am-steg-posy.jpg` | `#unwetter-am-steg-posy` | imported |
| `posz` | `assets/cubemap-static/posz.jpg` | `unwetter-am-steg-posz.jpg` | `#unwetter-am-steg-posz` | imported |
| `negx` | `assets/cubemap-static/negx.jpg` | `unwetter-am-steg-negx.jpg` | `#unwetter-am-steg-negx` | imported |
| `negy` | `assets/cubemap-static/negy.jpg` | `unwetter-am-steg-negy.jpg` | `#unwetter-am-steg-negy` | imported |
| `negz` | `assets/cubemap-static/negz.jpg` | `unwetter-am-steg-negz.jpg` | `#unwetter-am-steg-negz` | imported |

In `<a-assets>` deklariert, aber nirgends referenziert (nicht importiert):
- (keine)

Nicht von der Szene referenziert (nicht importiert, ggf. Varianten/Geschwister-Werke prüfen):
- `assets/Atem-5.mp3`
- `assets/mm_project.glb`
- `assets/sand-castle.glb`

Aus JS referenzierte Assets (nicht importiert, manuell prüfen):
- (keine)

## Manuell zu entscheiden

### Szenen-Attribute (`<a-scene>`, gehören dem Host)
- `xrextras-almost-there`
- `xrextras-loading`
- `xrextras-runtime-error`
- `renderer="colorManagement: true"`
- `image-target-ui="skip-marker: true; recenter-button:true; reset-button: false"`
- `xrweb`

### Kamera (`<a-camera>`, gehört dem Host)
- `id="camera"`
- `position="0 8 8"`

### Komponenten in der Szene, die das Template nicht registriert
- `image-target` — im alten Projekt selbst definiert

Im alten Projekt registrierte Komponenten: `cubemap-static`, `image-target`, `image-target-ui`, `tap-place-cursor`, `xr-light`

### `xrextras-attach` → `attach-to`
- `xrextras-attach="target: model; offset: 1 15 3;"`

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `legacy-attach` mit gleichem Schema ersetzen — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `cursor`
- `model`
- `ground`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `unwetter-am-steg-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

### UI-Texte aus dem alten Projekt
- (keine)

### HTML-Fehler in body.html
- (keine)

### Image-Targets im Export
- `marker.json` — laut Entscheidung nicht verwendet (SLAM wie im Original, siehe PORTING-GUIDE.md).

## Szene (alt, Asset-Referenzen umgeschrieben)

Ohne `<a-assets>` und `<a-camera>`. Koordinaten noch im alten System (Kamera auf `0 8 8`) — Umrechnung siehe PORTING-GUIDE.md.

```html
<!-- We can define assets here to be loaded when A-Frame initializes -->

<!-- The raycaster will emit mouse events on scene objects specified with the cantap class -->

<a-entity
    xr-light
    light="
      type: directional;
      intensity: 0.1;
      castShadow: true;
      shadowMapHeight:1024;
      shadowMapWidth:1024;
      shadowCameraTop: 10;
      target: #model;"
    xrextras-attach="target: model; offset: 1 15 3;"
    shadow>
  </a-entity>

<a-light 
  xr-light
  type="ambient" 
  intensity="0.1">
  </a-light>

<a-entity image-target>

   <a-ring 
      id="cursor"
      position="0 0 0" 
      rotation="-90 0 0"
      material="shader: flat; color: #FC046C"
      radius-inner="0.65" radius-outer="0.8"></a-ring>

  <a-entity 
    id="model" 
    gltf-model="#unwetter-am-steg-Wolke_v05" 
    scale="90 90 90" 
    position="0 -40 0"
    shadow="receive: false"
    animation-mixer="clip: animation_0"
    cubemap-static="posx: #unwetter-am-steg-posx; negx: #unwetter-am-steg-negx; posy: #unwetter-am-steg-posy; negy: #unwetter-am-steg-negy; posz: #unwetter-am-steg-posz; negz: #unwetter-am-steg-negz">
  </a-entity>
  
  </a-entity>

<a-plane
    id="ground" 
    rotation="-90 0 0" 
    width="20000" 
    height="20000" 
    material="shader: shadow" 
    shadow>
  </a-plane>
```
