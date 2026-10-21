# Offene Punkte für die Server-Fassung der Pflanze

Stand 2026-10-20. Die Sandbox (`sandbox/`) simuliert die Pflanze auf einem
lokalen Server. Die Liste sammelt, was sie noch nicht abdeckt und was die
Plattform-Fassung braucht.

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
10. **Mehrere Pflanzen.** Die Sandbox rechnet eine Pflanze mit 3 Jobs
    gleichzeitig. Mehrere Pflanzen teilen sich Rechenzeit, die Reihenfolge der
    Jobs muss dann über alle Pflanzen geregelt werden.
