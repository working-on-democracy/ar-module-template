# Port-Entwurf #19 Kleiderberg (Frankurt Fashion Movement)

Generiert von `npm run abv:port -- 19` aus `Projektordner_alt/kleiderberg-fuas/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-19-kleiderberg` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `sandCastleModel` | `assets/Berg-13.glb` | `kleiderberg-Berg-13.glb` | `#kleiderberg-Berg-13` | imported |

Nicht von der Szene referenziert (nicht importiert, ggf. Varianten/Geschwister-Werke prüfen):
- (keine)

Aus JS referenzierte Assets (nicht importiert, manuell prüfen):
- (keine)

## Manuell zu entscheiden

### Szenen-Attribute (`<a-scene>`, gehören dem Host)
- `xrextras-gesture-detector`
- `landing-page`
- `xrextras-loading`
- `xrextras-runtime-error`
- `renderer="colorManagement: true"`
- `xrweb="allowedDevices: any"`

### Kamera (`<a-camera>`, gehört dem Host)
- `id="camera"`
- `position="0 8 8"`
- `raycaster="objects: .cantap"`
- `cursor="fuse: false; rayOrigin: mouse;"`

### Komponenten in der Szene, die das Template nicht registriert
- (keine)

Im alten Projekt registrierte Komponenten: `xr-light`

### `xrextras-attach` → `attach-to`
- `xrextras-attach="target: model; offset: 1 150 -15;"`

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `attach-to="target: #camera; offset: …"` ersetzen, Offset dann in Welteinheiten — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `model`
- `ground`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `kleiderberg-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

### UI-Texte aus dem alten Projekt
- (keine)

### HTML-Fehler in body.html
- (keine)

### Image-Targets im Export
- (keine) — laut Entscheidung nicht verwendet (SLAM wie im Original, siehe PORTING-GUIDE.md).

## Szene (alt, Asset-Referenzen umgeschrieben)

Ohne `<a-assets>` und `<a-camera>`. Koordinaten noch im alten System (Kamera auf `0 8 8`) — Umrechnung siehe PORTING-GUIDE.md.

```html
<!-- We can define assets here to be loaded when A-Frame initializes -->

<!-- The raycaster will emit mouse events on scene objects specified with the cantap class -->

<a-entity
    light="
      type: directional;
      intensity: 2;
      castShadow: true;
     shadowMapHeight:2048;
      shadowMapWidth:2048;
      shadowCameraTop: 80;
      shadowCameraBottom: -80;
      shadowCameraRight: 80;
      shadowCameraLeft: -80;
      target: #model;
      shadowRadius: 12"
    xrextras-attach="target: model; offset: 1 150 -15;"
    shadow>
  </a-entity>

<a-light
    xr-light
    type="ambient">
  </a-light>

<a-entity 
    id="model" 
    gltf-model="#kleiderberg-Berg-13" 
    class="cantap" 
    xrextras-hold-drag 
    xrextras-two-finger-rotate 
    xrextras-pinch-scale 
    position="0 0 -30"
    scale="6.5 6.5 6.5" 
    shadow="receive: false">
  </a-entity>

<a-plane
    id="ground" 
    rotation="-90 0 0" 
    width="1000" 
    height="1000" 
    material="shader: shadow" 
    shadow>
  </a-plane>
```
