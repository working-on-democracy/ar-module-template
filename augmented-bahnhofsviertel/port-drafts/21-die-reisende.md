# Port-Entwurf #21 Die Reisende (HazMatLab)

Generiert von `npm run abv:port -- 21` aus `Projektordner_alt/hazmadlab/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-21-die-reisende` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `slime` | `assets/slime8.gltf` | `die-reisende-slime8.glb` | `#die-reisende-slime8` | converted |

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

Aus JS referenzierte Assets (nicht importiert, manuell prüfen):
- (keine)

## Manuell zu entscheiden

### Szenen-Attribute (`<a-scene>`, gehören dem Host)
- `xrextras-tap-recenter`
- `xrextras-gesture-detector`
- `landing-page`
- `xrextras-loading`
- `xrextras-runtime-error`
- `renderer="colorManagement: true"`
- `xrweb`

### Kamera (`<a-camera>`, gehört dem Host)
- `id="camera"`
- `position="0 8 8"`

### Komponenten in der Szene, die das Template nicht registriert
- `Scale`

Im alten Projekt registrierte Komponenten: `cubemap-realtime`, `cubemap-static`, `xr-light`

### `xrextras-attach` → `attach-to`
- `xrextras-attach="target: group; offset: 0 15 0;"`

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `attach-to="target: #camera; offset: …"` ersetzen, Offset dann in Welteinheiten — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `group`
- `ground`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `die-reisende-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

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
    position="0 0 0"
    Scale="1 1 1"
    xrextras-pinch-scale="max: 5">
  
  <a-entity
    
      gltf-model="#die-reisende-slime8"
      cubemap-realtime
      position="-4 -4 -25"
      rotation="0 60 0"
      scale="12 12 12"
      shadow>
  </a-entity>

 
    
  </a-entity>

<a-plane
    id="ground"
    rotation="-90 0 0"
    width="2048"
    height="2048"
    material="shader: shadow; transparent: true; opacity: 0.15"
    shadow
  ></a-plane>
```
