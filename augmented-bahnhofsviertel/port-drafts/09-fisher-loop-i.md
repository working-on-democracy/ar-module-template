# Port-Entwurf #9 Fisher-Loop (privatized) I (freitagsküche)

Generiert von `npm run abv:port -- 9` aus `Projektordner_alt/freitagskueche-fisherloop/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-09-fisher-loop-i` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `audio` | `assets/Loop.mp3` | `fisher-loop-i-Loop.mp3` | `#fisher-loop-i-Loop` | imported |
| `ballModel` | `assets/01_Privatized_01-2.gltf` | `fisher-loop-i-01_Privatized_01-2.glb` | `#fisher-loop-i-01_Privatized_01-2` | converted |

In `<a-assets>` deklariert, aber nirgends referenziert (nicht importiert):
- (keine)

Nicht von der Szene referenziert (nicht importiert, ggf. Varianten/Geschwister-Werke prüfen):
- `assets/cubemap-static/negx.jpg`
- `assets/cubemap-static/negy.jpg`
- `assets/cubemap-static/negz.jpg`
- `assets/cubemap-static/posx.jpg`
- `assets/cubemap-static/posy.jpg`
- `assets/cubemap-static/posz.jpg`

Aus JS referenzierte Assets (nicht importiert, manuell prüfen):
- (keine)

## Manuell zu entscheiden

### Szenen-Attribute (`<a-scene>`, gehören dem Host)
- `xrextras-gesture-detector`
- `xrextras-almost-there`
- `xrextras-loading`
- `xrextras-runtime-error`
- `renderer="colorManagement: true"`
- `image-target-ui="skip-marker: true; recenter-button:true; reset-button: false"`
- `xrweb`

### Kamera (`<a-camera>`, gehört dem Host)
- `id="camera"`
- `position="0 8 8"`
- `raycaster="objects: .cantap"`
- `cursor="fuse: false; rayOrigin: mouse;"`

### Komponenten in der Szene, die das Template nicht registriert
- `image-target` — im alten Projekt selbst definiert

Im alten Projekt registrierte Komponenten: `cubemap-realtime`, `image-target`, `image-target-ui`, `xr-light`

### `xrextras-attach` → `attach-to`
- `xrextras-attach="target: group; offset: 0 15 0;"`

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `attach-to="target: #camera; offset: …"` ersetzen, Offset dann in Welteinheiten — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `group`
- `ground`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `fisher-loop-i-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

### UI-Texte aus dem alten Projekt
- „Suche dir einen freien Platz auf der Wiese und tippe auf“

### HTML-Fehler in body.html
- (keine)

### Image-Targets im Export
- `marker.json` — laut Entscheidung nicht verwendet (SLAM wie im Original, siehe PORTING-GUIDE.md).

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
    id="group"
    sound="src: #fisher-loop-i-Loop; loop: true; volume: 5"
    image-target>
      
  
    <a-entity
      gltf-model="#fisher-loop-i-01_Privatized_01-2"
      visible="false"
      class="cantap"
      xrextras-two-finger-rotate
      xrextras-pinch-scale="max: 1.3"      
      cubemap-realtime
      position="0 0 -300"
      rotation="0 45 0"
      scale="7 7 7"
      animation-mixer
      shadow>
    </a-entity>
    
  </a-entity>

<a-plane
    id="ground"
    rotation="-90 0 0"
    width="100"
    height="100"
    material="shader: shadow"
    shadow
  ></a-plane>
```
