/* Minileague Squad Check — společné UI

   Světlý a tmavý režim, přepínač zobrazení desktop/mobil, infotooltip,
   kolejnice sezóny, odznaky klubů a snapshoty miniligy.

   Soubory js/ se načítají jako klasické <script> v pevném pořadí a
   sdílejí jeden globální scope: nic se neexportuje ani neimportuje,
   ale hoisting přes hranici souboru neplatí. Pořadí je proto součást
   kontraktu a je vypsané v index.html.
   ============================================================ */
/* ============================================================
   SVĚTLO A TMA

   Appka je navržená jako světlá: stupnice obtížnosti i odznaky
   klubů čtou na papíře líp než na černé. Tma proto není na
   prefers-color-scheme — automatika by lidem s tmavým systémem
   podstrčila horší variantu, aniž by si o ni řekli.
   ============================================================ */
const THEME_KEY = 'fpl_theme';

function applyTheme(mode){
  const dark = mode === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', dark ? '#1A0620' : '#37003C');
  const btn = $('theme');
  if(btn){
    btn.textContent = dark ? '☀' : '☾';
    btn.setAttribute('aria-pressed', String(dark));
    btn.title = dark ? 'Přepnout světlý režim' : 'Přepnout tmavý režim';
    btn.setAttribute('aria-label', btn.title);
  }
}

// Výchozí je světlo. Uloženou volbu bereme, systémovou preferenci ne.
applyTheme(localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light');

if($('theme')) $('theme').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'light' : 'dark';
  lsSet(THEME_KEY, next);
  applyTheme(next);
});

/* ============================================================
   ZOBRAZENÍ: MOBIL / DESKTOP

   Responzivní pravidla nejsou v hlavním stylopisu, ale ve třech
   samostatných tazích s atributem `media`. Přepínač jen přepisuje
   ten atribut — žádná duplicitní sada pravidel, žádné !important.

     mobile   — media="all", mobilní rozvržení i na širokém monitoru
     desktop  — media="not all", plus viewport na pevných 1100 px,
                takže i na telefonu vyjde desktopová verze

   Třetí režim „auto“ tady byl a je pryč. Vypadal jako přívětivé
   výchozí nastavení, ale ve skutečnosti dělal z tlačítka hádanku:
   ⇔ neříkalo, co je vidět teď, jen že to rozhoduje někdo jiný.
   Cyklus přes tři stavy navíc znamenal, že přepnutí z mobilu na
   desktop chtělo dvě kliknutí. Teď jsou stavy dva a tlačítko
   ukazuje ten, do kterého se překlopí.

   Volbu za člověka pořád udělá appka — jen jednou, při prvním
   spuštění, podle šířky okna. Od té chvíle je to jeho volba.

   Viewport meta prohlížeč na desktopu ignoruje, na telefonu je to
   ale jediná cesta, jak desktopové rozvržení vůbec dostat — proto
   se mění obojí najednou.
   ============================================================ */
const VIEW_KEY = 'fpl_view';
const VIEW_MQ = {mqL: '(max-width:720px)', mqS: '(max-width:640px)',
                 mqM: '(max-width:720px)'};
const VIEW_MODES = ['mobile', 'desktop'];
// Popisek ukazuje cíl kliknutí, ne aktuální stav: na mobilu nabízí
// desktop a naopak. Tlačítko tak vždycky říká, co udělá.
const VIEW_LABEL = {mobile: '▭', desktop: '▯'};
const VIEW_TITLE = {mobile: 'Přepnout na desktop zobrazení',
                    desktop: 'Přepnout na mobilní zobrazení'};

/* Výchozí režim při prvním spuštění. Uložená volba má vždycky
   přednost — tohle se ptá jen tehdy, když ještě žádná není. */
function defaultView(){
  return window.matchMedia && window.matchMedia('(max-width:720px)').matches
    ? 'mobile' : 'desktop';
}

function applyView(mode){
  if(!VIEW_MODES.includes(mode)) mode = defaultView();
  document.documentElement.setAttribute('data-view', mode);

  Object.entries(VIEW_MQ).forEach(([id, mq]) => {
    const el = document.getElementById(id);
    if(!el) return;
    el.media = mode === 'mobile' ? 'all' : 'not all';
  });

  const vp = document.querySelector('meta[name="viewport"]');
  if(vp) vp.setAttribute('content', mode === 'desktop'
    ? 'width=1100' : 'width=device-width, initial-scale=1');

  const btn = $('viewmode');
  if(btn){
    btn.textContent = VIEW_LABEL[mode];
    btn.title = VIEW_TITLE[mode];
    btn.setAttribute('aria-label', btn.title);
  }
}

applyView(localStorage.getItem(VIEW_KEY) || defaultView());

if($('viewmode')) $('viewmode').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-view');
  const next = cur === 'mobile' ? 'desktop' : 'mobile';
  lsSet(VIEW_KEY, next);
  applyView(next);
});

/* ============================================================
   INFOTOOLTIP

   Appka měla přes sedmdesát vysvětlujících odstavců pod tabulkami.
   Každý sám o sobě dával smysl, dohromady z toho ale byla zeď textu,
   kterou nikdo nečetl a která odsouvala vlastní data pod ohyb.

   Text zůstává — jen se schová za „i“ vedle nadpisu a vyjede na
   kliknutí. Kdo to čte poprvé, najde ho; kdo appku zná, nevidí ho.

   Proč kliknutí a ne hover: na dotykovém displeji hover neexistuje
   a tooltip by byl nedostupný. Kliknutí funguje všude stejně.
   ============================================================ */
let TIP_SEQ = 0;

/* Vrací „i“ tlačítko i s obsahem. Vkládá se přímo do nadpisu. */
function info(html){
  const id = 'tip' + (++TIP_SEQ);
  return `<button type="button" class="i-tip" aria-expanded="false"
      aria-controls="${id}" title="Co to znamená">i</button>` +
    `<span class="tipbox" id="${id}" role="note" hidden>${html}</span>`;
}

/* Jedna delegovaná obsluha pro celý dokument — tooltipy vznikají
   při každém překreslení a věšet posluchače na každý zvlášť by
   znamenalo je po překreslení ztrácet. */
document.addEventListener('click', ev => {
  const btn = ev.target.closest('.i-tip');

  // Klik mimo zavře všechno otevřené.
  document.querySelectorAll('.i-tip[aria-expanded="true"]').forEach(b => {
    if(b === btn) return;
    b.setAttribute('aria-expanded', 'false');
    const box = document.getElementById(b.getAttribute('aria-controls'));
    if(box) box.hidden = true;
  });

  if(!btn) return;
  ev.preventDefault();

  const box = document.getElementById(btn.getAttribute('aria-controls'));
  if(!box) return;
  const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!open));
  box.hidden = open;
});

document.addEventListener('keydown', ev => {
  if(ev.key !== 'Escape') return;
  document.querySelectorAll('.i-tip[aria-expanded="true"]').forEach(b => {
    b.setAttribute('aria-expanded', 'false');
    const box = document.getElementById(b.getAttribute('aria-controls'));
    if(box) box.hidden = true;
    b.focus();
  });
});

/* ============================================================
   KOLEJNICE SEZÓNY

   38 čárek pod hlavičkou, jedna na kolo. Odehraná plná, aktuální
   mátová a plní se do deadlinu, budoucí vlásek. Prázdné kolo tvého
   kádru dostane červenou tečku, dvojité mátovou.

   Stojí to jen na datech, která už appka stahuje (events, fixtures),
   a je to jediné místo, kde je celá sezóna vidět naráz. Blanky
   a doubly byly dřív schované v Programu, takže je člověk viděl,
   jen když si o ně řekl.
   ============================================================ */
let RAIL_TIMER = null;

/* Kolik hráčů z kádru má v daném kole 0 nebo 2+ zápasy.
   Bez načteného kádru vrací prázdno — kolejnice pak jede bez teček. */
function railShape(){
  if(!BOOT || !FIX) return {};
  const out = {};
  const teams = MY_SQUAD
    ? new Set(BOOT.elements.filter(p => MY_SQUAD.has(p.id)).map(p => p.team))
    : null;
  if(!teams || !teams.size) return out;

  for(let gw = 1; gw <= 38; gw++){
    let blank = 0, dbl = 0;
    for(const t of teams){
      const c = gwFixtures(t, gw).length;
      if(c === 0) blank++;
      else if(c > 1) dbl++;
    }
    if(blank || dbl) out[gw] = {blank, dbl};
  }
  return out;
}

function drawRail(){
  const track = $('railTrack');
  if(!track || !BOOT) return;

  const cur = BOOT.events.find(e => e.is_current);
  const nxt = BOOT.events.find(e => e.is_next);
  const live = cur ? cur.id : (nxt ? nxt.id : 1);
  const shape = railShape();

  // Naplněnost aktuální čárky = kolik uplynulo od minulého deadlinu
  // k tomu nadcházejícímu. Bez nadcházejícího (poslední kolo) je plná.
  let fill = 100;
  if(nxt){
    const to = new Date(nxt.deadline_time).getTime();
    const prev = BOOT.events.filter(e => e.id < nxt.id).pop();
    const from = prev ? new Date(prev.deadline_time).getTime() : to - 7 * 864e5;
    fill = Math.max(0, Math.min(100, ((Date.now() - from) / (to - from)) * 100));
  }

  const html = [];
  for(let g = 1; g <= 38; g++){
    const sh = shape[g];
    const cls = ['gw'];
    if(g < live) cls.push('past');
    if(g === live) cls.push('now');
    if(sh && sh.dbl && !sh.blank) cls.push('dbl');

    const label = 'GW' + g
      + (sh && sh.blank ? ' · ' + sh.blank + '× volno' : '')
      + (sh && sh.dbl ? ' · ' + sh.dbl + '× dvojité' : '');

    html.push(`<span class="${cls.join(' ')}" data-gw="GW${g}" title="${esc(label)}"
      ${g === live ? `style="--fill:${fill.toFixed(1)}%"` : ''}
      ><i></i>${sh ? '<b></b>' : ''}</span>`);
  }
  track.innerHTML = html.join('');
  track.setAttribute('aria-label',
    `Sezóna: kolo ${live} z 38` + (Object.keys(shape).length
      ? `, ${Object.keys(shape).length} kol s volnem nebo dvojitým zápasem` : ''));

  $('rail').hidden = false;
  const key = $('railKey');
  if(key){
    key.hidden = !Object.keys(shape).length;
    const scope = $('railScope');
    if(scope) scope.textContent = MY_SQUAD
      ? 'podle tvého kádru' : 'kádr zatím nenačtený';
  }

  // Přepočet po minutě, ať se aktuální čárka plní i při otevřené appce.
  if(RAIL_TIMER) clearInterval(RAIL_TIMER);
  RAIL_TIMER = setInterval(drawRail, 60000);
}

/* ============================================================
   ODZNAKY KLUBŮ

   Klíčem je teams[].code z bootstrapu, ne id — code přežívá mezi
   sezónami, id se přehazuje podle abecedy. Obrázek jde přes vlastní
   /api/badge, protože CSP má img-src 'self' a cizí doménu zablokuje.

   Když odznak na CDN není (typicky čerstvý nováček), spadneme na
   vlastní barevnou značku z club-marks.svg. Proto onerror.
   ============================================================ */
/* ============================================================
   DRESY

   Dres se kreslí, ne stahuje: jeden tvar, do kterého se pustí primární
   barva, doplňková a vzor. Žádný request navíc, funguje offline a tým,
   pro který barvy nemáme, dostane auberginový dres — nikdy prázdné místo.

   clipPath potřebuje unikátní id; kdyby se opakovalo, prohlížeč použije
   první výskyt a všechny dresy by měly tvar toho prvního.
   ============================================================ */
const KIT = {
  ARS:{p:'#EF0107', s:'#FFFFFF', w:'sleeves'},
  AVL:{p:'#95BFE5', s:'#670E36', w:'halves'},
  BOU:{p:'#DA291C', s:'#000000', w:'stripes'},
  BRE:{p:'#E30613', s:'#FFFFFF', w:'stripes'},
  BHA:{p:'#0057B8', s:'#FFFFFF', w:'stripes'},
  BUR:{p:'#6C1D45', s:'#99D6EA', w:'plain'},
  CHE:{p:'#034694', s:'#034694', w:'plain'},
  CRY:{p:'#1B458F', s:'#C4122E', w:'stripes'},
  EVE:{p:'#003399', s:'#FFFFFF', w:'plain'},
  FUL:{p:'#FFFFFF', s:'#000000', w:'sleeves'},
  IPS:{p:'#3A64A3', s:'#FFFFFF', w:'plain'},
  LEE:{p:'#FFFFFF', s:'#1D428A', w:'plain'},
  LEI:{p:'#003090', s:'#FDBE11', w:'plain'},
  LIV:{p:'#C8102E', s:'#C8102E', w:'plain'},
  MCI:{p:'#6CABDD', s:'#1C2C5B', w:'plain'},
  MUN:{p:'#DA291C', s:'#000000', w:'plain'},
  NEW:{p:'#241F20', s:'#FFFFFF', w:'stripes'},
  NFO:{p:'#DD0000', s:'#DD0000', w:'plain'},
  SOU:{p:'#D71920', s:'#FFFFFF', w:'stripes'},
  SUN:{p:'#EB172B', s:'#FFFFFF', w:'stripes'},
  TOT:{p:'#FFFFFF', s:'#132257', w:'plain'},
  WHU:{p:'#7A263A', s:'#1BB1E7', w:'sleeves'},
  WOL:{p:'#FDB913', s:'#231F20', w:'plain'},
};
let KIT_ID = 0;

function kit(shortName){
  const k = KIT[shortName] || {p:'#37003C', s:'#FFFFFF', w:'plain'};
  const id = 'kit' + (++KIT_ID);
  const body = '<path d="M30 8 L42 4 Q50 13 58 4 L70 8 L94 24 L82 44 L74 37'
             + ' L74 104 L26 104 L26 37 L18 44 L6 24 Z"/>';
  let vzor = '';
  if(k.w === 'stripes') vzor = [38, 54, 70]
    .map(x => `<rect x="${x}" y="0" width="8" height="108" fill="${k.s}"/>`).join('');
  else if(k.w === 'halves') vzor = `<rect x="50" y="0" width="50" height="108" fill="${k.s}"/>`;
  else if(k.w === 'sleeves') vzor =
    `<path d="M26 8 L6 24 L18 44 L26 37 Z" fill="${k.s}"/>`
  + `<path d="M74 8 L94 24 L82 44 L74 37 Z" fill="${k.s}"/>`;

  return `<svg viewBox="0 0 100 108" aria-hidden="true" focusable="false">
    <defs><clipPath id="${id}">${body}</clipPath></defs>
    <g clip-path="url(#${id})">
      <rect width="100" height="108" fill="${k.p}"/>${vzor}
      <path d="M42 4 Q50 13 58 4 L58 0 L42 0 Z" fill="rgba(0,0,0,.28)"/>
    </g>
    <g fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2">${body}</g>
  </svg>`;
}

function crest(teamId, cls){
  const t = BOOT && BOOT.teams.find(x => x.id === teamId);
  if(!t) return '';
  const sn = esc(t.short_name);
  const fb = `this.onerror=null;this.outerHTML='<svg class=&quot;crest ${cls || ''}&quot;`
    + ` role=&quot;img&quot; aria-label=&quot;${sn}&quot;><use href=&quot;#club-${sn}&quot;/></svg>'`;
  return `<img class="crest ${cls || ''}" src="/api/badge?code=${t.code}&size=50"
    alt="" width="21" height="21" loading="lazy" decoding="async" onerror="${fb}">`;
}

/* ============================================================
   SNAPSHOTY MINILIGY

   Hub uměl říct, jak si kdo stojí. Neuměl říct, co se změnilo od
   minula — z aktuálního stavu se to dopočítat nedá.

   Ukládáme proto po každém kole pořadí a body. Je to localStorage,
   takže na jiném zařízení je snapshot prázdný; server-side úložiště
   (Vercel KV) je další krok, ale tohle funguje hned a bez účtu.
   ============================================================ */
const SNAP_KEY = () =>
  'fpl_snap:' + (CONFIG.leagueId || localStorage.getItem('fpl_league') || '0');

function loadSnaps(){
  try{ return JSON.parse(localStorage.getItem(SNAP_KEY()) || '{}'); }
  catch(e){ return {}; }
}

/* Snapshot se ukládá pod číslem kola. Přepsat starý nesmíme —
   změnil by se tím i výpočet posunu, který na něj odkazuje. */
function saveSnap(gw, members){
  const all = loadSnaps();
  if(all[gw]) return all;
  all[gw] = members.slice(0, 60).map(m => ({
    id: m.entry, r: m.rank, t: m.total,
  }));
  // Držíme posledních osm kol; víc se do localStorage nevejde bezpečně.
  const keys = Object.keys(all).map(Number).sort((a, b) => a - b);
  while(keys.length > 8) delete all[keys.shift()];
  try{ lsSet(SNAP_KEY(), JSON.stringify(all)); }catch(e){}
  return all;
}

/* Posun v tabulce proti nejbližšímu staršímu snapshotu. */
function rankDelta(entryId, gw){
  const all = loadSnaps();
  const prev = Object.keys(all).map(Number).filter(g => g < gw).sort((a, b) => b - a)[0];
  if(!prev) return null;
  const row = all[prev].find(x => x.id === entryId);
  return row ? row.r : null;
}

function deltaChip(now, before){
  if(before === null || before === undefined) return '';
  const d = before - now;
  if(d === 0) return '<span class="delta same" title="beze změny">–</span>';
  return `<span class="delta ${d > 0 ? 'up' : 'down'}"
    title="proti minulému kolu">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>`;
}
