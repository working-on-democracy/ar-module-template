# Port-Entwurf #15 Milk Glass (Adrian Williams)

Generiert von `npm run abv:port -- 15` aus `Projektordner_alt/williams/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-15-milk-glass` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `incorrectGlass` | `assets/Glas_08.gltf` | `milk-glass-Glas_08.glb` | `#milk-glass-Glas_08` | converted |
| `posx` | `assets/cubemap-static/posx.jpg` | `milk-glass-posx.jpg` | `#milk-glass-posx` | imported |
| `posy` | `assets/cubemap-static/posy.jpg` | `milk-glass-posy.jpg` | `#milk-glass-posy` | imported |
| `posz` | `assets/cubemap-static/posz.jpg` | `milk-glass-posz.jpg` | `#milk-glass-posz` | imported |
| `negx` | `assets/cubemap-static/negx.jpg` | `milk-glass-negx.jpg` | `#milk-glass-negx` | imported |
| `negy` | `assets/cubemap-static/negy.jpg` | `milk-glass-negy.jpg` | `#milk-glass-negy` | imported |
| `negz` | `assets/cubemap-static/negz.jpg` | `milk-glass-negz.jpg` | `#milk-glass-negz` | imported |

In `<a-assets>` deklariert, aber nirgends referenziert (nicht importiert):
- (keine)

Nicht von der Szene referenziert (nicht importiert, ggf. Varianten/Geschwister-Werke prüfen):
- `assets/glass.glb`
- `assets/glass_converted.glb`

Aus JS referenzierte Assets (nicht importiert, manuell prüfen):
- (keine)

## Manuell zu entscheiden

### Szenen-Attribute (`<a-scene>`, gehören dem Host)
- `xrextras-tap-recenter`
- `landing-page`
- `xrextras-loading`
- `xrextras-runtime-error`
- `renderer="colorManagement: true"`
- `xrweb`

### Kamera (`<a-camera>`, gehört dem Host)
- `id="camera"`
- `position="0 1.75 2"`

### Komponenten in der Szene, die das Template nicht registriert
- (keine)

Im alten Projekt registrierte Komponenten: `cubemap-realtime`, `cubemap-static`, `xr-light`

### `xrextras-attach` → `attach-to`
- `xrextras-attach="target: group; offset: 0 15 0;"`

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `attach-to="target: #camera; offset: …"` ersetzen, Offset dann in Welteinheiten — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `group`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `milk-glass-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

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
       target: #group;"
    xrextras-attach="target: group; offset: 0 15 0;">
  </a-entity>

<a-light
    xr-light
    type="ambient">
  </a-light>

<a-entity 
    id="group">
  
  <a-entity
      gltf-model="#milk-glass-Glas_08"
      cubemap-static="posx: #milk-glass-posx; negx: #milk-glass-negx; posy: #milk-glass-posy; negy: #milk-glass-negy; posz: #milk-glass-posz; negz: #milk-glass-negz"
      position="0 0 0"
      scale="15 15 15">
  </a-entity>
    
  </a-entity>
```
