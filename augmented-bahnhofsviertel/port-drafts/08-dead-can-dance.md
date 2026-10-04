# Port-Entwurf #8 Dead can Dance (Maiken Laackmann)

Generiert von `npm run abv:port -- 8` aus `Projektordner_alt/laackmann-deadcandance/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-08-dead-can-dance` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `m0` | `assets/Insel.gltf` | `dead-can-dance-Insel.glb` | `#dead-can-dance-Insel` | converted |
| `m1` | `assets/drummer.gltf` | `dead-can-dance-drummer.glb` | `#dead-can-dance-drummer` | converted |
| `m2` | `assets/guitarist.gltf` | `dead-can-dance-guitarist.glb` | `#dead-can-dance-guitarist` | converted |
| `m3` | `assets/klatscherin.gltf` | `dead-can-dance-klatscherin.glb` | `#dead-can-dance-klatscherin` | converted |
| `m4` | `assets/klavier.gltf` | `dead-can-dance-klavier.glb` | `#dead-can-dance-klavier` | converted |
| `m5` | `assets/taenzerin.gltf` | `dead-can-dance-taenzerin.glb` | `#dead-can-dance-taenzerin` | converted |
| `posx` | `assets/cubemap-static/posx.jpg` | `dead-can-dance-posx.jpg` | `#dead-can-dance-posx` | imported |
| `posy` | `assets/cubemap-static/posy.jpg` | `dead-can-dance-posy.jpg` | `#dead-can-dance-posy` | imported |
| `posz` | `assets/cubemap-static/posz.jpg` | `dead-can-dance-posz.jpg` | `#dead-can-dance-posz` | imported |
| `negx` | `assets/cubemap-static/negx.jpg` | `dead-can-dance-negx.jpg` | `#dead-can-dance-negx` | imported |
| `negy` | `assets/cubemap-static/negy.jpg` | `dead-can-dance-negy.jpg` | `#dead-can-dance-negy` | imported |
| `negz` | `assets/cubemap-static/negz.jpg` | `dead-can-dance-negz.jpg` | `#dead-can-dance-negz` | imported |
| `audio` | `assets/LOOP-1.mp3` | `dead-can-dance-LOOP-1.mp3` | `#dead-can-dance-LOOP-1` | imported |

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

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `dead-can-dance-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

### UI-Texte aus dem alten Projekt
- „Suche dir einen guten Platz und tippe auf“

### HTML-Fehler in body.html
- (keine)

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
    <a-entity sound="src: #dead-can-dance-LOOP-1; loop: true; volume: 5"></a-entity>

    <a-entity
      id="group"
      class="cantap"
      xrextras-two-finger-rotate 
      xrextras-pinch-scale       
      visible="false"
      rotation="0 180 0"
      position="0 0 -6"
      scale="0.6 0.6 0.6">
    
      <a-entity 
        gltf-model="#dead-can-dance-Insel" 
        cubemap-static="posx: #dead-can-dance-posx; negx: #dead-can-dance-negx; posy: #dead-can-dance-posy; negy: #dead-can-dance-negy; posz: #dead-can-dance-posz; negz: #dead-can-dance-negz"
        shadow="receive: false">
      </a-entity>

      <a-entity 
        gltf-model="#dead-can-dance-drummer" 
        animation-mixer="clip: animation_0"
        cubemap-static="posx: #dead-can-dance-posx; negx: #dead-can-dance-negx; posy: #dead-can-dance-posy; negy: #dead-can-dance-negy; posz: #dead-can-dance-posz; negz: #dead-can-dance-negz"
        shadow="receive: false">
      </a-entity>

      <a-entity 
        gltf-model="#dead-can-dance-guitarist" 
        animation-mixer
        cubemap-static="posx: #dead-can-dance-posx; negx: #dead-can-dance-negx; posy: #dead-can-dance-posy; negy: #dead-can-dance-negy; posz: #dead-can-dance-posz; negz: #dead-can-dance-negz"
        shadow="receive: false">
      </a-entity>
    
        <a-entity 
        gltf-model="#dead-can-dance-klatscherin" 
        animation-mixer
        cubemap-static="posx: #dead-can-dance-posx; negx: #dead-can-dance-negx; posy: #dead-can-dance-posy; negy: #dead-can-dance-negy; posz: #dead-can-dance-posz; negz: #dead-can-dance-negz"
        shadow="receive: false">
      </a-entity>
  
        <a-entity 
        gltf-model="#dead-can-dance-klavier" 
        animation-mixer
        cubemap-static="posx: #dead-can-dance-posx; negx: #dead-can-dance-negx; posy: #dead-can-dance-posy; negy: #dead-can-dance-negy; posz: #dead-can-dance-posz; negz: #dead-can-dance-negz"
        shadow="receive: false">
      </a-entity>
  
        <a-entity 
        gltf-model="#dead-can-dance-taenzerin" 
        animation-mixer
        cubemap-static="posx: #dead-can-dance-posx; negx: #dead-can-dance-negx; posy: #dead-can-dance-posy; negy: #dead-can-dance-negy; posz: #dead-can-dance-posz; negz: #dead-can-dance-negz"
        shadow="receive: false">
      </a-entity>
   </a-entity>
  </a-entity>
```
