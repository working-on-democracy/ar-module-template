# Pflanze: AR-Testumgebung

Stand: 27. Oktober 2026. Online-Fassung zum Kommentieren:
https://claude.ai/artifact/PkqZ4YQJ2PEzK2uLxKvyks

## Kurz erklärt

Die AR-Testszene zeigt die Pflanze der laufenden Sandbox auf einem Telefon oder
iPad in AR. Man pflanzt dort wie im Viewer, danach steht die Pflanze live im Raum
und verändert sich mit der Simulation. Die Szene läuft auf derselben Technik wie die
App von an-alle.net (8frame 1.3.0 mit three r137, 8th Wall, dieselben Lichter), damit
sich hier zeigt, was später auf der Plattform passiert.

Sie ist nur ein Testwerkzeug. Auf der Plattform rechnet der Server die Pflanze, und
die App zeigt sie an ([Schnittstellen](SCHNITTSTELLEN.md)). Die Testszene macht
genau das gegen die Sandbox: Sie fragt dieselbe Form ab, die der Server später unter
`plantNearby` liefern soll.

Getestet am 26. Oktober 2026 auf einem iPad mit Safari: Pflanzen, Laden, die
Live-Pflanze und das Verdecken unter dem Boden. Schatten, Fotos und Zeichnungen sind
danach dazugekommen und bisher nur in Chrome am Rechner geprüft.

## Starten

1. `npm run sandbox` am Rechner. Die Sandbox wartet auf eine Pflanzung (Port 5180).
2. `npm run dev:ar` in einem zweiten Terminal. Vite zeigt eine Netzwerkadresse wie
   `https://10.36.22.26:5173`.
3. Am Telefon im selben WLAN diese Adresse öffnen, das selbst ausgestellte
   Zertifikat annehmen und die Kamera erlauben.
4. Das Telefon etwas bewegen, bis 8th Wall den Boden kennt. Dann erscheint die Liste
   zum Pflanzen.

Der Vite-Server reicht `/api` und `/run` an die Sandbox weiter. So läuft alles über
dieselbe HTTPS-Adresse, die die Kamera braucht. Eine andere Sandbox erreicht man mit
`PLANT_SANDBOX=http://host:port npm run dev:ar`.

**Nach Änderungen am Server** (`sandbox/server.ts`) die Sandbox neu starten. Vite lädt
Änderungen an der Szene selbst nach, die Sandbox nicht.

**Eine neue Pflanzung** braucht eine neu gestartete Sandbox. Hat sie schon eine
Pflanze, zeigt die Testszene diese gleich an. Ob zuerst im Viewer oder am Telefon
gepflanzt wird, ist gleich.

## Ablauf in der Szene

**Pflanzen:** Die Liste zeigt die pflanzbaren Objekte mit Vorschaubild. Solange ein
Modell lädt, steht auf seiner Kachel „lädt“ mit der Datenmenge, danach „wird
aufbereitet“. Scheitert etwas, steht der Grund rot auf der Kachel („lädt nicht: …“
oder „kein Bild: …“). Die Bedienung beim Pflanzen beschreibt der
[Pflanzmodus](PFLANZMODUS.md).

**Laden:** Nach dem Pflanzen lädt die Szene die Modelle der ersten Antwort. Der
Ladebildschirm zeigt, wie viele Modelle fertig sind und wie viele MB angekommen sind.
Steigt die Zahl, lädt es nur langsam. Steht sie still, hängt die Verbindung.

**Live:** Danach fragt die Szene die Pflanze regelmäßig ab, zeigt sie eine Abfrage
verzögert und blendet zwischen den letzten beiden Antworten über.

## Was die Szene zeigt

- **Objekte** mit Körnung (`grain-shimmer`), Leuchtfarbe, Schweben und Bewegung, wie
  der Server sie in `pose` schickt.
- **Fotos und Kommentare**, sobald ein Objekt sie übernommen hat, projiziert wie im
  Viewer.
- **Zeichnungen**, frei an ihrem Ort, angezogen auf dem Weg zum Objekt und in Ruhe
  mit der Textur des Objekts. Die Linien kommen aus `GET /api/strokes`, dem Ersatz
  der Sandbox für `strokesNearby` der Plattform, alle 10 Sekunden.
- **Boden:** Eine unsichtbare Fläche auf Bodenhöhe verdeckt, was im Boden steckt
  (Keimlinge, sinkende tote Objekte). Eine zweite Fläche zeigt nur die Schatten.
- **Schatten:** Die Objekte werfen Schatten auf den Boden, Zeichnungen nicht (wie auf
  der Plattform).

Nicht zu sehen sind freie Fotos und Kommentare, die noch kein Objekt übernommen hat.
Auf der Plattform zeigt die App sie selbst an ihrem Ort, die Testszene hat dafür
nichts.

## Was zurück an die Sandbox geht

Die Szene schreibt genau einmal: die Pflanzung. Danach liest sie nur.

| Abruf | Wozu |
| --- | --- |
| `GET /api/planting` | Katalog, Regeln, ob die Sandbox noch wartet |
| `GET /api/planting/models/…` | die Modelle für die Pflanzszene |
| `POST /api/planting` | die Pflanzung mit Seed, startet den Lauf |
| `GET /api/plant` | die Pflanze (Schnittstelle 1), alle 1 bis 3 Sekunden |
| `GET /api/strokes` | die Zeichnungen, alle 10 Sekunden |
| `/run/…`, `/api/photo/…` | Modelle und Fotos der laufenden Pflanze |

Tempo, Pause und neue Fotos, Zeichnungen oder Kommentare kommen nur aus dem Viewer
(`/api/cmd`). Die Testszene folgt dem: Läuft die Sandbox im Zeitraffer, läuft auch
die Pflanze am Telefon schneller, und die Abfrage geht dann jede Sekunde.

## Wie nah an der Plattform

Die Vorschau übernimmt die Szene der Host-App (`ArScene.vue` in `ar-demo-backend`,
geprüft am 26. Oktober 2026, Stand 0651352). Der wichtigste Unterschied ist der
Maßstab: Die Pflanze rechnet in Metern, die Host-App nutzt heute den responsiven
Maßstab ([offene Punkte](../SERVER-OFFENE-PUNKTE.md), Punkt 15).

| | Testszene | Host-App |
| --- | --- | --- |
| A-Frame und three.js | 8frame 1.3.0, three r137 | gleich |
| Lichter | Umgebung #BBB, gerichtet #FFF 0,6 auf `-0.5 1 1`, wirft Schatten | gleich (`#host-lights`) |
| Schattenbereich | Standard von A-Frame: ±5 m um den Ursprung, 512 px | gleich |
| Nebel | linear, schwarz, 1 bis 1000 m | gleich |
| Renderer | `colorManagement`, Bildfläche höchstens 1280 px, `preserveDrawingBuffer` | gleich |
| Maßstab | absolut: eine Einheit ist ein Meter, Boden bei y = 0 | responsiv |
| Inhalt | direkt in der Szene, Pflanzpunkt als Ursprung | Module unter `0 1.6 -3` |

Der Schattenbereich reicht nur etwa ±5 m um den Startpunkt der AR-Sitzung und
erfasst bei Objekten über etwa 1,5 m Höhe nicht alles. So ist es auch auf der
Plattform. Ob das reicht, ist offen (Punkt 18).

## Fallstricke

Diese Fehler sind beim Test auf dem iPad aufgetreten. Die Host-App läuft auf
derselben Technik und trifft sie genauso.

- **Kein weiterer WebGL-Kontext in Safari.** Neben 8th Wall gibt Safari auf iPhone
  und iPad keinen zusätzlichen WebGL-Kontext her. Die Vorschaubilder der Liste zeichnet
  deshalb der Renderer der Seite in ein Render-Target.
- **Kopierte Texturen in three r137.** Eine Kopie (`texture.clone()`) bekommt nur das
  Bild, das die Textur in diesem Moment hat. Wird eine Textur kopiert, bevor ihr Bild
  geladen ist, bleibt die Kopie schwarz. `grain-shimmer` kopiert jede Textur, sobald
  ein Modell gesetzt wird. Deshalb wartet die Szene auf das Foto, bevor sie das
  Modell setzt. Neuere three-Versionen (der Viewer) teilen die Bildquelle, dort fällt
  der Fehler nicht auf.
- **Safari lädt Texturen anders.** Der GLTFLoader von r137 nimmt in Safari den
  `TextureLoader` statt `createImageBitmap`. Was in Chrome am Rechner geht, ist in
  Safari deshalb nicht automatisch geprüft.
- **Zwei Vite-Server teilen sich einen Cache.** Ein zweiter `vite` im selben Projekt
  baut `node_modules/.vite` neu und kann dem ersten seine Abhängigkeiten wegnehmen.
  Abhilfe steht unter „Eine zweite Testumgebung“.

## Fehlersuche

- **Kacheln bleiben grau:** Steht etwas Rotes darauf, ist das der Grund. Steht „lädt“
  mit wachsender MB-Zahl darauf, lädt es noch. Ein Modell der Liste hat bis zu etwa
  9 MB, fünf zusammen leicht 28 MB.
- **Ladebildschirm bleibt stehen:** Die Anzeige sagt, ob noch Daten kommen.
- **„Keine Verbindung zur Sandbox“:** Läuft `npm run sandbox`, und stimmt
  `PLANT_SANDBOX`?
- **Konsole am iPad:** iPad per Kabel an den Mac, auf dem iPad unter Einstellungen →
  Apps → Safari → Erweitert den Web-Inspektor einschalten, am Mac in Safari unter
  Entwickler das iPad und die Seite wählen.
- **Ohne Telefon prüfen:** Dieselbe Adresse (`https://localhost:5173/ar.html`) läuft
  auch in Chrome am Rechner. Ohne Kamera ist das Bild schwarz, Liste, Laden und die
  Objekte in der Szene lassen sich aber prüfen, auch mit der Konsole. Die Meldung
  „No valid session manager“ von 8th Wall ist dort normal.

## Eine zweite Testumgebung

Für Tests neben der laufenden Sandbox, ohne sie zu stören (zum Beispiel durch einen
Agenten): eine eigene Sandbox auf Port 5191 und eine eigene Vorschau auf Port 5192
mit eigenem Vite-Cache.

```bash
npx tsx sandbox/server.ts --port 5191 --ohne-pflanzen --speed 3
PLANT_SANDBOX=http://localhost:5191 npx vite --config <eigene-config.mts> --mode ar --port 5192 --strictPort
```

Die eigene Konfiguration übernimmt `vite.config.ts` und setzt nur `cacheDir` auf einen
anderen Ordner. Sie braucht die Endung `.mts`, wenn sie außerhalb des Projekts liegt.
Damit Chrome das Zertifikat schon kennt, den Ordner `node_modules/.vite/basic-ssl` in
den neuen Cache kopieren. Den Lauf-Ordner unter `sandbox-runs/` danach löschen.

## Wo der Code liegt

| Datei | Inhalt |
| --- | --- |
| `src/ArModule.vue` | die Testszene: Boden, Schatten, Pflanzen, Ladebildschirm, Live-Pflanze |
| `src/plant-live.ts` | die Pflanze nach Schnittstelle 1: Abfragen, Überblenden, Modelle, Fotos, Kommentare, Zeichnungen |
| `sandbox/planting/` | die Pflanzszene, dieselbe wie im Viewer |
| `sandbox/render/` | Fotoprojektion, Kommentarschrift, Zeichnungen als Röhren, gemeinsam mit dem Viewer |
| `src/a-frame-components/grain-shimmer.ts` | die Körnung |
| `lib/preview-ar.ts` | die Vorschau-Szene: 8th Wall mit absolutem Maßstab, Nebel, Renderer wie die Host-App |
| `vite.config.ts` | `dev:ar`: HTTPS, Weiterleitung von `/api` und `/run` an die Sandbox |
| `sandbox/server.ts` | `GET /api/plant`, `GET /api/strokes`, Pflanzung |

Was in `src/plant-live.ts` steht, soll später in die Host-App wandern. Es nutzt nur,
was three r137 hat, und kein Vue.

## Offen

- Freie Fotos und Kommentare in der Testszene zeigen.
- Ein Test an einem echten Ort, mit der Pflanze aus dem Server statt der Sandbox.
- Wie viele Objekte ein Telefon flüssig zeigt. Eine späte Pflanze hat bis zu etwa 70.
- Ob die Host-App den Schattenbereich für die Pflanze vergrößert.
