# Port-Entwurf #10 Neon Organisms 3 (K. Ulrich Schneider)

Generiert von `npm run abv:port -- 10` aus `Projektordner_alt/scheider-organism/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-10-neon-organisms-3` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `m1` | `assets/Neon-1.gltf` | `neon-organisms-3-Neon-1.glb` | `#neon-organisms-3-Neon-1` | converted |
| `m2` | `assets/Neon-2.gltf` | `neon-organisms-3-Neon-2.glb` | `#neon-organisms-3-Neon-2` | converted |
| `m3` | `assets/Neon-3.gltf` | `neon-organisms-3-Neon-3.glb` | `#neon-organisms-3-Neon-3` | converted |
| `posx` | `assets/cubemap-static/posx.jpg` | `neon-organisms-3-posx.jpg` | `#neon-organisms-3-posx` | imported |
| `posy` | `assets/cubemap-static/posy.jpg` | `neon-organisms-3-posy.jpg` | `#neon-organisms-3-posy` | imported |
| `posz` | `assets/cubemap-static/posz.jpg` | `neon-organisms-3-posz.jpg` | `#neon-organisms-3-posz` | imported |
| `negx` | `assets/cubemap-static/negx.jpg` | `neon-organisms-3-negx.jpg` | `#neon-organisms-3-negx` | imported |
| `negy` | `assets/cubemap-static/negy.jpg` | `neon-organisms-3-negy.jpg` | `#neon-organisms-3-negy` | imported |
| `negz` | `assets/cubemap-static/negz.jpg` | `neon-organisms-3-negz.jpg` | `#neon-organisms-3-negz` | imported |

In `<a-assets>` deklariert, aber nirgends referenziert (nicht importiert):
- (keine)

Nicht von der Szene referenziert (nicht importiert, ggf. Varianten/Geschwister-Werke prüfen):
- (keine)

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

Im alten Projekt registrierte Komponenten: `cubemap-realtime`, `cubemap-static`, `image-target`, `image-target-ui`, `xr-light`

### `xrextras-attach` → `attach-to`
- (keine)

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `legacy-attach` mit gleichem Schema ersetzen — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `group`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `neon-organisms-3-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

### UI-Texte aus dem alten Projekt
- „Suche dir einen guten Platz und tippe auf“

### HTML-Fehler in body.html
- Zeile 85: Invalid end tag.

### Image-Targets im Export
- `marker-2.json`
- `marker.json` — laut Entscheidung nicht verwendet (SLAM wie im Original, siehe PORTING-GUIDE.md).

## Szene (alt, Asset-Referenzen umgeschrieben)

Ohne `<a-assets>` und `<a-camera>`. Koordinaten noch im alten System (Kamera auf `0 8 8`) — Umrechnung siehe PORTING-GUIDE.md.

```html
<!-- We can define assets here to be loaded when A-Frame initializes -->

<!-- The raycaster will emit mouse events on scene objects specified with the cantap class -->

<a-light type="ambient" intensity="1.5"></a-light>

<a-entity image-target>
  
    <a-entity
      id="group"
      class="cantap"
      xrextras-two-finger-rotate 
      xrextras-pinch-scale       
      visible="false"
      >


      <a-entity 
        gltf-model="#neon-organisms-3-Neon-1" 
        animation="property: rotation; easing: linear; to: 0 360 0; loop: true; dur: 100000"
        rotation="0 0 0"
        position="0 0 0 -6"
        scale="0.6 0.6 0.6"
        cubemap-static="posx: #neon-organisms-3-posx; negx: #neon-organisms-3-negx; posy: #neon-organisms-3-posy; negy: #neon-organisms-3-negy; posz: #neon-organisms-3-posz; negz: #neon-organisms-3-negz"
        shadow="receive: false">
      </a-entity>

      <a-entity 
        gltf-model="#neon-organisms-3-Neon-2" 
        animation="property: rotation; easing: linear; to: 0 -360 0; loop: true; dur: 1000000"
        rotation="0 0 0"
        position="0 -5 -6"
        scale="0.6 0.6 0.6"
        cubemap-static="posx: #neon-organisms-3-posx; negx: #neon-organisms-3-negx; posy: #neon-organisms-3-posy; negy: #neon-organisms-3-negy; posz: #neon-organisms-3-posz; negz: #neon-organisms-3-negz"
        shadow="receive: false">
      </a-entity>

        <a-entity 
        gltf-model="#neon-organisms-3-Neon-3" 
        animation="property: rotation; easing: linear; to: 0 360 0; loop: true; dur: 1000000"
        rotation="0 0 0"
        position="0 0 -6"
        scale="0.6 0.6 0.6"
        cubemap-static="posx: #neon-organisms-3-posx; negx: #neon-organisms-3-negx; posy: #neon-organisms-3-posy; negy: #neon-organisms-3-negy; posz: #neon-organisms-3-posz; negz: #neon-organisms-3-negz"
        shadow="receive: false">
      </a-entity>

      </a-entity>
   </a-entity>
```
