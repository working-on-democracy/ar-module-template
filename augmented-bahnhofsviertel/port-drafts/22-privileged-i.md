# Port-Entwurf #22 Privileged I (Jonathan Radetz)

Generiert von `npm run abv:port -- 22` aus `Projektordner_alt/radetz-nepal/`.
Arbeitsgrundlage für `src/ArModule.vue` auf `abv-22-privileged-i` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (`src/assets/`) | id | Status |
|---|---|---|---|---|
| `video` | `assets/textures/nepal_kl.jpg` | `privileged-i-nepal_kl.jpg` | `#privileged-i-nepal_kl` | exists |
| `video1` | `assets/textures/taxi.mp4` | `privileged-i-taxi.mp4` | `#privileged-i-taxi` | exists |
| `audio1` | `assets/taxi.mp3` | `privileged-i-taxi-mp3.mp3` | `#privileged-i-taxi-mp3` | exists |

In `<a-assets>` deklariert, aber nirgends referenziert (nicht importiert):
- `#laufband` (`assets/Laufband.gltf`)

Nicht von der Szene referenziert (nicht importiert, ggf. Varianten/Geschwister-Werke prüfen):
- `assets/textures/Lima_01_kl.mp4`
- `assets/textures/sphericalMap2.mp4`

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
- `position="0 4 5"`
- `id="camera"`
- `portal-camera`

### Komponenten in der Szene, die das Template nicht registriert
- `image-target` — im alten Projekt selbst definiert
- `play-video`

Im alten Projekt registrierte Komponenten: `image-target`, `image-target-ui`, `portal-camera`

### `xrextras-attach` → `attach-to`
- (keine)

`xrextras-attach` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne `#` mitprefixen); bei `target: camera` (außerhalb des Moduls) durch `legacy-attach` mit gleichem Schema ersetzen — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
- `hider-walls`
- `portalHiderRing`
- `portal-wall`
- `portal-contents`

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon `#ground`/`#lightTarget`): IDs mit `privileged-i-` prefixen und jede Referenz darauf mitziehen — auch ohne `#`, z. B. `xrextras-attach="target: model"`.

### UI-Texte aus dem alten Projekt
- „<button class=“

### HTML-Fehler in body.html
- (keine)

### Image-Targets im Export
- (keine) — laut Entscheidung nicht verwendet (SLAM wie im Original, siehe PORTING-GUIDE.md).

## Szene (alt, Asset-Referenzen umgeschrieben)

Ohne `<a-assets>` und `<a-camera>`. Koordinaten noch im alten System (Kamera auf `0 8 8`) — Umrechnung siehe PORTING-GUIDE.md.

```html
<!-- We can define assets here to be loaded while the load screen is displayed -->

<!-- Camera -->

<!-- taxi -->

<a-entity
    geometry="primitive: plane; height: 5.4; width: 9.6;"
    play-video="video: #privileged-i-taxi; autoplay: true"
    sound="src: #privileged-i-taxi-mp3; loop: true; volume: 4; maxDistance: 6; distanceModel: linear; rolloffFactor: 4"
    material="src: #privileged-i-taxi; side: double"
    rotation="0 0 0"
    position="0 6 -1">
  </a-entity>

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
    <a-circle radius="0" rotation="0 180 0" position="0 7.5 0" scale="0.8 0.8 0" xrextras-hider-material></a-circle>
    <a-circle radius="0" rotation="0 180 0" position="0 7.5 -0.25" scale="0.8 0.8 0" xrextras-hider-material></a-circle>
  </a-entity>


  <!-- Lights -->
  
  <a-light type="ambient" intensity="0.9" color= "#ffffff"></a-light>
  <a-entity light="type: directional; color: #ffffff; intensity: 4.5" position="-1 1 0"></a-entity>

 

  <!-- Portal Contents -->
  <a-entity id="portal-contents">
      
     <a-videosphere rotation="0 -90 0" src="#privileged-i-nepal_kl"></a-videosphere>
     <!--a-entity
      id="model"
      gltf-model="#laufband"
      rotation="0 90 0"
      position="15 0 -22"
      scale="40 40 40"
      shadow="cast: false">
    </a-entity-->

    <!--a-entity
      id="model"
      gltf-model="#laufband"
      rotation="0 -120 0"
      position="-5 0 -70"
      scale="40 40 40"
      shadow="cast: false">
    </a-entity-->
  </a-entity>
</a-entity>
```
