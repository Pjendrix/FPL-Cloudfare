/* Minileague Squad Check — start

   Předvyplnění formuláře, spuštění appky a registrace service workeru.
   Načítá se poslední, protože volá kód ze všech ostatních souborů.

   Soubory js/ se načítají jako klasické <script> v pevném pořadí a
   sdílejí jeden globální scope: nic se neexportuje ani neimportuje,
   ale hoisting přes hranici souboru neplatí. Pořadí je proto součást
   kontraktu a je vypsané v index.html.
   ============================================================ */
/* Kdo tu byl minule.

   enterApp() si ID ukládá do localStorage od začátku, ale start appky
   se na to nikdy nepodíval — koukal jen do CONFIG. Kdo měl CONFIG
   prázdný, dostal vstupní obrazovku po každém refreshi, přestože
   appka jeho ID celou dobu znala. Uložená hodnota má stejnou váhu
   jako CONFIG; z uživatelova pohledu je to totéž rozhodnutí, jen
   udělané kliknutím místo úpravy souboru.

   Vrátit se na vstupní obrazovku jde tlačítkem „Změnit ID“, které
   uložené hodnoty smaže. Bez něj by tohle byla past. */
const savedEntry = CONFIG.entryId || localStorage.getItem(ENTRY_KEY) || '';
const savedLeague = CONFIG.leagueId || localStorage.getItem(LEAGUE_KEY) || '';

$('eid').value = savedEntry;
$('lid').value = savedLeague;

if(savedEntry) enterApp(savedEntry, savedLeague);
else bootstrapGate();

/* Service worker drží skořápku appky offline. Data se nikdy necachují —
   zastaralé pořadí ligy je horší než chybová hláška. */
if('serviceWorker' in navigator && location.protocol === 'https:'){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
