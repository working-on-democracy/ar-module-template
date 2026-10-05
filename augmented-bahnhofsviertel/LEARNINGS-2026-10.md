# Learnings aus der Portierung (Session 2026-10-04/05)

Rückblick auf die Session, in der 17 der 26 Augmented-Bahnhofsviertel-Werke
portiert und auf dem Handy getestet wurden. Gedacht fürs Troubleshooting:
**Symptom → Ursache → Lösung → wie prüfen.** Die Kurzfassung jeder
Falle steht in [PORTING-GUIDE.md §8](PORTING-GUIDE.md#8-bekannte-fallstricke);
dieses Dokument erklärt, wie wir darauf gekommen sind, was sich als falsch
herausgestellt hat und woran man ein Wiederauftreten erkennt.

Inhalt:

1. [Engine-Unterschiede: 8frame 1.2 / three r137 → 8frame 1.5 / three r158](#1-engine-unterschiede-8frame-12--three-r137--8frame-15--three-r158)
2. [Lade-Reihenfolge in `dev:ar`](#2-lade-reihenfolge-in-devar)
3. [Maßstab, Platzierung, Hülle (`legacy-space`)](#3-maßstab-platzierung-hülle-legacy-space)
4. [Sound und Video](#4-sound-und-video)
5. [Eingabe: Taps und Gesten](#5-eingabe-taps-und-gesten)
6. [Assets und Kompression](#6-assets-und-kompression)
7. [Portierungs-Skript (`abv:port`)](#7-portierungs-skript-abvport)
8. [Werkspezifische Abweichungen vom Original](#8-werkspezifische-abweichungen-vom-original)
9. [Headless-Testen: was funktioniert, was täuscht](#9-headless-testen-was-funktioniert-was-täuscht)
10. [Irrwege — was wir falsch vermutet haben](#10-irrwege--was-wir-falsch-vermutet-haben)
11. [Arbeitsweise und Werkzeug-Fallen](#11-arbeitsweise-und-werkzeug-fallen)

---

## 1. Engine-Unterschiede: 8frame 1.2 / three r137 → 8frame 1.5 / three r158

Die alten Exporte liefen auf 8frame 1.1/1.2 (three r137), das Template auf
8frame 1.5 (three r158). Etliche Bugs waren keine Fehler im Port, sondern
geändertes Engine-Verhalten bei unverändertem Markup. **Erste Frage bei
„sieht anders aus als im Original“: Hat sich hier das Engine-Verhalten
geändert?**

### Zeichenreihenfolge undurchsichtiger Objekte (Hider-Material) — #22

- **Symptom:** Portal-Werk: Taxi-Video unsichtbar, nur Kamerabild, beim
  Bewegen blitzt das Panorama auf.
- **Ursache:** `xrextras-hider-material` (schreibt nur Tiefe, keine Farbe)
  verdeckt nur, was *nach* ihm gezeichnet wird. three r137 sortierte
  undurchsichtige Objekte nach `renderOrder`, dann **Material-ID** (=
  Erstellungsreihenfolge), dann Abstand. 8frame 1.5 ersetzt das per
  `renderer.setOpaqueSort()` durch reines Abstands-Sortieren. Im Original
  war die Reihenfolge damit stabil (Taxi vor den Hidern erstellt → sichtbar;
  Panorama danach → verdeckt), im Port kippte sie mit jedem Kameraschritt.
- **Lösung:** `legacy-portal` setzt die alte Reihenfolge explizit:
  Hider-Wände + Portalwand `renderOrder` 1, Portal-Inhalte 2, alles andere
  bleibt 0. Gilt auch für #7.
- **Prüfen:** Szene headless mit waagerechter Kamera rendern (siehe §9),
  einmal vor, einmal hinter der Portalebene. Vorher Material-IDs und
  `renderOrder` aller Hider-Meshes ausgeben.
- **Merksatz:** Jedes Werk, das sich auf Erstellungsreihenfolge verlässt
  (Hider, Masken, Tiefen-Tricks), braucht im Port explizites `renderOrder`.

### Statische Cubemaps zu dunkel — #5

- **Symptom:** Schwarze, metallische Figuren deutlich dunkler als auf dem
  Marker-Foto des Originals.
- **Ursache:** three r152+ markiert `CubeTextureLoader`-Bilder als sRGB und
  linearisiert sie vor dem Shading (Mittelgrau 0,5 → ~0,21). r137 nutzte die
  JPEG-Werte direkt.
- **Lösung:** `cubemap-static` setzt `colorSpace = NoColorSpace`. Betrifft
  alle Werke mit statischer Cubemap (#5, #8, #10, #15). Bei #5 zusätzlich
  `envMapIntensity: 2.5` nach Augenmaß. Ob das Original eine Live-Env-Map
  hatte, ist offen (Steuerliste, „Vor dem finalen Export“).

### Live-Env-Map aktualisiert die Vorfilterung nicht

- three r158 filtert eine Render-Target-Env-Map (PMREM) nur neu, wenn
  `texture.needsPMREMUpdate = true` gesetzt ist. `cubemap-realtime` setzt das
  jetzt nach jedem Cube-Update.

### Zwei Env-Maps auf Instanzen desselben Modells — #18

- **Symptom:** Die Kugel spiegelte bunt und reagierte nicht auf die Kamera.
  Andere Werke mit `cubemap-realtime` funktionierten, das Problem war also
  werkspezifisch.
- **Ursache:** Die unsichtbare Mini-Kugel (gleiches Modell) hatte eine
  statische Cubemap, die sichtbare die Live-Env-Map. In r158 stören sich die
  beiden beim Vorfiltern, und die sichtbare zeigte das statische
  FUNKY-TOWN-Bild.
- **Lösung:** Die Mini-Kugel bekommt keine Env-Map mehr. Im Kommentar von
  `cubemap-realtime.ts` als bekannte Inkompatibilität vermerkt.
- **Prüfen:** siehe §9 („Helligkeit messen, nicht Render-Target lesen“).

### `THREE.RGBFormat` gibt es nicht mehr

- r158 kennt `RGBFormat` nicht mehr. Altes `texture.format =
  THREE[data.format]` setzt dann `undefined`. Format weglassen; der Standard
  (RGBA) sieht identisch aus.

---

### Nachtrag 2026-10-05: Der Host läuft auf 8frame 1.3

Der Abgleich mit dem Host-Repo (`ar-demo-backend`) zeigte: Der Host lädt
**8frame 1.3.0 und xrextras byte-gleich mit den alten Exporten** — also die
Laufzeit der Originale, nicht die 1.5 der Vorschau. Alle Handy-Tests bis
dahin liefen auf 1.5. Seitdem nutzen Vorschau und Standalone die Dateien des
Hosts. Die oben beschriebenen 1.5-Korrekturen schaden unter 1.3 nicht
(Cubemap ohnehin linear, explizite Zeichenreihenfolge, `needsPMREMUpdate`
existiert); `cubemap-realtime` musste dagegen `encoding: sRGBEncoding`
zusätzlich setzen, weil `SRGBColorSpace` in r137 fehlt. **Lehre:** Die
Laufzeit des Ziel-Hosts am Code prüfen, bevor man auf einer anderen
Laufzeit kalibriert — der Template-README widersprach sich hier.

## 2. Lade-Reihenfolge in `dev:ar`

`ar.html` lädt 8frame **dynamisch**; das Modul-Bundle kann davor fertig sein
(gemessen: `manifest.ts` bei ~65 ms, `THREE` bei ~160 ms). Im Host und in
`npm run dev` ist A-Frame immer zuerst da — **diese Bugs treten nur in
`dev:ar` auf.** Beide Fixes sind seit `1f5c653` auch auf `feature_template`.

| Symptom (nur `dev:ar`) | Ursache | Lösung |
|---|---|---|
| Modul wird gar nicht gemountet, Konsole: „AFRAME is not defined“ | `trim-loop-clip.ts` las `AFRAME.THREE` auf oberster Ebene. Es reichte, die Komponente im Manifest zu registrieren | `declare const THREE: any;` und nur zur Laufzeit zugreifen |
| Komprimierte `.glb` laden nicht: „setMeshoptDecoder must be called before loading compressed files“ | `patchGLTFLoaderWithMeshoptDecoder()` prüfte einmal, fand kein `THREE` und gab still auf | Patch wiederholt sich jeden Frame (max. 30 s), bis `THREE.GLTFLoader` da ist |

**Regel:** Keine Komponente darf `AFRAME`/`THREE` beim Modul-Laden anfassen.

---

## 3. Maßstab, Platzierung, Hülle (`legacy-space`)

Die alten Szenen gingen von einer Kamera auf fester Höhe aus (meist
`0 8 8`); XR8 startet die echte Kamera auf y ≈ 2 („responsive scale“).
`legacy-space` platziert die unveränderte alte Szene modul-lokal mit
`s = Kamerahöhe / legacyCameraHeight`. Daraus folgen mehrere Dinge, die
**alle mitskaliert werden müssen** — jedes davon war einmal ein Bug:

| Was | Symptom ohne Skalierung | Stand |
|---|---|---|
| Schattenkamera-Ränder **und near/far** | Schattenakne / Streifen (#14) | `legacy-space` skaliert beides; #14 zusätzlich `shadowBias: -0.0005` |
| Positionale Sound-Distanzen | Sound zu leise/laut, Reichweite falsch | `scaleSoundDistances` (nur Sounds, die beim Platzieren existieren!) |
| Reichweite von Point/Spot-Lights | Licht reicht zu weit/kurz | `scaleLightRanges` |
| Später erzeugte Sounds (#6) | Referenzdistanz in alten Einheiten | die erzeugende Komponente skaliert selbst (`sound-loaded`) |

Weitere Erkenntnisse:

- **Kamera-Konvention je Werk prüfen.** Nicht alle Werke nutzen `0 8 8`:
  #15 `0 1.75 2`, #22 `0 4 5`, #7 `0 8 11`, #23/#24 `0 0.8 0`, #4/#6
  `0 8 0`. Die Kamera-Position im alten `body.html` ist die Quelle für
  `legacyCameraHeight`/`legacyCameraDistance`.
- **Fallback-Maßstab griff zu früh (#23).** Kommt keine Kamerahöhe an,
  platziert `legacy-space` mit einem Fallback. Mit 3 s Wartezeit war das bei
  langsamem XR8-Start schon passiert (gemessen: Maßstab 0,2 statt 2,5;
  `realityready` kam erst nach ~1,9 s, die Kamera war noch nicht oben).
  Jetzt wartet es mit XR8 bis zu `xrFallbackAfter` = 15 s. **Symptom bei
  Wiederauftreten:** Szene winzig, gemessener Maßstab = Fallback-Wert.
- **Kamera-Position in alte Koordinaten umrechnen.** Alte Komponenten lesen
  `camera.object3D.position` als Szenenkoordinate. In der Hülle ist das
  falsch (Host-Kamera, Hülle skaliert und gedreht). Muster für Ports
  (`legacy-portal`, `europaplatz-ii-…`, `birdkind-…`): `camera.getWorldPosition()`
  → `entity.object3D.worldToLocal()`; Blickrichtung mit der invertierten
  Welt-Rotation der Entity transformieren.
- **`xrextras-attach` mit `target: camera`** landet falsch (kopiert lokale
  Position): durch `legacy-attach` ersetzen (gleiches Schema).
- **Pinch auf einer Gruppe** skaliert um deren Ursprung. Lag der weit vom
  Modell (#21: ~25 Einheiten), wanderte das Modell weg und Pinch wirkte
  „hakelig“. Pinch aufs Modell legen.
- **Smart Recenter / globales `recenter`** (#4): betreffen die ganze Engine
  und damit andere Module. Nicht portieren; Recenter-Button und `tapRecenter`
  platzieren nur die eigene Hülle neu.

---

## 4. Sound und Video

- **Host-Videos sind stumm.** Der Host (und die Preview) injiziert jedes
  Video als `<video muted loop playsinline>`. Hatte das Original Ton im
  Video (#23, Video 1), im Tap-Handler `video.muted = false` und dann
  `play()`. Vorher mit `ffprobe` prüfen, ob das Video überhaupt eine
  Tonspur hat (#7: keine).
- **Audio braucht die Nutzergeste.** `unlockAudio()` (bzw.
  `playLegacySounds()`) im Tap-Handler des Start-Buttons aufrufen, sonst
  bleibt der AudioContext auf `suspended`.
- **Später erzeugte Sounds** (#6): Entities mit `sound`-Komponente erst nach
  dem Unlock erzeugen; `autoplay: true` spielt nach `sound-loaded`.
- **Flacher Falloff wirkt „nicht räumlich“ (#6).** Das Original nutzte
  `inverse`, Referenzdistanz 4, Rolloff 1, Lautstärke 4. Gain bei 0,5
  Kamerahöhen 4,0, bei 2,5 noch 0,8, bei 5 noch 0,4 — nie still. Auf dem
  Handy-Lautsprecher (praktisch mono) fehlt zusätzlich die Links/Rechts-Information.
  Nach Rückfrage umgestellt auf `linear`, Reichweite 32 Einheiten
  (4 Kamerahöhen). **Faustregel:** Wer „Räumlichkeit“ will, braucht eine
  Reichweite, ab der eine Quelle still ist (`linear` + `maxDistance`).
- **A-Frame `isPlaying`** auf Komponenten ist der Lebenszyklus, nicht „Audio
  läuft“: Hörbarkeit steht an `sound.pool.children[].isPlaying`.
- **Gleich große Dateien ≠ gleicher Inhalt** (#24: vier MP3s mit identischer
  Byte-Größe). Per Hash prüfen, bevor man Duplikate entfernt.

---

## 5. Eingabe: Taps und Gesten

- **iOS unterdrückt `click` nach `xrextras-gesture-detector`.** Alte
  `xrextras-tap-recenter`/`click`-Handler taten auf dem iPhone nichts.
  `legacy-space` erkennt Taps über Pointer-Events (ein Finger, kurz, kaum
  bewegt) und nur auf dem Canvas.
- **Modul-DOM liegt in `<a-scene>`:** „Liegt das Ziel in der Szene?“ trifft
  auch Overlay-Buttons. Deshalb nur Taps auf dem Canvas zählen.
- **Headless-Touch-Tests sind für Tap-Timing unbrauchbar** (Software-Renderer
  verzögert Events um ~1 s). Taps auf dem Handy testen.

---

## 6. Assets und Kompression

- **„Lossless“ kann vergrößern:** Modelle mit JPEG-Texturen wurden größer
  (Kleiderberg 12,1 → 13,4 MB; #14, #15, #17 ebenso). Dann das Original aus
  `uncompressed-assets/` zurücklegen.
- **Dramatische Ersparnis prüfen:** #5 11,8 → 0,5 MB, weil gltfpack
  65 Meshes zu 4 Instanzen zusammenlegte — alle gezeichneten Vertices
  blieben erhalten. Vor dem Behalten gezeichnete Vertices/Knoten vergleichen.
- **Sichtprüfung mit festen Parametern:** Bei Zufalls-Platzierung (#6) für
  den Vorher/Nachher-Vergleich Größe, Drehung und Abstand kurz festsetzen,
  beide Varianten headless rendern, nebeneinanderstellen, danach den Zufall
  wiederherstellen.
- **Nicht jedes Asset lohnt sich:** Kleine Modelle (#4, 1,6 MB für 37
  Latten) und Audio/Video blieben unverändert; verlustbehaftete Kompression
  von Sound/Video/Panorama nur nach Abstimmung (ändert das Werk).
- `compress-assets` ist interaktiv; Antworten mit Pausen einspeisen:
  `(for a in 1 a 1 1 y; do sleep 2; echo $a; done; sleep 60) | npm run -s compress-assets`.

---

## 7. Portierungs-Skript (`abv:port`)

Beim Portieren gefundene und behobene Lücken:

- **Asset-ID-Kollision** (#22): IDs sind Dateinamen ohne Endung —
  `taxi.mp4` und `taxi.mp3` ergaben beide `privileged-i-taxi`. Jetzt bekommt
  die zweite Datei die Endung angehängt (`…-taxi-mp3`). Alle vorher
  portierten Werke wurden geprüft: keine Kollision.
- **Auskommentierte Referenzen** (#22): Ein 3-MB-Modell wurde importiert,
  obwohl es nur in auskommentierten Entities vorkam. HTML-Kommentare zählen
  jetzt nicht mehr als Verwendung.
- **Nur referenzierte Assets** werden importiert (alte Exporte enthalten oft
  ungenutzte Cubemaps und Modelle); `gltf` → `glb` per `unpartition`.

---

## 8. Werkspezifische Abweichungen vom Original

Bewusste Änderungen, jeweils nach Rückmeldung oder Rückfrage — wichtig,
damit sie später nicht als „Bug“ zurückgedreht werden:

| Werk | Abweichung | Grund |
|---|---|---|
| #1 | Start-Hinweis mit Platzhalter `((TARGET))` statt „Euro-Skulptur“ | Modul steht auch für #2/#3 an anderen Orten; vor dem finalen Export ersetzen |
| #5 | `envMapIntensity: 2.5` | Figuren zu dunkel; mit der Autorin klären |
| #6 | Sound-Falloff `linear`, still ab 4 Kamerahöhen | Original klang unabhängig vom Abstand gleich laut |
| #10 | Start-Screen verschwindet | Original warf beim Start einen Fehler (nicht vorhandener Sound) und blieb stehen |
| #14 | `shadowBias: -0.0005` | Schattenartefakte |
| #21 | Abstand/Pinch nach Handy-Test angepasst | Reisende −35, Pinch aufs Modell |
| #20 | Neuport nach der Live-App: acht Muscheln, Ton 8/4 bzw. 8/2 | Export war ein älterer Stand (eine Muschel, 50/500) |
| #22 | Portalwand-Kreise `radius="10.2"` | Live-App; Export hatte 0 (kein Rückfenster) |
| #19 | Umgebungslicht weggelassen | im Original `type="ambient;  intensity: 1.5"` — ungültiger Typ, 8frame erzeugte kein Licht (wirkungslos). Die frühere Abweichung z = −70 ist mit dem Neuport (§10) entfallen |

Bewusst **nicht** geändert (getestet und verworfen):

- **#16 springender Loop:** gebackene Stoffsimulation, Ende ≠ Anfang. Eine
  Überblendung (`crossfade-loop-clip`) wurde gebaut und verworfen: Der
  Sprung bleibt wie im Original.
- **#18 Zentrierung:** Die Kugel wurde zentriert und wieder zurückgenommen:
  Die Position neben der Mitte war richtig.

Weggelassen, weil im Original wirkungslos: `play-video` (#22–#24, nie
registriert), `env-map-white` (#1), Reset-Hooks bei Marker-Verlust (#4, #6,
Marker wird übersprungen), umami-Analytics.

---

## 9. Headless-Testen: was funktioniert, was täuscht

Grundlage: [HEADLESS-AR-TESTING-GUIDE.md](../cross-feature-reference-docs/HEADLESS-AR-TESTING-GUIDE.md).
Ergänzungen aus dieser Session:

- **Die Headless-Kamera schaut senkrecht nach unten** (XR8 1.5 ohne
  Bewegungssensor). Für eine Ansicht auf Augenhöhe die Hülle per Skript mit
  Rx(−90°) neu platzieren (Kamera-Offset in alten Einheiten × Maßstab, siehe
  Probe-Muster unten). **Achtung:** Ein Start-Button, der neu zentriert
  (`legacy-space-place`), macht das rückgängig — danach erneut platzieren
  oder die Komponente direkt aufrufen. Bei #4 landeten so die ersten zwei
  Latten unter der Kamera (Blick nach unten): ein Testartefakt, kein Bug.
- **Durchgehen simulieren:** Hülle entlang ihrer lokalen +z verschieben
  (`ls.position.addScaledVector(dir, dz * scale)`), dann Zustand und
  Screenshot prüfen (#22, #7).
- **Helligkeit messen, nicht Render-Target lesen (#18):** Ob eine Live-Env-Map
  wirkt, zeigt nur die **gerenderte** Helligkeit der Oberfläche bei
  wechselndem Kamerabild (Fake-Kamera-Video mit Helligkeitswechsel). Der
  Inhalt des Cube-Render-Targets allein beweist nichts.
- **Fake-Kameras:** neutrales Rauschen (Standard), Blitz-Video (Helligkeit
  wechselt), Raum-Screenshot. Marker-Bilder taugen nicht als Kamerabild: Es
  sind Fotos der AR-Werke selbst.
- **Zustand per `page.evaluate` auslesen** statt nur Screenshots: Maßstab der
  Hülle, Sichtbarkeit von Gruppen, `renderOrder`, Video `paused`,
  Sound-`isPlaying`, `getRefDistance()`/`getMaxDistance()`, Panner-`distanceModel`.
- **Nicht headless prüfbar:** echtes SLAM/Bewegung, GPU-Darstellung,
  Tap-Timing, wie laut/räumlich etwas auf dem Handy klingt (#6 war headless
  korrekt konfiguriert und klang trotzdem flach).
- Für eigene Tests Port 5199 benutzen und den Server danach beenden; den
  `dev:ar` für die Handy-Tests startet der Nutzer selbst.

Probe-Muster (Hülle für waagerechten Blick neu platzieren):

```js
const obj = document.querySelector('[legacy-space]').object3D;
const cam = new THREE.Vector3(); document.querySelector('a-scene').camera.getWorldPosition(cam);
const s = obj.scale.x, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const off = new THREE.Vector3(0, 8, 8).multiplyScalar(s).applyQuaternion(q); // alte Kamera-Position
const world = new THREE.Matrix4().compose(cam.clone().sub(off), q, new THREE.Vector3(s, s, s));
world.premultiply(new THREE.Matrix4().copy(obj.parent.matrixWorld).invert());
world.decompose(obj.position, obj.quaternion, obj.scale);
```

---

## 10. Irrwege — was wir falsch vermutet haben

- **#18, zwei falsche Hypothesen:** Zuerst wurde ein Problem im
  Rechenkontext der Env-Map-Erzeugung vermutet, dann die Mesh-Kompression des
  Modells. Beide wurden widerlegt, ihre Erklärungen aus der Doku gestrichen
  und `cubemap-realtime` auf die getestete Fassung (plus `needsPMREMUpdate`)
  zurückgesetzt. Die echte Ursache war die zweite Env-Map auf der
  unsichtbaren Mini-Kugel (§1). Den entscheidenden Hinweis gab der Nutzer:
  „In anderen Projekten reagiert es“ — also werkspezifisch. **Lehre:** Bei
  einem Fehler, der nur in einem Werk auftritt, zuerst die Unterschiede zu
  funktionierenden Werken suchen, nicht die gemeinsame Komponente umbauen.
  Das Modell von #18 ist unkomprimiert geblieben.
- **#22, Annahme „Portal-Logik falsch“:** Die Portal-Logik war korrekt
  (headless verifiziert); falsch war die Zeichenreihenfolge. Erst der
  Vergleich der Sortierfunktionen beider 8frame-Versionen brachte die
  Ursache. **Lehre:** Bei „flackert je nach Kamera“ an Sortierung/Tiefe
  denken.
- **#6, Vorschauwerte falsch gerechnet:** In der Optionsvorschau standen
  Gain-Werte, die nicht zur angegebenen Konfiguration passten. Gewählt wurde
  die Konfiguration, die Werte wurden danach korrigiert. **Lehre:**
  Kurven vor dem Zeigen mit der Formel nachrechnen (`linear`:
  `vol · (1 − rolloff · (d − ref) / (max − ref))`).
- **#19, falsche Quelle:** Der Pilot wurde aus dem Export `kleiderberg-fuas`
  portiert (`Berg-13.glb`: bunte Sprechblasen und ~250 schwebende
  Piktogramm-Teile, Gesten, Schattenboden). Der Nutzer verglich mit der noch
  laufenden Original-App und sah nur Stempel-Texte am Boden. Deren Seite
  (digitalekunst.8thwall.app/fashion-revolution-ffm) liefert ihre
  `body.html` im Klartext und das Modell öffentlich aus: andere Szene
  (Position, Maßstab, Live-Env-Map, keine Gesten), Modell byte-identisch mit
  dem „ungenutzten“ `Berg.gltf` in `madebychildren`. Neu portiert nach der
  Live-App (2026-10-05). **Lehre:** Ein Export ist nicht automatisch die
  veröffentlichte Fassung. Läuft das Original noch, dessen ausgelieferte
  Szene (`app8("<body.html>"…)` in der Index-Seite, `…bundle.js` mit den
  Komponenten) als Referenz nehmen und Modelle per Hash abgleichen.
- **Nummerierte Reihen (#2/#3), Annahme „dieselbe Arbeit“:** Galt für
  Xenoglossy nicht — der Live-Abgleich zeigte drei Farbfassungen mit eigener
  Platzierung, eigenem Licht und eigenem Start-Text. **Lehre:** Bei
  Reihen-Werken jede Live-App einzeln abgleichen, bevor sie als identisch
  gelten. Beim Bundle-Vergleich lange Zeichenketten nicht abschneiden — die
  UI-Texte stecken in langen HTML-Labels.

---

## 11. Arbeitsweise und Werkzeug-Fallen

- **Branch-Fluss:** Basis-Änderungen (gemeinsame Bausteine, Skripte,
  Steuerliste, Guide) auf `augmented-bahnhofsviertel` committen, Werk-Dateien
  (`ArModule.vue`, Werk-Komponenten, Assets, Port-Entwurf) auf dem Werk-Branch;
  danach die Basis in alle Werk-Branches mergen und Sync mit origin prüfen.
  Werkspezifische Komponenten im Manifest direkt nach `no-frustum-cull`
  eintragen, nicht am Listenende — so mergen spätere Basis-Änderungen
  konfliktfrei.
- **`feature_template` nur kontrolliert:** Template-Bugs, die beim
  Portieren auffallen, erst melden; Änderung nur nach ausdrücklicher Freigabe,
  dann die Hunks von Hand anwenden (kein Merge/Cherry-Pick aus den
  abv-Branches). Der Pre-Push-Hook blockiert Pushes mit abv-Inhalt.
- **Bei Charakter-Änderungen erst fragen** (AGENTS.md §5): Falloff (#6),
  Überblendung (#16), Zentrierung (#18), Zuordnungsfragen (#22/#23) wurden
  mit Optionen vorgelegt statt still entschieden.
- **Shell-Fallen (zsh auf macOS):** `grep` ist hier ugrep — Zählungen und
  Ausgaben sind unzuverlässig (einmal kamen Treffer aus einer falschen
  Eingabe, was wie eine kaputte Datei aussah). Für Prüfungen Python nutzen.
  `${b#...}`-Ersetzung scheitert, stattdessen `sed`. `cat -A` gibt es nicht.
- **Webseite als Quelle kann sich widersprechen:** Bei Privileged I/II nennen
  App-Links und Credits gegensätzliche Orte (offen, Steuerliste).
- **Ordner im Altbestand ohne Werk** (`madebychildren`): Assets per Hash mit
  anderen Projekten abgleichen, eingebettete Texturen extrahieren und
  ansehen — so ließ sich der Fashion-Revolution-Kontext erkennen.
