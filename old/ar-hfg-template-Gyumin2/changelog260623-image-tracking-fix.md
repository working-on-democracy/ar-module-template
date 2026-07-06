# Änderungen am AR-Projekt (Image Tracking Fix)

## 1. Engine-Update: Wechsel auf `@8thwall/engine-binary`

Die alte, aus dem Export der ehemaligen 8th Wall Plattform stammende `external/xr/xr.js` wurde durch die aktuelle, eigenständige Engine-Binary ersetzt (npm-Paket war bereits in `package.json` vorhanden, wurde aber vom Build nicht genutzt).

**`config/webpack.config.js`** – neues Copy-Pattern ergänzt:

```js
{
  from: path.join(rootPath, 'node_modules', '@8thwall', 'engine-binary', 'dist'),
  to: path.join(distPath, 'external', 'xr'),
  noErrorOnMissing: true,
},
```

Der alte, lokal abgelegte Ordner `external/xr/` wurde gelöscht, damit keine veralteten Dateien mehr versehentlich mitkopiert werden.

## 2. Fix: Image-Target-Bilder fehlten im Build (eigentliche Ursache des Problems)

`src/image-targets/` (Ordner wurde während der Fehlersuche von `imageTargets` auf `image-targets` umbenannt) enthält die von 8th Wall generierten Bild-Varianten (`*_luminance.jpg`, `*_original.jpg`, `*_cropped.jpg`, `*_thumbnail.jpg`), die in der `video-target.json` referenziert werden. Das ursprüngliche Copy-Pattern zeigte auf einen nicht existierenden Ordner im Projekt-Root, wodurch die Bilder nie im `dist`-Ordner landeten → 404 beim Laden des Referenzbilds → Tracking konnte nie funktionieren.

**`config/webpack.config.js`** – korrigiertes Pattern:

```js
{
  from: path.join(srcPath, 'image-targets'),
  to: path.join(distPath, 'image-targets'),
  noErrorOnMissing: true,
},
```

**`src/app.js`** – `require()`-Pfad entsprechend angepasst:

```js
require('../src/image-targets/video-target.json')
```

## 3. `index.html`: `disableWorldTracking` entfernt

```html
<!-- vorher -->
xrweb="allowedDevices: any; disableWorldTracking: true;"

<!-- jetzt -->
xrweb="allowedDevices: any;"
```

## 4. Debugging-Code in `src/app.js` (für spätere Fehlersuche drin gelassen)

```js
window.addEventListener('xrimagefound', (e) => {
  console.log('IMAGE FOUND:', JSON.stringify(e.detail))
})
window.addEventListener('xrimageupdated', (e) => {
  console.log('IMAGE UPDATED:', JSON.stringify(e.detail))
})
window.addEventListener('xrimagelost', (e) => {
  console.log('IMAGE LOST')
})
```

## 5. Debugging-Code in `src/app.js`: `realityerror`-Listener

Eingebaut, um bei der Fehlersuche die eigentliche, lesbare Fehlermeldung hinter einem kryptischen `Event {isTrusted: true}` in der Konsole sichtbar zu machen (Listener sowohl auf `window` als auch direkt auf der `<a-scene>`, da unklar war, auf welcher Ebene das Event ankommt). Am Ende stellte sich heraus, dass dieses spezielle Konsolen-Log gar nicht von `realityerror` stammte, sondern von Eruda selbst – der eigentliche Fehler (404 auf das Tracking-Bild) wurde über den Browser-Network-Tab gefunden. Dieser Listener hat im finalen Fix also keine Rolle gespielt:

```js
window.addEventListener('realityerror', (e) => {
  console.error('REALITY ERROR (window):', e.detail && e.detail.error)
  if (e.detail && e.detail.error) {
    console.error('Message:', e.detail.error.message)
    console.error('Stack:', e.detail.error.stack)
  }
})

document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene')
  if (scene) {
    scene.addEventListener('realityerror', (e) => {
      console.error('REALITY ERROR (scene):', e.detail && e.detail.error)
      if (e.detail && e.detail.error) {
        console.error('Message:', e.detail.error.message)
      }
    })
  }
})
```

Kann gefahrlos entfernt werden – schadet im Produktivbetrieb nicht (loggt nur bei echten Engine-Fehlern), ist aber unnötiger Code.

## 6. Temporärer Debug-Helfer in `index.html` (Eruda)

Wurde zum mobilen Debuggen (Chrome auf iOS) eingebaut. **Vor dem Live-Gang wieder entfernen:**

```html
<script src="https://cdn.jsdelivr.net/npm/eruda"></script>
<script>eruda.init();</script>
```

## 7. Test-Box im Image Target (kann entfernt werden)

In `index.html`, zur visuellen Sichtkontrolle ob das Tracking grundsätzlich funktioniert:

```html
<a-box color="red" scale="0.2 0.2 0.2" position="0 0 0.1"></a-box>
```

Kann jetzt aus dem `<xrextras-named-image-target>`-Block entfernt werden, da Video und Tracking bestätigt funktionieren.

---

**Offene Aufräumarbeiten vor Produktiv-Release:**
- [x] Eruda-Script aus `index.html` entfernen (Punkt 6)
- [x] Rote Test-Box aus `index.html` entfernen (Punkt 7)
- [x] `realityerror`-Debug-Listener aus `app.js` entfernen (Punkt 5)
- [x] Optional: `console.log`-Debugging (Punkt 4) reduzieren oder hinter einen Debug-Flag setzen
