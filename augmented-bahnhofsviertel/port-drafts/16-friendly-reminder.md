# Port-Entwurf #16 Friendly reminder (enşöligensi) (Nouria Behloul)

Generiert von `npm run abv:port -- 16` aus `Projektordner_alt/nouria-behloul/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-16-friendly-reminder` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `ballModel` | `assets/Flag.gltf` | `friendly-reminder-Flag.glb` | `#friendly-reminder-Flag` | converted |
| `audio1` | `assets/Soundfile.mp3` | `friendly-reminder-Soundfile.mp3` | `#friendly-reminder-Soundfile` | imported |

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
- `assets/textures/poem1.mp4`
- `assets/textures/poem2.mp4`
- `assets/textures/poem3.mp4`
- `assets/textures/poem4.mp4`
- `assets/textures/poem5.mp4`

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
- `position="0 8 8"`
- `sound="src: #audio1; loop: true; volume: 1"`

### Komponenten in der Szene, die das Template nicht registriert
- (keine)

Im alten Projekt registrierte Komponenten: `cubemap-realtime`, `cubemap-static`, `image-target`, `image-target-ui`, `xr-light`

### `xrextras-attach` → `attach-to`
- `xrextras-attach="target: group; offset: 0 15 0;"`

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `attach-to="target: #camera; offset: …"` ersetzen, Offset dann in Welteinheiten — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- (keine)

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `friendly-reminder-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

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
       target: #group;"
    xrextras-attach="target: group; offset: 0 15 0;">
  </a-entity>

<a-light
    xr-light
    type="ambient">
  </a-light>

<a-entity
      gltf-model="#friendly-reminder-Flag"
      position="4 -15 -60"
      rotation="0 0 0"
      scale="27 27 27"
      animation-mixer="clip: animation_0">
    </a-entity>
```
