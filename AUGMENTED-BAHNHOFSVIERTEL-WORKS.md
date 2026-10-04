# Augmented Bahnhofsviertel — Werkliste und Portierungsstand

Steuerliste des Branches `augmented-bahnhofsviertel`: Zwischenbasis für die Portierung der ursprünglich auf 8th Wall gehosteten AR-Arbeiten in dieses Framework. Ablauf, Werkzeuge und Regeln: [augmented-bahnhofsviertel/PORTING-GUIDE.md](augmented-bahnhofsviertel/PORTING-GUIDE.md).

> **Wichtig — keine Rückführung nach `feature_template`:** Änderungen auf diesem Branch (und den Werk-Branches `abv-*`) werden **niemals** automatisch nach `feature_template` gemergt, gepusht, gerebased oder gecherry-pickt. `feature_template` ist immer die Vorlage und wird nur kontrolliert geändert. Entsteht hier ein verallgemeinerbares Feature, wird es separat über `ADDING-FEATURES-WORKFLOW.md` nach `feature_template` portiert — nur nach ausdrücklicher Freigabe. Erlaubt ist nur die umgekehrte Richtung: `feature_template` → `augmented-bahnhofsviertel`.

## Projekt

„Augmented Bahnhofsviertel“ ist ein Kunstprojekt der freitagsküche und Maiken Laackmann im digitalen öffentlichen Raum. Die eingeladene Künstler*innen entwicklen hierfür Arbeiten für Orte rund um das Frankfurter Bahnhofsviertel.

Quelle der Werkdaten: https://broadcastsfromthekitchen.de/ar#/augmented-bahnhofsviertel (abgerufen am 2026-10-04 über die JSON-Endpunkte der Seite). Pro Werk liegen Beschreibung (unverändert von der Quellseite), Ort, Original-URL und Marker-Bild in `augmented-bahnhofsviertel/about/<Nr>-<slug>/`, dazu Referenz-Screenshots des Originals (`npm run abv:reference`). Maschinenlesbar für die Scripts: [augmented-bahnhofsviertel/works.json](augmented-bahnhofsviertel/works.json).

## Getroffene Entscheidungen (2026-10-04)

- **Tracking originalgetreu:** Alle alten Projekte setzen das Modell per SLAM vor die Kamera (Start-Button, Recenter) — `image-target-ui` steht überall auf `skip-marker: true`. Kein Werk wird auf Image-Tracking umgestellt; die Marker-Bilder sind nur Referenz.
- **Ein Branch pro Werk:** `abv-<Nr>-<slug>` (Spalte „Branch“). Werke einer Reihe zweigen vom ersten Werk der Reihe ab (Spalte „Basis“). Gemeinsames liegt auf `augmented-bahnhofsviertel`.
- **Reihenfolge:** zuerst die einfachsten Werke (Pilot), komplexe zuletzt.
- **Look:** möglichst originalgetreu; kleine Abweichungen vorerst akzeptiert — Feedback von damals Beteiligten folgt später.
- **Nummerierte Werkreihen sind dieselbe Arbeit an verschiedenen Orten** (2026-10-04): Nr. 2/3 = Nr. 1, Nr. 12 = Nr. 9, Nr. 13 = Nr. 4, Nr. 25 = Nr. 21 — kein eigener Port, kein eigener Branch. Ausnahme vorerst Privileged I–III (Nr. 22–24): drei getrennte alte Apps mit unterschiedlichem Inhalt (Nepal/Istanbul/Lima), werden einzeln portiert.
- **Annahmen:** `kleiderberg-fuas` ist die richtige Kleiderberg-Fassung, `hazmadlab` („Dome“) ist Die Reisende.
- **Start/Recenter modul-lokal:** kein globales XR8-Recenter; das Modul platziert nur seine eigenen Inhalte vor der Kamera, über eine Legacy-Hülle um die alte Szene (Maßstab/Höhe im Pilot auf dem Handy bestätigen) — PORTING-GUIDE.md §6.
- **Template-Beispiel-Assets** sind auf der Zwischenbasis entfernt (PORTING-GUIDE.md §7).

## Werke

Komplexität ist eine grobe Ersteinschätzung aus der Oberflächenanalyse (Anzahl Modelle/Medien, eigene Komponenten). Status: `offen` → `in Arbeit` → `portiert` (Szene läuft im Template) → `abgenommen` (Feedback eingearbeitet).

| Nr. | Werk | Künstler*in | Alter Ordner | Branch | Basis | Komplexität | Besonderheiten | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | [Xenoglossy I](augmented-bahnhofsviertel/about/01-xenoglossy-i/README.md) | Tina Kohlmann | `kohlmann-xenoglossy` | `abv-01-xenoglossy-i` | — | einfach | Großes animiertes Gesicht, Ziehen/Drehen/Skalieren; Start-Hinweis „Richte die Kamera auf die Euro-Skulptur …“ mit Start-Button (blendet Modell ein), Recenter-Button; Licht folgt der Kamera (`legacy-attach`). Steht auch für Nr. 2/3; Start-Hinweis vorläufig mit Platzhalter `((TARGET))` statt „Euro-Skulptur“ (siehe „Vor dem finalen Export“). Auf dem Handy geprüft (2026-10-04): Größe, Abstand, Start, Gesten, Licht passen. Modell verlustfrei komprimiert 7,2 → 5,1 MB | portiert |
| 2 | [Xenoglossy II](augmented-bahnhofsviertel/about/02-xenoglossy-ii/README.md) | Tina Kohlmann | — | — | Nr. 1 | — | dieselbe Arbeit wie Nr. 1 an einem anderen Ort — kein eigener Port | entfällt (= Nr. 1) |
| 3 | [Xenoglossy III](augmented-bahnhofsviertel/about/03-xenoglossy-iii/README.md) | Tina Kohlmann | — | — | Nr. 1 | — | dieselbe Arbeit wie Nr. 1 an einem anderen Ort — kein eigener Port | entfällt (= Nr. 1) |
| 4 | [Europaplatz (Frankfurt) II](augmented-bahnhofsviertel/about/04-europaplatz-ii/README.md) | Yves Mettler | `mettler-europaplatz2` | `abv-04-europaplatz-ii` | — | komplex | 37 Modelle, eigene Platzierungs-Komponenten (cursor-/distance-/tab-place-*) | offen |
| 5 | [Unwetter am Steg](augmented-bahnhofsviertel/about/05-unwetter-am-steg/README.md) | Parastou Forouhar | `forouhar-unwetter` | `abv-05-unwetter-am-steg` | — | mittel | Animation, eigene `tap-place-cursor`-Komponente, Env-Map | offen |
| 6 | [Birdkin(d)](augmented-bahnhofsviertel/about/06-birdkind/README.md) | Katharina Pelosi | `pelosi-birdkind` | `abv-06-birdkind` | — | komplex | 12 Sounds, eigene `distance-place-sequence`-Komponente | offen |
| 7 | [I can‘t get no - yes, we can](augmented-bahnhofsviertel/about/07-i-cant-get-no/README.md) | Andreas Diefenbach | `diefenbach-cannotgetno` | `abv-07-i-cant-get-no` | — | komplex | Portal (`portal-camera`, Hider-Material), Video | offen |
| 8 | [Dead can Dance](augmented-bahnhofsviertel/about/08-dead-can-dance/README.md) | Maiken Laackmann | `laackmann-deadcandance` | `abv-08-dead-can-dance` | — | mittel | 6 animierte Modelle, Sound-Loop | offen |
| 9 | [Fisher-Loop (privatized) I](augmented-bahnhofsviertel/about/09-fisher-loop-i/README.md) | freitagsküche | `freitagskueche-fisherloop` | `abv-09-fisher-loop-i` | — | einfach | Riesiger Schriftzug weit entfernt (`z = -300`), animiert, Pinch (max 1,3) + Drehen; Start-Hinweis „Suche dir einen freien Platz auf der Wiese …“ mit Start-Button (platziert neu, blendet Modell ein, startet positionalen Loop), Recenter-Button; kein Tap-Recenter. Auf dem Handy geprüft (2026-10-04): Abstand, Start, Sound, Pinch, Drehen, Recenter passen. Modell 0,3 MB (keine Kompression nötig) | portiert |
| 10 | [Neon Organisms 3](augmented-bahnhofsviertel/about/10-neon-organisms-3/README.md) | K. Ulrich Schneider | `scheider-organism` | `abv-10-neon-organisms-3` | — | einfach | 3 Modelle, Env-Map, Gesten; body.html mit HTML-Fehler | offen |
| 11 | [Die kommende Gemeinschaft liegt hinter unseren Depressionen](augmented-bahnhofsviertel/about/11-die-kommende-gemeinschaft/README.md) | Götz Schramm | — | `abv-11-die-kommende-gemeinschaft` | — | ? | Export fehlt, wird beschafft | zurückgestellt |
| 12 | [Fisher-Loop (privatized) II](augmented-bahnhofsviertel/about/12-fisher-loop-ii/README.md) | freitagsküche | — | — | Nr. 9 | — | dieselbe Arbeit wie Nr. 9 an einem anderen Ort — kein eigener Port | entfällt (= Nr. 9) |
| 13 | [Europaplatz (Frankfurt) I](augmented-bahnhofsviertel/about/13-europaplatz-i/README.md) | Yves Mettler | — | — | Nr. 4 | — | dieselbe Arbeit wie Nr. 4 an einem anderen Ort — kein eigener Port | entfällt (= Nr. 4) |
| 14 | [Kamuro Komet](augmented-bahnhofsviertel/about/14-kamuro-komet/README.md) | Sandra Kranich | `kranich-komet` | `abv-14-kamuro-komet` | — | einfach | Schwebende, langsam rotierende Skulptur (Live-Env-Map) hoch über dem Boden, Ein-Finger-Drehen + Pinch (max 1,3) auf der Gruppe, Tap-Recenter; kein Overlay. Auf dem Handy geprüft (2026-10-04): Höhe, Abstand, Gesten, Tap, Reflexionen passen; Schattenartefakte → `legacy-space` skaliert jetzt auch den Tiefenbereich der Schattenkamera (betrifft alle Werke), dazu Abweichung `shadowBias: -0.0005` am Licht — Artefakte danach weg. Modell unkomprimiert (1,5 MB; verlustfrei wäre größer) | portiert |
| 15 | [Milk Glass](augmented-bahnhofsviertel/about/15-milk-glass/README.md) | Adrian Williams | `williams` | `abv-15-milk-glass` | — | einfach | 1 Modell (lebensgroßes Glas), statische Env-Map, Tap-Recenter; alte Kamera auf `0 1.75 2` statt `0 8 8`. Auf dem Handy geprüft (2026-10-04): Größe, Abstand, Reflexionen (statische Studio-Cubemap) und Tap-Recenter passen. Modell unkomprimiert (6,3 MB; verlustfrei wäre größer). Seitentitel „Cold Milk“ | portiert |
| 16 | [Friendly reminder (enşöligensi)](augmented-bahnhofsviertel/about/16-friendly-reminder/README.md) | Nouria Behloul | `nouria-behloul` | `abv-16-friendly-reminder` | — | einfach | Riesige wehende Flagge (Morph-Animation, 401 Morph-Targets), Sound-Loop über Play-Button, Recenter-Button + Tap-Recenter — erstes Werk mit `LegacyOverlay`. Auf dem Handy geprüft (2026-10-04): Größe, Abstand, Sound, Recenter passen. Animation springt an jedem Loop (gebackene Stoffsimulation, Ende ≠ Anfang, ~28× ein normaler Frame-Schritt) — wie im Original, bewusst so belassen (Überblendung mit `crossfade-loop-clip` getestet und verworfen). Modell verlustfrei komprimiert 4,2 → 1,5 MB | portiert |
| 17 | [Wann ist das Sprechen über Gefühle ein politischer Akt?](augmented-bahnhofsviertel/about/17-sprechen-ueber-gefuehle/README.md) | Achim Lengerer | `scriptings` | `abv-17-sprechen-ueber-gefuehle` | — | einfach | Große Pille (Live-Env-Map), Sound-Loop doppelt: laut an der Kamera + positional an der Pille (Distanzen von `legacy-space` mitskaliert); Audio-Button, Recenter-Button, Tap-Recenter. Auf dem Handy geprüft (2026-10-04): Größe, Abstand, Sound, Recenter, Tap und Reflexionen passen. Modell unkomprimiert (3,9 MB; verlustfrei wäre 8,6 MB) | portiert |
| 18 | [Funkytown](augmented-bahnhofsviertel/about/18-funkytown/README.md) | saasfee\* | `disco` | `abv-18-funkytown` | — | mittel | viele Kugel-Modelle, 2 Sounds, Farb-Animation, `responsive-immersive` | offen |
| 19 | [Kleiderberg](augmented-bahnhofsviertel/about/19-kleiderberg/README.md) | Frankurt Fashion Movement | `kleiderberg-fuas` | `abv-19-kleiderberg` | — | einfach | 1 Modell, Gesten — **Pilot**. Auf dem Handy geprüft (2026-10-04): Platzierung, Abstand, Ziehen, Drehen und Skalieren funktionieren. Abweichung: Modell auf `z = -70` statt `-30` (Betrachter stand sonst im Ring der Grafik-Elemente, Berg füllte das Bild). Modell bleibt unkomprimiert (12,7 MB; verlustfreie Kompression vergrößert es, Textur so abgenommen) | portiert |
| 20 | [Solid Dream Level](augmented-bahnhofsviertel/about/20-solid-dream-level/README.md) | Anna Hofmann | `anna-hofmann` | `abv-20-solid-dream-level` | — | mittel | Sound, eigene `tap-animation`-Komponente, Env-Map | offen |
| 21 | [Die Reisende](augmented-bahnhofsviertel/about/21-die-reisende/README.md) | HazMatLab | `hazmadlab` | `abv-21-die-reisende` | — | einfach | 1 Modell, Live-Env-Map (`cubemap-realtime`), Tap-Recenter. Auf dem Handy geprüft (2026-10-04): Platzierung/Größe ok, Reflexionen da, Tap platziert neu. Abweichungen nach eigener Einschätzung: Slime auf `z = -35` statt `-25`; Pinch vom Gruppen- aufs Modell-Entity verlegt (folgt den Fingern, skaliert in beide Richtungen) — beides auf dem Handy bestätigt. Modell verlustfrei komprimiert 3,9 → 3,5 MB (Geometrie quantisiert) | portiert |
| 22 | [Privileged I](augmented-bahnhofsviertel/about/22-privileged-i/README.md) | Jonathan Radetz | `radetz-nepal` | `abv-22-privileged-i` | — | komplex | Portal, Video, Sound (Referenz: `portaljonathan`) | offen |
| 23 | [Privileged II](augmented-bahnhofsviertel/about/23-privileged-ii/README.md) | Jonathan Radetz | `radetz-istanbul` | `abv-23-privileged-ii` | — | mittel | 4 Modelle, 4 Videos, `play-video` | offen |
| 24 | [Privileged III](augmented-bahnhofsviertel/about/24-privileged-iii/README.md) | Jonathan Radetz | `radetz-lima` | `abv-24-privileged-iii` | — | mittel | 5 Modelle, 4 Videos, 4 Sounds, `play-video` | offen |
| 25 | [Die Reisende II](augmented-bahnhofsviertel/about/25-die-reisende-ii/README.md) | HazMatLab | — | — | Nr. 21 | — | dieselbe Arbeit wie Nr. 21 an einem anderen Ort — kein eigener Port | entfällt (= Nr. 21) |
| 26 | [Knusperhäuschen](augmented-bahnhofsviertel/about/26-knusperhaeuschen/README.md) | Sonja Yakovleva | `yakovleva-knusper` | `abv-26-knusperhaeuschen` | — | einfach | 1 Modell (keine Animation), Live-Env-Map, Tap-Recenter. Original lief fehlerhaft (`app.js` brach ab, geplanter Start-/Recenter-Button existierte nie) — portiert wie es tatsächlich lief: Haus sofort sichtbar, Kamera steht **im** Haus (~69×40×80 alte Einheiten). Auf dem Handy geprüft (2026-10-04): Start im Haus, Tap-Recenter und Reflexionen passen so. Modell verlustfrei komprimiert 7,0 → 5,1 MB | portiert |

Privileged I–III sind drei eigenständige alte Apps, keine Reihe im Branch-Sinn (jede hat ihren eigenen Export); sie teilen aber Code, der bei Bedarf auf die Zwischenbasis wandert.

## Vor dem finalen Export

Punkte, die vor der Veröffentlichung der Module noch geändert werden müssen:

- **Nr. 1 Xenoglossy (`abv-01-xenoglossy-i`):** Der Start-Hinweis enthält den Platzhalter `((TARGET))` statt des Ortsnamens („Richte die Kamera auf die ((TARGET)) und tippe auf ‚Start‘“). Das Original nannte die „Euro-Skulptur“ (Ort von Nr. 1); das Modul steht aber auch für Nr. 2/3 an anderen Orten. Ersetzen, sobald klar ist, wie die Orte im finalen Export abgebildet werden.

## Weitere Ordner im Altbestand

| Ordner | Einordnung | Vorgehen |
|---|---|---|
| `portaljonathan` | Portal-Prototyp zu Privileged | nur als Referenz für Nr. 7 / Nr. 22 |
| `madebychildren` | keinem Werk zugeordnet; Assets überschneiden sich mit Williams, Kleiderberg, Radetz | ganz am Schluss prüfen |
