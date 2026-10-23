# Pflanze für an-alle.net

Der Branch `plant` enthält die **Pflanze**: ein digitales Ökosystem aus 3D-Objekten,
das an einem Ort auf der Plattform an-alle.net wächst, sich kopiert, verschmilzt,
halbiert, verwelkt und nach rund 40 Tagen vergeht. Fotos, Zeichnungen und
Besucher in der Nähe beschleunigen es. Jede Veränderung an einem Objekt ist ein
echter Rechenschritt auf einer GLB-Datei.

Hier liegt alles, was die Pflanze braucht, und nichts sonst:

- die **Simulation**: Regeln, Phasen, Zeitfaktor, deterministisch
- die **Rechenschritte**: Skripte, die Modelle verschmelzen, reduzieren, halbieren,
  stilisieren und Texturen zerdrücken
- die **Sandbox**: ein lokaler Server mit 3D-Viewer, der eine Pflanze mit echten
  Modellen laufen lässt, dazu der Lebenszyklus-Rechner
- die **Dokumentation** für Entwicklung und Server
- das **Grundgerüst des AR-Modul-Templates** (`lib/`, `src/`, `npm run dev:ar`), mit
  dem die Pflanze als Nächstes auf Telefonen in AR getestet wird, und die Komponente
  **`grain-shimmer`**: die körnige, glitzernde Oberfläche ist ein fester Teil des
  Looks der Pflanze (der Viewer der Sandbox nutzt denselben Shader)

Der Branch zweigt von `main` ab. Alle Features, Beispiele, Guides und Assets des
Templates, die die Pflanze nicht nutzt, sind entfernt. `grain-shimmer` ist das
einzige Template-Feature, das bleibt. Die Entwicklung bis hierher
liegt als Archiv in den Branches `ai-asset-tools` und `plant-sandbox`.

## Für den Admin: hier anfangen

1. **[`sandbox/docs/ADMIN-AUFGABEN.md`](sandbox/docs/ADMIN-AUFGABEN.md)**: was am
   Server zu tun ist, nach Priorität, mit Befehlen.
2. Der wichtigste Punkt zuerst: Laufen die GLB-Skripte auf dem Uberspace? Der
   Server hat glibc 2.17, die nativen Pakete der Bildbibliothek `sharp` brauchen
   2.26. Getestet wird die WebAssembly-Variante von `sharp`. Scheitert sie, gibt es
   einen lokal getesteten Ausweichweg mit einem Platzhalter-Paket. Beides steht
   in den Admin-Aufgaben.
3. Was die AR-App vom Server bekommt (die Abfrage `plantNearby`):
   **[`sandbox/docs/SCHNITTSTELLEN.md`](sandbox/docs/SCHNITTSTELLEN.md)**.
4. Hintergrund und Begründungen: **[`sandbox/docs/TECHNISCHE-VORAUSSETZUNGEN.md`](sandbox/docs/TECHNISCHE-VORAUSSETZUNGEN.md)**
   (Skripte, Werkzeuge, nötige Dienste, Unterschiede zwischen Sandbox und Produkt,
   Pitfalls, Bottlenecks, ungetestete Funktionen).
5. Offene Punkte für die Server-Fassung: [`sandbox/SERVER-OFFENE-PUNKTE.md`](sandbox/SERVER-OFFENE-PUNKTE.md).

## Schnellstart

```bash
npm install
npm run sandbox                           # neuer Lauf, Viewer auf http://localhost:5180
npm run sandbox -- --seed 12              # bestimmter Seed
npm run sandbox -- --speed echtzeit4      # viermal so schnell wie die echte Zeit
npm run sandbox -- --replay sandbox-runs/<Ordner>   # aufgezeichneten Lauf wieder abspielen
npm run lifecycle-page                    # Lebenszyklus-Rechner bauen (sandbox/lifecycle-page/)
npm run measure                           # Phasen über 10 Seeds messen, ohne Modelle
npm run typecheck                         # Typprüfung für alles
```

Läuft gerade eine Sandbox, braucht eine zweite einen anderen Port (`-- --port 5181`).
Jeder Lauf legt einen Ordner unter `sandbox-runs/` an (von Git ignoriert): Modelle,
Protokoll, Aufzeichnung. Die Startmodelle liegen in `sandbox/models/`, die Testfotos
(gemeinfreie Stadt- und Parkaufnahmen im Hochformat, Quellen in `QUELLEN.md`) in `sandbox/test-photos/`.
Im Viewer blendet **Vorschau** (Taste P, Esc beendet) Oberfläche, Markierungen und
Hilfslinien aus: dunkelgrauer Boden, der Eingesunkenes verdeckt, mit Horizont im Dunst.

## Was wo liegt

```
sandbox/
  sim/              Simulation: Regeln, Phasen, Zeitfaktor (reines TypeScript, ohne Abhängigkeiten)
  params.ts         alle Parameter mit Standardwerten
  scenarios/        Startobjekte, Szenario (Fotos, Zeichnungen, Besuche nach Zeitplan)
  runner/           führt die Jobs der Simulation mit den Skripten aus
  server.ts         Sandbox-Server: Tempo, Protokoll, Aufzeichnung, Viewer
  viewer/           3D-Viewer im Browser (three.js)
  lifecycle-page/   Lebenszyklus-Rechner (dieselbe Simulation mit Zahlen statt Modellen)
  models/           die acht Startmodelle (aus Sloyd)
  docs/             Dokumentation der Pflanze
scripts/            Rechenschritte und Werkzeuge: glb-fuse, glb-reduce, glb-split, stylize-glb,
                    glb-texture-crush, jimp-image, sloyd-generate, glb-compression, compress-assets
src/, lib/          Grundgerüst des AR-Modul-Templates für den AR-Test,
                    src/a-frame-components/grain-shimmer.ts: der Körnungs-Look der Pflanze
guides/, examples/  Guide und Beispiel zu grain-shimmer
cross-feature-reference-docs/
                    Referenzen: Asset-Erzeugung und GLB-Werkzeuge, Komprimierung, Template-Grundgerüst
```

## Dokumentation

| Dokument | Inhalt |
| --- | --- |
| [`sandbox/docs/ADMIN-AUFGABEN.md`](sandbox/docs/ADMIN-AUFGABEN.md) | Aufgaben am Server nach Priorität |
| [`sandbox/docs/TECHNISCHE-VORAUSSETZUNGEN.md`](sandbox/docs/TECHNISCHE-VORAUSSETZUNGEN.md) | technische Referenz für Server und Plattform |
| [`sandbox/docs/SCHNITTSTELLEN.md`](sandbox/docs/SCHNITTSTELLEN.md) | was die AR-App vom Server bekommt, was der Rechendienst bekommt, mit Erklärung |
| [`sandbox/docs/PHASEN.md`](sandbox/docs/PHASEN.md) | die Phasen der Pflanze und was in ihnen passiert |
| [`sandbox/docs/ZEITMASSSTAB-UND-BOOSTS.md`](sandbox/docs/ZEITMASSSTAB-UND-BOOSTS.md) | Zeitfaktor und Time Boosts |
| [`cross-feature-reference-docs/AI-ASSET-GENERATION-GUIDE.md`](cross-feature-reference-docs/AI-ASSET-GENERATION-GUIDE.md) | Sloyd und die GLB-Werkzeuge im Detail (englisch) |
| [`cross-feature-reference-docs/ASSET-COMPRESSION-GUIDE.md`](cross-feature-reference-docs/ASSET-COMPRESSION-GUIDE.md) | Komprimierung für die Auslieferung, nie doppelt komprimieren (englisch) |
| [`guides/GRAIN-SHIMMER-FEATURE-GUIDE.md`](guides/GRAIN-SHIMMER-FEATURE-GUIDE.md) | die Körnung der Pflanze: Attribute, Werte, Fallstricke (englisch) |
| [`cross-feature-reference-docs/AR-MODULE-TEMPLATE.md`](cross-feature-reference-docs/AR-MODULE-TEMPLATE.md) | Build, Vorschau und Host-Vertrag des Template-Grundgerüsts (englisch) |

Die Dokumente in `sandbox/docs/` gibt es auch online zum Kommentieren, die Links
stehen jeweils oben im Dokument.

## Wie es weitergeht

Drei Spuren laufen parallel:

1. **Feintuning** der Parameter in der Sandbox und im Lebenszyklus-Rechner, wie bisher.
2. **AR-Test auf Telefonen, lokal:** eine Darstellung der Pflanze als A-Frame-Komponente,
   die den Zustand der laufenden Sandbox über das WLAN holt und ihn mit `npm run dev:ar`
   am Telefon in AR zeigt, mit `grain-shimmer` wie im Viewer. Sie wird so gebaut, dass sie später in die Plattform-App
   wandern kann (8frame 1.3.0, three r137, kein Vue).
3. **Server und Plattform, der Admin:** die Schritte aus
   [`ADMIN-AUFGABEN.md`](sandbox/docs/ADMIN-AUFGABEN.md).

Damit Spur 2 und 3 zusammenpassen, steht in [`SCHNITTSTELLEN.md`](sandbox/docs/SCHNITTSTELLEN.md)
fest, welche Daten die AR-App über eine Pflanze bekommt. Die Sandbox liefert diese Form
unter `/api/plant`, der Server später unter `plantNearby`.
