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
- **Annahmen:** `kleiderberg-fuas` ist die richtige Kleiderberg-Fassung, `hazmadlab` („Dome“) ist Die Reisende.
- **Start/Recenter modul-lokal:** kein globales XR8-Recenter; das Modul platziert nur seine eigenen Inhalte vor der Kamera, über eine Legacy-Hülle um die alte Szene (Maßstab/Höhe im Pilot auf dem Handy bestätigen) — PORTING-GUIDE.md §6.
- **Template-Beispiel-Assets** sind auf der Zwischenbasis entfernt (PORTING-GUIDE.md §7).

## Werke

Komplexität ist eine grobe Ersteinschätzung aus der Oberflächenanalyse (Anzahl Modelle/Medien, eigene Komponenten). Status: `offen` → `in Arbeit` → `portiert` (Szene läuft im Template) → `abgenommen` (Feedback eingearbeitet).

| Nr. | Werk | Künstler*in | Alter Ordner | Branch | Basis | Komplexität | Besonderheiten | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | [Xenoglossy I](augmented-bahnhofsviertel/about/01-xenoglossy-i/README.md) | Tina Kohlmann | `kohlmann-xenoglossy` | `abv-01-xenoglossy-i` | — | einfach | 1 Modell, Animation, Gesten (ziehen/drehen/skalieren) | offen |
| 2 | [Xenoglossy II](augmented-bahnhofsviertel/about/02-xenoglossy-ii/README.md) | Tina Kohlmann | — | `abv-02-xenoglossy-ii` | Nr. 1 | ? | kein eigener Export; Ordner von Nr. 1 enthält 3 Gesicht-Modelle — prüfen, ob Variante | offen |
| 3 | [Xenoglossy III](augmented-bahnhofsviertel/about/03-xenoglossy-iii/README.md) | Tina Kohlmann | — | `abv-03-xenoglossy-iii` | Nr. 1 | ? | wie Nr. 2 | offen |
| 4 | [Europaplatz (Frankfurt) II](augmented-bahnhofsviertel/about/04-europaplatz-ii/README.md) | Yves Mettler | `mettler-europaplatz2` | `abv-04-europaplatz-ii` | — | komplex | 37 Modelle, eigene Platzierungs-Komponenten (cursor-/distance-/tab-place-*) | offen |
| 5 | [Unwetter am Steg](augmented-bahnhofsviertel/about/05-unwetter-am-steg/README.md) | Parastou Forouhar | `forouhar-unwetter` | `abv-05-unwetter-am-steg` | — | mittel | Animation, eigene `tap-place-cursor`-Komponente, Env-Map | offen |
| 6 | [Birdkin(d)](augmented-bahnhofsviertel/about/06-birdkind/README.md) | Katharina Pelosi | `pelosi-birdkind` | `abv-06-birdkind` | — | komplex | 12 Sounds, eigene `distance-place-sequence`-Komponente | offen |
| 7 | [I can‘t get no - yes, we can](augmented-bahnhofsviertel/about/07-i-cant-get-no/README.md) | Andreas Diefenbach | `diefenbach-cannotgetno` | `abv-07-i-cant-get-no` | — | komplex | Portal (`portal-camera`, Hider-Material), Video | offen |
| 8 | [Dead can Dance](augmented-bahnhofsviertel/about/08-dead-can-dance/README.md) | Maiken Laackmann | `laackmann-deadcandance` | `abv-08-dead-can-dance` | — | mittel | 6 animierte Modelle, Sound-Loop | offen |
| 9 | [Fisher-Loop (privatized) I](augmented-bahnhofsviertel/about/09-fisher-loop-i/README.md) | freitagsküche | `freitagskueche-fisherloop` | `abv-09-fisher-loop-i` | — | einfach | 1 Modell, Sound-Loop, Animation, Gesten | offen |
| 10 | [Neon Organisms 3](augmented-bahnhofsviertel/about/10-neon-organisms-3/README.md) | K. Ulrich Schneider | `scheider-organism` | `abv-10-neon-organisms-3` | — | einfach | 3 Modelle, Env-Map, Gesten; body.html mit HTML-Fehler | offen |
| 11 | [Die kommende Gemeinschaft liegt hinter unseren Depressionen](augmented-bahnhofsviertel/about/11-die-kommende-gemeinschaft/README.md) | Götz Schramm | — | `abv-11-die-kommende-gemeinschaft` | — | ? | Export fehlt, wird beschafft | zurückgestellt |
| 12 | [Fisher-Loop (privatized) II](augmented-bahnhofsviertel/about/12-fisher-loop-ii/README.md) | freitagsküche | — | `abv-12-fisher-loop-ii` | Nr. 9 | ? | kein eigener Export — prüfen, ob Variante in Nr. 9 | offen |
| 13 | [Europaplatz (Frankfurt) I](augmented-bahnhofsviertel/about/13-europaplatz-i/README.md) | Yves Mettler | — | `abv-13-europaplatz-i` | Nr. 4 | ? | kein eigener Export — Nr. 4 hat mehrere Platzierungs-Varianten, prüfen | offen |
| 14 | [Kamuro Komet](augmented-bahnhofsviertel/about/14-kamuro-komet/README.md) | Sandra Kranich | `kranich-komet` | `abv-14-kamuro-komet` | — | einfach | Env-Map (statisch + Kamera), Gesten | offen |
| 15 | [Milk Glass](augmented-bahnhofsviertel/about/15-milk-glass/README.md) | Adrian Williams | `williams` | `abv-15-milk-glass` | — | einfach | 1 Modell (lebensgroßes Glas), statische Env-Map, Tap-Recenter; alte Kamera auf `0 1.75 2` statt `0 8 8`. Auf dem Handy geprüft (2026-10-04): Größe, Abstand, Reflexionen (statische Studio-Cubemap) und Tap-Recenter passen. Modell unkomprimiert (6,3 MB; verlustfrei wäre größer). Seitentitel „Cold Milk“ | portiert |
| 16 | [Friendly reminder (enşöligensi)](augmented-bahnhofsviertel/about/16-friendly-reminder/README.md) | Nouria Behloul | `nouria-behloul` | `abv-16-friendly-reminder` | — | einfach | 1 animiertes Modell, Sound-Loop an der Kamera, Env-Map | offen |
| 17 | [Wann ist das Sprechen über Gefühle ein politischer Akt?](augmented-bahnhofsviertel/about/17-sprechen-ueber-gefuehle/README.md) | Achim Lengerer | `scriptings` | `abv-17-sprechen-ueber-gefuehle` | — | einfach | 1 Modell, Sound-Loop, Env-Map | offen |
| 18 | [Funkytown](augmented-bahnhofsviertel/about/18-funkytown/README.md) | saasfee\* | `disco` | `abv-18-funkytown` | — | mittel | viele Kugel-Modelle, 2 Sounds, Farb-Animation, `responsive-immersive` | offen |
| 19 | [Kleiderberg](augmented-bahnhofsviertel/about/19-kleiderberg/README.md) | Frankurt Fashion Movement | `kleiderberg-fuas` | `abv-19-kleiderberg` | — | einfach | 1 Modell, Gesten — **Pilot**. Auf dem Handy geprüft (2026-10-04): Platzierung, Abstand, Ziehen, Drehen und Skalieren funktionieren. Abweichung: Modell auf `z = -70` statt `-30` (Betrachter stand sonst im Ring der Grafik-Elemente, Berg füllte das Bild). Modell bleibt unkomprimiert (12,7 MB; verlustfreie Kompression vergrößert es, Textur so abgenommen) | portiert |
| 20 | [Solid Dream Level](augmented-bahnhofsviertel/about/20-solid-dream-level/README.md) | Anna Hofmann | `anna-hofmann` | `abv-20-solid-dream-level` | — | mittel | Sound, eigene `tap-animation`-Komponente, Env-Map | offen |
| 21 | [Die Reisende](augmented-bahnhofsviertel/about/21-die-reisende/README.md) | HazMatLab | `hazmadlab` | `abv-21-die-reisende` | — | einfach | 1 Modell, Live-Env-Map (`cubemap-realtime`), Tap-Recenter. Auf dem Handy geprüft (2026-10-04): Platzierung/Größe ok, Reflexionen da, Tap platziert neu. Abweichungen nach eigener Einschätzung: Slime auf `z = -35` statt `-25`; Pinch vom Gruppen- aufs Modell-Entity verlegt (folgt den Fingern, skaliert in beide Richtungen) — beides auf dem Handy bestätigt. Modell verlustfrei komprimiert 3,9 → 3,5 MB (Geometrie quantisiert) | portiert |
| 22 | [Privileged I](augmented-bahnhofsviertel/about/22-privileged-i/README.md) | Jonathan Radetz | `radetz-nepal` | `abv-22-privileged-i` | — | komplex | Portal, Video, Sound (Referenz: `portaljonathan`) | offen |
| 23 | [Privileged II](augmented-bahnhofsviertel/about/23-privileged-ii/README.md) | Jonathan Radetz | `radetz-istanbul` | `abv-23-privileged-ii` | — | mittel | 4 Modelle, 4 Videos, `play-video` | offen |
| 24 | [Privileged III](augmented-bahnhofsviertel/about/24-privileged-iii/README.md) | Jonathan Radetz | `radetz-lima` | `abv-24-privileged-iii` | — | mittel | 5 Modelle, 4 Videos, 4 Sounds, `play-video` | offen |
| 25 | [Die Reisende II](augmented-bahnhofsviertel/about/25-die-reisende-ii/README.md) | HazMatLab | — | `abv-25-die-reisende-ii` | Nr. 21 | ? | kein eigener Export — `hazmadlab` enthält ungenutzte Varianten `slime2/3/5.gltf` (Szene nutzt `slime8`): Kandidaten für dieses Werk, prüfen | offen |
| 26 | [Knusperhäuschen](augmented-bahnhofsviertel/about/26-knusperhaeuschen/README.md) | Sonja Yakovleva | `yakovleva-knusper` | `abv-26-knusperhaeuschen` | — | einfach | 1 animiertes Modell, Env-Map | offen |

Privileged I–III sind drei eigenständige alte Apps, keine Reihe im Branch-Sinn (jede hat ihren eigenen Export); sie teilen aber Code, der bei Bedarf auf die Zwischenbasis wandert.

## Weitere Ordner im Altbestand

| Ordner | Einordnung | Vorgehen |
|---|---|---|
| `portaljonathan` | Portal-Prototyp zu Privileged | nur als Referenz für Nr. 7 / Nr. 22 |
| `madebychildren` | keinem Werk zugeordnet; Assets überschneiden sich mit Williams, Kleiderberg, Radetz | ganz am Schluss prüfen |
