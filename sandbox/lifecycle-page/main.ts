// Lifecycle page: runs the simulation core in the browser with plain-number
// jobs, from values entered in a form, and draws the result. Bundled into one
// HTML file by sandbox/lifecycle-page/build.ts.
import { PARAMS, type Params } from "../params";
import models from "../scenarios/starter-models.json";
import { buildScenario, DEFAULT_STARTERS, SCENARIO_DEFAULTS, type ScenarioValues } from "../scenarios/generate";
import { runAbstractJob } from "../sim/abstract-jobs";
import { advance } from "../sim/schedule";
import { createRng } from "../sim/rng";
import type { JobResult, ModelVersion, ObjectKind, ObjectState, Scenario, ScheduledEntry, Vec3, World } from "../sim/types";
import { createWorld, ecosystemBounds, ecosystemCenter, drawingCenter, step, swayOf, worldBounds } from "../sim/world";

const MODELS = models as unknown as Record<string, ModelVersion>;
const MODEL_LABELS: Record<string, string> = {
  flamingo: "Flamingo", mango: "Mango", "muschel-vase": "Muschelvase", naehmaschine: "Nähmaschine",
  regenschirm: "Regenschirm", rucksack: "Rucksack", "tarot-figur": "Tarotfigur", "tiffany-lampe": "Tiffany-Lampe",
};

// ---------------------------------------------------------------- form definition

type Field = { key: string; label: string; unit?: string; step?: number; hint?: string };
type Group = { title: string; note?: string; fields: Field[] };


const SCENARIO_GROUP: Group = {
  title: "Szenario",
  note: "Fotos, Zeichnungen und Besuche werden aus dem Seed zufällig verteilt.",
  fields: [
    { key: "seed", label: "Seed", step: 1 },
    { key: "days", label: "Dauer", unit: "Kalendertage", step: 1 },
    { key: "photosPerWeek", label: "Neue Fotos", unit: "pro Woche", step: 0.5 },
    { key: "drawingsPerWeek", label: "Neue Zeichnungen", unit: "pro Woche", step: 0.5 },
    { key: "blockShare", label: "Anteil gesperrter Fotos", unit: "0–1", step: 0.05 },
    { key: "visitsPerWeek", label: "Besuche", unit: "pro Woche", step: 0.5 },
    { key: "visitDevices", label: "Geräte pro Besuch", step: 1 },
    { key: "visitHours", label: "Dauer eines Besuchs", unit: "Stunden", step: 0.25 },
    { key: "contentDistance", label: "Fotos und Zeichnungen bis", unit: "m vom Pflanzort", step: 1 },
  ],
};

const PARAM_GROUPS: Group[] = [
  { title: "Polygonbudget", note: "Passt sich den Ursprungsobjekten an: Grundwert + Steigung × (Summe ihrer Dreiecke − Bezugssumme), zwischen Minimum und Maximum. Die Grenzen für verstärkte Komprimierung und Halbieren sind Anteile davon.", fields: [
    { key: "budgetBase", label: "Grundwert", unit: "Dreiecke", step: 1000 },
    { key: "budgetRefOrigins", label: "bei Ursprungsobjekten mit zusammen", unit: "Dreiecken", step: 1000 },
    { key: "budgetSlope", label: "Steigung", unit: "Budget pro Dreieck mehr", step: 0.05 },
    { key: "budgetMin", label: "Budget mindestens", unit: "Dreiecke", step: 1000 },
    { key: "budgetMax", label: "Budget höchstens", unit: "Dreiecke", step: 1000 },
    { key: "originMaxTriangles", label: "Ursprungsobjekt höchstens", unit: "Dreiecke (sonst reduziert)", step: 500 },
  ] },
  { title: "Keimlinge", fields: [
    { key: "growDays", label: "Aufwachsen", unit: "Eigentage", step: 0.1 },
    { key: "maxGeneration", label: "Höchste Generation", step: 1 },
    { key: "keimRatePerDay", label: "Neue Keimlinge", unit: "pro Ursprungslinie und Eigentag", step: 0.1 },
    { key: "copyVariance", label: "Varianz", unit: "±Anteil", step: 0.05 },
    { key: "genAdvanceStart", label: "Nächste Generation anfangs mit", unit: "Wahrscheinlichkeit", step: 0.05 },
    { key: "genAdvanceDays", label: "sicher nach", unit: "Eigentagen", step: 1 },
    { key: "growthMaxDays", label: "Keimlingsphase ohne Plateau höchstens", unit: "Eigentage", step: 1 },
    { key: "copyShrink", label: "Kopie behält", unit: "Anteil Dreiecke", step: 0.05 },
    { key: "spreadBase", label: "Abstand Kopie", unit: "m", step: 0.1 },
    { key: "spreadPerGeneration", label: "+ pro Generation", unit: "m", step: 0.1 },
    { key: "spreadJitter", label: "+ zufällig bis", unit: "m", step: 0.1 },
    { key: "plateauDays", label: "Plateau hält", unit: "Eigentage", step: 0.5 },
    { key: "plateauRefillBelow", label: "Neue Keimlinge im Plateau nur unter", unit: "Anteil Budget", step: 0.01 },
    { key: "voxelFromGeneration", label: "Voxelisiert ab Generation", step: 1 },
    { key: "voxelCellsStart", label: "Voxelraster dort", unit: "Zellen über die längste Seite", step: 1 },
    { key: "voxelCellsFactor", label: "je Generation gröber", unit: "× Zellen", step: 0.05 },
    { key: "voxelTargetDays", label: "Voxel-Generationen ab der Halbierungsgrenze (im Wachstum) bis zum Würfel in", unit: "Eigentagen", step: 0.5 },
    { key: "voxelCopiesPerGeneration", label: "Kopien je Voxel-Generation", unit: "pro Linie", step: 0.5 },
  ] },
  { title: "Vorläufer", note: "Die ersten Keimlinge: jedes Ursprungsobjekt einmal, zufällig zugeordnet, je zwei pro Generation (1, 1, 2, 2, 3) und direkt von ihm kopiert, kurz nacheinander und dicht beieinander. Sie bilden selbst keine Kopien, zählen aber zum Budget. Sie und alles, was aus ihnen verschmilzt oder halbiert wird, bilden die schnelle Linie. Jeder andere neue Keimling kommt mit einer kleinen Chance dazu und gibt das an seine Kopien weiter.", fields: [
    { key: "pioneerCount", label: "Anzahl", unit: "0 = keine", step: 1 },
    { key: "fastKeimChance", label: "Neuer Keimling gehört zur schnellen Linie mit Chance", unit: "Anteil (vererbt sich an Kopien)", step: 0.01 },
    { key: "pioneerStaggerMinutes", label: "nacheinander im Abstand von", unit: "Eigenminuten (der erste beim Pflanzen)", step: 0.5 },
    { key: "fastGrowSpeed", label: "wachsen schneller", unit: "fach", step: 0.5 },
    { key: "fastFuseSpeed", label: "Paarbildung und Weg zum Partner schneller", unit: "fach", step: 0.5 },
    { key: "fastEarlyBoostFactor", label: "In der Anfangszeit wirken alle Boosts auf sie", unit: "fach (Boost-Anteil des Zeitfaktors, auch Hinschauen)", step: 0.5 },
    { key: "fastEarlyContentMax", label: "Fotos und Zeichnungen in der Anfangszeit höchstens", unit: "+ zum Faktor", step: 0.5 },
    { key: "fastContentMaxItems", label: "schnelle Linie zählt dauerhaft bis zu", unit: "Fotos und Zeichnungen", step: 1 },
    { key: "fastContentMaxBoost", label: "Fotos und Zeichnungen für die schnelle Linie höchstens", unit: "+ zum Faktor", step: 1 },
    { key: "firstFuseSpeed", label: "Eröffnung (drei Verschmelzungen der Vorläufer) zusätzlich schneller", unit: "fach", step: 0.5 },
    { key: "firstFuseEaseK", label: "Eröffnung: Beschleunigung k", unit: "0 = gleichmäßig", step: 0.5 },
    { key: "fastHalvingAffinity", label: "werden eher halbiert", unit: "fach", step: 0.5 },
    { key: "pioneerOriginGap", label: "Abstand zu Ursprungsobjekten mindestens", unit: "m", step: 0.05 },
    { key: "pioneerGap", label: "Abstand zum nächsten Vorläufer höchstens", unit: "m", step: 0.05 },
  ] },
  { title: "Verschmelzen", note: "Aktive Objekte und ausgewachsene Keimlinge. Freie Paare bilden sich nach der Rate, sobald die Eröffnung der Vorläufer begonnen hat (ohne Vorläufer sofort). Ein Paar steht fest; das niedrigere Objekt wandert zum höheren.", fields: [
    { key: "requiredFusions", label: "Ein Objekt durchläuft mindestens", unit: "Verschmelzungen (Phase 3, 4, 7, 8, 10)", step: 1 },
    { key: "chainEveryDays", label: "Kette verschmilzt höchstens alle", unit: "Eigentage", step: 0.1 },
    { key: "requiredHalvings", label: "Ein Teil wird mindestens", unit: "mal halbiert (Phase 11 … 13)", step: 1 },
    { key: "fusePerDay", label: "Paarbildungs-Rate", unit: "pro Eigentag und Objekt", step: 0.05 },
    { key: "fuseTravelDays", label: "Weg zum Partner", unit: "Eigentage", step: 0.1 },
    { key: "fuseEaseK", label: "Beschleunigung k", unit: "0 = gleichmäßig", step: 0.5 },
  ] },
  { title: "Größe und Höhe", note: "Seitenansicht. Ursprungsobjekte stehen am Boden; ihre längste Seite wird beim Pflanzen in den Bereich unten gebracht. Keimlinge nehmen die Größe ihres Ursprungsobjekts, leicht variiert und mit jeder Generation größer; sie dürfen den Bereich um den Spielraum verlassen, nach oben ab Generation 2 jeweils weiter. Die letzten Generationen werden wieder kleiner, jede um einen zufälligen Anteil. Höhen gehen nur nach oben: Eine Verschmelzung startet von der Höhe des höheren Partners und steigt, jede Komprimierung hebt ein Stück, nach und nach und unterschiedlich weit. Wer die Höhengrenze erreicht, sinkt danach langsam ein Stück zurück.", fields: [
    { key: "originMinSize", label: "Ursprungsobjekt mindestens", unit: "m, längste Seite", step: 0.05 },
    { key: "originMaxSize", label: "Ursprungsobjekt höchstens", unit: "m, längste Seite", step: 0.05 },
    { key: "keimSizeVariance", label: "Keimling-Größe variiert", unit: "±Anteil", step: 0.05 },
    { key: "keimGrowPerGeneration", label: "je Generation größer um", unit: "Anteil (nach der ersten Voxel-Generation je Generation halbiert)", step: 0.05 },
    { key: "keimGrowStopGeneration", label: "ab Generation kleiner statt größer", step: 1 },
    { key: "keimShrinkMin", label: "je Generation kleiner, mindestens", unit: "Anteil", step: 0.05 },
    { key: "keimShrinkMax", label: "je Generation kleiner, höchstens", unit: "Anteil", step: 0.05 },
    { key: "keimSizeSlack", label: "Spielraum über den Bereich hinaus", unit: "m", step: 0.05 },
    { key: "keimSizeSlackPerGeneration", label: "nach oben je weitere Generation", unit: "m (nach der ersten Voxel-Generation je Generation halbiert)", step: 0.05 },
    { key: "keimTiltPerGeneration", label: "Neigung bis", unit: "Grad × (Generation − 1)", step: 0.5 },
    { key: "tintStart", label: "Leuchtfarbe Generation 1", unit: "Stärke (zufällige reine Farbe)", step: 0.01 },
    { key: "tintPerGeneration", label: "+ je weitere Generation", unit: "Stärke", step: 0.01 },
    { key: "tintFuseLoss", label: "Verschmelzen: Mittel beider minus", unit: "Stärke (Farben gemischt)", step: 0.01 },
    { key: "tintMin", label: "Leuchtfarbe mindestens", unit: "Stärke, nur bei der ersten Verschmelzung (auch nach dem Verblassen)", step: 0.01 },
    { key: "tintMax", label: "Leuchtfarbe höchstens", unit: "Stärke", step: 0.01 },
    { key: "keimStartScale", label: "Keimling wächst ab", unit: "Anteil seiner Größe", step: 0.05 },
    { key: "maxGrowFactor", label: "Beim Verschmelzen wächst das kleinere auf die Höhe des größeren, höchstens um", unit: "Faktor", step: 0.5 },
    { key: "riseStep", label: "Steigt pro Verschmelzung", unit: "m", step: 0.05 },
    { key: "riseVariance", label: "Varianz", unit: "±Anteil", step: 0.05 },
    { key: "halvingRise", label: "Hälften schweben auf", unit: "m", step: 0.05 },
    { key: "compressRise", label: "Komprimierung hebt um", unit: "m je halbierter Dreieckszahl", step: 0.01 },
    { key: "compressRiseSpread", label: "Streuung", unit: "× e^(zufällig ±Wert)", step: 0.1 },
    { key: "liftEaseDays", label: "Anheben verteilt über etwa", unit: "Eigentage", step: 0.1 },
    { key: "maxTop", label: "Höhengrenze Oberkante", unit: "m", step: 0.1 },
    { key: "ceilingDropMin", label: "an der Grenze sinkt es wieder um mindestens", unit: "m", step: 0.05 },
    { key: "ceilingDropMax", label: "höchstens", unit: "m", step: 0.05 },
    { key: "ceilingDriftDays", label: "langsam über etwa", unit: "Eigentage", step: 0.5 },
    { key: "maxWidth", label: "Breitengrenze", unit: "m, längere Seite am Boden", step: 0.1 },
    { key: "fusedGrowPerDay", label: "Verschmolzene wachsen um", unit: "Anteil ihrer Größe pro Eigentag", step: 0.01 },
    { key: "fusedGrowMax", label: "bis höchstens", unit: "× Größe nach der Verschmelzung (darüber: Sinken bis zur Einsinkgrenze)", step: 0.05 },
    { key: "maxSink", label: "Einsinken höchstens", unit: "Anteil der Höhe", step: 0.05 },
  ] },
  { title: "Schweben, Anziehen, Abstoßen, Wind", note: "Aktive verschmolzene Objekte treiben ganz langsam zum nächsten mit gleich vielen Verschmelzungen, bis sie sich fast berühren oder leicht überschneiden; mit dem Verwelken hört das auf. Schweben geht vom Standort nach oben, nie in den Boden: schon unter vielen Dreiecken ganz leicht und langsam, je weniger Dreiecke desto stärker und schneller; in Bodennähe schwächer, höher stärker. Im Abstieg ziehen alle Objekte, die nicht gerade verschmelzen, langsam zum Pflanzpunkt, die beiden Hälften einer Halbierung stoßen sich dazu langsam voneinander ab. Im Verfall hört das Zusammenziehen auf, die Hälften stoßen sich stärker ab und verwelkende Objekte schrumpfen langsam. Halbierte Objekte mit wenigen Dreiecken treiben im Wind: sehr langsam, in alle Richtungen, auch hoch und runter, je näher an der Todesgrenze desto schneller; ab und zu dreht der Wind.", fields: [
    { key: "swayFromTriangles", label: "Schweben ab unter", unit: "Dreiecke", step: 1000 },
    { key: "swayAmplitude", label: "Schweben bei einem Dreieck", unit: "m", step: 0.05 },
    { key: "swaySlowSeconds", label: "anfangs ein Auf und Ab in", unit: "Sekunden", step: 0.5 },
    { key: "swayFastSeconds", label: "bei einem Dreieck in", unit: "Sekunden", step: 0.5 },
    { key: "swayGroundFactor", label: "am Boden", unit: "× Schweben", step: 0.1 },
    { key: "swayPerMetre", label: "+ pro Meter Höhe", unit: "× Schweben", step: 0.1 },
    { key: "swayMaxFactor", label: "höchstens", unit: "× Schweben", step: 0.1 },
    { key: "gatherPerDay", label: "Zusammenziehen im Abstieg", unit: "m pro Eigentag", step: 0.01 },
    { key: "gatherStop", label: "bis zum Pflanzpunkt höchstens", unit: "m + halbe Breite", step: 0.05 },
    { key: "halvingRepelPerDay", label: "Hälften stoßen sich ab mit", unit: "m pro Eigentag", step: 0.01 },
    { key: "halvingRepelRange", label: "Abstoßen bis Abstand", unit: "m", step: 0.1 },
    { key: "decayRepelFactor", label: "Abstoßen im Verfall", unit: "fach", step: 0.5 },
    { key: "attractFromFusions", label: "Gleiche Verschmelzungsstufe zieht sich an ab", unit: "Verschmelzungen", step: 1 },
    { key: "attractPerDay", label: "Anziehung", unit: "m pro Eigentag", step: 0.01 },
    { key: "attractRange", label: "Anziehung bis Abstand", unit: "m", step: 0.5 },
    { key: "attractGapMin", label: "hält an bei Lücke ab", unit: "m (negativ = Überschneidung)", step: 0.01 },
    { key: "attractGapMax", label: "bis", unit: "m", step: 0.01 },
    { key: "windFromTriangles", label: "Wind für Halbierte unter", unit: "Dreiecke", step: 50 },
    { key: "windSpeedPerDay", label: "Wind an der Todesgrenze", unit: "m pro Eigentag", step: 0.05 },
    { key: "windVertical", label: "Wind nach oben oder unten bis", unit: "Anteil der Richtung", step: 0.05 },
    { key: "windTurnPerDay", label: "Wind dreht", unit: "Chance pro Eigentag", step: 0.1 },
    { key: "windEaseDays", label: "Wind folgt einer Drehung in etwa", unit: "Eigentage", step: 0.1 },
    { key: "windRange", label: "Wind treibt zurück ab", unit: "m vom Pflanzpunkt", step: 0.5 },
    { key: "decayShrinkPerDay", label: "Verwelkende schrumpfen im Verfall um", unit: "Anteil ihrer Größe pro Eigentag", step: 0.005 },
    { key: "decayShrinkMin", label: "bis auf", unit: "Anteil ihrer Größe", step: 0.05 },
  ] },
  { title: "Rechnen", note: "Ein Ergebnis wird so lange nach dem Auftrag eingesetzt; in der Sandbox läuft die Uhr währenddessen weiter.", fields: [
    { key: "jobLeadDays", label: "Rechenvorlauf", unit: "Eigentage", step: 0.05 },
    { key: "softFuseLeadDays", label: "Rechenvorlauf weiche Verschmelzung", unit: "Eigentage", step: 0.1 },
  ] },
  { title: "Verstärkte Komprimierung", note: "Zeitkonto über der Grenze, summiert sich, steht nach dem Auslösen auf null.", fields: [
    { key: "compressAtShare", label: "Grenze (auch: Plateau erreicht)", unit: "Anteil Budget", step: 0.005 },
    { key: "compressSpanDays", label: "Zeitspanne", unit: "Eigentage", step: 0.1 },
    { key: "compressVariance", label: "Varianz", unit: "±Anteil", step: 0.05 },
    { key: "compressKeep", label: "Objekt behält", unit: "Anteil Dreiecke", step: 0.05 },
  ] },
  { title: "Abstieg und Halbieren", fields: [
    { key: "descentCompressEveryDays", label: "Komprimierung alle", unit: "Eigentage", step: 0.1 },
    { key: "descentCompressKeep", label: "Objekt behält", unit: "Anteil Dreiecke", step: 0.05 },
    { key: "halvingAtShare", label: "Halbieren unter", unit: "Anteil Budget", step: 0.01 },
    { key: "halvingEveryDays", label: "Halbieren alle", unit: "Eigentage", step: 0.1 },
    { key: "halvingVariance", label: "Varianz", unit: "±Anteil", step: 0.05 },
    { key: "halvingRateRisePerDay", label: "Halbieren wird häufiger um", unit: "× Rate pro Eigentag seit Beginn", step: 0.01 },
    { key: "minTrianglesToHalve", label: "Halbieren erst ab", unit: "Dreiecke", step: 50 },
    { key: "smallWiltPerDay", label: "Zu Kleine verwelken mit", unit: "Wahrscheinlichkeit pro Eigentag", step: 0.05 },
  ] },
  { title: "Verfall", note: "Beginnt, sobald nur noch verwelkende Objekte existieren.", fields: [
    { key: "decayCompressEveryDays", label: "Komprimierung alle", unit: "Eigentage", step: 0.05 },
    { key: "decayCompressKeep", label: "Objekt behält", unit: "Anteil Dreiecke", step: 0.05 },
  ] },
  { title: "Verwelken", note: "Ursprungsobjekte werden im Abstieg mit dem Ökosystem komprimiert, bis knapp über die Todesgrenze. Ist das letzte andere Objekt tot, bringt eine letzte Komprimierung sie darunter, notfalls bleiben nur ihre größten Dreiecke: Sie sterben im selben Moment, das Ende der Pflanze. Lässt sich ein kleines Objekt kaum noch komprimieren, werden seine Komprimierungen erzwungen; erst wenn auch das nichts bringt, stirbt es vorzeitig. Tote versinken bis ganz unter die Erde.", fields: [
    { key: "crushEveryDays", label: "Crush-Stufe alle", unit: "Eigentage", step: 0.1 },
    { key: "maxCrushLevel", label: "Höchste Crush-Stufe", step: 1 },
    { key: "deathTriangles", label: "Tod unter", unit: "Dreiecke", step: 10 },
    { key: "stuckKeep", label: "Tod, wenn Komprimieren mehr behält als", unit: "Anteil (nur zu klein zum Halbieren)", step: 0.01 },
    { key: "lingerDays", label: "Tote bleiben sichtbar und versinken dabei", unit: "Eigentage", step: 0.1 },
    { key: "lingerVariance", label: "Varianz", unit: "± Eigentage", step: 0.1 },
    { key: "maxJobFailures", label: "Verwelkende sterben vorzeitig nach", unit: "gescheiterten Vorgängen", step: 1 },
  ] },
  { title: "Fotos", fields: [
    { key: "photoWaitDays", label: "Wartezeit", unit: "Kalendertage", step: 0.5 },
    { key: "photoTakePerDay", label: "Übernahme-Rate", unit: "pro Eigentag", step: 0.1 },
    { key: "photoLifetimeDays", label: "Lebensdauer", unit: "Kalendertage", step: 1 },
  ] },
  { title: "Zeichnungen", fields: [
    { key: "objectRadiusBase", label: "Objektradius", unit: "m + halbe Diagonale", step: 0.1 },
    { key: "drawingAttractPerDay", label: "Anziehungs-Rate", unit: "pro Eigentag", step: 0.1 },
    { key: "drawingSpeed", label: "Geschwindigkeit", unit: "m pro Eigentag", step: 0.1 },
    { key: "drawingMinScale", label: "Kleinste Größe", unit: "Anteil", step: 0.05 },
    { key: "overlapMin", label: "Überschneidung von", unit: "Anteil", step: 0.01 },
    { key: "overlapMax", label: "Überschneidung bis", unit: "Anteil", step: 0.01 },
    { key: "drawingLifetimeDays", label: "Lebensdauer", unit: "Kalendertage", step: 1 },
  ] },
  { title: "Zeitmaßstab und Boosts", note: "Faktor = 1 + Fotos und Zeichnungen (Inhalt + Ereignisse, höchstens ihre Grenze) + Hinschauen (höchstens so viele Geräte). Geräte nehmen Fotos und Zeichnungen nichts weg. Schaut ein paar Tage lang niemand hin, ruhen alle Boosts, bis wieder ein Gerät kommt.", fields: [
    { key: "contentBoostPerItem", label: "Inhalt pro Foto/Zeichnung", step: 0.01 },
    { key: "contentBoostMaxItems", label: "Inhalt zählt bis", unit: "Stück", step: 1 },
    { key: "eventBoost", label: "Ereignis-Boost", unit: "neues Foto oder neue Zeichnung im Radius", step: 0.1 },
    { key: "eventBoostDays", label: "Ereignis klingt ab in", unit: "Kalendertage", step: 0.05 },
    { key: "firstViewerBoost", label: "Hinschauen erstes Gerät", step: 0.1 },
    { key: "viewerBoost", label: "Hinschauen jedes weitere Gerät", step: 0.1 },
    { key: "earlyBoostHours", label: "Anfangszeit mit Extra-Boosts", unit: "Stunden nach dem Pflanzen (Kalenderzeit, auch für die schnelle Linie)", step: 0.25 },
    { key: "earlyContentFactor", label: "Fotos und Zeichnungen wirken dort", unit: "fach", step: 0.5 },
    { key: "earlyFadeFromHours", label: "Extra-Boosts der Anfangszeit sinken ab", unit: "Stunden (bis 0 am Ende der Anfangszeit)", step: 0.05 },
    { key: "contentMaxBoost", label: "Fotos und Zeichnungen höchstens", unit: "+ zum Faktor", step: 0.5 },
    { key: "viewerMaxDevices", label: "Geräte gezählt höchstens", unit: "Stück", step: 1 },
    { key: "unwatchedPauseDays", label: "Boosts ausgesetzt nach", unit: "Kalendertagen ohne Gerät, bis wieder jemand hinschaut", step: 0.5 },
    { key: "unwatchedSlowDays", label: "verlangsamt nach", unit: "Kalendertagen ohne Gerät, bis wieder jemand hinschaut", step: 0.5 },
    { key: "unwatchedSlowFactor", label: "Zeitfaktor dann", unit: "× (unter 1: langsamer als die echte Zeit)", step: 0.05 },
  ] },
  { title: "Raum", fields: [
    { key: "feedRadius", label: "Radius Hinschauen und Füttern", unit: "m", step: 1 },
    { key: "exclusionRadius", label: "Sperrradius", unit: "m", step: 5 },
  ] },
];


// ---------------------------------------------------------------- state

type Inputs = { params: Params; scenario: ScenarioValues; starters: string[] };

const STORE_KEY = "lebenszyklus-rechner-v2";

function loadInputs(): Inputs {
  const base: Inputs = { params: { ...PARAMS }, scenario: { ...SCENARIO_DEFAULTS }, starters: [...DEFAULT_STARTERS] };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    return {
      params: { ...base.params, ...saved.params },
      scenario: { ...base.scenario, ...saved.scenario },
      starters: Array.isArray(saved.starters) && saved.starters.length ? saved.starters : base.starters,
    };
  } catch { return base; }
}

function saveInputs(i: Inputs) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(i)); } catch { /* storage unavailable */ }
}

let inputs = loadInputs();

// ---------------------------------------------------------------- scenario from the form

// ---------------------------------------------------------------- run

interface Frame {
  calendar: number;
  eigen: number;
  objects: { x: number; z: number; r: number; state: ObjectState; photo: boolean; tri: number; fusions: number; origin: boolean; x0: number; x1: number; y0: number; y1: number; sway: number; grow: number }[];
  photos: { x: number; z: number; blocked: boolean; gone: boolean; used: boolean }[];
  drawings: { x: number; z: number; y: number; mode: string; scale: number; tex: boolean }[];
  pairs: { ax: number; az: number; bx: number; bz: number }[];
  center: Vec3;
  bounds: { min: Vec3; max: Vec3 } | null;
}

interface RunResult { world: World; frames: Frame[]; ms: number }

const FRAME_EVERY = 0.25;

function run(i: Inputs): RunResult {
  const t0 = performance.now();
  const w = createWorld(buildScenario(i), { ...i.params });
  const frames: Frame[] = [snapshot(w)];
  const ready = new Map<number, JobResult>();
  let nextFrame = FRAME_EVERY;
  while (w.calendar < i.scenario.days && w.phase !== "ende") {
    const r = advance(w, ready);
    if ("jobs" in r) for (const j of r.jobs) ready.set(j.id, runAbstractJob(w, j)); // computed at once, used when due
    if (w.calendar >= nextFrame) { frames.push(snapshot(w)); nextFrame += FRAME_EVERY; }
  }
  frames.push(snapshot(w));
  return { world: w, frames, ms: performance.now() - t0 };
}

function snapshot(w: World): Frame {
  const usedPhotos = new Set(w.objects.map((o) => o.photo?.photoId).filter(Boolean));
  return {
    calendar: w.calendar,
    eigen: w.eigen,
    objects: w.objects.map((o) => { const b = worldBounds(o); return {
      x0: b.min[0], x1: b.max[0], y0: b.min[1], y1: b.max[1], sway: swayOf(o, w.params), grow: o.grow,
      x: o.pos[0], z: o.pos[2], r: Math.max(0.12, Math.hypot(o.max[0] - o.min[0], o.max[2] - o.min[2]) / 2),
      state: o.state, photo: !!o.photo, tri: o.triangles, fusions: o.fusions, origin: o.origin,
    }; }),
    photos: w.photos.map((p) => ({ x: p.pos[0], z: p.pos[2], blocked: p.blocked, gone: p.gone, used: usedPhotos.has(p.id) })),
    drawings: w.drawings.filter((d) => !d.gone).map((d) => ({ x: d.pos[0], z: d.pos[2], y: drawingCenter(d)[1], mode: d.mode, scale: d.scale, tex: !!d.texture })),
    pairs: w.pairs.filter((pr) => pr.start !== null).flatMap((pr) => {
      const a = w.objects.find((o) => o.id === pr.a), b = w.objects.find((o) => o.id === pr.b);
      return a && b ? [{ ax: a.pos[0], az: a.pos[2], bx: b.pos[0], bz: b.pos[2] }] : [];
    }),
    center: ecosystemCenter(w),
    bounds: ecosystemBounds(w),
  };
}

// ---------------------------------------------------------------- DOM helpers

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fmt = (n: number, d = 0) => n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function fieldHtml(prefix: string, f: Field, value: number) {
  const id = `${prefix}-${f.key}`;
  return `<label class="field" for="${id}"><span class="field-label">${esc(f.label)}</span>
    <input id="${id}" data-group="${prefix}" data-key="${f.key}" type="number" inputmode="decimal" step="${f.step ?? "any"}" value="${value}">
    <span class="field-unit">${f.unit ? esc(f.unit) : ""}</span></label>`;
}

function renderForm() {
  const starters = Object.keys(MODELS).map((name) => {
    const m = MODELS[name];
    const h = (m.max[1] - m.min[1]).toFixed(2);
    return `<label class="starter" for="st-${name}"><input id="st-${name}" type="checkbox" data-starter="${name}" ${inputs.starters.includes(name) ? "checked" : ""}>
      <span>${MODEL_LABELS[name] ?? name}</span><span class="starter-meta">${fmt(m.triangles)} △ · Original ${h} m hoch</span></label>`;
  }).join("");
  const group = (prefix: string, g: Group, values: Record<string, number>, open: boolean) =>
    `<details class="group" ${open ? "open" : ""}><summary>${esc(g.title)}</summary>
      ${g.note ? `<p class="group-note">${esc(g.note)}</p>` : ""}
      <div class="fields">${g.fields.map((f) => fieldHtml(prefix, f, values[f.key])).join("")}</div></details>`;
  $("#form-body").innerHTML =
    `<details class="group" open><summary>Startobjekte</summary><p class="group-note">Gepflanzte Objekte aus der Testreihe (Phase 1), mit echter Dreieckszahl und Größe.</p><div class="starters">${starters}</div></details>` +
    group("sc", SCENARIO_GROUP, inputs.scenario as unknown as Record<string, number>, true) +
    PARAM_GROUPS.map((g, k) => group("p", g, inputs.params as unknown as Record<string, number>, k === 0)).join("");
}

function readForm() {
  const next: Inputs = { params: { ...inputs.params }, scenario: { ...inputs.scenario }, starters: [] };
  document.querySelectorAll<HTMLInputElement>("input[data-key]").forEach((el) => {
    const v = Number(el.value);
    if (!Number.isFinite(v)) return;
    if (el.dataset.group === "sc") (next.scenario as Record<string, number>)[el.dataset.key!] = v;
    else (next.params as Record<string, number>)[el.dataset.key!] = v;
  });
  document.querySelectorAll<HTMLInputElement>("input[data-starter]").forEach((el) => { if (el.checked) next.starters.push(el.dataset.starter!); });
  if (!next.starters.length) next.starters = [DEFAULT_STARTERS[0]];
  next.scenario.days = Math.min(Math.max(1, next.scenario.days), 2000);
  inputs = next;
  saveInputs(inputs);
}

// ---------------------------------------------------------------- results

let result: RunResult | null = null;
let frameIndex = 0;

function firstEvent(w: World, type: string, contains?: string) {
  return w.events.find((e) => e.type === type && (!contains || e.text.includes(contains)));
}

function renderSummary(r: RunResult) {
  const w = r.world;
  const plateau = firstEvent(w, "phase", "Plateau");
  const descent = firstEvent(w, "phase", "Abstieg");
  const halving = firstEvent(w, "halbierung");
  const decay = firstEvent(w, "phase", "Verfall");
  const end = firstEvent(w, "phase", "vergangen");
  const maxObjects = Math.max(...w.samples.map((s) => s.counts.keimling + s.counts.aktiv + s.counts.verwelkend + s.counts.tot));
  const avgFactor = w.calendar > 0 ? w.eigen / w.calendar : 1;
  const when = (e?: { calendar: number; eigen: number }) =>
    e ? `<b>Tag ${fmt(e.calendar, 1)}</b><span>Eigenzeit ${fmt(e.eigen, 1)}</span>` : `<b>—</b><span>nicht erreicht</span>`;
  const count = (t: string) => w.events.filter((e) => e.type === t).length;
  $("#summary").innerHTML = `
    <div class="stat"><span class="stat-label">Höchststand</span><b>${fmt(w.plateauMax)} △</b><span>${fmt((w.plateauMax / w.budget) * 100)} % des Budgets (${fmt(w.budget)})</span></div>
    <div class="stat"><span class="stat-label">Plateau erreicht</span>${when(plateau)}</div>
    <div class="stat"><span class="stat-label">Abstieg ab</span>${when(descent)}</div>
    <div class="stat"><span class="stat-label">Erste Halbierung</span>${when(halving)}</div>
    <div class="stat"><span class="stat-label">Verfall ab</span>${when(decay)}</div>
    <div class="stat"><span class="stat-label">${end ? "Vergangen" : "Stand am Ende"}</span>${end ? when(end) : `<b>Tag ${fmt(w.calendar, 0)}</b><span>${fmt(w.objects.length)} Objekte, Phase ${w.phase}</span>`}</div>
    <div class="stat"><span class="stat-label">Objekte höchstens</span><b>${fmt(maxObjects)}</b><span>${count("kopie")} Kopien, ${count("verschmelzung")} Verschmelzungen, ${count("halbierung")} Halbierungen</span></div>
    <div class="stat"><span class="stat-label">Zeitfaktor im Mittel</span><b>${fmt(avgFactor, 2)} ×</b><span>Eigenzeit ${fmt(w.eigen, 0)} in ${fmt(w.calendar, 0)} Kalendertagen</span></div>
    <div class="stat"><span class="stat-label">Fotos und Zeichnungen</span><b>${count("foto-uebernahme")} · ${count("zeichnung-ruht")}</b><span>Fotos übernommen · Zeichnungen ruhen</span></div>`;
  $("#run-meta").textContent = `${fmt(w.samples.length)} Messpunkte, ${fmt(w.events.length)} Ereignisse, gerechnet in ${fmt(r.ms)} ms`;
}

// --- curve chart (SVG)

const STATE_ORDER: ObjectState[] = ["keimling", "aktiv", "verwelkend", "tot"];
const KIND_ORDER: ObjectKind[] = ["ursprung", "keimling", "voxelkeimling", "unveraendert", "v1", "v2", "v3", "v4", "halbiert"];

const STATE_LABEL: Record<ObjectState, string> = { keimling: "Keimling", aktiv: "Aktiv", verwelkend: "Verwelkend", tot: "Tot" };

function niceStep(max: number, n = 5) {
  const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

function renderCurve(r: RunResult) {
  const w = r.world, p = w.params, S = w.samples;
  const W = 760, H = 300, L = 64, R = 16, T = 16, B = 34;
  const maxDay = Math.max(1, w.calendar);
  const maxTri = Math.max(w.budget, w.plateauMax) * 1.05;
  const X = (d: number) => L + (d / maxDay) * (W - L - R);
  const Y = (v: number) => T + (1 - v / maxTri) * (H - T - B);
  const path = S.map((s, k) => `${k ? "L" : "M"}${X(s.calendar).toFixed(1)} ${Y(s.triangles).toFixed(1)}`).join("");
  const area = `${path}L${X(S[S.length - 1].calendar).toFixed(1)} ${Y(0)}L${X(S[0].calendar).toFixed(1)} ${Y(0)}Z`;
  const ys = niceStep(maxTri), xs = niceStep(maxDay, 8);
  let grid = "";
  for (let v = 0; v <= maxTri; v += ys) grid += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 8}" y="${Y(v) + 4}" class="tick" text-anchor="end">${fmt(v / 1000)}k</text>`;
  for (let d = 0; d <= maxDay; d += xs) grid += `<text x="${X(d)}" y="${H - 12}" class="tick" text-anchor="middle">${fmt(d)}</text>`;
  const ref = (v: number, label: string, cls: string) =>
    `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="${cls}"/><text x="${W - R}" y="${Y(v) - 5}" text-anchor="end" class="ref-label">${label}</text>`;
  const marks = w.events.filter((e) => e.type === "phase").map((e) =>
    `<line x1="${X(e.calendar)}" x2="${X(e.calendar)}" y1="${T}" y2="${H - B}" class="phase-line"/>`).join("");
  const cur = result ? result.frames[frameIndex] : null;
  const cursor = cur ? `<line x1="${X(cur.calendar)}" x2="${X(cur.calendar)}" y1="${T}" y2="${H - B}" class="cursor"/>` : "";
  $("#curve").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Dreiecke im Ökosystem über die Kalendertage">
    ${grid}${ref(w.budget, `Budget ${fmt(w.budget)}`, "ref")}${ref(w.compressAt, "Grenze verstärkte Komprimierung", "ref ref-soft")}
    ${ref(w.halvingAt, "Halbieren unter", "ref ref-soft")}
    ${marks}<path d="${area}" class="area"/><path d="${path}" class="line"/>${cursor}
    <text x="${L}" y="${H - 1}" class="axis-label">Kalendertage</text></svg>`;

  // stacked object counts: by state, and by history
  const stacked = (id: string, label: string, keys: string[], get: (s: (typeof S)[number], key: string) => number, cls: string) => {
    const H2 = 170, T2 = 10, B2 = 28;
    const maxObj = Math.max(1, ...S.map((s) => keys.reduce((n, k) => n + get(s, k), 0)));
    const Y2 = (v: number) => T2 + (1 - v / maxObj) * (H2 - T2 - B2);
    let layers = "";
    const base = S.map(() => 0);
    for (const key of keys) {
      const top = S.map((s, k) => base[k] + get(s, key));
      const up = S.map((s, k) => `${k ? "L" : "M"}${X(s.calendar).toFixed(1)} ${Y2(top[k]).toFixed(1)}`).join("");
      const down = S.map((s, k) => `L${X(s.calendar).toFixed(1)} ${Y2(base[k]).toFixed(1)}`).reverse().join("");
      layers += `<path d="${up}${down}Z" class="${cls}-${key}"/>`;
      top.forEach((v, k) => (base[k] = v));
    }
    const os = niceStep(maxObj, 3);
    let g2 = "";
    for (let v = 0; v <= maxObj; v += os) g2 += `<line x1="${L}" x2="${W - R}" y1="${Y2(v)}" y2="${Y2(v)}" class="grid"/><text x="${L - 8}" y="${Y2(v) + 4}" class="tick" text-anchor="end">${fmt(v)}</text>`;
    const c2 = cur ? `<line x1="${X(cur.calendar)}" x2="${X(cur.calendar)}" y1="${T2}" y2="${H2 - B2}" class="cursor"/>` : "";
    $(id).innerHTML = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="${label}">${g2}${layers}${c2}
      <text x="${L}" y="${H2 - 6}" class="axis-label">${label}</text></svg>`;
  };
  stacked("#states", "Objekte nach Stadium", STATE_ORDER, (s, k) => s.counts[k as ObjectState], "st st");
  stacked("#kinds", "Objekte nach Herkunft (mit Ursprungsobjekten)", KIND_ORDER, (s, k) => s.kinds[k as ObjectKind], "kd kd");

  // time factor strip
  const H3 = 96, T3 = 8, B3 = 24;
  const maxF = Math.max(8, ...S.map((s) => s.factor));
  const YF = (v: number) => T3 + (1 - v / maxF) * (H3 - T3 - B3);
  const fpath = S.map((s, k) => `${k ? "L" : "M"}${X(s.calendar).toFixed(1)} ${YF(s.factor).toFixed(1)}`).join("");
  let g3 = "";
  for (const v of [1, maxF]) g3 += `<line x1="${L}" x2="${W - R}" y1="${YF(v)}" y2="${YF(v)}" class="grid"/><text x="${L - 8}" y="${YF(v) + 4}" class="tick" text-anchor="end">${fmt(v, v % 1 ? 1 : 0)}×</text>`;
  const cursor3 = cur ? `<line x1="${X(cur.calendar)}" x2="${X(cur.calendar)}" y1="${T3}" y2="${H3 - B3}" class="cursor"/>` : "";
  $("#factor").innerHTML = `<svg viewBox="0 0 ${W} ${H3}" role="img" aria-label="Zeitfaktor über die Kalendertage">
    ${g3}<path d="${fpath}" class="factor"/>${cursor3}
    <text x="${L}" y="${H3 - 6}" class="axis-label">Zeitfaktor: Inhalte, Vererbungen und Besuche</text></svg>`;
}

// --- top view (canvas)

function css(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function renderMap() {
  if (!result) return;
  const f = result.frames[frameIndex];
  const p = result.world.params;
  const canvas = $<HTMLCanvasElement>("#map");
  const box = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  // Scale: fit the feed radius plus the content around the planting point.
  let reach = p.feedRadius + 2;
  for (const o of f.objects) reach = Math.max(reach, Math.hypot(o.x, o.z) + o.r + 1);
  for (const ph of f.photos) reach = Math.max(reach, Math.hypot(ph.x, ph.z) + 1);
  const s = Math.min(box.width, box.height) / 2 / reach;
  const cx = box.width / 2, cy = box.height / 2;
  const P = (x: number, z: number) => [cx + x * s, cy + z * s] as const;

  // metre grid
  ctx.strokeStyle = css("--grid"); ctx.lineWidth = 1;
  const g = reach > 30 ? 10 : 5;
  for (let m = -Math.ceil(reach / g) * g; m <= reach; m += g) {
    const [a] = P(m, 0), [, b] = P(0, m);
    ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(a, box.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, b); ctx.lineTo(box.width, b); ctx.stroke();
  }
  // feed radius around the moving centre
  const [ccx, ccy] = P(f.center[0], f.center[2]);
  ctx.fillStyle = css("--feed-fill"); ctx.strokeStyle = css("--accent"); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ccx, ccy, p.feedRadius * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // bounding box
  if (f.bounds) {
    const [x0, y0] = P(f.bounds.min[0], f.bounds.min[2]), [x1, y1] = P(f.bounds.max[0], f.bounds.max[2]);
    ctx.setLineDash([4, 3]); ctx.strokeStyle = css("--muted"); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
  }
  // fusion pairs: B on its way to A
  ctx.strokeStyle = css("--pair"); ctx.lineWidth = 3.5; ctx.setLineDash([8, 5]);
  for (const pr of f.pairs) {
    const [ax, ay] = P(pr.ax, pr.az), [bx, by] = P(pr.bx, pr.bz);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.setLineDash([]);
  // objects
  for (const o of f.objects) {
    const [x, y] = P(o.x, o.z);
    ctx.fillStyle = css(`--st-${o.state}`);
    ctx.globalAlpha = o.state === "tot" ? 0.45 : 0.9;
    ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, o.r * s), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (o.photo) { ctx.strokeStyle = css("--photo"); ctx.lineWidth = 2; ctx.stroke(); }
    if (o.origin) { ctx.strokeStyle = css("--fg"); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, o.r * s) + 3, 0, Math.PI * 2); ctx.stroke(); }
    if (o.fusions > 0) { ctx.fillStyle = css("--surface"); ctx.font = `600 10px ${css("--font-data")}`; ctx.textAlign = "center"; ctx.fillText(String(o.fusions), x, y + 3.5); ctx.textAlign = "start"; }
  }
  // photos
  for (const ph of f.photos) {
    const [x, y] = P(ph.x, ph.z);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ph.gone ? css("--muted") : css("--photo");
    ctx.fillStyle = ph.used ? css("--photo") : "transparent";
    ctx.globalAlpha = ph.gone ? 0.5 : 1;
    ctx.beginPath(); ctx.rect(x - 4, y - 3, 8, 6); ctx.fill(); ctx.stroke();
    if (ph.blocked) { ctx.beginPath(); ctx.moveTo(x - 5, y - 4); ctx.lineTo(x + 5, y + 4); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  // drawings
  for (const d of f.drawings) {
    const [x, y] = P(d.x, d.z);
    const k = 6 * d.scale;
    ctx.strokeStyle = d.tex ? css("--st-aktiv") : css("--drawing"); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - k, y); ctx.quadraticCurveTo(x - k / 2, y - k, x, y); ctx.quadraticCurveTo(x + k / 2, y + k, x + k, y); ctx.stroke();
  }
  // planting point and centre
  const [px, py] = P(0, 0);
  ctx.strokeStyle = css("--fg"); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px - 6, py - 6); ctx.lineTo(px + 6, py + 6); ctx.moveTo(px + 6, py - 6); ctx.lineTo(px - 6, py + 6); ctx.stroke();
  // moving centre: a crosshair, so it never reads as an object
  ctx.lineWidth = 4; ctx.strokeStyle = css("--surface");
  ctx.beginPath(); ctx.moveTo(ccx - 11, ccy); ctx.lineTo(ccx + 11, ccy); ctx.moveTo(ccx, ccy - 11); ctx.lineTo(ccx, ccy + 11); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = css("--accent");
  ctx.beginPath(); ctx.moveTo(ccx - 11, ccy); ctx.lineTo(ccx + 11, ccy); ctx.moveTo(ccx, ccy - 11); ctx.lineTo(ccx, ccy + 11); ctx.stroke();
  ctx.beginPath(); ctx.arc(ccx, ccy, 6, 0, Math.PI * 2); ctx.stroke();
  // scale bar
  ctx.fillStyle = css("--muted"); ctx.font = `12px ${css("--font-data")}`;
  ctx.fillRect(12, box.height - 16, g * s, 2); ctx.fillText(`${g} m`, 12, box.height - 22);

  const tri = f.objects.filter((o) => o.state !== "tot" && !o.origin).reduce((n, o) => n + o.tri, 0);
  $("#frame-label").textContent = `Tag ${fmt(f.calendar, 1)} · Eigenzeit ${fmt(f.eigen, 1)} · ${fmt(f.objects.length)} Objekte · ${fmt(tri)} △`;
}

// --- side view (canvas): looking north, east to the right, height up

function renderSide() {
  if (!result) return;
  const f = result.frames[frameIndex];
  const p = result.world.params;
  const canvas = $<HTMLCanvasElement>("#side");
  const box = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  // horizontal reach like the top view, vertical: ground to above the limit
  let reach = p.feedRadius + 2;
  for (const o of f.objects) reach = Math.max(reach, Math.abs(o.x0) + 1, Math.abs(o.x1) + 1);
  let top = Math.max(p.maxTop + 0.5, 2.2), bottom = -0.6;
  for (const o of f.objects) { top = Math.max(top, o.y1 + o.sway + 0.2); bottom = Math.min(bottom, o.y0 - 0.2); }
  const padL = 40, padR = 12, padT = 12, padB = 22;
  const sx = (box.width - padL - padR) / (2 * reach);
  const sy = (box.height - padT - padB) / (top - bottom);
  const X = (x: number) => padL + (x + reach) * sx;
  const Y = (y: number) => padT + (top - y) * sy;
  // height grid
  ctx.font = `12px ${css("--font-data")}`; ctx.fillStyle = css("--muted"); ctx.strokeStyle = css("--grid"); ctx.lineWidth = 1;
  const stepM = top - bottom > 6 ? 1 : 0.5;
  for (let m = Math.ceil(bottom / stepM) * stepM; m <= top; m += stepM) {
    ctx.beginPath(); ctx.moveTo(padL, Y(m)); ctx.lineTo(box.width - padR, Y(m)); ctx.stroke();
    ctx.fillText(`${fmt(m, stepM < 1 ? 1 : 0)} m`, 2, Y(m) + 4);
  }
  // underground tint, ground line
  ctx.fillStyle = css("--grid"); ctx.globalAlpha = 0.6; ctx.fillRect(padL, Y(0), box.width - padL - padR, Y(bottom) - Y(0)); ctx.globalAlpha = 1;
  ctx.strokeStyle = css("--fg"); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(box.width - padR, Y(0)); ctx.stroke();
  // height limit
  ctx.setLineDash([6, 4]); ctx.strokeStyle = css("--drawing"); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, Y(p.maxTop)); ctx.lineTo(box.width - padR, Y(p.maxTop)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = css("--drawing"); ctx.fillText("Höhengrenze", box.width - padR - 80, Y(p.maxTop) - 5);
  // a person for scale (1.75 m) at the planting point's left edge
  const px = X(-reach) + 14;
  ctx.strokeStyle = css("--muted"); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, Y(1.62), 0.12 * sy, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px, Y(1.5)); ctx.lineTo(px, Y(0.85)); ctx.moveTo(px, Y(0.85)); ctx.lineTo(px - 0.18 * sy, Y(0)); ctx.moveTo(px, Y(0.85)); ctx.lineTo(px + 0.18 * sy, Y(0));
  ctx.moveTo(px - 0.25 * sy, Y(1.3)); ctx.lineTo(px + 0.25 * sy, Y(1.3)); ctx.stroke();
  // objects, farthest drawn first does not matter in a silhouette view
  for (const o of f.objects) {
    const x0 = X(o.x0), x1 = X(o.x1), y0 = Y(o.y0), y1 = Y(o.y1);
    if (o.sway > 0) { ctx.fillStyle = css(`--st-${o.state}`); ctx.globalAlpha = 0.18; ctx.fillRect(x0, Y(o.y1 + o.sway), x1 - x0, Y(o.y0) - Y(o.y1 + o.sway)); } // floats upwards only
    ctx.globalAlpha = o.state === "tot" ? 0.4 : 0.85;
    ctx.fillStyle = o.origin ? css("--kd-ursprung") : css(`--st-${o.state}`);
    ctx.fillRect(x0, y1, Math.max(1.5, x1 - x0), y0 - y1);
    ctx.globalAlpha = 1;
    if (o.photo) { ctx.strokeStyle = css("--photo"); ctx.lineWidth = 2; ctx.strokeRect(x0, y1, Math.max(1.5, x1 - x0), y0 - y1); }
  }
  // photos at eye height (on the platform they follow the viewer's height), drawings at their height
  for (const ph of f.photos) {
    if (ph.gone) continue;
    ctx.strokeStyle = css("--photo"); ctx.lineWidth = 1.5; ctx.fillStyle = ph.used ? css("--photo") : "transparent";
    ctx.beginPath(); ctx.rect(X(ph.x) - 4, Y(1.5) - 3, 8, 6); ctx.fill(); ctx.stroke();
  }
  for (const d of f.drawings) {
    const x = X(d.x), y = Y(d.y), k = 6 * d.scale;
    ctx.strokeStyle = d.tex ? css("--st-aktiv") : css("--drawing"); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - k, y); ctx.quadraticCurveTo(x - k / 2, y - k, x, y); ctx.quadraticCurveTo(x + k / 2, y + k, x + k, y); ctx.stroke();
  }
  const highest = f.objects.reduce((m, o) => Math.max(m, o.y1), 0);
  $("#side-label").textContent = `höchste Oberkante ${fmt(highest, 2)} m`;
}

function renderLog(r: RunResult) {
  const filter = ($<HTMLSelectElement>("#log-filter")).value;
  const rows = r.world.events.filter((e) => !filter || e.type.startsWith(filter));
  const shown = rows.slice(0, 600);
  $("#log").innerHTML = shown.map((e) =>
    `<tr><td class="num">${fmt(e.calendar, 2)}</td><td class="num">${fmt(e.eigen, 2)}</td><td>${esc(e.text)}</td></tr>`).join("") +
    (rows.length > shown.length ? `<tr><td colspan="3" class="more">… und ${fmt(rows.length - shown.length)} weitere</td></tr>` : "");
}

function setFrame(k: number) {
  if (!result) return;
  frameIndex = Math.max(0, Math.min(result.frames.length - 1, k));
  ($<HTMLInputElement>("#scrub")).value = String(frameIndex);
  renderMap();
  renderSide();
  renderCurve(result);
}

function recalc() {
  readForm();
  result = run(inputs);
  const scrub = $<HTMLInputElement>("#scrub");
  scrub.max = String(result.frames.length - 1);
  renderSummary(result);
  renderLog(result);
  setFrame(Math.round((result.frames.length - 1) * 0.35));
}

// ---------------------------------------------------------------- wiring

let timer: number | undefined;
let playing: number | undefined;

function init() {
  renderForm();
  $("#form-body").addEventListener("input", () => { clearTimeout(timer); timer = window.setTimeout(recalc, 350); });
  $("#reset").addEventListener("click", () => {
    inputs = { params: { ...PARAMS }, scenario: { ...SCENARIO_DEFAULTS }, starters: [...DEFAULT_STARTERS] };
    renderForm(); recalc();
  });
  $("#copy").addEventListener("click", async () => {
    const text = JSON.stringify(inputs, null, 2);
    const out = $("#copy-state");
    try { await navigator.clipboard.writeText(text); out.textContent = "Werte kopiert"; }
    catch {
      const ta = $<HTMLTextAreaElement>("#copy-fallback");
      ta.hidden = false; ta.value = text; ta.select();
      out.textContent = "Text markiert, bitte selbst kopieren";
    }
  });
  $("#scrub").addEventListener("input", (e) => setFrame(Number((e.target as HTMLInputElement).value)));
  $("#play").addEventListener("click", () => {
    const btn = $("#play");
    if (playing) { clearInterval(playing); playing = undefined; btn.textContent = "Abspielen"; return; }
    if (result && frameIndex >= result.frames.length - 1) setFrame(0);
    btn.textContent = "Anhalten";
    playing = window.setInterval(() => {
      if (!result || frameIndex >= result.frames.length - 1) { clearInterval(playing); playing = undefined; btn.textContent = "Abspielen"; return; }
      setFrame(frameIndex + 1);
    }, 60);
  });
  $("#log-filter").addEventListener("change", () => result && renderLog(result));
  // Click or drag in a chart: that day becomes the selected moment.
  for (const id of ["#curve", "#states", "#kinds", "#factor"]) {
    const el = $(id);
    const pick = (e: PointerEvent) => {
      const svg = el.querySelector("svg");
      if (!svg || !result) return;
      const box = svg.getBoundingClientRect();
      const x = ((e.clientX - box.left) / box.width) * 760; // viewBox width
      const day = ((x - 64) / (760 - 64 - 16)) * Math.max(1, result.world.calendar);
      let best = 0;
      result.frames.forEach((f, k) => { if (Math.abs(f.calendar - day) < Math.abs(result!.frames[best].calendar - day)) best = k; });
      setFrame(best);
    };
    el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); pick(e); });
    el.addEventListener("pointermove", (e) => { if (el.hasPointerCapture(e.pointerId)) pick(e); });
  }
  window.addEventListener("resize", () => { renderMap(); renderSide(); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { renderMap(); });
  recalc();
}

init();
