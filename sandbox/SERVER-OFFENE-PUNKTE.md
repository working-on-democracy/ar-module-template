# Offene Punkte für die Server-Fassung der Pflanze

Stand 2026-10-24. Die Sandbox (`sandbox/`) simuliert die Pflanze auf einem
lokalen Server. Die Liste sammelt, was sie noch nicht abdeckt und was die
Plattform-Fassung braucht.

Ausführlicher, mit dem Stand des Servers: [docs/TECHNISCHE-VORAUSSETZUNGEN.md](docs/TECHNISCHE-VORAUSSETZUNGEN.md),
die Schritte für den Admin: [docs/ADMIN-AUFGABEN.md](docs/ADMIN-AUFGABEN.md).

## Zuerst testen

**`sharp` als WebAssembly-Variante auf dem Uberspace.** Der Server läuft auf
CentOS 7 mit glibc 2.17, die nativen Pakete von `sharp` brauchen 2.26. Alle
GLB-Skripte laden `sharp` beim Start, über `@gltf-transform/functions`, auch
wenn sie keine Bilder bearbeiten. Auf dem Server `npm install --cpu=wasm32
sharp` und jedes Skript einmal laufen lassen (`glb-fuse` hart, weich und
voxel, `glb-reduce` auch erzwungen, `glb-split`, `stylize-glb`,
`glb-texture-crush`). Lokal mit ausgeblendetem nativem `sharp` getestet
(2026-10-21), auf dem Server nicht. Das muss der Admin vor allem anderen prüfen.
Scheitert es, reicht ein Platzhalter-Paket für `sharp` (`file:./shims/sharp` plus
`"overrides": { "sharp": "$sharp" }`), weil die Pflanze seit der Umstellung auf
`jimp` keine `sharp`-Funktion aufruft. Lokal getestet, es fehlt nur WebP. Erst wenn
auch das scheitert, muss der Rechendienst auf einen anderen Rechner.

## Schon abgesichert

- Ein gescheiterter Job lässt die Objekte unverändert. Ein Verschmelzungspaar
  löst sich auf, und eine gescheiterte Kopie entsteht nicht
  (`jobFailed` in `sim/world.ts`).
- Ein Skript, das hängt, wird nach 15 Minuten abgebrochen und zählt als
  gescheitert (`SCRIPT_TIMEOUT_MS` in `runner/jobs.ts`).
- Ein verwelkendes Objekt stirbt vorzeitig, wenn 3 seiner Vorgänge gescheitert
  sind. Ein Ursprungsobjekt stirbt auch dann mit dem Ökosystem, wenn seine
  letzte Komprimierung 3-mal scheitert (`maxJobFailures`).
- Kleine Objekte, die sich kaum noch komprimieren lassen, werden erzwungen
  komprimiert (`--permissive --prune --force`). Erst wenn auch das nichts
  bringt, sterben sie vorzeitig.
- Jeder Lauf wird aufgezeichnet (`tape.jsonl`) und lässt sich exakt wieder
  abspielen. Prüfsummen zeigen an, wenn die Wiedergabe abweicht.

## Offen

1. **Neustart und Absturz.** Der Zustand wird alle 5 s in `state.json`
   geschrieben, aber beim Start nicht wieder geladen. Nach einem Neustart ist
   ein Lauf verloren. Möglicher Weg: die Aufzeichnung bis zum letzten Stand
   abspielen und dann live weiterlaufen lassen. Dafür müssen auch die
   Modelldateien erhalten bleiben. Das ist der wichtigste Punkt.
2. **Ergebnisse prüfen.** Ein Modell, das sich lesen lässt, aber unbrauchbar
   ist (leer, riesig, kaputte Maße, keine Textur), wird übernommen. Nötig ist
   eine Prüfung vor dem Übernehmen, die so ein Ergebnis wie einen gescheiterten
   Job behandelt.
3. **Abbruch während einer Reise.** Scheitert eine Verschmelzung, während das
   wandernde Objekt schon unterwegs ist, springt es an seinen Platz zurück. Es
   sollte stattdessen dort stehen bleiben, wo es gerade ist, oder langsam
   zurückgleiten.
4. **Wiederholen statt aufgeben.** Ein gescheiterter Job wird nicht wiederholt.
   Bei vorübergehenden Fehlern (Speicher, Netz, Neustart) wäre ein zweiter
   Versuch sinnvoll, bevor das Objekt unverändert bleibt.
5. **Speicherplatz.** Jeder Schritt schreibt eine neue GLB-Datei. Es gibt keine
   Prüfung, ob genug Platz frei ist, und keine Aufräumregel für Dateien, die
   kein Objekt mehr braucht.
6. **Überwachung.** Häufen sich Fehler, merkt das niemand. Es braucht eine
   Meldung an die Betreuer (Fehlerquote, wartende Uhr, hängende Jobs).
7. **Wartende Uhr.** Die Uhr wartet auf fällige Ergebnisse. Auf dem Server
   darf das nicht dazu führen, dass eine Pflanze unbemerkt stehen bleibt. Das
   Zeitlimit für Skripte deckt nur hängende Skripte ab, keinen ausgefallenen
   Rechendienst.
8. **Ende der Pflanze.** Wenn die Ursprungsobjekte unter die Todesgrenze fallen,
   ist das Ökosystem vergangen. Ob dann alle zugehörigen Daten gelöscht werden
   (Modelle, Fotos, Zeichnungen, Aufzeichnung), steht noch nicht fest.
9. **Geräte zählen.** Die Sandbox zählt Geräte über einen Knopf. Auf dem Server
   muss festgelegt werden, was als Hinschauen zählt: im Radius, mit offener
   App, wie lange. Davon hängen die Pause der Boosts nach 3 Tagen und die Verlangsamung auf 0,5 nach 7 Tagen ab.
   Vorschlag: Jede Abfrage `plantNearby` zählt als Hinschauen, mit einer anonymen
   Kennung pro Sitzung, die einige Minuten gilt (siehe `docs/SCHNITTSTELLEN.md`).
10. **Mehrere Pflanzen.** Die Sandbox rechnet eine Pflanze mit 3 Jobs
    gleichzeitig. Mehrere Pflanzen teilen sich Rechenzeit, die Reihenfolge der
11. **Keimling-Varianten vorbereiten.** Zwischen Erstellen (Sloyd) und Pflanzen
    vergeht Zeit. Darin lassen sich alle Varianten einer Linie rechnen:
    Arbeitsfassung des Ursprungsobjekts (höchstens 7 500 Dreiecke), die
    Vorläufer-Varianten (Phase 2 mit 1 500 und 1 275, Voxel 24 vom Ursprung),
    Generation 1 (Phase 2), Generation 2 (Reduktion), Generation 3 bis 8 (Voxel
    24 bis 1, jede aus der vorigen), danach die Fuse-Vorbereitung jeder
    Variante. Frühe Generationen zuerst. Größe, Neigung und Leuchtfarbe sind
    Werte der Simulation, deshalb reicht eine Datei pro Generation. Eine Kopie
    wird dann zum Nachschlagen, die Uhr wartet am Anfang nicht mehr. Wird
    vor dem Ende der Vorbereitung gepflanzt, wird vorgezogen, was die
    Simulation braucht. Kopien mit einem Elternteil, das nicht die vorige
    Generation ist, bleiben normale Jobs. In der Sandbox ist das umgesetzt: Jeder
    Kopierschritt (Phase 2, Reduktion, Voxel) landet in einem Cache, geschlüsselt
    nach dem Inhalt der Eingabedatei und dem Schritt mit seinen Einstellungen
    (`sandbox-runs/copy-cache`, `runner/jobs.ts`). Die Objekt-Seite rechnet die
    Varianten neuer Objekte damit vor (`sandbox/objects/workshop.ts`, nur wenn der
    Lauf gerade nichts rechnet), und jeder Lauf schaut zuerst dort nach. Die
    Startmodelle füllen ihn beim ersten Lauf. Der Server braucht dasselbe.
12. **Sloyd-Rohdatei löschen.** Bei Objekten über 7 500 Dreiecken kann die
    Rohdatei (0,8 bis 1,7 MB) nach der Vorbereitung weg. Ab dann ist die
    Arbeitsfassung mit 7 500 Dreiecken das Ursprungsobjekt: Sie steht in der
    Pflanze und wird im Abstieg komprimiert. Objekte mit höchstens 7 500
    Dreiecken werden nicht reduziert, ihre Rohdatei bleibt.
13. **Pflanzabstand begrenzen.** Die Pflanzszene lässt jedes Objekt höchstens
    0,5 m (Kante zu Kante) vom nächsten pflanzen (`originMaxGap`), und die Sandbox
    prüft eine Pflanzung beim Empfang noch einmal (`checkPlanting` in
    `sandbox/planting/rules.ts`). Der Server der Plattform muss dieselbe Prüfung
    machen. Die 6 m von `originMaxSpread` bleiben nur als Notlösung.
14. **Pflanzung annehmen und speichern.** Die Sandbox nimmt die Pflanzung über
    `POST /api/planting` an (Form in `docs/SCHNITTSTELLEN.md`) und startet damit
    den Lauf. Wohin der Server eine Pflanzung speichert, woher später die
    pflanzbaren Objekte kommen (heute die 8 Startmodelle) und wie sie in die
    Datenbank kommen, ist offen.
15. **Absoluter Maßstab in der App.** Die Pflanze rechnet in Metern mit dem Boden
    bei y = 0. Die AR-Testfassung startet 8th Wall deshalb mit
    `scale: "absolute"`. Die Host-App nutzt heute den responsiven Maßstab, dort
    hängt die Größe einer Einheit von der Höhe des Telefons beim Start ab. Für die
    Pflanze braucht die App den absoluten Maßstab, oder sie rechnet um.
16. **Kommentare anbinden.** Die Sandbox erzeugt Kommentare aus einer Liste von
    Beispieltexten. Auf dem Server liest die Pflanze die Textbeiträge (`Post`) im
    Umkreis aus der Datenbank, wie Fotos und Zeichnungen, und braucht von der
    Moderation, wenn einer gesperrt oder gelöscht wird. Wie lange ein Beitrag lebt,
    rechnet die Plattform aus Gebiet und Votes (`src/utils/expiry.ts`); die Sandbox
    nimmt pauschal 14 Kalendertage.
17. **Zugangscodes und Rechte.** Für den Workshop gibt es Zugangscodes
    (`proxy/`, Anleitung in `docs/WORKSHOP.md`): Ein Teilnehmer-Code erstellt
    höchstens 7 Objekte und pflanzt nur eigene, ein Admin-Code hat keine Grenze
    und pflanzt alles. Der Sloyd-Schlüssel liegt nur beim Vermittler. Der Server
    der Plattform braucht dasselbe: Codes mit Rolle, Kontingent und Sperre, eine
    Verwaltung dafür, Objekte, die einem Code gehören, und eine Pflanzliste je
    nach Rolle (eigene Objekte oder die ganze Datenbank).
18. **Boden verdecken in der App.** Teile eines Objekts unter dem Boden (beim
    Wachsen und Einsinken) muss die App verdecken: eine unsichtbare Fläche auf
    Bodenhöhe, die nur Tiefe schreibt und vor den Objekten gezeichnet wird
    (`docs/SCHNITTSTELLEN.md`, so in `src/ArModule.vue`). Dazu werfen die Objekte
    Schatten auf eine Schattenfläche am Boden. Das Schattenlicht der Host-App
    reicht nur ±5 m um den Ursprung und bis etwa 1,5 m Höhe; ob das für die
    Pflanze genügt oder der Admin den Schattenausschnitt vergrößert, ist offen.
    Die Host-App hat beides noch nicht für die Pflanze.
