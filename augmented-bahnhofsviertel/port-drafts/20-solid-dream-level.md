# Port-Entwurf #20 Solid Dream Level (Anna Hofmann)

Generiert von `npm run abv:port -- 20` aus `Projektordner_alt/anna-hofmann/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-20-solid-dream-level` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `ballModel` | `assets/Muschel3.gltf` | `solid-dream-level-Muschel3.glb` | `#solid-dream-level-Muschel3` | converted |
| `audio1` | `assets/sound.mp3` | `solid-dream-level-sound.mp3` | `#solid-dream-level-sound` | imported |

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
- `assets/textures/poem1.mp4`
- `assets/textures/poem2.mp4`
- `assets/textures/poem3.mp4`
- `assets/textures/poem4.mp4`
- `assets/textures/poem5.mp4`

Aus JS referenzierte Assets (nicht importiert, manuell prüfen):
- (keine)

## Manuell zu entscheiden

### Szenen-Attribute (`<a-scene>`, gehören dem Host)
- `xrextras-gesture-detector`
- `xrextras-almost-there`
- `xrextras-loading`
- `xrextras-runtime-error`
- `renderer="colorManagement: true"`
- `xrweb`
- `image-target-ui="skip-marker: true; recenter-button:true; reset-button: false"`

### Kamera (`<a-camera>`, gehört dem Host)
- `id="camera"`
- `position="0 8 8"`
- `raycaster="objects: .cantap"`
- `cursor="fuse: false; rayOrigin: mouse;"`

### Komponenten in der Szene, die das Template nicht registriert
- `image-target` — im alten Projekt selbst definiert
- `tap-animation` — im alten Projekt selbst definiert

Im alten Projekt registrierte Komponenten: `cubemap-realtime`, `cubemap-static`, `image-target`, `image-target-ui`, `tap-animation`, `xr-light`

### `xrextras-attach` → `attach-to`
- `xrextras-attach="target: group; offset: 0 15 0;"`

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `legacy-attach` mit gleichem Schema ersetzen — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `group`
- `ground`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `solid-dream-level-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

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
      shadowCameraTop: 40;
      shadowCameraBottom: -40;
      shadowCameraRight: 40;
      shadowCameraLeft: -40;
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
    scale="3 3 3"
>

    <a-entity
      class="cantap"
      tap-animation
      sound="src: #solid-dream-level-sound; loop: false; volume: 50; rolloffFactor: 500;"    
      gltf-model="#solid-dream-level-Muschel3"
      cubemap-realtime
      position="0 0 -2"
      rotation="0 0 0"
      scale="1 1 1"
      shadow>
    </a-entity>

  </a-entity>

<a-plane
    id="ground"
    rotation="-90 0 0"
    width="2000"
    height="2000"
    material="shader: shadow"
    shadow
  ></a-plane>
```
