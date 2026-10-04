# Port-Entwurf #23 Privileged II (Jonathan Radetz)

Generiert von `npm run abv:port -- 23` aus `Projektordner_alt/radetz-istanbul/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-23-privileged-ii` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `ballModel` | `assets/Fakten1.gltf` | `privileged-ii-Fakten1.glb` | `#privileged-ii-Fakten1` | converted |
| `fakten2` | `assets/Fakten2.gltf` | `privileged-ii-Fakten2.glb` | `#privileged-ii-Fakten2` | converted |
| `fakten3` | `assets/Fakten3.gltf` | `privileged-ii-Fakten3.glb` | `#privileged-ii-Fakten3` | converted |
| `fakten4` | `assets/Fakten4.gltf` | `privileged-ii-Fakten4.glb` | `#privileged-ii-Fakten4` | converted |
| `video1` | `assets/textures/1.mp4` | `privileged-ii-1.mp4` | `#privileged-ii-1` | imported |
| `video2` | `assets/textures/2.mp4` | `privileged-ii-2.mp4` | `#privileged-ii-2` | imported |
| `video3` | `assets/textures/3.mp4` | `privileged-ii-3.mp4` | `#privileged-ii-3` | imported |
| `video4` | `assets/textures/4.mp4` | `privileged-ii-4.mp4` | `#privileged-ii-4` | imported |

In `<a-assets>` deklariert, aber nirgends referenziert (nicht importiert):
- `#posx` (`assets/cubemap-static/posx.jpg`)
- `#posy` (`assets/cubemap-static/posy.jpg`)
- `#posz` (`assets/cubemap-static/posz.jpg`)
- `#negx` (`assets/cubemap-static/negx.jpg`)
- `#negy` (`assets/cubemap-static/negy.jpg`)
- `#negz` (`assets/cubemap-static/negz.jpg`)

Nicht von der Szene referenziert (nicht importiert, ggf. Varianten/Geschwister-Werke prüfen):
- `assets/cubemap-static/negx.jpg`
- `assets/cubemap-static/negy.jpg`
- `assets/cubemap-static/negz.jpg`
- `assets/cubemap-static/posx.jpg`
- `assets/cubemap-static/posy.jpg`
- `assets/cubemap-static/posz.jpg`
- `assets/jini-ball.glb`

Aus JS referenzierte Assets (nicht importiert, manuell prüfen):
- (keine)

## Manuell zu entscheiden

### Szenen-Attribute (`<a-scene>`, gehören dem Host)
- `xrextras-tap-recenter`
- `xrextras-gesture-detector`
- `xrextras-almost-there`
- `xrextras-loading`
- `xrextras-runtime-error`
- `renderer="colorManagement: true"`
- `xrweb`
- `image-target-ui="skip-marker: true; recenter-button:true; reset-button: false"`

### Kamera (`<a-camera>`, gehört dem Host)
- `id="camera"`
- `position="0 0.8 0"`

### Komponenten in der Szene, die das Template nicht registriert
- `image-target` — im alten Projekt selbst definiert
- `play-video`

Im alten Projekt registrierte Komponenten: `cubemap-realtime`, `cubemap-static`, `image-target`, `image-target-ui`, `xr-light`

### `xrextras-attach` → `attach-to`
- `xrextras-attach="target: group; offset: 0 15 0;"`

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `legacy-attach` mit gleichem Schema ersetzen — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `group`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `privileged-ii-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

### UI-Texte aus dem alten Projekt
- „<button class=“

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
       shadowMapHeight:2048;
       shadowMapWidth:2048;
       shadowCameraTop: 10;
       target: #group;"
    xrextras-attach="target: group; offset: 0 15 0;"
    shadow>
  </a-entity>

<a-light
    xr-light
    type="ambient">
  </a-light>

<a-entity 
  image-target
    id="group">
>


      <a-entity
    geometry="primitive: plane; height: 9; width: 16;"
    play-video="video: #privileged-ii-1; autoplay: true"
    material="src: #privileged-ii-1"
    rotation="0 180 0"
    position="0 4.5 8">
  </a-entity>

     <a-entity
      gltf-model="#privileged-ii-Fakten1"
      position="0 0 2"
      rotation="0 180 0"
      scale="1.5 1.5 1.5">
    </a-entity>

    <a-entity
    geometry="primitive: plane; height: 9; width: 16;"
    play-video="video: #privileged-ii-2; autoplay: true"
    material="src: #privileged-ii-2"
    rotation="0 -90 0"
    position="8 4.5 0">
  </a-entity>

       <a-entity
      gltf-model="#privileged-ii-Fakten2"
      position="2 0 0"
      rotation="0 -90 0"
      scale="1.5 1.5 1.5">
    </a-entity>

    <a-entity
    geometry="primitive: plane; height: 9; width: 16;"
    play-video="video: #privileged-ii-3; autoplay: true"
    material="src: #privileged-ii-3"
    rotation="0 0 0"
    position="0 4.5 -8">
  </a-entity>



  <a-entity
      gltf-model="#privileged-ii-Fakten3"
      position="0 0 -2"
      rotation="0 0 0"
      scale="1.5 1.5 1.5"
      >
    </a-entity>

    <a-entity
    geometry="primitive: plane; height: 9; width: 16;"
    play-video="video: #privileged-ii-4; autoplay: true"
    material="src: #privileged-ii-4"
    rotation="0 90 0"
    position="-8 4.5 0">
  </a-entity>


       <a-entity
      gltf-model="#privileged-ii-Fakten4"
      position="-2 0 0"
      rotation="0 90 0"
      scale="1.5 1.5 1.5">
    </a-entity>

    
  </a-entity>
```
