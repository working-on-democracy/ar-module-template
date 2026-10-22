# Phasen der Pflanze

Stand: 22. Oktober 2026. Online-Fassung zum Kommentieren:
https://claude.ai/artifact/RNvesde8hFhazDVdYV9fHN

## Überblick

Eine Pflanze lebt im Median rund 40 Kalendertage, in vier Phasen. Das Wachstum ist
kurz, Plateau und Abstieg dauern je etwa 9 Tage, der Verfall rund 15. Wie lange
genau, hängt vom Zeitfaktor ab, also davon, wie oft jemand hinschaut und Inhalte
beiträgt.

Kalendertage, Median über 10 Seeds im Standardszenario:

| Phase | von Tag | bis Tag | wichtigste Vorgänge |
| --- | --- | --- | --- |
| Wachstum | 0 | 4,2 | Vorläufer und Eröffnung kurz nach dem Pflanzen, Keimlinge entstehen |
| Plateau | 4,2 | 13,4 | Keimlinge füllen auf, verstärkte Komprimierung |
| Abstieg | 13,4 | 22,7 | stetige Komprimierung, ab Tag 16,1 Halbieren |
| Verfall | 22,7 | 37,4 | häufige Komprimierung, Sterben, Ende |

Im Code heißen die Phasen `wachstum`, `plateau`, `abstieg`, `verfall` und `ende`.
Das Halbieren ist ein Abschnitt des Abstiegs, der beginnt, sobald die Dreiecke unter
73 % des Budgets fallen. Die Phasen gelten für die ganze Pflanze. Vorläufer,
Keimling-Generationen und die schnelle Linie laufen quer dazu und haben unten eigene
Abschnitte.

## Die Transformationen

Jede Veränderung an einem Modell ist ein Rechenjob. Er läuft als Skript auf einer
echten GLB-Datei und schreibt eine neue Datei. Welche Einstellungen ein Job nimmt,
folgt den Schritten der Teststrecke (`sandbox/sim/recipes.ts`). Im
Lebenszyklus-Rechner werden dieselben Jobs nur als Zahlen gerechnet.

| Schritt | Was passiert | Skript | wann |
| --- | --- | --- | --- |
| Phase 2 | Stilisierung: 1 500 Dreiecke, Texturen 128 px, Sättigung 1,3 | `stylize-glb.ts` | erste Generation eines Ursprungsobjekts |
| Kopie | einfache Kopie der Datei | – | Keimling in derselben Generation wie sein Elternteil |
| Reduktion | 85 % der Dreiecke des Elternteils | `glb-reduce.ts` | Keimling der nächsten normalen Generation |
| Phase 5 | Voxelisierung, Raster 24 → 12 → 6 → 3 → 2 → 1 Zellen | `glb-fuse.ts --mode voxel` | Keimlinge ab Generation 3 |
| Phase 3 | harte Verschmelzung, danach höchstens 10 000 Dreiecke | `glb-fuse.ts` + `glb-reduce.ts` | erste Verschmelzung eines Objekts |
| Phase 4 | weiche Verschmelzung, höchstens 10 000 | `glb-fuse.ts` + `glb-reduce.ts` | zweite Verschmelzung |
| Phase 6 | weiche Voxel-Verschmelzung, höchstens 5 000 | `glb-fuse.ts` + `glb-reduce.ts` | Verschmelzung mit einem Voxel-Keimling |
| Phase 7 | weich, neu stilisiert auf 2 500 | `glb-fuse.ts` + `stylize-glb.ts` | dritte Verschmelzung |
| Phase 8 | weich, stilisiert auf 1 000 | `glb-fuse.ts` + `stylize-glb.ts` | vierte Verschmelzung |
| Phase 10 | weich, wenig Überschneidung, ein Viertel der Dreiecke | `glb-fuse.ts` + `glb-reduce.ts` | fünfte und jede weitere |
| Phase 9 | Texturen zerdrückt (JPEG-Qualität 2, 3 Durchgänge) | `glb-texture-crush.ts` | verwelkende Objekte, Ursprungsobjekte im Verfall |
| Phase 11/12 | halbiert, beide Hälften auf die halbe Dreieckszahl | `glb-split.ts` + `glb-reduce.ts` | erste Halbierung eines Objekts |
| Phase 13 | nochmal halbiert und halbiert, Texturen zerdrückt | `glb-split.ts` + `glb-reduce.ts` + `glb-texture-crush.ts` | zweite und dritte Halbierung |
| Phase 13 (Drittel) | halbiert, Hälften auf ein Drittel, Texturen zerdrückt | dieselben | ab der vierten Halbierung |
| Komprimierung | weniger Dreiecke, Aussehen bleibt | `glb-reduce.ts` | ab dem Plateau, in drei Stärken |
| erzwungene Komprimierung | permissiv, lose Teile weg, größte Dreiecke behalten | `glb-reduce.ts --permissive --prune --force` | kleine Objekte, die sich kaum noch komprimieren lassen; letzte Komprimierung der Ursprungsobjekte |

Eine Verschmelzung braucht zwei Jobs mit demselben Startwert. Der erste berechnet
nur die Lage des wandernden Objekts im Ergebnis und ist schnell fertig. Der zweite
rechnet das verschmolzene Modell, während das Objekt schon unterwegs ist. Jedes
Modell wird für die Verschmelzung nur einmal vorbereitet und dann aus dem
gemeinsamen Zwischenspeicher genommen.

Jeder Job hat einen Fälligkeitstermin in Eigenzeit, meist 0,4 Eigentage nach dem
Auftrag, bei weichen Verschmelzungen 2,5. Ist das Ergebnis dann noch nicht fertig,
wartet die Uhr.

## Pflanzen

Die Pflanze beginnt mit fünf Ursprungsobjekten. Sie stehen am Boden, ihre Mitte ist
der Pflanzpunkt, der sich nie mehr ändert.

**Transformationen beim Pflanzen:**

- Ein Ursprungsobjekt mit mehr als 7 500 Dreiecken wird auf 7 500 reduziert
  (`glb-reduce.ts`, bei Texturnähten permissiv).
- Seine längste Seite wird auf 0,2 bis 0,6 m gebracht.
- Die Mitten zweier Ursprungsobjekte liegen höchstens 6 m auseinander. Wurden sie
  weiter auseinander gepflanzt, rücken alle im selben Verhältnis zu ihrer Mitte
  zusammen. Auf der Plattform soll die App so weit auseinander gar nicht erst
  pflanzen lassen.

**Was festgelegt wird:**

- Das Budget hängt von den Dreiecken der Ursprungsobjekte ab: 80 000 bei zusammen
  25 000 Dreiecken. Jedes Dreieck darüber bringt 0,4 Budget dazu, jedes darunter
  nimmt 0,4 weg. Das Budget bleibt immer zwischen 70 000 und 90 000.
- Ab 91,5 % des Budgets beginnt die verstärkte Komprimierung, und das Plateau ist
  erreicht.
- Unter 73 % des Budgets beginnt im Abstieg das Halbieren. Auf dem Weg nach oben
  starten bei derselben Grenze die Voxel-Generationen.
- Die Reihenfolge der Vorläufer wird ausgelost.
- Die drei Magnetpunkte für den Abstieg werden ausgelost: die Ecken eines Dreiecks
  mit zufälligen Winkeln, das alle Ursprungsobjekte umschließt. Seine Kanten bleiben
  mindestens 0,1 m von jedem Ursprungsobjekt weg, und kein Winkel ist kleiner als
  25°. Jede Ecke liegt mindestens 2,5 m vom Pflanzpunkt entfernt und höchstens 3 m
  von der Mitte des nächsten Ursprungsobjekts. Steht ein Ursprungsobjekt weiter als
  1,2 m vom Pflanzpunkt (so weit wie im Standardszenario), wächst diese Grenze um
  1,5 m pro Meter darüber. So bleibt das Dreieck bei eng gepflanzten Objekten etwa
  so groß wie im Standardszenario (Ecken 2,5 bis 4,2 m vom Pflanzpunkt) und wächst
  mit, wenn sie weiter auseinander stehen (bei 6 m Abstand bis rund 11 m). Die
  Auslosung hat eigene Zufallszahlen, der übrige Lauf hängt nicht davon ab.

Die Ursprungsobjekte zählen nicht zum Budget und nicht zum aktiven Ökosystem. Sie
bilden Keimlinge, verschmelzen aber nie und werden erst im Abstieg verändert.

## Vorläufer

Die Vorläufer sind die ersten fünf Keimlinge. Sie sorgen dafür, dass direkt nach
dem Pflanzen etwas Sichtbares passiert: In den ersten Minuten entstehen sie, und
kurz darauf verschmelzen sie miteinander.

**Entstehen:**

- Jedes Ursprungsobjekt bekommt einen Vorläufer, in ausgeloster Reihenfolge, im
  Abstand von 0,67 Eigenminuten (40 Sekunden bei Faktor 1). Der erste entsteht beim
  Pflanzen.
- Sie werden direkt vom Ursprungsobjekt kopiert, je zwei pro Generation: 1, 1, 2,
  2, 3.
- Generation 1: Phase 2 mit 1 500 Dreiecken. Generation 2: Phase 2 mit 85 % davon
  (1 275). Generation 3: Phase 5, Voxel mit 24 Zellen.
- Ihre Ergebnisse werden genommen, sobald sie fertig sind. Bis dahin wartet die
  Uhr.
- Sie stehen dicht beieinander (höchstens 0,2 m Lücke zum nächsten Vorläufer) und
  mindestens 0,5 m von jedem Ursprungsobjekt entfernt. Der erste steht möglichst
  nah am Pflanzpunkt.
- Sie wachsen doppelt so schnell aus dem Boden wie andere Keimlinge.
- Sie bilden selbst keine Kopien.

**Eröffnung**, immer gleich ablaufend:

1. Sobald alle ausgewachsen sind, bilden zwei zufällige Vorläufer ein Paar.
2. Wenn das erste Paar die Hälfte seines Weges hinter sich hat, bilden zwei der
   übrigen ein zweites Paar.
3. Sobald das erste Paar verschmolzen ist, verschmilzt das Ergebnis mit dem letzten
   Vorläufer.

Die Eröffnungsverschmelzungen laufen 32-mal schneller zum Partner als normale
(doppelt für die schnelle Linie, 16-mal für die Eröffnung) und auf einer flacheren
Kurve, damit die Bewegung früh sichtbar wird. Ihre Ergebnisse werden ohne Vorlauf
genommen. Ist ein Partner ein Voxel-Vorläufer, wird es Phase 6.

Erst nach der Eröffnung verschmelzen die Vorläufer auch mit anderen Objekten, und
erst ab Beginn der Eröffnung bilden sich überhaupt freie Paare. Die Vorläufer und
alles, was aus ihnen entsteht, gehören zur schnellen Linie.

## Keimling-Generationen

Jede Linie (ein Ursprungsobjekt mit allen seinen Nachkommen) bildet Keimlinge in bis
zu acht Generationen. Generation 1 und 2 sind normale Kopien, ab Generation 3
werden sie voxelisiert, jede Generation mit einem gröberen Raster bis zum einzelnen
Würfel.

| Generation | Transformation | Dreiecke etwa | Größe gegenüber dem Ursprungsobjekt | Neigung bis | Leuchtstärke |
| --- | --- | --- | --- | --- | --- |
| 1 | Phase 2 vom Ursprungsobjekt | 1 500 | × 1,15 | 0° | 0,02 |
| 2 | Reduktion auf 85 % des Elternteils | 1 275 | × 1,32 | 3° | 0,04 |
| 3 | Phase 5, 24 Zellen | 2 400 | × 1,52 | 6° | 0,06 |
| 4 | Phase 5, 12 Zellen | 600 | × 1,64 | 9° | 0,08 |
| 5 | Phase 5, 6 Zellen | 150 | × 1,70 | 12° | 0,10 |
| 6 | Phase 5, 3 Zellen | 40 | 5–30 % kleiner als Gen. 5 | 15° | 0,12 |
| 7 | Phase 5, 2 Zellen | 17 | wieder 5–30 % kleiner | 18° | 0,12 |
| 8 | Phase 5, 1 Zelle (ein Würfel) | 12 | wieder 5–30 % kleiner | 21° | 0,12 |

Ein Keimling derselben Generation wie sein Elternteil ist eine einfache Kopie der
Datei.

**Normale Generationen (1 und 2)** entstehen nach einer Rate: Jede Linie bildet
etwa 1,5 Keimlinge pro Eigentag, mit ±50 % Zufall im Abstand. Das Elternteil wird
aus den ausgewachsenen Keimlingen der Linie gelost, spätere Generationen werden
häufiger gewählt. Ob der neue Keimling die nächste Generation wird, ist am Anfang zu
15 % so und nach 8 Eigentagen sicher. Die erste Kopie jeder Linie wird genommen,
sobald sie fertig ist, wie bei den Vorläufern.

**Voxel-Generationen (3 bis 8)** folgen einem Zeitplan. Sie beginnen, sobald die
Dreiecke im Wachstum über 73 % des Budgets steigen, spätestens mit dem Plateau.
Danach bekommt jede Linie eine Kopie pro Voxel-Generation, gleichmäßig verteilt,
und der letzte Würfel entsteht 5,3 Eigentage nach dem Beginn. Elternteil ist ein
Mitglied der Generation davor.

**Für alle Keimlinge gilt:**

- Neue Keimlinge entstehen nur, wenn ihre geschätzten Dreiecke ins Budget passen,
  im Plateau nur unter 93 % des Budgets. Voxel-Keimlinge dürfen die 93 %
  überschreiten, das Budget nicht.
- Abstand zum Elternteil: 0,4 m + 0,2 m je Generation + zufällig bis 0,4 m.
- Größe: Die Werte der Tabelle gelten vor dem Zufall von ±15 %. Ab der ersten
  Voxel-Generation halbiert sich das Wachstum je Generation, ab Generation 6 werden
  sie kleiner. Erlaubt sind 0,05 bis 0,75 m längste Seite, nach oben ab Generation 2
  etwas mehr.
- Sie wachsen über 0,67 Eigentage aus dem Boden, von halber bis voller Größe.
- Jeder bekommt eine zufällige reine Leuchtfarbe.
- Mit 4 % Chance gehört ein neuer Keimling zur schnellen Linie, und seine Kopien
  erben das.
- Ausgewachsene Keimlinge können schon verschmelzen. Wenn die Keimlingsphase endet,
  werden alle übrigen aktiv.

## Wachstum

Das Wachstum dauert vom Pflanzen, bis die Dreiecke 91,5 % des Budgets erreichen, im
Median etwa 4,2 Kalendertage. Wird diese Grenze nie erreicht, endet die
Keimlingsphase nach 16,7 Eigentagen.

**Was entsteht:**

- die Vorläufer und ihre Eröffnung
- Keimlinge der normalen Generationen nach der Rate, solange das Budget es zulässt
- ab 73 % des Budgets die Voxel-Generationen nach ihrem Zeitplan

**Was verschmilzt:**

- Jedes ausgewachsene Objekt wählt mit 7,5 % Chance pro Eigentag den nächsten
  freien Partner in seiner Reichweite (2 m plus halbe Diagonale). Das niedrigere
  Objekt wandert zum höheren und wächst dabei auf dessen Höhe, höchstens auf das
  Vierfache. Der Weg dauert etwa 0,4 Eigentage, mindestens aber so lange wie der
  Rechenvorlauf, bei weichen Verschmelzungen also 2,5 Eigentage.
- Eine Kette sorgt dafür, dass jeder Schritt der Teststrecke vorkommt: Ein Objekt
  verschmilzt alle 0,67 Eigentage erneut, bevorzugt mit einem noch nie
  verschmolzenen Partner, bis es fünf Verschmelzungen hat (Phase 3, 4, 7, 8, 10).
- Zur Mitte der Voxel-Zeit verschmilzt ein Voxel-Keimling mit seinem nächsten
  normalen Partner (Phase 6), damit auch dieser Schritt vorkommt.

**Was sich bewegt:**

- Verschmolzene Objekte wachsen um 4 % pro Eigentag, bis sie das 1,5-fache ihrer
  Größe nach der Verschmelzung erreichen.
- Verschmolzene Objekte mit gleich vielen Verschmelzungen ziehen sich langsam an,
  bis sie sich fast berühren.
- Mit jeder Verschmelzung steigt das Ergebnis etwa 0,3 m höher als der höhere
  Partner.

## Plateau

Das Plateau beginnt, wenn die Dreiecke 91,5 % des Budgets erreichen, und hält 10,7
Eigentage. Im Median liegt es zwischen Kalendertag 4,2 und 13,4.

**Was sich gegenüber dem Wachstum ändert:**

- Neue normale Keimlinge entstehen nur noch, solange die Dreiecke unter 93 % des
  Budgets liegen. Sie füllen auf, was durch Verschmelzen und Komprimieren verloren
  geht.
- Die Voxel-Generationen laufen nach ihrem Zeitplan weiter bis zum Würfel.
- **Verstärkte Komprimierung:** Solange die Dreiecke über 91,5 % liegen, läuft ein
  Zeitkonto. Erreicht es etwa 1 Eigentag (±20 %), wird das größte Objekt auf die
  Hälfte seiner Dreiecke komprimiert (`glb-reduce.ts`), und das Konto beginnt von
  vorn. Das gilt auch später, falls die Grenze noch einmal überschritten wird.
- Jede Komprimierung hebt das Objekt ein Stück an: etwa 6 cm je Halbierung der
  Dreieckszahl, sehr unterschiedlich gestreut, verteilt über etwa 1,5 Eigentage.

Verschmelzen, Kette und Anziehung laufen weiter wie im Wachstum.

Das Plateau endet, wenn seine Zeit um ist und keine Kopie mehr in Arbeit ist und
kein Keimling mehr wächst. Dann werden alle übrigen Keimlinge aktiv, und der Abstieg
beginnt.

## Abstieg

Der Abstieg beginnt, wenn die Keimlingsphase vorbei ist, im Median an Kalendertag
13,4. Es entstehen keine Keimlinge mehr, und die Dreiecke nehmen ab.

**Transformationen:**

- **Stetige Komprimierung:** Alle 0,53 Eigentage wird ein zufälliges Objekt auf 75 %
  seiner Dreiecke komprimiert.
- **Erzwungene Komprimierung:** Lässt sich ein Objekt unter 800 Dreiecken kaum noch
  komprimieren (es behält mehr als 95 %), werden seine Komprimierungen ab dann
  erzwungen. Bringt auch das nichts mehr, stirbt es.
- **Ursprungsobjekte** werden im selben Verhältnis komprimiert, in dem die Dreiecke
  des Ökosystems unter ihren Höchststand fallen, bis knapp über die Todesgrenze. Ein
  neuer Auftrag kommt erst, wenn das Ziel 10 % unter dem jetzigen Stand liegt.
  Bleiben sie an Texturnähten hängen, läuft die Komprimierung permissiv nach.
- Verwelkende Objekte bekommen nach 0,67 Eigentagen einmal zerdrückte Texturen
  (Phase 9).

**Zustandsänderungen:**

- Aktive Objekte unter 800 Dreiecken sind zu klein zum Halbieren und verwelken mit
  85 % Chance pro Eigentag.
- Verwelkende Objekte sterben, sobald sie die Todesgrenze von 1 Dreieck erreichen.
- Verschmelzungen gehen weiter. Die Kette nimmt jetzt jeden normalen Partner und
  gibt auf, wenn keiner mehr da ist.

**Bewegung:**

- Alles, was nicht unterwegs zu einer Verschmelzung ist, driftet mit 0,07 m pro
  Eigentag zum nächsten der drei Magnetpunkte, bis es 0,65 m davon entfernt ist
  (plus halbe Breite). So sammeln sich die Objekte an den drei Ecken des Dreiecks.
- Die Anziehung unter gleich oft verschmolzenen Objekten läuft weiter, bis sie
  verwelken.

## Halbieren

Das Halbieren ist ein Abschnitt des Abstiegs, keine eigene Phase im Code. Es
beginnt, sobald die Dreiecke unter 73 % des Budgets fallen, im Median an
Kalendertag 16,1. Alles aus dem Abstieg läuft weiter.

**Wer halbiert wird:** etwa alle 0,5 Eigentage (±30 %) ein Objekt, und die Abstände
werden kürzer: Sie werden geteilt durch 1 + 0,075 × Eigentage seit Beginn, nach 10
Eigentagen also durch 1,75. Gewählt wird das größte Objekt mit mindestens 800
Dreiecken, Objekte der schnellen Linie zählen dabei doppelt. Die Kette der
Verschmelzungen wird nicht halbiert.

**Halbierungskette:** Damit jeder Schritt vorkommt, wird das erste halbierte Stück
immer wieder halbiert, bis es vier Halbierungen hinter sich hat. Es lebt so lange
weiter, auch wenn es die Todesgrenze erreicht.

**Transformationen**, je nachdem, wie oft das Stück schon halbiert wurde:

| Halbierung | Schritt | Hälften |
| --- | --- | --- |
| 1. | Phase 11/12 | halbe Dreieckszahl |
| 2. und 3. | Phase 13 | halbe Dreieckszahl, Texturen zerdrückt |
| ab 4. | Phase 13 (Drittel) | ein Drittel, Texturen zerdrückt |

`glb-split.ts` schneidet entlang einer zufälligen Ebene. Die Schnittkante bleibt
offen und zackig.

**Was mit den Hälften passiert:**

- Beide verwelken sofort.
- Sie schweben etwa 0,1 m auf (±50 %) und stoßen sich mit 0,07 m pro Eigentag ab,
  schwächer mit der Entfernung, über 1,5 m gar nicht mehr.
- **Wind:** Halbierte Stücke unter 500 Dreiecken driften in alle Richtungen, auch
  auf und ab. Je näher sie der Todesgrenze kommen, desto stärker, bis 1,5 m pro
  Eigentag. Die Richtung wechselt etwa 1,5-mal pro Eigentag. Wer weiter als 4,5 m
  vom Pflanzpunkt weg ist, wird wieder nach innen getrieben.
- Sie sinken nie in den Boden und steigen nie über die Höhengrenze von 3 m.

## Verfall und Ende

Der Verfall beginnt, wenn es nur noch verwelkende Objekte gibt und kein Paar mehr
unterwegs ist, im Median an Kalendertag 22,7. Er dauert etwa 15 Kalendertage, bis
zum Ende an Kalendertag 37,4.

**Transformationen:**

- Komprimierung alle 0,05 Eigentage statt alle 0,53: Ein zufälliges Objekt wird auf
  die Hälfte seiner Dreiecke komprimiert, kleine Objekte erzwungen.
- Halbieren läuft weiter, solange es Objekte mit mindestens 800 Dreiecken gibt.
- Die Ursprungsobjekte werden weiter im Verhältnis komprimiert und bekommen jetzt
  auch zerdrückte Texturen (Phase 9).

**Bewegung:**

- Die Drift zu den Magnetpunkten hört auf.
- Halbierte Stücke stoßen sich doppelt so stark ab.
- Verwelkende Objekte schrumpfen um 2,25 % pro Eigentag, bis auf 70 % ihrer Größe
  bei Beginn des Verfalls.
- Der Wind treibt die kleinen Stücke weiter auseinander.

**Sterben:** Ein Objekt stirbt, wenn es eine dieser Bedingungen erfüllt, in dieser
Reihenfolge geprüft:

1. Es lässt sich weder komprimieren noch halbieren.
2. Es verwelkt und hat die Todesgrenze von 1 Dreieck erreicht.
3. Es verwelkt, und 3 seiner Vorgänge sind gescheitert.

Ein totes Objekt bleibt 1,33 Eigentage sichtbar (±0,5, zufällig je Objekt). In
dieser Zeit sinkt es gleichmäßig, bis seine Oberkante unter dem Boden ist. Im
Viewer wird sein Bodenmarker grau.

**Ende der Pflanze:** Sobald das letzte andere Objekt tot ist, werden noch laufende
Aufträge der Ursprungsobjekte sofort fällig. Jedes Ursprungsobjekt bekommt eine
letzte, erzwungene Komprimierung unter die Todesgrenze, auf die die Uhr wartet, und
stirbt dann mit dem Ökosystem. Scheitert diese Komprimierung dreimal, stirbt es
trotzdem. Wenn kein Objekt, kein Auftrag und kein Paar mehr übrig ist, ist das
Ökosystem vergangen.

## Die schnelle Linie

Die schnelle Linie ist eine Eigenschaft einzelner Objekte, keine Phase. Sie läuft
durch alle Phasen und macht einen Teil der Pflanze lebendiger.

**Wer dazugehört:**

- die fünf Vorläufer
- jedes Objekt, das aus einer Verschmelzung mit einem Objekt der schnellen Linie
  entsteht
- beide Hälften eines halbierten Objekts der schnellen Linie
- jede Kopie eines Keimlings der schnellen Linie (Ursprungsobjekte geben es nicht
  weiter)
- jeder andere neue Keimling mit 4 % Chance

**Was anders ist:**

| Vorgang | schnelle Linie |
| --- | --- |
| Aus dem Boden wachsen | doppelt so schnell |
| Partner wählen | doppelte Rate |
| Weg zum Partner | halb so lang, wenn einer der beiden zur schnellen Linie gehört |
| Halbieren | zählt bei der Auswahl doppelt |
| Zeitfaktor | eigener Faktor: bis zu 20 Fotos und Zeichnungen zählen, Deckel 21 statt 7 |
| erste halbe Stunde | Deckel 30, alle Boosts zählen 8-mal, auch Hinschauen |

Der eigene Zeitfaktor wirkt auf das, was ein einzelnes Objekt tut: aus dem Boden
wachsen, einen Partner wählen, Anziehung, Aufsteigen, Absinken unter der Decke und
Wind. Was die ganze Pflanze betrifft, läuft im normalen Faktor: Phasen,
Komprimierungen, Halbieren, Reisezeit der Paare und die Fälligkeit der Jobs.

Schaut niemand hin, gilt für die schnelle Linie dasselbe wie für alle: nach 3 Tagen
Faktor 1, nach 7 Tagen 0,5.

Die Vorläufer bilden keine Kopien. Andere Keimlinge der schnellen Linie schon.

## Was in allen Phasen läuft

**Zeitfaktor.** Alles hier und in den Phasen läuft in Eigenzeit, die Boosts
beschleunigen sie. Wie, steht in [Zeitmaßstab und Time Boosts](ZEITMASSSTAB-UND-BOOSTS.md).
Die Kalendertage in diesem Dokument sind Mediane über 10 Seeds im Standardszenario
mit Besuchen, Fotos und Zeichnungen.

**Fotos.** Ein Foto im Umkreis von 15 m kann nach einem Kalendertag Wartezeit
genommen werden, mit 50 % Chance pro Eigentag. Das nächste aktive Objekt übernimmt
es und bleibt aktiv. Das Foto wird aus der Richtung, in der es hängt (1,5 m über
dem Boden), auf das Objekt projiziert. Nur was die Projektion direkt trifft, zeigt
das Foto. Was abgewandt ist oder hinter einem anderen Teil liegt, behält die
eigene Textur. Nach einer Verschmelzung wird das Foto neu auf das verschmolzene
Objekt projiziert. Tragen beide Partner ein Foto, behält das Ziel seines, und das
andere kann wieder genommen werden. Beim Halbieren behalten beide Hälften das Foto
mit derselben Projektion, zusammen zeigen sie weiter das ganze Bild. Läuft das Foto ab (nach 14 Kalendertagen) oder wird es gesperrt,
bekommt das Objekt seine eigene Textur zurück.

**Zeichnungen.** Eine Zeichnung wird von einem Objekt in Reichweite angezogen
(Chance 1,2 pro Eigentag), fliegt mit 2,25 m pro Eigentag zu ihm, schrumpft dabei bis
auf die Hälfte und bleibt mit 8–12 % Überschneidung an ihm hängen. Dann übernimmt
sie die Textur des Objekts und bewegt sich mit ihm. Nach 90 Kalendertagen
verschwindet sie.

**Höhen.** Objekte steigen mit Verschmelzungen, Halbierungen und Komprimierungen.
Keine Oberkante kommt über 3 m. Wer an die Grenze stößt, sinkt danach über etwa 3,5
Eigentage um 0,1 bis 0,75 m zurück. Ein Objekt, das zu groß ist, darf bis zu 30 %
seiner Höhe im Boden versinken und schrumpft erst darüber hinaus. Kein Objekt wird
breiter als 2 m.

**Schweben.** Objekte unter 20 000 Dreiecken wippen nach oben, je weniger Dreiecke,
desto stärker und schneller, höher über dem Boden mehr. Das läuft im Viewer in
echten Sekunden und verändert die Simulation nicht.

**Fehler.** Scheitert ein Job, bleiben die Objekte unverändert, und ein Paar löst
sich auf. Die Regeln zum Sterben aus dem Abschnitt Verfall gelten schon ab dem
Abstieg.
