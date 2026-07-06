# Wie Image Tracking in diesem Projekt funktioniert

Dieses Dokument erklärt den Gesamtablauf des Image Trackings (8th Wall Engine + A-Frame) und welche Codeblöcke jeweils welche Aufgabe übernehmen.

## Grundprinzip

8th Wall vergleicht laufend das Live-Kamerabild mit zuvor hinterlegten Referenzbildern ("Image Targets"). Wird eine ausreichende Übereinstimmung gefunden, weiß die Engine: "Dieses physische Bild ist gerade im Kamerabild sichtbar, und zwar mit dieser Position/Rotation/Größe" – und kann darauf 3D-Content (hier: ein Video) exakt ausgerichtet einblenden.

Damit das funktioniert, braucht es drei Zutaten, die alle zusammenpassen müssen:

1. Ein **Referenzbild + Metadaten** (von 8th Wall aus deinem Ausgangsbild generiert)
2. **Code, der diese Daten der Engine übergibt** (Konfiguration)
3. **Markup, das auf den Namen des Targets reagiert** (was passiert, wenn es erkannt wird)

---

## 1. Die Image-Target-Daten (`src/image-targets/`)

### Erzeugung mit dem offiziellen `image-target-cli`-Tool

Da die alte, gehostete 8th Wall Plattform (samt Web-Console zum Hochladen von Bildern) abgeschaltet wurde, werden Image Targets für die aktuelle Open-Source-Engine über ein eigenes CLI-Tool aus dem `8thwall/8thwall`-Repo erzeugt: **`image-target-cli`**. Laut offizieller Dokumentation verarbeitet dieses Tool ein Ausgangsbild in das Datenformat, das von der (selbst-gehosteten) Engine gelesen werden kann.

Aufruf (z. B. direkt per `npx`, ohne lokale Installation):

```bash
npx @8thwall/image-target-cli@latest
```

Das Tool fragt danach interaktiv im Terminal ab:

1. **Bildpfad** – der Pfad zum Ausgangsbild, das als Tracking-Ziel dienen soll (`.jpg`/`.jpeg`/`.png`).
2. **Zuschnitt (Crop)** – welcher Bildbereich tatsächlich für die Erkennung verwendet werden soll. Möglich ist ein automatischer, zentrierter Zuschnitt oder eine manuelle Eingabe der Crop-Maße. Bei zylindrischer Geometrie (z. B. für Dosen/Becher) werden zusätzlich Umfang und Zielbreite abgefragt; bei konischer Geometrie (z. B. Flaschen) der äußere und innere Radius der Bildkrümmung.
3. **Ordner-/Target-Name** – der Name, unter dem das Target gespeichert wird. Dieser Name landet als `name`-Feld in der erzeugten JSON (siehe unten) und muss später exakt mit dem `name`-Attribut in `<xrextras-named-image-target>` übereinstimmen.

**Was das Tool im Hintergrund tut:** Aus dem Ausgangsbild berechnet es die für die Feature-Erkennung nötigen Bildvarianten (insbesondere die Luminance-Map, siehe unten) und legt diese zusammen mit den Geometrie-Metadaten (Maße, Zuschnitt, Form) in einem Ausgabeordner ab – das ist genau das Datenpaket, das anschließend in `src/image-targets/` liegt und von `app.js` per `require()` eingelesen wird.

### Das erzeugte Datenpaket

Das Ergebnis dieses CLI-Durchlaufs ist ein Datenpaket:

```
src/image-targets/
  video-target.json
  video-target_original.jpg
  video-target_cropped.jpg
  video-target_thumbnail.jpg
  video-target_luminance.jpg
```

**`video-target.json`** ist die zentrale Metadaten-Datei:

```json
{
  "imagePath": "image-targets/video-target_luminance.jpg",
  "name": "video-target",
  "type": "PLANAR",
  "properties": {
    "width": 584,
    "height": 779,
    ...
  },
  "resources": { ... }
}
```

- **`name`**: Der eindeutige Bezeichner dieses Targets. Dieser Name verbindet später die Konfiguration (Schritt 2) mit dem Markup in der HTML (Schritt 3) – er muss überall exakt gleich geschrieben sein.
- **`imagePath`**: Pfad zur sogenannten **Luminance-Map** – einer speziell aufbereiteten Graustufen-Version des Bildes, die für die Feature-Erkennung verwendet wird (nicht das hübsche Originalbild, sondern eine für den Tracking-Algorithmus optimierte Variante).
- **`properties.width/height`**: Die physischen Maße des Referenzbildes, damit die Engine die richtige Skalierung im 3D-Raum berechnen kann.

Diese Dateien sind reine **Daten**, kein Code – aber ohne sie (bzw. wenn `imagePath` auf eine nicht erreichbare Datei zeigt) hat die Engine keine Grundlage zum Erkennen.

---

## 2. Konfiguration: Die Daten der Engine übergeben (`src/app.js`)

```js
const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [
      require('../src/image-targets/video-target.json'),
    ],
  })
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
```

**Was hier passiert:**

- `XR8.XrController.configure({ imageTargetData: [...] })` ist der Aufruf, der der 8th Wall Engine sagt: "Hier sind die Referenzbilder, nach denen du im Kamerabild suchen sollst." Man kann hier eine Liste mehrerer Targets übergeben, falls ein Projekt mehrere Bilder erkennen soll.
- `require('../src/image-targets/video-target.json')` lädt die Metadaten-Datei zur Build-Zeit (Webpack bündelt den JSON-Inhalt direkt ins `bundle.js`).
- Die Prüfung `window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)` stellt sicher, dass die Konfiguration erst läuft, **sobald die Engine tatsächlich geladen ist** – unabhängig davon, ob `XR8` zu diesem Zeitpunkt schon existiert oder erst kurz danach per Event nachgeliefert wird.

**Wichtig:** Diese Funktion lädt nur die *Metadaten*-JSON. Das eigentliche Bild (`imagePath` aus Schritt 1) wird von der Engine zur Laufzeit per HTTP nachgeladen – es muss also zusätzlich am Server unter dem in `imagePath` angegebenen relativen Pfad erreichbar sein (siehe Abschnitt 4 zum Build-Prozess).

---

## 3. Reaktion auf Erkennung: Das Markup (`src/index.html`)

```html
<xrextras-named-image-target name="video-target">
    <a-entity xrextras-play-video="video: #jelly-video; thumb: #jelly-thumb; canstop: true"
              geometry="primitive: plane; height: 1; width: 0.79;"></a-entity>
</xrextras-named-image-target>
```

**Was hier passiert:**

- `<xrextras-named-image-target name="video-target">` ist eine von `xrextras` bereitgestellte A-Frame-Komponente. Sie lauscht intern auf die Tracking-Events der Engine (`xrimagefound` / `xrimageupdated` / `xrimagelost`) und filtert automatisch nach dem angegebenen `name`. Nur wenn der Name **exakt** mit dem `name`-Feld aus der `video-target.json` übereinstimmt, reagiert dieser Block.
- Solange das Target erkannt ist, positioniert `xrextras-named-image-target` automatisch alle Kind-Elemente exakt an der Stelle und mit der Ausrichtung des erkannten physischen Bildes – wie ein unsichtbarer Anker im 3D-Raum.
- Das Kind-Element `<a-entity xrextras-play-video="...">` ist die eigentliche Nutzlast: eine Plane (`geometry`), auf der das Video `#jelly-video` abgespielt wird, sobald das Target sichtbar ist. `canstop: true` sorgt zusätzlich dafür, dass das Video pausiert, wenn das Target wieder aus dem Kamerabild verschwindet.
- `#jelly-video` und `#jelly-thumb` werden weiter oben in `<a-assets>` definiert:
  ```html
  <a-assets>
      <img id="jelly-thumb" src="assets/video-target.jpg">
      <video id="jelly-video" autoplay muted crossorigin="anonymous" loop="true" src="assets/jellyfish-video.mp4"></video>
  </a-assets>
  ```
  Das ist bewusst getrennt von den Image-Target-Daten aus Schritt 1: `assets/video-target.jpg` ist hier nur das **Thumbnail-Bild für das Video selbst** (es wird angezeigt, bevor/falls das Video noch nicht abspielt), nicht das Tracking-Referenzbild der Engine.

---

## 4. Engine-Initialisierung & Pipeline-Konfiguration (`src/index.html`, `<head>` und `<a-scene>`)

```html
<script crossorigin="anonymous" src="./external/xr/xr.js" data-preload-chunks="face, slam" async="true"></script>
```

```html
<a-scene
    ...
    xrweb="allowedDevices: any;"
>
```

- `data-preload-chunks="face, slam"`: 8th Wall lädt einzelne Pipeline-Module ("Chunks") bei Bedarf nach, um die initiale Ladezeit klein zu halten. Image Tracking läuft technisch über den **`slam`**-Chunk (Teil der World-Tracking-Pipeline) – daher muss `slam` hier vorgeladen werden, sonst ist die für Image Targets nötige Funktionalität zur Laufzeit gar nicht verfügbar.
- `xrweb="allowedDevices: any;"`: Aktiviert die WebXR-Pipeline grundsätzlich für alle Gerätetypen. **Wichtig:** Ein zusätzliches `disableWorldTracking: true` würde hier die für Image Tracking nötige SLAM-Pipeline deaktivieren und das Tracking verhindern – dieses Attribut darf hier nicht gesetzt sein.

---

## 5. Build-Prozess: Wie die Dateien zusammenkommen (`config/webpack.config.js`)

```js
new CopyWebpackPlugin({
  patterns: [
    {
      from: path.join(rootPath, 'node_modules', '@8thwall', 'engine-binary', 'dist'),
      to: path.join(distPath, 'external', 'xr'),
      noErrorOnMissing: true,
    },
    {
      from: path.join(srcPath, 'image-targets'),
      to: path.join(distPath, 'image-targets'),
      noErrorOnMissing: true,
    },
    ...
  ],
})
```

Dieser Plugin-Block sorgt beim `npm run build` dafür, dass zwei Dinge in den finalen `dist`-Ordner kopiert werden:

- Die **Engine selbst** (`xr.js`, `xr-face.js`, `xr-slam.js`) aus dem npm-Paket `@8thwall/engine-binary` nach `dist/external/xr/`.
- Die **Image-Target-Bilder** aus `src/image-targets/` nach `dist/image-targets/`.

**Der entscheidende Zusammenhang:** Das Ziel-Verzeichnis `dist/image-targets/` muss exakt dem entsprechen, was `imagePath` in der `video-target.json` als Präfix erwartet (`"image-targets/video-target_luminance.jpg"`). Nur wenn diese drei Dinge – Quellordner-Name im Webpack-Pattern, Zielordner-Name im Webpack-Pattern, und der `imagePath`-Präfix in der JSON – konsistent zusammenpassen, kann der Browser das Referenzbild zur Laufzeit erfolgreich per HTTP nachladen.

---

## Zusammenfassung: Der komplette Ablauf

1. **Build-Zeit:** Webpack kopiert Engine + Image-Target-Bilder in `dist/`, bündelt `video-target.json` per `require()` direkt ins `bundle.js`.
2. **Seitenaufruf:** `xr.js` lädt, Chunk `slam` wird vorgeladen → SLAM/Image-Tracking-Pipeline verfügbar.
3. **`xrloaded`-Event:** `app.js` ruft `XR8.XrController.configure()` mit den Metadaten aus der JSON auf. Die Engine lädt daraufhin selbstständig das via `imagePath` referenzierte Luminance-Bild per HTTP nach.
4. **Laufzeit:** Die Engine vergleicht laufend das Kamerabild mit dem geladenen Referenzbild.
5. **Treffer:** Bei Übereinstimmung feuert die Engine intern Tracking-Events; `<xrextras-named-image-target name="video-target">` reagiert darauf (Name-Match) und positioniert sein Kind-Element (die Video-Plane) exakt am erkannten Bild.
6. **Wiedergabe:** `xrextras-play-video` startet das Video, solange das Target sichtbar bleibt, und pausiert es, wenn es aus dem Bild verschwindet.
