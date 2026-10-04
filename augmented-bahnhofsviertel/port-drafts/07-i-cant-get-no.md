# Port-Entwurf #7 I can‘t get no - yes, we can (Andreas Diefenbach)

Generiert von `npm run abv:port -- 7` aus `Projektordner_alt/diefenbach-cannotgetno/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-07-i-cant-get-no` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `laufband` | `assets/Laufband.gltf` | `i-cant-get-no-Laufband.glb` | `#i-cant-get-no-Laufband` | converted |
| `video` | `assets/textures/sphericalMap2.mp4` | `i-cant-get-no-sphericalMap2.mp4` | `#i-cant-get-no-sphericalMap2` | imported |

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
- `xrweb`
- `image-target-ui="skip-marker: true; recenter-button:true; reset-button: false"`

### Kamera (`<a-camera>`, gehört dem Host)
- `position="0 8 11"`
- `id="camera"`
- `portal-camera`

### Komponenten in der Szene, die das Template nicht registriert
- `image-target` — im alten Projekt selbst definiert

Im alten Projekt registrierte Komponenten: `image-target`, `image-target-ui`, `portal-camera`

### `xrextras-attach` → `attach-to`
- (keine)

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `legacy-attach` mit gleichem Schema ersetzen — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `hider-walls`
- `portalHiderRing`
- `portal-wall`
- `portal-contents`
- `model`
- `model`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `i-cant-get-no-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

### UI-Texte aus dem alten Projekt
- „Trete von der Strasse weg. Richte die Kamera auf den Eingang der Deutschen Bank. Tippe auf“

### HTML-Fehler in body.html
- (keine)

### Image-Targets im Export
- `marker.json`
- `marker2.json` — laut Entscheidung nicht verwendet (SLAM wie im Original, siehe PORTING-GUIDE.md).

## Szene (alt, Asset-Referenzen umgeschrieben)

Ohne `<a-assets>` und `<a-camera>`. Koordinaten noch im alten System (Kamera auf `0 8 8`) — Umrechnung siehe PORTING-GUIDE.md.

```html
<!-- We can define assets here to be loaded while the load screen is displayed -->

<!-- Camera -->

<a-entity image-target>
    <!-- Hider walls -->
  <a-entity id="hider-walls">
    <a-box scale="100 1 100" position="0 -1 49" xrextras-hider-material></a-box>
    <a-box scale="100 100 1" position="0 50 75" xrextras-hider-material></a-box>
    <a-box scale="100 1 100" position="0 100 49" xrextras-hider-material></a-box>
    <a-box scale="1 100 100" position="-30 50 50" xrextras-hider-material></a-box>
    <a-box scale="1 100 100" position="30 50 50" xrextras-hider-material></a-box>
      <a-ring id="portalHiderRing" radius-inner="0" radius-outer="100" position="0 7.5 -0.2" xrextras-hider-material></a-ring>
  </a-entity>

   <a-entity id="portal-wall">
    <a-circle radius="5.2" rotation="0 180 0" position="0 7.5 0" scale="0.8 0.8 0" xrextras-hider-material></a-circle>
    <a-circle radius="5.2" rotation="0 180 0" position="0 7.5 -0.25" scale="0.8 0.8 0" xrextras-hider-material></a-circle>
  </a-entity>


  <!-- Lights -->
  
  <a-light type="ambient" intensity="0.9" color= "#e33900"></a-light>
  <a-entity light="type: directional; color: #E37300; intensity: 4.5" position="-1 1 0"></a-entity>


  <!-- Portal Contents -->
  <a-entity id="portal-contents">
      
     <a-videosphere rotation="0 -90 0" src="#i-cant-get-no-sphericalMap2"></a-videosphere>
     <a-entity
      id="model"
      gltf-model="#i-cant-get-no-Laufband"
      rotation="0 90 0"
      position="15 0 -22"
      scale="40 40 40"
      shadow="cast: false">
    </a-entity>

    <a-entity
      id="model"
      gltf-model="#i-cant-get-no-Laufband"
      rotation="0 -120 0"
      position="-5 0 -70"
      scale="40 40 40"
      shadow="cast: false">
    </a-entity>
  </a-entity>
</a-entity>
```
