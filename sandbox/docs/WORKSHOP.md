# Pflanze: Anleitung für Team und Workshop

Stand: 24. Oktober 2026. Online-Fassung zum Kommentieren:
https://claude.ai/artifact/Srsp6wMrBQ6uutvAy2bZ8G

## Worum es geht

Die **Pflanze** ist ein Teil der Plattform an-alle.net. Sie besteht aus 3D-Objekten,
die an einem Ort in der Stadt stehen und mit dem Handy in Augmented Reality zu
sehen sind. Die Objekte leben: Sie ziehen sich an, verschmelzen miteinander,
werden halbiert, verwelken und zerfallen. Fotos, Zeichnungen und Kommentare, die
Leute auf der Plattform hinterlassen, landen auf den Objekten und halten die
Pflanze länger am Leben. Auf der Plattform dauert so ein Leben Wochen.

Die **Sandbox** ist eine Probierfassung der Pflanze für deinen eigenen Rechner.
Sie rechnet genau das Gleiche wie später die Plattform, nur schneller, und zeigt
es im Browser. Fotos und Kommentare kommen dort nicht von echten Leuten, die
Sandbox erfindet sie.

Im Workshop machst du drei Dinge:

1. **Objekte erstellen.** Aus einem Foto von einem Gegenstand oder aus einer kurzen
   Beschreibung entsteht ein 3D-Modell. Das macht **Sloyd**, ein Online-Dienst, der
   mit künstlicher Intelligenz aus Bildern und Texten 3D-Modelle baut. Die Sandbox
   schickt dein Bild oder deinen Text dorthin und holt das fertige Modell ab.
2. **Pflanzen.** Du stellst 3 bis 5 deiner Objekte nebeneinander auf den Boden.
   Damit beginnt eine neue Pflanze.
3. **Beobachten.** Du siehst zu, was die Pflanze mit deinen Objekten macht.

Sloyd kostet pro Objekt Geld. Damit das überschaubar bleibt, bekommst du vom
Workshop-Team einen **Zugangscode** (etwa `PFL-ABCD-EFGH`). Mit ihm kannst du bis
zu 7 Objekte erstellen. Gepflanzt werden nur deine eigenen Objekte, mindestens 3.

## Was du brauchst

- einen Rechner mit macOS, Windows oder Linux und Internet
- etwa 1 GB freien Platz
- einen aktuellen Browser (Chrome, Firefox, Safari oder Edge)
- deinen Zugangscode
- zwei kostenlose Programme, die du einmal installierst:
  - **Git** (https://git-scm.com/downloads) lädt den Programmcode der Pflanze von
    GitHub herunter. GitHub ist die Seite, auf der wir den Code ablegen.
  - **Node.js** (https://nodejs.org, die Fassung mit „LTS“) führt die Sandbox aus.
    Die Sandbox ist in JavaScript geschrieben, und Node.js lässt JavaScript auf
    deinem Rechner laufen statt nur im Browser. Gebraucht wird Version 22 oder
    neuer, mindestens 20.12. Mit Node.js kommt **npm** mit, ein Hilfsprogramm, das
    weitere Bausteine nachlädt und die Sandbox startet.

Alle Befehle in dieser Anleitung tippst du in ein **Terminal**. Das ist ein Fenster,
in dem man dem Rechner Befehle als Text gibt. Auf dem Mac heißt das Programm
„Terminal“ (über die Spotlight-Suche zu finden), unter Windows „PowerShell“
(über das Startmenü). Einen Befehl abschicken: eintippen oder einfügen, dann
Enter.

Ob Git und Node.js da sind, zeigen diese zwei Befehle. Sie geben jeweils eine
Versionsnummer aus. Steht dort „command not found“ oder „nicht erkannt“, fehlt das
Programm noch.

```bash
git --version
node --version
```

## Einrichten (einmal)

Im Terminal zuerst in den Ordner wechseln, in dem das Projekt liegen soll, etwa
deinen Dokumente-Ordner:

```bash
cd Documents
```

Dann den Code herunterladen und die Bausteine nachladen:

```bash
git clone --branch plant --single-branch --depth 1 https://github.com/working-on-democracy/ar-module-template.git pflanze
cd pflanze
npm install
```

Was hier passiert:
- `git clone …` legt einen neuen Ordner `pflanze` an und lädt den Code hinein.
- `cd pflanze` wechselt in diesen Ordner. Alle weiteren Befehle laufen dort.
- `npm install` lädt die Bausteine nach, die die Sandbox braucht, etwa das
  Programm für die 3D-Darstellung. Das dauert ein paar Minuten.

## Starten

Wenn du das Terminal neu geöffnet hast, zuerst wieder in den Ordner wechseln
(`cd Documents/pflanze`). Dann:

```bash
npm run sandbox
```

Damit läuft die Sandbox auf deinem Rechner, wie eine kleine Webseite, die nur du
erreichst. Öffne im Browser **http://localhost:5180**. „localhost“ heißt: dein
eigener Rechner. Die Seite dort heißt **Viewer**: Sie zeigt die Pflanze in 3D und
ist der Ort, an dem du pflanzt und zusiehst.

Das Terminal bleibt dabei offen, dort steht, was die Sandbox gerade tut. Beenden
mit `Strg+C` (auf dem Mac `ctrl+C`).

Eine neue Pflanze beginnt immer mit einem Neustart der Sandbox: `Strg+C`, dann
wieder `npm run sandbox`. Deine Objekte bleiben dabei erhalten.

## Objekte erstellen

1. Im Viewer oben rechts auf **Neue Objekte** klicken. Die Objekt-Seite öffnet sich
   in einem neuen Tab.
2. Beim ersten Mal den **Zugangscode** eingeben und speichern. Die Seite zeigt
   danach, wie viele deiner 7 Objekte schon erstellt sind.
3. **Bild zu 3D** oder **Text zu 3D** wählen:
   - Bild: ein Foto von einem einzelnen Gegenstand, möglichst ganz im Bild und vor
     ruhigem Hintergrund.
   - Text: eine kurze Beschreibung eines Gegenstands, etwa „Eine alte grüne
     Gießkanne aus Blech, leicht verbeult“.
4. Einen **Namen** geben. So heißt das Objekt in der Pflanzliste.
5. **Erstellen** klicken. Das Formular ist danach wieder leer, und die Liste
   darunter zeigt, wie weit dein Objekt ist.

Was dann passiert, zeigt die Liste Schritt für Schritt:
- **bei Sloyd:** Sloyd baut das 3D-Modell, meist 2 bis 5 Minuten.
- **Arbeitsfassung:** Die Sandbox vereinfacht das Modell, damit die Pflanze mit
  vielen Objekten flüssig läuft. Danach steht es in der Pflanzliste.
- **Varianten:** Die Sandbox rechnet vor, wie das Objekt später als junger Trieb
  (Keimling) aussieht. Das läuft im Hintergrund, du kannst schon pflanzen.

Für jedes Objekt bezahlen wir Sloyd mit **Credits**, einer Art Guthaben. Ein Objekt
kostet etwa 25 Cent. Deshalb gibt es die Grenze von 7 Objekten pro Code.

**Löschen:** In der Pflanzliste hat jedes neue Objekt oben rechts ein ×. Nach einer
Warnung ist es endgültig weg, mit allen Dateien. Solange Sloyd oder die
Arbeitsfassung noch läuft, geht das nicht. Ein gelöschtes Objekt zählt weiter zu
den 7 eines Codes, denn bezahlt ist es schon. Das Team kann den Zähler auf der
Verwaltungsseite zurücksetzen.

## Pflanzen

Sobald 3 deiner Objekte fertig sind, kannst du pflanzen. Zurück im Viewer-Tab
erscheinen sie von selbst in der Liste.

1. Ein Objekt aus der Liste wählen.
2. Eine durchsichtige Kopie steht in der Mitte der Ansicht auf dem Boden. Grün
   heißt: Hier darf es stehen. Rot: zu nah an einem anderen oder mehr als 0,5 m
   weg.
3. Die Ansicht bewegen: W A S D, Q / E nach unten / oben, rechte Maustaste dreht
   die Ansicht. Größe mit dem Mausrad, drehen durch Ziehen mit der linken
   Maustaste.
4. **Platzieren**, dann **Bestätigen** und **Ja, pflanzen**.
5. Weitere Objekte genauso. Ab 3 Objekten **Pflanze starten**, nach dem 5. startet
   sie von selbst.

Auf dem Handy wird später genauso gepflanzt, nur mit Fingern statt Maus. Mehr dazu
steht im Leitfaden [Pflanzmodus](PFLANZMODUS.md).

## Die Pflanze beobachten

- Links stehen die **Phase** (der Lebensabschnitt der Pflanze, etwa Wachstum, Abstieg oder
  Verfall), der Kalendertag und die Ereignisse.
- Unter **Steuerung** lässt sich das Tempo erhöhen, etwa auf „1 Tag/min“: Dann
  vergeht in einer Minute ein Tag der Pflanze, und es passiert mehr.
- **Vorschau** (oder Taste P) blendet alles außer der Pflanze aus. Esc beendet sie.
- Beim Start speichert der Browser eine Datei `pflanzung-….json` in deine
  Downloads. Sie enthält alles, was deine Pflanze ausmacht. Mit ihr lässt sich
  genau dieselbe Pflanze später noch einmal starten:
  `npm run sandbox -- --values ~/Downloads/pflanzung-….json`

## Wenn etwas nicht klappt

| Was passiert | Was hilft |
| --- | --- |
| „command not found“ oder „nicht erkannt“ | Git oder Node.js fehlt, siehe „Was du brauchst“ |
| „Die Sandbox braucht Node.js 20.12 oder neuer“ | Node.js von https://nodejs.org neu installieren |
| „no such file“ oder `npm` findet nichts | Du bist nicht im Ordner `pflanze`: `cd Documents/pflanze` |
| Port 5180 ist belegt (eine andere Sandbox läuft schon) | `npm run sandbox -- --port 5181`, dann http://localhost:5181 |
| „Unbekannter Zugangscode“ oder „gesperrt“ | Code genau abschreiben, sonst beim Workshop-Team melden |
| „Mit diesem Zugangscode sind schon 7 … erstellt“ | Das war das Kontingent. Das Team kann es erhöhen. |
| Ein Objekt steht auf „Fehler“ | Die Meldung in der Liste lesen. Bei „Credits“ das Team ansprechen, sonst einfach neu erstellen. |
| Die Pflanzliste ist leer | Erst 3 eigene Objekte erstellen, siehe oben |

Alles, was du erstellst, liegt im Ordner `pflanze` unter `sandbox-objects/`, deine
Pflanzen unter `sandbox-runs/`. Beides bleibt auf deinem Rechner.

## Für das Team

### Wie die Zugangscodes funktionieren

Wer bei Sloyd ein Modell bestellt, braucht einen **Sloyd-Schlüssel**, eine Art
Passwort für unser Sloyd-Konto. Mit ihm kann man unbegrenzt auf unsere Kosten
bestellen, deshalb bekommen ihn die Teilnehmenden nicht. Ihre Sandboxen schicken
die Bestellung stattdessen an einen **Vermittler**: ein kleines Programm im
Internet, das den Schlüssel kennt. Der Vermittler prüft den Zugangscode, zählt mit
und gibt die Bestellung erst dann an Sloyd weiter. Er legt auch die Qualität fest
(20 000 Flächen, Textur mit 2048 Pixeln), damit jedes Objekt gleich viel kostet.

Wer im Team den Sloyd-Schlüssel selbst in der Datei `.env.local` im Projektordner
hat, braucht keinen Code und hat keine Grenze.

Später übernimmt der Server der Plattform die Aufgabe des Vermittlers.

### Codes verwalten

Die Codes verwaltet die Admin-Seite des Vermittlers:
**https://pflanze-sloyd.workingondemocracy.workers.dev/admin**, angemeldet mit dem
Admin-Passwort. Dort lassen sich:

- Codes anlegen, einzeln oder viele auf einmal, mit Bezeichnung (etwa
  „Workshop Oktober“). Rolle **Teilnehmer**: höchstens 7 Objekte (einstellbar),
  gepflanzt werden nur eigene. Rolle **Admin**: ohne Begrenzung, gepflanzt wird
  alles (eigene Objekte und die 8 Startmodelle, die im Projekt liegen).
- Codes sperren und entsperren, ein Objekt mehr erlauben, den Zähler
  zurücksetzen und Codes löschen.
- sehen, wie viele Objekte jeder Code erstellt hat und was das ungefähr an
  Credits gekostet hat.

### Der Vermittler technisch

Der Vermittler ist ein **Cloudflare Worker**. Cloudflare ist ein Anbieter, bei dem
kleine Programme im Internet laufen, ohne dass wir einen eigenen Server betreiben;
ein Worker ist so ein Programm. Unserer heißt `pflanze-sloyd`, läuft im
Cloudflare-Konto von working on democracy unter
https://pflanze-sloyd.workingondemocracy.workers.dev, und sein Code liegt im
Projekt im Ordner `proxy/`. Die Codes speichert er in **Cloudflare KV**, einem
einfachen Datenspeicher von Cloudflare.

Eingerichtet ist er schon. Geändert wird er mit **wrangler**, dem
Befehlszeilen-Werkzeug von Cloudflare, im Terminal im Ordner `proxy/`:

```bash
npx wrangler login                          # im Browser beim Cloudflare-Konto anmelden
npx wrangler kv namespace create CODES      # nur beim ersten Mal: den Datenspeicher anlegen, die id in wrangler.toml eintragen
npx wrangler secret put SLOYD_CLIENT_ID     # die Geheimnisse hinterlegen, jeweils den Wert eingeben
npx wrangler secret put SLOYD_CLIENT_SECRET
npx wrangler secret put ADMIN_PASSWORD
npx wrangler deploy                         # den Code aus proxy/ hochladen
```

Die Adresse des Vermittlers steht in `sandbox/objects/access.ts`
(`DEFAULT_PROXY`). So finden alle Sandboxen ihn ohne eigene Einstellung. Für Tests
geht eine andere Adresse mit der Umgebungsvariable `PLANT_PROXY_URL`.

Kosten: Das kostenlose Angebot von Cloudflare reicht weit (100 000 Anfragen und
1 000 Schreibvorgänge im Datenspeicher am Tag). Was zählt, sind die Sloyd-Credits.
