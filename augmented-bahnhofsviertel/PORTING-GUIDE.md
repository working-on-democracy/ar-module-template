# Portierungs-Guide: 8th-Wall-Werke → ArModule

Wie ein Werk aus dem alten 8th-Wall-Export (`augmented-bahnhofsviertel/Projektordner_alt/`, gitignored) in ein ArModule dieses Templates übertragen wird. Steuerliste und Stand: [AUGMENTED-BAHNHOFSVIERTEL-WORKS.md](../AUGMENTED-BAHNHOFSVIERTEL-WORKS.md). Allgemeine Template-Regeln: [AGENTS.md](../AGENTS.md) — gelten hier uneingeschränkt.

## 1. Grundsätze

- **Kein Rückfluss nach `feature_template`.** Weder vom Zwischenbranch noch von `abv-*`-Branches wird nach `feature_template` gemergt/gepusht (der lokale pre-push-Hook blockiert es). Ein hier entstandener, allgemein nützlicher Baustein geht nur über `ADDING-FEATURES-WORKFLOW.md` und nach ausdrücklicher Freigabe dorthin.
- **Originalgetreu.** SLAM-Platzierung vor der Kamera mit Start-Button und Recenter wie im Original, kein Image-Tracking. Look möglichst wie das Original; kleine Abweichungen sind vorerst akzeptiert und werden dokumentiert (Feedback der damals Beteiligten folgt).
- **Ein Branch pro Werk** (`abv-<Nr>-<slug>`), Reihen-Werke zweigen vom ersten Werk ab. Was mehrere Werke brauchen, kommt auf `augmented-bahnhofsviertel` und wird von dort in die Werk-Branches gemergt — nie zwischen Werk-Branches kopieren.
- **Die alten Exporte bleiben unverändert.** Builds/Analysen arbeiten auf Kopien (`.reference-build/`, Dry-Run-Ordner).

## 2. Altes Format vs. ArModule

| | Alter 8th-Wall-Export | ArModule (dieses Template) |
|---|---|---|
| Einheit | eigenständige Web-App pro Werk (webpack, `index/head/body.html`, `app.js`) | Vue-SFC `src/ArModule.vue`, vom Host in **seine** Szene geladen |
| Szene | eigene `<a-scene xrweb …>` mit `xrextras-*`, `image-target-ui`, `recenter` | gehört dem Host; das Modul liefert nur Entities |
| Kamera | eigene `<a-camera position="0 8 8" raycaster cursor …>`, teils mit `sound` oder Kindern | gehört dem Host; `id/position/cursor/raycaster` sind verboten (`CAMERA_PROPS_FORBIDDEN`) |
| Assets | `<a-assets>` in body.html, Unterordner, glTF als Ordner-Bundles | flach in `src/assets/`, Dateiname = Asset-ID, vom Host injiziert; keine eigenen `<a-assets>` |
| Komponenten | `AFRAME.registerComponent` in `app.js` (+ Systeme) | `src/a-frame-components/*.ts`, registriert über `src/manifest.ts` (nur Komponenten, keine Systeme) |
| UI | DOM-Overlays aus `ui.js` (Start, Hinweise, Recenter, Audio/Video freischalten), CSS aus `ui.css` | Vue-Template im Modul (2D-DOM, inline-Styles — `<style>`-Blöcke erreichen den Host nicht, siehe README „Caveats“) |
| Laufzeit | 8frame **1.3.0** (three r137) im Export-Build, aframe-extras 6.1.1, xrextras | 8frame **1.5.0** (three r158) in `dev:ar`, aframe-extras 6.1.1, xrextras |

Hinweis zur Laufzeit: Die Projekte nennen in `head.html` die A-Frame-Versionen 1.1/1.2/1.3, der Export-Build lädt aber für alle 8frame 1.3.0 — das ist die Referenz, gegen die verglichen wird.

## 3. Werkzeuge

| Befehl | Zweck |
|---|---|
| `npm run abv:port -- <Nr>` | legt `abv-<Nr>-<slug>` an (von der Zwischenbasis bzw. vom Reihen-Vorgänger), importiert die referenzierten Assets geprefixt nach `src/assets/` (glTF → GLB verlustfrei) und schreibt `augmented-bahnhofsviertel/port-drafts/<Nr>-<slug>.md` |
| `npm run abv:port -- <Nr> --dry-run` | dasselbe ohne Git und ohne Projektdateien (Ausgabe in einen Temp-Ordner) — zum Vorab-Ansehen |
| `npm run abv:port -- <Nr> --no-branch [--force-assets]` | auf dem bereits bestehenden Werk-Branch erneut importieren |
| `npm run abv:reference -- <Nr> [legacy\|port]` | Headless-Screenshot des Originals (`legacy`, baut den Export aus einer gepatchten Kopie) bzw. des Ports (`port`, startet `dev:ar` auf dem aktuellen Branch) nach `about/<Nr>-<slug>/reference-*.jpg` |
| `npm run compress-assets` | Mesh-/Textur-Kompression der importierten GLBs (siehe `cross-feature-reference-docs/ASSET-COMPRESSION-GUIDE.md`) |

Einmalig pro Rechner für `abv:reference`: `ffmpeg` und `npx playwright install chromium`; der erste Legacy-Lauf führt ein `npm install` in `Projektordner_alt/` aus (alle 22 Exporte haben identische Build-Konfiguration, ein gemeinsames `node_modules` reicht).

## 4. Ablauf pro Werk (Checkliste)

1. **Vorab:** Port-Entwurf per `--dry-run` ansehen; offene Punkte in der Steuerliste vermerken. Referenz des Originals ansehen (`about/<Nr>-<slug>/reference-legacy*.jpg`, ggf. neu aufnehmen).
2. **Branch + Import:** `npm run abv:port -- <Nr>` (sauberer Working Tree nötig). Status in der Steuerliste auf `in Arbeit`.
3. **Platzhalter-Szene ersetzen:** Licht und Boden der Template-Szene in `ArModule.vue` durch die des Werks ersetzen — die Lade-UI und `no-frustum-cull` auf dem Wurzel-Entity bleiben. (Die Template-Beispiel-Assets sind auf der Zwischenbasis bereits entfernt, siehe §7.)
4. **Szene übertragen:** den Szenen-Block aus dem Port-Entwurf in das Wurzel-`<a-entity>` von `ArModule.vue` übernehmen und dabei
   - Element-IDs mit `<slug>-` prefixen (inkl. Referenzen ohne `#`, z. B. `xrextras-attach="target: model"`),
   - Kamera-Inhalte (z. B. `sound` an `<a-camera>`) auf eigene Entities verlegen — Ambient-Sound mit dem Tap-to-enable-sound-Overlay des Templates (`examples/sound-unlock-overlay-usage.html`) statt des alten `enable-audio`,
   - `xrextras-attach` beibehalten, wenn Ziel und Element denselben Elternteil haben (Ziel-ID mitprefixen); bei `target: camera` durch `legacy-attach` ersetzen (§8),
   - die alte Szene unverändert in die Legacy-Hülle aus §6 setzen statt Koordinaten einzeln umzurechnen,
   - das alte `image-target`-Wrapper-Entity (startet unsichtbar, wird per „Start“ eingeblendet) durch den Start/Recenter-Mechanismus aus §6 ersetzen,
   - `animation-mixer` beibehalten (originalgetreu; nicht mit `trim-loop-clip` auf demselben Entity kombinieren).
5. **Komponenten:** was im Entwurf unter „Komponenten, die das Template nicht registriert“ steht, prüfen — gemeinsame Bausteine (§5) nutzen; werkspezifische Komponenten als `src/a-frame-components/<slug>-*.ts` portieren und additiv in `manifest.ts` eintragen. Dabei die Template-Regeln: Materialien vor Änderung klonen, `object3dset` (Typ `mesh`) statt nur `model-loaded`, eindeutiger `customProgramCacheKey` bei `onBeforeCompile`, Pipeline-Module/Listener in `remove()` abbauen.
6. **UI-Texte** (Start-Hinweis u. ä.) aus dem Entwurf wörtlich übernehmen.
7. **Assets komprimieren:** `npm run compress-assets` für die importierten GLBs/Bilder (nie auf bereits komprimierte Dateien von Hand `gltfpack`).
8. **Prüfen:** `npx vue-tsc --noEmit`, `npm run build` (danach `dist-platform/` löschen), `npm run abv:reference -- <Nr> port` und mit `reference-legacy.jpg` vergleichen; Abweichungen im Werk-Abschnitt der Steuerliste notieren. Auf dem Handy (`npm run dev:ar`) Maßstab, Platzierung und Bewegung prüfen — headless geht das nicht.
9. **Steuerliste** aktualisieren (`portiert`), committen nur auf Anweisung.

## 5. Gemeinsame Bausteine (auf der Zwischenbasis)

Unter ihren Originalnamen portiert, damit altes Markup unverändert passt:

| Komponente | Original | Änderungen gegenüber dem Original |
|---|---|---|
| `xr-light` | `xrlight.js` (17 Projekte, identisch) | ohne A-Frame-System (Manifest kann keine Systeme registrieren); Pipeline-Modul wird beim letzten `remove()` entfernt; schreibt Intensität nur bei Änderung |
| `cubemap-static` | `cubemap-static.js` (15 Projekte) | klont Materialien; `object3dset`; liest die Würfelbilder linear wie das Original (three r152+ würde sie als sRGB behandeln und die Reflexionen deutlich abdunkeln); `format` wird ignoriert (`THREE.RGBFormat` existiert in r137+ nicht mehr — war also schon im Export-Build wirkungslos) |
| `cubemap-realtime` | `cubemap-realtime.js` (15 Projekte, 6 Varianten) | klont Materialien; `object3dset`; optional `envMapIntensity` (Standard 1); eindeutiger Pipeline-Name pro Instanz + Abbau in `remove()`; synchronisierte Kameratextur (`realityTexture`); Render-Target nach jedem Update mit `needsPMREMUpdate` markiert; **nicht** mit `cubemap-static` auf einer anderen Instanz desselben Modells kombinieren (§8) |
| `legacy-space` | neu (ersetzt `image-target-ui`/`recenter`) | Hülle um die unveränderte alte Szene, platziert sie modul-lokal vor der Kamera (§6); `legacy-space-place`-Event = modul-lokales Recenter; skaliert Schatten-Kameras (Ausdehnung **und** Tiefenbereich near/far — sonst Shadow-Acne), die Reichweite (`distance`) von Punkt-/Spotlichtern und Distanzen positionaler Sounds (`refDistance`/`maxDistance`) mit; jeder erkannte Szenen-Tap wird als `legacy-space-tap` an der Hülle gemeldet (für werkspezifische Komponenten, die früher auf `click` reagierten); `tapRecenter: true` = modul-lokales `xrextras-tap-recenter` (jeder Tap auf die Szene platziert neu; erkannt über Pointer-Events statt `click`, weil iOS den `click` nach `xrextras-gesture-detector` unterdrückt — auf dem Handy bestätigt) |
| `LegacyOverlay.vue` (+ `legacy-ui-icons.ts`, `legacy-audio.ts`) | `ui.js`/`ui.css`/`image-target-ui.js`/`enable-audio.js` | Vue-Overlay im Modul statt DOM-Buttons im `<body>`: Mittelspalte (Start-/Audio-/Video-Buttons mit Hinweistext, verschwinden nach dem Tippen; `variant: "hint"` = `.hint` mit ✕) und Recenter-Button oben rechts (`legacy-space-place`, modul-lokal); gleiche Optik, inline-Styles. Erscheint, sobald die Hülle platziert ist (Ersatz für `realityready`). `legacy-audio.ts`: Sounds des Moduls mit iOS-Unlock starten, im Hintergrund pausieren (nur hörbare). Recenter-Icon gemeinsam (in allen 17 Projekten identisch), werkspezifische Icons pro Werk |
| `crossfade-loop-clip` | neu (statt `animation-mixer`) | für Animationen, die nicht nahtlos loopen: gleicher Abspielbereich wie `animation-mixer` (ab t = 0), die letzten `crossfade` Sekunden blenden in den Loop-Start; jeder Track-Typ. Nur nach Abstimmung einsetzen — ändert die Bewegung sichtbar |
| `legacy-attach` | `xrextras-attach` | gleiches Schema; rechnet die Weltposition des Ziels in den Elternraum um und addiert den Offset dort (alte Einheiten/Achsen) — für Ziele außerhalb der Hülle, v. a. `target: camera` (6× in #1, #4, #6, #18) |
| `hold-drag` | `xrextras-hold-drag` | gleiches Schema/Verhalten, rechnet Boden-Treffer und Höhen in den lokalen Raum des Elternteils um (Original schreibt Weltkoordinaten in die lokale Position, §8) |

Bereits im Template bzw. in der Host-Laufzeit vorhanden: `animation-mixer` und `xrextras-*` (Gesten, `xrextras-hider-material`) über aframe-extras/xrextras; `attach-to` als Ersatz für `xrextras-attach` bei Zielen außerhalb des Moduls, z. B. der Kamera (§8); `no-frustum-cull` für animierte Modelle; `material="shader: shadow"` für Schattenböden; `sound-unlock-audio` als Basis für das Freischalten von Audio.

Noch nicht portiert (Kandidaten, sobald ein Werk sie braucht): Legacy-Hülle mit modul-lokalem Start/Recenter und die übrigen Overlays aus `ui.js`/`image-target-ui.js` (§6, im Pilot), Video-Freischaltung (`enable-video.js`, 5 Varianten), `portal-camera`/Portal-Komponenten (Nr. 7, 22, Referenz `portaljonathan`), Platzierungs-Komponenten von Mettler/Pelosi.

## 6. Platzierung, Recenter und Maßstab

### Wie die alten Szenen platziert sind

Die alten Szenen verwenden durchgängig die 8th-Wall-Konvention „Kamera startet auf `0 8 8`, Boden bei `y = 0`“ im Maßstabsmodus `responsive`: Die Starthöhe der Kamera (8 Einheiten) entspricht der realen Handyhöhe über dem Boden. Eine alte Einheit ist also etwa `H / 8` Meter (bei H ≈ 1,5 m rund 0,19 m) — daher Werte wie `scale="25 25 25"` oder `position="0 0 -30"`. „Start“ und der Recenter-Button lösen `scene.emit('recenter')` aus, ein **globales** XR8-Recenter.

### Warum feste Offsets hier nicht funktionieren

Ein Modul sitzt nicht im Szenen-Ursprung, sondern unter Wrappern, die es selbst nicht kontrolliert:

- `lib/preview-ar.ts` hängt jedes Modul **ohne** Image-Targets in ein `module-root` bei `0 1.6 -3` (bildet laut Kommentar die Host-Platzierung `AR_MODULE_POSITION` nach — der Host-Code selbst liegt nicht in diesem Repo). Siehe `guides/IMAGE-TRACKING-FEATURE-GUIDE.md` §3 Punkt 3: genau dieser Wrapper hat dort schon Inhalte verschoben.
- Das Wurzel-Entity in `ArModule.vue` hat zusätzlich `position="0 -2 0"`.

Eine Hülle mit fest eingerechneten Offsets (`0 1.6 -3`, `0 -2 0`) wäre die „Kamera-Korrektur für eine bestimmte Host-Installation“, vor der `ADDING-FEATURES-WORKFLOW.md` §3 warnt: Sie stimmt nur, solange Preview und Host genau diese Werte verwenden.

### Entscheidung: modul-lokales Platzieren (2026-10-04)

Kein globales `recenter` (das würde im Host alle gleichzeitig sichtbaren Module und die Host-UI verschieben). Stattdessen setzt das Modul bei „Start“ und bei seinem eigenen Recenter-Button **nur seine eigenen Inhalte** vor die aktuelle Kamera — wie im Original, aber ohne Nebenwirkung auf andere Module.

Umgesetzt im Pilot (#19 Kleiderberg) als Komponente **`legacy-space`** um die unverändert übernommene alte Szene:

1. Sobald die Kamera eine brauchbare Pose hat, liest sie deren **Welt**-Pose.
2. Zielpose der Hülle: Skalierung `s = Kamerahöhe / 8`, Drehung nur um die Hochachse in Blickrichtung (beim senkrecht nach unten gehaltenen Handy: Richtung Bildschirm-Oberkante), alte Kamera `0 8 8` liegt auf der echten Kamera, alter Boden `y = 0` auf dem Weltboden `y = 0`.
3. Diese Weltpose wird über die inverse Welt-Matrix des Elternteils in lokale Koordinaten umgerechnet — unabhängig von Preview- oder Host-Wrappern.

Gemessen (headless, `dev:ar`): XR8 setzt die Kamera der Preview (Start `0 0 0`, `scale: responsive`) auf **Höhe 2**, der Boden ist Welt-`y = 0` — dieselbe Konvention wie in den alten Projekten (Kamera 8, Boden 0), nur mit anderer Starthöhe. Deshalb braucht die Hülle keinen Meter-Wert: `s = 2 / 8 = 0.25` folgt direkt aus 8th Walls eigener `responsive`-Logik. Für Kleiderberg ergab das Hülle bei Welt `0 0 -2`, Skalierung `0.25` — exakt wie berechnet. **Auf dem Handy noch zu prüfen:** ob der Host dieselbe Konvention nutzt und ob die Platzierung in der Praxis wie im Original wirkt.

Für Werke mit Recenter-Button: der Button schickt `legacy-space-place` an die Hülle. Für Werke mit `xrextras-tap-recenter` an der Szene: `legacy-space="tapRecenter: true"`.

`abv:port` importiert nur Assets, die die Szene oder das Projekt-JS tatsächlich referenziert (bzw. alle, wenn das JS `<a-asset-item>`s selbst einsammelt wie bei Mettler; Cubemap-Bilder nur, wenn `cubemap-static` genutzt wird — auch per `setAttribute` aus JS). Neun alte Projekte deklarieren die sechs Cubemap-Bilder, ohne sie zu verwenden; der Entwurf listet solche Assets unter „deklariert, aber nirgends referenziert“.

### Start-Overlay

Die alten 2D-Overlays (Hinweistext + „Start“, Recenter-Button oben rechts, Audio/Video-Freischaltung) werden als Vue-Overlay im Modul nachgebaut — wie die Lade-UI in `ArModule.vue`: inline-Styles, kein `<style>`-Block (erreicht den Host nicht, README „Caveats“). Texte wörtlich aus dem Port-Entwurf.

## 7. Entschiedene Grundsatzfragen (2026-10-04)

1. **Start/Recenter:** modul-lokal (§6), kein globales XR8-Recenter.
2. **Template-Beispiel-Assets:** auf der Zwischenbasis entfernt — `jellyfish-video.mp4`, `liquid-texture-target-1/2.webp`, `mesh-render-order-rosa.glb` (zusammen ~5,5 MB) sowie das Beispiel-Image-Target `src/image-targets/video-target.*` (wird ebenfalls ausgeliefert und injiziert). Behalten: die vier Sound-Icons `sound-*.webp` (~600 Byte, Teil des Sound-Features). Die `examples/*.html` verweisen weiterhin auf die entfernten Dateien — sie werden nicht gebaut und dienen hier nur als Doku. **Bei jedem Merge von `feature_template` in die Zwischenbasis prüfen, ob neue Beispiel-Assets mitkommen.**
3. **Legacy-Hülle:** ja, als modul-lokale Platzierung nach §6, Bestätigung von Maßstab/Höhe im Pilot auf dem Handy.

## 8. Bekannte Fallstricke

- **Asset-Ordner-Bundles:** `assets/x.gltf` ist im Export ein Ordner mit der eigentlichen Datei; `abv:port` und `abv:reference` lösen das auf.
- **Mehrere Buffer:** alte `.gltf` haben teils mehrere Buffer; `abv:port` führt sie beim GLB-Export verlustfrei zusammen.
- **IDs kollidieren** in der gemeinsamen Host-Szene (`model`, `ground`, `group`, `camera` sind in fast allen alten Szenen vergeben).
- **Kamera-Attribute** (`position="0 8 8"`, `raycaster`, `cursor`) sind host-eigen; Sound an der Kamera muss umziehen.
- **`xrextras-attach`** (19× in den alten Szenen, meist Lichter) kopiert die **lokale** Position des Ziels plus Offset in die eigene **lokale** Position (geprüft im Quelltext von `@8thwall/xrextras`). Das ist korrekt, solange Ziel und angehängtes Element **denselben Elternteil** haben — z. B. Licht und Modell beide direkt in der Legacy-Hülle (`target: model`/`group`): dann bleibt es unverändert, Offsets in alten Einheiten. Falsch wird es bei Zielen in einem anderen Koordinatenraum, vor allem **`target: camera`** (die Host-Kamera liegt außerhalb des Moduls): dort `legacy-attach` mit unverändertem Schema verwenden (Offset bleibt in alten Einheiten und Achsen). Das Template-eigene `attach-to` passt hier schlechter: sein Offset ist in Welteinheiten und -achsen, müsste also mit der Skalierung und Drehung der Hülle umgerechnet werden. Das Ziel wird per `getElementById` ohne `#` gesucht — beim ID-Prefixen mitziehen.
- **`xrextras-hold-drag`** schreibt den Boden-Treffer (Weltkoordinaten) und eine Welt-Höhe direkt in die *lokale* Position und misst die Zugdistanz zwischen lokaler Modell- und Kameraposition (geprüft im Quelltext) — in der Hülle springt das Modell. Ersatz: `hold-drag` mit gleichem Schema; `groundId` auf die geprefixte Boden-ID setzen.
- **`AFRAME`/`THREE` nie beim Modul-Laden lesen:** In `dev:ar` wird 8frame dynamisch nachgeladen und kann nach dem Modul-Bundle fertig werden. `trim-loop-clip.ts` las `AFRAME.THREE` auf oberster Ebene — der ganze Manifest-Import scheiterte, das Modul wurde nie gemountet (behoben, im Pilot gefunden; betrifft auch `feature_template`). Neue Komponenten: `declare const THREE: any;` und nur zur Laufzeit zugreifen.
- **Komprimierte Modelle in `dev:ar`:** derselbe Lade-Wettlauf ließ den MeshOpt-Patch (`lib/gltf-meshopt-setup.ts`) still ausfallen — komprimierte GLBs luden nicht („setMeshoptDecoder must be called before loading compressed files“). Behoben (Patch wiederholt sich, bis `THREE` da ist; im Pilot #21 gefunden, betrifft auch `feature_template`).
- **Kompression:** `compress-assets` „lossless“ kann Modelle mit JPEG-Texturen **vergrößern** (Kleiderberg: 12,1 → 13,4 MB). Dann das Original behalten (liegt in `uncompressed-assets/`) — verlustbehaftete Kompression oder Verkleinern ändert den Look und ist abzustimmen.
- **Headless-Kamera:** Ohne Bewegungssensor richtet XR8 (1.5) die Kamera headless senkrecht nach unten; der alte Export (älteres Engine-Build) lässt sie waagerecht. Screenshots von Original und Port sind deshalb headless nicht direkt vergleichbar — Platzierung und Maßstab auf dem Handy prüfen.
- **`xrextras-tap-recenter` / `click` auf dem iPhone:** Das Original reagierte auf `click` an der Szene — den unterdrückt iOS nach `xrextras-gesture-detector`, der Tap tat auf dem iPhone also nichts. `legacy-space="tapRecenter: true"` erkennt Taps über Pointer-Events (ein Finger, kurz, kaum bewegt; nur auf der Szene, nicht auf DOM-UI).
- **`xrextras-pinch-scale` auf einer Gruppe** skaliert um den Ursprung der Gruppe. Liegt der weit vom Modell entfernt (Die Reisende: alter Szenen-Ursprung ~25 Einheiten vor dem Modell), wandert das Modell beim Skalieren mit weg, die sichtbare Größe folgt den Fingern kaum und wirkt „hakelig“. Auf das Modell selbst legen — dann skaliert es um sich selbst (min ⅓, max laut Attribut). Headless-Tests mit Touch-Events sind für Tap-Timing unbrauchbar (Software-Renderer verzögert Events um ~1 s).
- **A-Frame `isPlaying` ist nicht „Audio läuft“:** auf Komponenten bedeutet `isPlaying` den Lebenszyklus (Entity spielt/pausiert). Ob ein `sound` hörbar ist, steht an `sound.pool.children[].isPlaying`.
- **Modul-DOM liegt in `<a-scene>`:** Das Modul (inkl. seines Vue-Overlays) wird im Szenen-Element gemountet. „Liegt das Tap-Ziel in der Szene?“ trifft deshalb auch Overlay-Buttons — Taps auf die Szene nur am Canvas erkennen (`legacy-space` tut das).
- **Springende Loops:** Gebackene Simulationen (z. B. #16: 401 Morph-Target-Frames) haben oft kein passendes Ende/Anfang; `animation-mixer` springt dann an jedem Loop — auch im Original. Keyframes vor t = 0 (Blender-Export) spielt three.js nie ab. Messbar per Formvergleich der Frames; Abhilfe nach Abstimmung: `crossfade-loop-clip`.
- **Werkspezifische Komponenten im Manifest:** nicht ans Ende der `components`-Liste hängen (dort ergänzt die Zwischenbasis), sondern z. B. direkt nach `no-frustum-cull` — sonst kollidieren spätere Merges der Zwischenbasis. Mit Werk-Prefix registrieren (`<slug>-…`), damit ein gleichnamiges Bauteil eines anderen Moduls im Host nicht gewinnt.
- **Kompression mit dramatischer Ersparnis prüfen:** gltfpack legt identische Geometrie zusammen (Instanzen). Bei #5 wurden aus 65 Meshes 4 — alle 324 283 gezeichneten Vertices blieben erhalten. Vor dem Behalten gezeichnete Vertices/Knoten vergleichen.
- **Zu dunkle Reflexionen:** three.js r152+ markiert `CubeTextureLoader`-Bilder als sRGB, r137 (alter Export) las sie linear. Ohne Korrektur werden statische Env-Maps deutlich dunkler (Mittelgrau 0,5 → ~0,21) — besonders sichtbar bei schwarzen, metallischen Materialien, die nur durch die Env-Map hell werden (#5). `cubemap-static` setzt deshalb `colorSpace = NoColorSpace`. Betrifft alle Werke mit `cubemap-static` (#5, #8, #10, #15).
- **Live-Reflexion zeigt falsches Bild (#18):** Zwei verschiedene Env-Maps auf Instanzen desselben Modells in einer Szene (statische Cubemap auf der unsichtbaren Mini-Kugel, Live-Env-Map auf der sichtbaren) stören sich in three r158 beim Vorfiltern — die sichtbare Kugel zeigte das statische FUNKY-TOWN-Bild statt des Kamerabilds (bunt, keine Reaktion auf die Kamera). Headless nachgestellt und behoben, indem die unsichtbare Mini-Kugel keine Env-Map mehr bekommt. Prüfmethode: Kamera-Video mit wechselnder Helligkeit einspielen und die gerenderte Helligkeit der Oberfläche messen — der Inhalt des Render-Targets allein beweist nichts.
- **Videos sind im Host stumm:** Der Host (und die Preview) injiziert jedes Video als `<video muted loop playsinline>`. Hatte ein Video im Original Ton, im Tap-Handler des Start-/PLAY-Buttons `video.muted = false` setzen und dann `play()` (#23).
- **Taps:** alte Szenen nutzen `class="cantap"` mit dem Raycaster/Cursor an der Kamera — der gehört im Host dem Host (Preview: `raycaster="objects: .cantap"`). iOS Safari unterdrückt den synthetischen `click` nach `xrextras-gesture-detector` (`guides/SOUND-FEATURE-GUIDE.md` §4) — Werke mit Gesten **und** Tippen auf dem iPhone testen.
- **Animationen:** animierte Skinned Meshes verschwinden ohne `no-frustum-cull` (sitzt auf dem Wurzel-Entity von `ArModule.vue`, bleibt dort). `animation-mixer` nicht zusammen mit `trim-loop-clip` auf einem Entity.
- **Audio-Autoplay:** Sounds mit `autoplay`/Loop brauchen eine Nutzergeste — Template-Overlay statt altem `enable-audio`; iPhone-Stummschalter-Workaround steckt in `sound-unlock-audio.ts`.
- **Pipeline-Module:** alte Komponenten registrieren XR8-Kamera-Pipeline-Module und entfernen sie nie — im Host bliebe nach dem Entladen eines Moduls Code im globalen Pipeline aktiv.
- **Materialien:** alte Komponenten verändern geteilte glTF-Materialien direkt — im Template immer klonen.
- **Analytics:** alte Projekte laden umami-Tracking (`head.html`) — nicht mitportieren.
- **HTML-Fehler** in alten `body.html` (z. B. Nr. 10) — im Port-Entwurf unter „HTML-Fehler“ gemeldet.
- **Headless-Referenzen** zeigen, ob eine Szene lädt und rendert, nicht SLAM-Verhalten, echte GPU-Darstellung oder Maßstab. Die Fake-Kamera ist bewusst neutrales Rauschen, weil die Marker-Bilder Fotos der AR-Werke selbst sind.
