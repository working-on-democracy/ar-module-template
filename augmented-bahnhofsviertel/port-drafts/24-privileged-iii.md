# Port-Entwurf #24 Privileged III (Jonathan Radetz)

Generiert von `npm run abv:port -- 24` aus `Projektordner_alt/radetz-lima/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-24-privileged-iii` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `ballModel` | `assets/Pfeil.gltf` | `privileged-iii-Pfeil.glb` | `#privileged-iii-Pfeil` | converted |
| `fakten1` | `assets/Fakten1.gltf` | `privileged-iii-Fakten1.glb` | `#privileged-iii-Fakten1` | converted |
| `fakten2` | `assets/Fakten2.gltf` | `privileged-iii-Fakten2.glb` | `#privileged-iii-Fakten2` | converted |
| `fakten3` | `assets/Fakten3.gltf` | `privileged-iii-Fakten3.glb` | `#privileged-iii-Fakten3` | converted |
| `fakten4` | `assets/Fakten4.gltf` | `privileged-iii-Fakten4.glb` | `#privileged-iii-Fakten4` | converted |
| `video1` | `assets/textures/1.mp4` | `privileged-iii-1.mp4` | `#privileged-iii-1` | imported |
| `video2` | `assets/textures/2.mp4` | `privileged-iii-2.mp4` | `#privileged-iii-2` | imported |
| `video3` | `assets/textures/3.mp4` | `privileged-iii-3.mp4` | `#privileged-iii-3` | imported |
| `video4` | `assets/textures/4.mp4` | `privileged-iii-4.mp4` | `#privileged-iii-4` | imported |
| `audio1` | `assets/textures/01.mp3` | `privileged-iii-01.mp3` | `#privileged-iii-01` | imported |
| `audio2` | `assets/textures/02.mp3` | `privileged-iii-02.mp3` | `#privileged-iii-02` | imported |
| `audio3` | `assets/textures/03.mp3` | `privileged-iii-03.mp3` | `#privileged-iii-03` | imported |
| `audio4` | `assets/textures/04.mp3` | `privileged-iii-04.mp3` | `#privileged-iii-04` | imported |

In `<a-assets>` deklariert, aber nirgends referenziert (nicht importiert):
- `#posx` (`assets/cubemap-static/posx.jpg`)
- `#posy` (`assets/cubemap-static/posy.jpg`)
- `#posz` (`assets/cubemap-static/posz.jpg`)
- `#negx` (`assets/cubemap-static/negx.jpg`)
- `#negy` (`assets/cubemap-static/negy.jpg`)
- `#negz` (`assets/cubemap-static/negz.jpg`)

Nicht von der Szene referenziert (nicht importiert, ggf. Varianten/Geschwister-Werke prüfen):
- `assets/Pfeil.png`
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

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `privileged-iii-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

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
    id="group"
    scale="0.7 0.7 0.7">
>


    <a-entity
      gltf-model="#privileged-iii-Fakten1"
      position="0 0 0"
      rotation="0 0 0"
      scale="1 1 1">
      </a-entity>

      <a-entity
      gltf-model="#privileged-iii-Pfeil"
      position="0 0 -2"
      rotation="0 0 0"
      scale="2 2 2">
      </a-entity>

    <a-entity
    sound="src: #privileged-iii-01; loop: true; volume: 1; maxDistance: 3; distanceModel: linear; rolloffFactor: 1"    
    geometry="primitive: plane; height: 4.6; width: 2.66;"
    play-video="video: #privileged-iii-1; autoplay: true"
    material="src: #privileged-iii-1; side: double"
    rotation="0 0 0"
    position="0 2.3 -3">
    </a-entity>



     <a-entity
      gltf-model="#privileged-iii-Fakten2"
      position="0 0 -5"
      rotation="0 0 0"
      scale="1 1 1">
    </a-entity>

    <a-entity
      gltf-model="#privileged-iii-Pfeil"
      position="0 0 -7"
      rotation="0 0 0"
      scale="2 2 2">
    </a-entity>

    
 <a-entity
    sound="src: #privileged-iii-02; loop: true; volume: 1; maxDistance: 3; distanceModel: linear; rolloffFactor: 1"    
    geometry="primitive: plane; height: 4.6; width: 2.66;"
    play-video="video: #privileged-iii-2; autoplay: true"
    material="src: #privileged-iii-2; side: double"
    rotation="0 0 0"
    position="0 2.3 -8">
  </a-entity>


    <a-entity
      gltf-model="#privileged-iii-Fakten3"
      position="0 0 -10"
      rotation="0 0 0"
      scale="1 1 1">
    </a-entity>


   <a-entity
      gltf-model="#privileged-iii-Pfeil"
      position="0 0 -12"
      rotation="0 0 0"
      scale="2 2 2">
    </a-entity>


 <a-entity
    sound="src: #privileged-iii-03; loop: true; volume: 1; maxDistance: 3; distanceModel: linear; rolloffFactor: 1"    
    geometry="primitive: plane; height: 4.6; width: 2.66;"
    play-video="video: #privileged-iii-3; autoplay: true"
    material="src: #privileged-iii-3; side: double"
    rotation="0 0 0"
    position="0 2.3 -13">
  </a-entity>

          <a-entity
      gltf-model="#privileged-iii-Fakten4"
      position="0 0 -15"
      rotation="0 0 0"
      scale="1 1 1">
    </a-entity>

   
 <a-entity
    sound="src: #privileged-iii-04; loop: true; volume: 1; maxDistance: 3; distanceModel: linear; rolloffFactor: 1"    
    geometry="primitive: plane; height: 4.6; width: 2.66;"
    play-video="video: #privileged-iii-4; autoplay: true"
    material="src: #privileged-iii-4; side: double"
    rotation="0 0 0"
    position="0 2.3 -18">
  </a-entity>




    
  </a-entity>
```
