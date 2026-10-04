# Port-Entwurf #18 Funkytown (saasfee*)

Generiert von `npm run abv:port -- 18` aus `Projektordner_alt/disco/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-18-funkytown` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `ballModel` | `assets/glb/kugel49.gltf` | `funkytown-kugel49.glb` | `#funkytown-kugel49` | converted |
| `posx` | `assets/cubemap-static/funkytown02.jpg` | `funkytown-funkytown02.jpg` | `#funkytown-funkytown02` | imported |
| `posy` | `assets/cubemap-static/funkytown02.jpg` | `funkytown-funkytown02.jpg` | `#funkytown-funkytown02` | shared |
| `posz` | `assets/cubemap-static/funkytown02.jpg` | `funkytown-funkytown02.jpg` | `#funkytown-funkytown02` | shared |
| `negx` | `assets/cubemap-static/funkytown02.jpg` | `funkytown-funkytown02.jpg` | `#funkytown-funkytown02` | shared |
| `negy` | `assets/cubemap-static/funkytown02.jpg` | `funkytown-funkytown02.jpg` | `#funkytown-funkytown02` | shared |
| `negz` | `assets/cubemap-static/funkytown02.jpg` | `funkytown-funkytown02.jpg` | `#funkytown-funkytown02` | shared |
| `audio1` | `assets/mp3/sergej-auto-jump.mp3` | `funkytown-sergej-auto-jump.mp3` | `#funkytown-sergej-auto-jump` | imported |
| `audio2` | `assets/mp3/sergej-auto-ambient.mp3` | `funkytown-sergej-auto-ambient.mp3` | `#funkytown-sergej-auto-ambient` | imported |

In `<a-assets>` deklariert, aber nirgends referenziert (nicht importiert):
- (keine)

Nicht von der Szene referenziert (nicht importiert, ggf. Varianten/Geschwister-Werke prüfen):
- `assets/cubemap-static/negx.jpg`
- `assets/cubemap-static/negy.jpg`
- `assets/cubemap-static/negz.jpg`
- `assets/cubemap-static/posx.jpg`
- `assets/cubemap-static/posy.jpg`
- `assets/cubemap-static/posz.jpg`
- `assets/glb/kugel02.glb`
- `assets/glb/kugel03.glb`
- `assets/glb/kugel06.glb`

Aus JS referenzierte Assets (nicht importiert, manuell prüfen):
- (keine)

## Manuell zu entscheiden

### Szenen-Attribute (`<a-scene>`, gehören dem Host)
- `xrextras-gesture-detector`
- `xrextras-tap-recenter`
- `responsive-immersive`
- `landing-page="mediaSrc: https://www.youtube.com/watch?v=H-f40M2Ap_g"`
- `xrextras-loading`
- `xrextras-runtime-error`
- `renderer="colorManagement: true"`
- `xrweb`
- `image-target-ui="skip-marker: true; recenter-button: false; reset-button: false"`

### Kamera (`<a-camera>`, gehört dem Host)
- `id="camera"`
- `position="0 18 8"`
- `fov="120"`

### Komponenten in der Szene, die das Template nicht registriert
- (keine)

Im alten Projekt registrierte Komponenten: `cubemap-realtime`, `cubemap-static`, `image-target`, `image-target-ui`, `responsive-immersive`, `xr-light`

### `xrextras-attach` → `attach-to`
- `xrextras-attach="target: camera; offset: 8 40 -22;"`

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `legacy-attach` mit gleichem Schema ersetzen — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `group`
- `ambient-sound`
- `disco-sound`
- `static-ball`
- `realtime-ball`
- `ground`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `funkytown-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

### UI-Texte aus dem alten Projekt
- (keine)

### HTML-Fehler in body.html
- (keine)

### Image-Targets im Export
- (keine) — laut Entscheidung nicht verwendet (SLAM wie im Original, siehe PORTING-GUIDE.md).

## Szene (alt, Asset-Referenzen umgeschrieben)

Ohne `<a-assets>` und `<a-camera>`. Koordinaten noch im alten System (Kamera auf `0 8 8`) — Umrechnung siehe PORTING-GUIDE.md.

```html
<a-entity
    xr-light
    light="type: directional;
       castShadow: true;
       shadowMapHeight: 2048;
       shadowMapWidth: 2048;
       shadowCameraTop: 200;
       shadowCameraBottom: -200;
       shadowCameraRight: 200;
       shadowCameraLeft: -200;
       target: #camera;
       shadowRadius: 4"
    xrextras-attach="target: camera; offset: 8 40 -22;"
    shadow>
  </a-entity>

<a-light
    xr-light
    type="ambient">
  </a-light>

<a-entity
    light="type: point; color: #F0F; intensity: 100.0; distance: 20"
    position="10 3 -15"
    animation="property: light.intensity; from:1.0; to:-1.0; dur: 468; loop:true; easings: easeOutExpo; dir: normal; autoplay: true"
    animation__color="light.color; from:rgb(200, 70, 30); to:rgb(0, 30, 180); dur: 1500; loop:true; easings: easeInOutSine; dir: alternate; autoplay: true">
  </a-entity>

<a-entity 
    id="group">

    <a-entity
      id="ambient-sound"
      geometry="primitive: box"
      material="color: red; opacity: 0.0; transparent: true"
      light="type: point; intensity: 2.0"
      sound="src: #funkytown-sergej-auto-ambient; loop: true; volume: .6; maxDistance: 36; distanceModel: linear; rolloffFactor: 1"
      position="0 18 8"
      shadow>
    </a-entity>

    <a-entity
      id="disco-sound"
      geometry="primitive: box"
      material="color: green; opacity: 0.0; transparent: true"
      sound="src: #funkytown-sergej-auto-jump; loop: true; volume: 1; maxDistance: 46; distanceModel: linear; rolloffFactor: 1"
      position="-30 20 -50"
      shadow>
    </a-entity>

    <a-entity
      id="static-ball"
      gltf-model="#funkytown-kugel49"
      position="0 0 0"
      scale=".001 .001 .001">
    </a-entity>

    <a-entity
      id="realtime-ball"
      gltf-model="#funkytown-kugel49"
      animation-mixer="clip: animation_0; timeScale: 0.5"
      position="0 0 0"
      shadow>
    </a-entity>

  </a-entity>

<a-plane
    id="ground"
    rotation="-90 0 0"
    position="0 0 0"
    width="200"
    height="200"
    material="shader: shadow"
    shadow>
  </a-plane>
```
