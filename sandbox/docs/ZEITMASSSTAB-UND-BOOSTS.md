# Zeitmaßstab und Time Boosts der Pflanze

Stand: 21. Oktober 2026. Online-Fassung zum Kommentieren:
https://claude.ai/artifact/BiNMahM2fMoUSM5PFsnvJy

## Überblick

Die Pflanze lebt in ihrer eigenen Zeit, der Eigenzeit. Der Zeitfaktor sagt, wie
viele Eigentage in einem Kalendertag vergehen. Bei Faktor 1 laufen beide Uhren
gleich schnell, bei Faktor 4 erlebt die Pflanze an einem Kalendertag vier Tage.

Der Faktor ist ohne Zutun 1. Time Boosts heben ihn an: Fotos und Zeichnungen in der
Nähe, frisch entstandene Inhalte und Geräte, die gerade hinschauen. Schaut lange
niemand hin, fallen die Boosts weg, und nach 7 Tagen sinkt der Faktor auf 0,5.

Der Faktor wird bei jedem Simulationsschritt neu berechnet und sofort, wenn ein
Gerät kommt oder geht oder ein Foto oder eine Zeichnung entsteht. Die Rechnung
steht in `updateFactor` in `sandbox/sim/world.ts`.

## Wie der Zeitfaktor berechnet wird

Der Faktor setzt sich aus einem Grundwert von 1 und drei Boosts zusammen:

```
Faktor = 1 + min(7, Inhalt + Ereignisse) + Hinschauen
```

**Inhalt.** Jedes Foto und jede Zeichnung im Umkreis von 15 m um die Mitte der
Pflanze zählt 0,05. Es zählen höchstens 10 Stück, also höchstens 0,5. Fotos
verschwinden nach 14, Zeichnungen nach 90 Kalendertagen und zählen dann nicht mehr.

**Ereignisse.** Entsteht ein neues Foto oder eine neue Zeichnung im Umkreis, gibt
das einen Stoß von 2. Er läuft über 0,25 Kalendertage (6 Stunden) gleichmäßig auf 0
aus. Mehrere Stöße addieren sich.

**Deckel.** Inhalt und Ereignisse zusammen bringen höchstens 7. Geräte zählen nicht
in diesen Deckel.

**Hinschauen.** Das erste Gerät im Umkreis bringt 3, jedes weitere 1,5: bei 1 Gerät
3, bei 2 Geräten 4,5, bei 3 Geräten 6. Welches Gerät zuerst kam, spielt keine
Rolle, es zählt nur die Anzahl im Moment. Es zählen höchstens 10 Geräte, also
höchstens 16,5. Der Boost gilt nur, solange das Gerät da ist.

**Erste halbe Stunde.** Direkt nach dem Pflanzen zählen Inhalt und Ereignisse
doppelt. Das gilt voll für die ersten 20 Minuten und fällt bis 30 Minuten nach dem
Pflanzen linear auf normal zurück. Hinschauen ist davon nicht betroffen.

Damit liegt der Faktor höchstens bei 1 + 7 + 16,5 = 24,5. Im Alltag ist er meist 1
und steigt bei Besuchen und neuen Inhalten für einige Stunden auf etwa 4 bis 7.

## Die schnelle Linie

Objekte der schnellen Linie haben einen eigenen Zeitfaktor. Dazu gehören die
Vorläufer, alle ihre Nachkommen und jeder neue Keimling, der mit 4 % Chance in die
schnelle Linie fällt. Ihr Faktor wird aus denselben Boosts berechnet, mit drei
Unterschieden:

1. Es zählen bis zu 20 Fotos und Zeichnungen statt 10, also bis zu 1,0 Inhalt.
2. Der Deckel für Inhalt und Ereignisse liegt bei 21 statt 7. In der ersten halben
   Stunde steigt er bis auf 30.
3. In der ersten halben Stunde zählen alle Boosts 8-mal, auch das Hinschauen. Voll
   gilt das für die ersten 20 Minuten, bis 30 Minuten fällt es linear auf einfach
   zurück.

```
Faktor_schnell = 1 + V × (min(D, Inhalt_20 + Ereignisse) + Hinschauen)
```

Dabei ist V der Verstärker (8, nach 30 Minuten 1) und D der Deckel (30, nach 30
Minuten 21). Nach der ersten halben Stunde ist der Unterschied zum normalen Faktor
klein. Er zeigt sich nur, wenn sehr viele Inhalte oder Ereignisse zusammenkommen.

Zusätzlich wachsen Objekte der schnellen Linie doppelt so schnell aus dem Boden und
entscheiden sich doppelt so schnell für eine Verschmelzung (`fastGrowSpeed`,
`fastFuseSpeed`). Das wirkt auf die Geschwindigkeit, nicht auf den Faktor.

## Wenn niemand hinschaut

Gezählt wird ab dem letzten Moment, in dem ein Gerät im Umkreis war, in
Kalendertagen.

| Ohne Gerät seit | Zeitfaktor | schnelle Linie |
| --- | --- | --- |
| unter 3 Tagen | normal berechnet | normal berechnet |
| 3 bis 7 Tage | genau 1, alle Boosts ausgesetzt | genau 1 |
| ab 7 Tagen | 0,5 | 0,5 |

Ab 3 Tagen zählen auch neue Fotos und Zeichnungen nicht mehr. Ab 7 Tagen läuft die
Pflanze halb so schnell wie die echte Zeit.

Sobald wieder ein Gerät im Umkreis ist, gilt sofort wieder die normale Berechnung,
für Pause und Verlangsamung gleichermaßen. Beides wird im Protokoll vermerkt, und
der Viewer zeigt es in der Zeile Zeitfaktor an.

## Worauf der Zeitfaktor wirkt

Alles, was die Pflanze selbst tut, läuft in Eigenzeit und wird durch den Faktor
schneller oder langsamer. Alles, was von außen kommt oder für Menschen gilt, läuft
in Kalenderzeit und bleibt unberührt.

**Läuft in Eigenzeit (wird beschleunigt):**

| Vorgang | Uhr | Parameter |
| --- | --- | --- |
| Keimlinge wachsen aus dem Boden | eigener Faktor des Objekts | `growDays` |
| neue Keimlinge entstehen, Generationen rücken vor | Pflanze | `keimRatePerDay`, `genAdvanceDays` |
| Wachstum, Plateau, Voxel-Generationen | Pflanze | `growthMaxDays`, `plateauDays`, `voxelTargetDays` |
| Entscheidung zum Verschmelzen | eigener Faktor des Objekts | `fusePerDay`, `chainEveryDays` |
| Reise zum Partner beim Verschmelzen | Pflanze | `fuseTravelDays` |
| Komprimieren, Halbieren, Verwelken | Pflanze | `descentCompressEveryDays`, `decayCompressEveryDays`, `halvingEveryDays`, `smallWiltPerDay` |
| Zerdrücken und Sterben | Pflanze | `crushEveryDays` |
| Karenzzeit und Absinken der Toten | Pflanze | `lingerDays` |
| verschmolzene Objekte wachsen, Objekte schrumpfen im Verfall | Pflanze | `fusedGrowPerDay`, `decayShrinkPerDay` |
| Zusammenrücken, Abstoßen beim Halbieren | Pflanze | `gatherPerDay`, `halvingRepelPerDay` |
| Anziehung, Aufsteigen, Absinken unter der Decke, Wind | eigener Faktor des Objekts | `attractPerDay`, `liftEaseDays`, `ceilingDriftDays`, `windSpeedPerDay` |
| Fotos nehmen, Zeichnungen anziehen und heranholen | Pflanze | `photoTakePerDay`, `drawingAttractPerDay`, `drawingSpeed` |
| Rechenvorlauf der Jobs | Pflanze | `jobLeadDays` |

„Pflanze“ heißt der normale Faktor. „Eigener Faktor des Objekts“ heißt: Objekte der
schnellen Linie nutzen ihren Faktor, alle anderen den normalen.

**Läuft in Kalenderzeit (bleibt gleich):**

- Lebensdauer von Fotos (14 Tage) und Zeichnungen (90 Tage)
- Wartezeit, bevor ein Foto genommen werden darf (1 Tag, Moderation)
- Dauer eines Ereignis-Stoßes (6 Stunden)
- die erste halbe Stunde nach dem Pflanzen
- die 3 und 7 Tage ohne Hinschauen
- das Schwanken im Viewer, das in echten Sekunden läuft

Der Faktor ändert also, wie viel die Pflanze in einem Kalendertag schafft. Er
ändert nicht, wie lange Inhalte von Menschen bleiben.

Der Rechenvorlauf hat eine Folge: Je höher der Faktor, desto weniger echte Zeit
bleibt einem Rechenjob bis zu seinem Fälligkeitstermin. Ist ein Ergebnis fällig,
aber noch nicht fertig, wartet die Uhr darauf.

In der Sandbox gibt es zusätzlich das Tempo (`--speed`). Es legt fest, wie viele
Kalendertage pro echter Minute simuliert werden, und hat mit dem Zeitfaktor nichts
zu tun. Auf dem Server gibt es nur Echtzeit.

## Beispielrechnungen

| Lage | Rechnung | Faktor | schnelle Linie |
| --- | --- | --- | --- |
| niemand da, keine Inhalte | 1 | 1 | 1 |
| 1 Gerät schaut hin | 1 + 3 | 4 | 4 |
| 2 Geräte schauen hin | 1 + 3 + 1,5 | 5,5 | 5,5 |
| 6 Inhalte im Umkreis, gerade ein neues Foto, 1 Gerät | 1 + (0,3 + 2) + 3 | 6,3 | 6,3 |
| dasselbe 3 Stunden später, Gerät weg | 1 + (0,3 + 1) | 2,3 | 2,3 |
| 15 Inhalte im Umkreis, 4 neue in den letzten Stunden, 3 Geräte | 1 + min(7; 0,5 + ca. 6) + 6 | ca. 13,5 | ca. 13,8 |
| erste 20 Minuten nach dem Pflanzen, 2 Geräte, keine Inhalte | 1 + 4,5 | 5,5 | 1 + 8 × 4,5 = 37 |
| 4 Tage ohne Gerät, 3 neue Zeichnungen | Boosts ausgesetzt | 1 | 1 |
| 8 Tage ohne Gerät | verlangsamt | 0,5 | 0,5 |

Bei Faktor 4 erlebt die Pflanze in 6 Stunden einen ganzen Eigentag. Bei Faktor 0,5
braucht sie für einen Eigentag zwei Kalendertage.

## Parameter

Alle Werte stehen in `sandbox/params.ts` und lassen sich im Lebenszyklus-Rechner
verstellen.

| Parameter | Standard | Bedeutung |
| --- | --- | --- |
| `feedRadius` | 15 m | Umkreis, in dem Inhalte und Ereignisse zählen |
| `contentBoostPerItem` | 0,05 | Boost je Foto oder Zeichnung |
| `contentBoostMaxItems` | 10 | so viele zählen höchstens |
| `eventBoost` | 2 | Stoß bei einem neuen Inhalt |
| `eventBoostDays` | 0,25 Kalendertage | so lange läuft der Stoß aus |
| `contentMaxBoost` | 7 | Deckel für Inhalt und Ereignisse |
| `firstViewerBoost` | 3 | Boost des ersten Geräts |
| `viewerBoost` | 1,5 | Boost je weiteres Gerät |
| `viewerMaxDevices` | 10 | so viele Geräte zählen höchstens |
| `earlyBoostHours` | 0,5 h | Ende der verstärkten Anfangszeit, für alle Objekte und die schnelle Linie |
| `earlyFadeFromHours` | 0,33 h (20 min) | bis dahin voll verstärkt, danach linear zurück |
| `earlyContentFactor` | 2 | Inhalt und Ereignisse zählen am Anfang so oft |
| `fastContentMaxItems` | 20 | schnelle Linie: so viele Inhalte zählen |
| `fastContentMaxBoost` | 21 | schnelle Linie: Deckel |
| `fastEarlyContentMax` | 30 | schnelle Linie: Deckel am Anfang |
| `fastEarlyBoostFactor` | 8 | schnelle Linie: alle Boosts am Anfang so oft |
| `unwatchedPauseDays` | 3 Kalendertage | ohne Gerät: Boosts ausgesetzt |
| `unwatchedSlowDays` | 7 Kalendertage | ohne Gerät: verlangsamt |
| `unwatchedSlowFactor` | 0,5 | Zeitfaktor bei Verlangsamung |
