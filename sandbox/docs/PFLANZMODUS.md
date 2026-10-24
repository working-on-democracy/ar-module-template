# Pflanze: Pflanzmodus

Stand: 24. Oktober 2026. Online-Fassung zum Kommentieren:
https://claude.ai/artifact/SnBVVsMQmVjm27MKWLFu8X

## Kurz erklärt

Eine Pflanze beginnt mit drei bis fünf Ursprungsobjekten, die Besucher selbst in
die Welt setzen. Der Pflanzmodus ist die Szene dafür: Aus einer Liste wählen sie
ein Objekt, stellen es auf den Boden, passen Größe und Drehung an und bestätigen.
Danach startet die Simulation mit genau dieser Anordnung.

Die Szene läuft heute an zwei Stellen mit demselben Code: im Viewer der Sandbox am
Rechner und in der AR-Testszene am Telefon. Woher später die pflanzbaren Objekte
kommen und wo der Server eine Pflanzung speichert, ist noch offen. Bis dahin sind
die 8 Startmodelle in `sandbox/models/` die Auswahl, dazu die neuen Objekte von
der Objekt-Seite der Sandbox (`/objekte.html`), und die Sandbox nimmt die
Pflanzung an.

## Ablauf

1. **Liste.** Sie zeigt die Objekte mit Vorschaubild und Namen und darüber, wie
   viele schon gepflanzt sind. Jedes Objekt lässt sich einmal pflanzen. Gepflanzte
   sind ausgegraut.
2. **Ausrichten.** Nach der Wahl steht eine durchsichtige Kopie des Objekts auf dem
   Boden in der Mitte des Blickfelds, mit einem Ring für seine Grundfläche. Sie
   ist grün, wo das Objekt stehen darf, und rot, wo nicht. Eine Zeile darunter sagt
   warum. „Platzieren“ hält die Kopie dort fest, „Abbrechen“ führt zurück zur Liste.
3. **Platziert.** Die Kopie bleibt stehen. Größe und Drehung lassen sich weiter
   ändern, ein kurzer Hinweis oben sagt wie. „Bestätigen“ fragt noch einmal
   nach („Bist du sicher?“). „Verschieben“ führt zurück zum Ausrichten,
   „Abbrechen“ zurück zur Liste.
4. **Gepflanzt.** Nach dem Ja ersetzt das echte Objekt die Kopie. Es lässt sich
   nicht mehr ändern, eine Rückgängig-Funktion gibt es nicht. Es geht zurück zur
   Liste.
5. **Starten.** Ab 3 Objekten wird „Pflanze starten“ aktiv und fragt noch einmal
   nach. Nach dem 5. Objekt startet die Pflanze von selbst, ohne Rückfrage.
6. **Laden.** Ein Ladebildschirm mit Fortschrittsbalken überbrückt die Zeit, bis
   die Simulation läuft. Geladen wird nur, was das erste Bild braucht: die Modelle
   der Ursprungsobjekte, wie der Server sie angelegt hat.

## Regeln

| Regel | Wert | Parameter |
| --- | --- | --- |
| Objekte pro Pflanze | 3 bis 5 | `plantMinObjects`, `plantMaxObjects` |
| Größe (längste Seite) | 0,2 bis 0,6 m | `originMinSize`, `originMaxSize` |
| Angebotene Größe | die eigene des Modells, auf diesen Bereich gebracht | |
| Abstand zum nächsten gepflanzten Objekt | höchstens 0,5 m, Kante zu Kante | `originMaxGap` |
| Überschneidung der Grundflächen | nicht erlaubt | |
| Zielen | höchstens 12 m vom Telefon (im Viewer 60 m) | |

Die **Grundfläche** ist ein Kreis um den Ursprung des Modells mit der halben
waagrechten Diagonale als Radius, so wie beim Dreieck der Magnetpunkte. Sie ist
eher großzügig: Ein Objekt wird schon rot, kurz bevor sich die Modelle wirklich
berühren. Um jedes gepflanzte Objekt zeigt beim Ausrichten ein heller Ring, wie
weit das nächste reichen darf.

Das **erste Objekt** darf überall stehen und legt den Ort der Pflanze fest. Jedes
weitere muss an eins der schon gepflanzten anschließen. Fünf Objekte stehen so
höchstens rund 4,5 m auseinander, die Notgrenze `originMaxSpread` (6 m) greift
nie.

Der **Server prüft** jede Pflanzung beim Empfang noch einmal mit derselben Regel
(`checkPlanting`): Anzahl, bekannte Objekte, jedes nur einmal, Größen und Abstände
in der Reihenfolge des Pflanzens.

## Bedienung

| Was | Telefon | Rechner (Sandbox-Viewer) |
| --- | --- | --- |
| Ort wählen | Telefon auf den Boden richten, die Kopie folgt der Bildmitte | Ansicht bewegen: W A S D, Q / E nach unten / oben, rechte Maustaste dreht die Ansicht |
| Größe ändern | zwei Finger auseinander oder zusammen | Mausrad oder Zusammenziehen auf dem Trackpad |
| Drehen | mit einem Finger waagrecht ziehen | mit der linken Maustaste ziehen |
| Bestätigen, Abbrechen | Knöpfe unten | Knöpfe unten |

Größe und Drehung gehen beim Ausrichten und nach dem Platzieren. Gesten, die auf
einem Knopf beginnen, zählen nicht.

## Was danach passiert

Mit dem Start lost die Szene einen **Seed** von 0 bis 99 aus und schickt die
Pflanzung mit ihm an den Server (`POST /api/planting`). Jedes Objekt geht mit
Modell, Ort, Größe und Drehung hin, in der Reihenfolge des Pflanzens. Der Server
startet den Lauf damit. Die Ursprungsobjekte stehen dort, wo sie gepflanzt wurden.

Die Szene **speichert eine Datei** (`pflanzung-<lauf>.json`) mit allem, was
derselbe Lauf noch einmal braucht: Parameter, Szenario mit Seed, Pflanzung, Tempo
und Verschmelzmodus. `npm run sandbox -- --values <datei>` startet ihn ohne
Pflanzszene. Was während des Laufs per Knopf dazukommt (Geräte, Fotos, Tempo),
steht nicht darin, das hält die Aufzeichnung (`--replay`).

Danach zeigt der Viewer die laufende Simulation wie gewohnt. Die AR-Testszene zeigt
die Pflanze live über Schnittstelle 1 (`GET /api/plant`, siehe
[Schnittstellen](SCHNITTSTELLEN.md)), um den Pflanzpunkt herum.

## Ausprobieren

**Am Rechner:** `npm run sandbox` startet die Sandbox und wartet auf die Pflanzung.
Im Viewer auf http://localhost:5180 erscheint die Pflanzszene.
`npm run sandbox -- --ohne-pflanzen` überspringt sie und startet mit den fünf
Standardobjekten im Ring. Eine Wiedergabe (`--replay`) und ein Lauf aus einer
gespeicherten Datei (`--values`) starten auch ohne sie.

**Am Telefon:** Erst `npm run sandbox`, dann `npm run dev:ar`. Am Telefon im selben
WLAN die angezeigte Netzwerkadresse öffnen und das Zertifikat annehmen. Der
Vite-Server von `dev:ar` reicht `/api` und `/run` an die Sandbox weiter
(`PLANT_SANDBOX=http://host:port`, sonst Port 5180), so läuft alles über HTTPS. Die
Szene startet 8th Wall mit absolutem Maßstab: Eine Einheit ist ein Meter, der Boden
liegt bei y = 0. Das Telefon braucht am Anfang etwas Bewegung, bis es den Boden
kennt. Hat die Sandbox schon eine Pflanze, zeigt die AR-Szene diese, statt eine
neue pflanzen zu lassen. Für eine neue Pflanzung die Sandbox neu starten.

Ob zuerst im Viewer oder am Telefon gepflanzt wird, ist gleich: Die erste
Pflanzung gilt, jede weitere lehnt die Sandbox ab, bis sie neu startet.

## Wo der Code liegt

| Datei | Inhalt |
| --- | --- |
| `sandbox/planting/rules.ts` | Katalog, Größen, Grundfläche, Abstandsregel, Prüfung einer ganzen Pflanzung (auch für den Server) |
| `sandbox/planting/scene.ts` | die Szene: Zustände, Kopie, Ringe, Gesten, Vorschaubilder |
| `sandbox/planting/ui.ts` | Oberfläche als DOM mit Inline-Styles: Liste, Knöpfe, Dialoge, Hinweis, Ladebildschirm, Datei speichern |
| `sandbox/server.ts` | `GET`/`POST /api/planting`, die Modelle zum Platzieren, Start des Laufs, `GET /api/plant` |
| `sandbox/viewer/main.ts` | Einbindung im Viewer (`begin`, `plant`) |
| `src/ArModule.vue` | die AR-Testszene: Pflanzen, Laden, Live-Pflanze |
| `src/plant-live.ts` | die Pflanze in AR nach Schnittstelle 1 |
| `lib/preview-ar.ts`, `vite.config.ts` | absoluter Maßstab, Weiterleitung zur Sandbox |

Die Szene kennt kein Framework. three.js bekommt sie vom Aufrufer: im Viewer
three.js aus npm, in AR die Version von 8frame 1.3 (three r137). Sie nutzt nur, was
beide Versionen haben. Die Oberfläche ist reines DOM mit Inline-Styles, weil ein
`<style>`-Block eines Moduls die Host-App nie erreicht.

## Für die Plattform

Was die Plattform für den Pflanzmodus braucht, steht in
[`SERVER-OFFENE-PUNKTE.md`](../SERVER-OFFENE-PUNKTE.md) (Punkte 13 bis 15) und die
Form der Abrufe in [Schnittstellen](SCHNITTSTELLEN.md#pflanzen-app--server). Kurz:

- **Pflanzung annehmen und prüfen:** derselbe Abruf und dieselbe Prüfung wie in der
  Sandbox.
- **Speichern:** wohin eine Pflanzung geht und wie sie mit einem Ort (Breite,
  Länge) verbunden wird, ist offen.
- **Objekte:** woher die pflanzbaren Objekte kommen und wie sie in die Datenbank
  kommen, ist offen. Heute sind es die 8 Startmodelle und alles, was auf der
  Objekt-Seite der Sandbox (`/objekte.html`) entsteht.
- **Maßstab:** Die Host-App nutzt den responsiven Maßstab von 8th Wall. Die
  Pflanze rechnet in Metern und braucht den absoluten Maßstab, oder die App rechnet
  um.

## Offen für die nächsten Runden

- Das Aussehen der Liste, der Knöpfe und der Dialoge ist ein erster Entwurf.
- Die Grundfläche als Kreis ist großzügig. Eine genauere Form (der Umriss des
  Modells von oben) würde engeres Pflanzen erlauben.
- In AR sind Zeichnungen der Pflanze noch nicht zu sehen. Die App zeichnet sie
  selbst, die Sandbox liefert aber keine echten `Stroke`-Daten.
- Am Telefon ist die Szene noch nicht getestet.
