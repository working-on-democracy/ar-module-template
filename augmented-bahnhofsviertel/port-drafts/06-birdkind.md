# Port-Entwurf #6 Birdkin(d) (Katharina Pelosi)

Generiert von `npm run abv:port -- 6` aus `Projektordner_alt/pelosi-birdkind/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-06-birdkind` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `l1` | `assets/Membran_01.gltf` | `birdkind-Membran_01.glb` | `#birdkind-Membran_01` | converted |
| `l2` | `assets/Membran_02.gltf` | `birdkind-Membran_02.glb` | `#birdkind-Membran_02` | converted |
| `s1` | `assets/01.mp3` | `birdkind-01.mp3` | `#birdkind-01` | imported |
| `s2` | `assets/02.mp3` | `birdkind-02.mp3` | `#birdkind-02` | imported |
| `s3` | `assets/03.mp3` | `birdkind-03.mp3` | `#birdkind-03` | imported |
| `s4` | `assets/04.mp3` | `birdkind-04.mp3` | `#birdkind-04` | imported |
| `s5` | `assets/05.mp3` | `birdkind-05.mp3` | `#birdkind-05` | imported |
| `s6` | `assets/06.mp3` | `birdkind-06.mp3` | `#birdkind-06` | imported |
| `s7` | `assets/07.mp3` | `birdkind-07.mp3` | `#birdkind-07` | imported |
| `s8` | `assets/08.mp3` | `birdkind-08.mp3` | `#birdkind-08` | imported |
| `s9` | `assets/09.mp3` | `birdkind-09.mp3` | `#birdkind-09` | imported |
| `s10` | `assets/10.mp3` | `birdkind-10.mp3` | `#birdkind-10` | imported |
| `s11` | `assets/11.mp3` | `birdkind-11.mp3` | `#birdkind-11` | imported |
| `s12` | `assets/12.mp3` | `birdkind-12.mp3` | `#birdkind-12` | imported |

In `<a-assets>` deklariert, aber nirgends referenziert (nicht importiert):
- (keine)

Nicht von der Szene referenziert (nicht importiert, ggf. Varianten/Geschwister-Werke prüfen):
- (keine)

Aus JS referenzierte Assets (nicht importiert, manuell prüfen):
- (keine)

## Manuell zu entscheiden

### Szenen-Attribute (`<a-scene>`, gehören dem Host)
- `id="scene"`
- `xrextras-almost-there`
- `xrextras-loading`
- `xrextras-runtime-error`
- `renderer="colorManagement:true"`
- `xrweb`
- `skip-marker="true"`
- `image-target-ui="skip-marker: true; recenter-button:true; reset-button: false"`
- `distance-place-sequence="sequence:0,40,46,54,70,85,94,109,127, 135, 159, 175"`

### Kamera (`<a-camera>`, gehört dem Host)
- `id="camera"`
- `position="0 8 0"`

### Komponenten in der Szene, die das Template nicht registriert
- (keine)

Im alten Projekt registrierte Komponenten: `distance-place-sequence`, `image-target-ui`

### `xrextras-attach` → `attach-to`
- `xrextras-attach="target: camera; offset: 8 15 4"`
- `xrextras-attach="target: camera; offset: 8 15 -4"`

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `legacy-attach` mit gleichem Schema ersetzen — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `ground`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `birdkind-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

### UI-Texte aus dem alten Projekt
- „Drehe die Lautstärke auf, suche dir einen schönen Platz und tippe auf“

### HTML-Fehler in body.html
- (keine)

### Image-Targets im Export
- `marker.json` — laut Entscheidung nicht verwendet (SLAM wie im Original, siehe PORTING-GUIDE.md).

## Szene (alt, Asset-Referenzen umgeschrieben)

Ohne `<a-assets>` und `<a-camera>`. Koordinaten noch im alten System (Kamera auf `0 8 8`) — Umrechnung siehe PORTING-GUIDE.md.

```html
<!-- Die oben beschriebenen Komponenten gehen durch alle asset-items vom typ .gltf / .glb durch -->

<!-- The raycaster will emit mouse events on scene objects specified with the cantap class -->

<a-entity
    light="
      type: directional;
      intensity: 5.0;
      castShadow: true;
      shadowMapHeight:1024;
      shadowMapWidth:1024;
      shadowCameraTop: 20;
      shadowCameraBottom: -20;
      shadowCameraRight: 20;
      shadowCameraLeft: -20;
      target: #camera"
    xrextras-attach="target: camera; offset: 8 15 4"
    position="1 4.3 2.5"
    shadow>
  </a-entity>

<a-entity
    light="
      type: directional;
      intensity: 3.0;
      castShadow: false;
      shadowMapHeight:1024;
      shadowMapWidth:1024;
      shadowCameraTop: 20;
      shadowCameraBottom: -20;
      shadowCameraRight: 20;
      shadowCameraLeft: -20;
      target: #camera"
    xrextras-attach="target: camera; offset: 8 15 -4"
    position="1 4.3 -2.5"
    shadow>
  </a-entity>

<a-light type="ambient" intensity="2.0" color="#fff"></a-light>

<!-- Adding the cantap class allows the ground to be clicked -->

<a-box
    id="ground"
    scale="10000 2 10000"
    position="0 -1 0"
    material="shader: shadow; transparent: true; opacity: 0.2; color: #fff800"
    shadow>
  </a-box>
```
