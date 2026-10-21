# Pflanze: Aufgaben für den Admin

Stand: 21. Oktober 2026. Online-Fassung zum Kommentieren:
https://claude.ai/artifact/KoFCGVuWSXaCxviELw37uu

Was auf dem Uberspace der Plattform zu tun ist, damit die Pflanze dort laufen kann, wichtigstes zuerst. Hintergrund und Begründungen stehen
in [Technische Voraussetzungen](TECHNISCHE-VORAUSSETZUNGEN.md).

## 1. Zuerst: Laufen die Skripte auf dem Server?

Davon hängt alles andere ab. Der Server hat glibc 2.17, das native `sharp` braucht
2.26, und alle GLB-Skripte laden `sharp`. Getestet wird die WebAssembly-Variante,
auf die `sharp` von selbst ausweicht.

- [ ] Testordner anlegen, getrennt von der laufenden Plattform:

```bash
git clone --single-branch --depth 1 -b plant https://github.com/working-on-democracy/ar-module-template.git ~/plant-test
cd ~/plant-test
npm install
npm install --cpu=wasm32 sharp
node -e 'require("sharp"); console.log("sharp ok")'
```

- [ ] Jedes Skript einmal laufen lassen und Zeit und Speicher notieren (die Testmodelle liegen im
  Repo unter `sandbox/models/`):

```bash
T='/usr/bin/time -v'; A=sandbox/models/flamingo-3d.glb; B=sandbox/models/tarot-figur-3d.glb
$T npx tsx scripts/stylize-glb.ts $A --faces 1500 --texture 128 --saturation 1.3 --no-compress --out s.glb
$T npx tsx scripts/glb-reduce.ts s.glb --target 700 --out r.glb
$T npx tsx scripts/glb-reduce.ts s.glb --target 20 --permissive --prune --force --out f.glb
$T npx tsx scripts/glb-split.ts s.glb --seed 3 --out half
$T npx tsx scripts/glb-texture-crush.ts s.glb --format jpeg --quality 2 --passes 3 --saturation 1.5 --out c.glb
$T npx tsx scripts/glb-fuse.ts s.glb $B --mode hart --seed 4 --repair --out h.glb
$T npx tsx scripts/glb-fuse.ts s.glb $B --mode weich --seed 5 --repair --out w.glb
$T npx tsx scripts/glb-fuse.ts s.glb r.glb --mode voxel --voxel-cells 12 --out v.glb
```

- [ ] Ergebnis zurückmelden: welche Skripte laufen, Laufzeit, höchster Speicher
  („Maximum resident set size“). Zum Vergleich auf dem Mac: 2 bis 4 Sekunden je
  Skript, die weiche Verschmelzung 34 Sekunden.
- [ ] Dasselbe mit Node 22 wiederholen. Achtung: `uberspace tools version use node 22`
  gilt für das ganze Konto, also nach dem nächsten Neustart auch für den Backend-Dienst.
  Danach wieder auf 20 stellen oder bewusst wechseln.

Für das Klonen braucht das Konto Lesezugriff auf das Repo. Fehlt `/usr/bin/time`,
reicht das eingebaute `time` für die Laufzeit.

**Falls `sharp` auch als WebAssembly nicht lädt:** Die Pflanze ruft keine
`sharp`-Funktion auf, die Skripte laden es nur mit. Ein Platzhalter-Paket reicht
dann, lokal so getestet. Es fehlt nur WebP für die Auslieferung, dann gibt es PNG-
und JPEG-Texturen.

- [ ] Platzhalter anlegen und `sharp` im Testordner durch ihn ersetzen:

```bash
mkdir -p ~/plant-test/shims/sharp && cd ~/plant-test/shims/sharp
echo '{ "name": "sharp", "version": "0.0.0-stub", "main": "index.js" }' > package.json
echo 'module.exports = function sharp() { throw new Error("sharp is not available on this server"); };' > index.js
cd ~/plant-test && rm -rf node_modules/sharp && cp -R shims/sharp node_modules/sharp
```

- [ ] Die Skripte von oben noch einmal laufen lassen. Alle sollen durchlaufen. Nur
  `glb-texture-crush --format webp` darf mit „sharp is not available“ scheitern.
- [ ] Für den Dauerbetrieb den Platzhalter in der `package.json` des Servers
  eintragen, damit `npm install` ihn nicht überschreibt: als Abhängigkeit
  `"sharp": "file:./shims/sharp"` und dazu `"overrides": { "sharp": "$sharp" }`. So
  zeigt auch `@gltf-transform/functions` auf den Platzhalter. Lokal in einem leeren
  Projekt geprüft.

Scheitert auch das, braucht der Rechendienst einen anderen Rechner oder einen
Container mit neuerem System. Dann bitte melden, bevor weiter gebaut wird.

## 2. Vor dem Bauen klären

- [ ] Plattenkontingent des Kontos nachsehen. Ohne Aufräumen braucht ein
  Lebenszyklus 0,3 bis 1,2 GB.
- [ ] Ob Uberspace für ein Konto Grenzen bei Arbeitsspeicher oder Rechenzeit setzt,
  und was bei 3 gleichzeitigen Skripten passiert.
- [ ] Speicherorte festlegen: Arbeitsdateien außerhalb von `~/html` (Vorschlag
  `~/plant-data/`), Auslieferung unter `~/html/plant/`. Nicht in MongoDB, sonst
  greift die 7-GB-Grenze, die Fotos und Zeichnungen löscht.
- [ ] Node-Version für das ganze Konto festlegen. Node 20 bekommt seit April 2026
  keine Updates mehr.

## 3. Beim Einrichten

- [ ] supervisor-Dienst für die Pflanze, getrennt vom Backend-Dienst, mit
  `autorestart=yes`, etwa `~/etc/services.d/plant.ini`.
- [ ] Die Skripte im Rechendienst mit `nice` starten, höchstens 2 bis 3
  gleichzeitig, Zeitlimit 15 Minuten.
- [ ] Ordner für den gemeinsamen Zwischenspeicher der Verschmelzungen anlegen, etwa
  `~/plant-data/fuse-cache`.
- [ ] Neue Werte in `.env`: Speicherort der Modelle, Zahl der gleichzeitigen
  Skripte, Zeitlimit, Speichergrenze für Modelle.
- [ ] Die Abfrage `plantNearby` im Backend genau in der Form aus
  [SCHNITTSTELLEN.md](SCHNITTSTELLEN.md) bauen. Dort steht auch, wie der Rechendienst
  Aufträge und Ergebnisse austauscht, falls er auf einen anderen Rechner muss.
- [ ] `deploy.sh` um den neuen Dienst erweitern. Backend und Frontend weiter
  zusammen ausliefern, weil das GraphQL-Schema neue Felder bekommt.
- [ ] `~/plant-data` in die Datensicherung aufnehmen, falls es eine gibt.

## 4. Im Betrieb

- [ ] Überwachung: eine Meldung, wenn die Uhr der Pflanze länger als einige Minuten
  auf ein Ergebnis wartet oder Jobs gehäuft scheitern.
- [ ] Aufräumen: Modelldateien, die kein lebendes Objekt mehr braucht, nach einer
  Schonfrist löschen. Die Regel kommt aus der Pflanze, der Admin prüft, ob der Platz
  wirklich frei wird.
- [ ] Plattenplatz regelmäßig ansehen, solange es keine Erfahrungswerte gibt.

## Noch nicht Sache des Admins

Wiederaufnahme nach Neustart, Gerätezählung, Vorbereitung der Keimling-Varianten,
Verbindung zur Foto-Moderation und das Löschen am Ende einer Pflanze müssen erst
gebaut werden. Sie stehen in [Technische Voraussetzungen](TECHNISCHE-VORAUSSETZUNGEN.md)
und in [`SERVER-OFFENE-PUNKTE.md`](../SERVER-OFFENE-PUNKTE.md).
