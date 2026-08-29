/* Minileague Squad Check — jádro

   Konfigurace, proxy na FPL API a její cache, načtení kádru, přepínání
   záložek (TABS, selectTab), vstupní obrazovka a tvrdé obnovení.
   Všechno ostatní na tomhle stojí — musí se načíst první.

   Soubory js/ se načítají jako klasické <script> v pevném pořadí a
   sdílejí jeden globální scope: nic se neexportuje ani neimportuje,
   ale hoisting přes hranici souboru neplatí. Pořadí je proto součást
   kontraktu a je vypsané v index.html.
   ============================================================ */
/* ============================================================
   KONFIGURACE — vyplň si tady svoje ID a máš appku "svoji".
   ============================================================ */
const CONFIG = {
  /* ---------------------------------------------------------------
     REŽIM JEDNÉ MINILIGY

     Vyplň `leagueId` a appka přestane být obecným nástrojem: stáhne si
     soupisku ligy a na vstupní obrazovce nabídne rozbalovací seznam
     jmen místo pole na číselné ID. Nikdo pak nemusí lovit svoje entry ID
     v adrese FPL — vybere se ze seznamu.

     Prázdné `leagueId` vrátí původní chování se dvěma poli.
     --------------------------------------------------------------- */
  leagueId: '14044',
  entryId: '',

  // Název v hlavičce a na vstupu. Prázdné = vezme se z FPL.
  leagueName: 'O pohár Ládi Stropnického',

  /* Sezóny, které se v lize hrály „oficiálně“, a kdo v nich nastoupil.

     FPL zná jen celkové body každého manažera — netuší, že v prvních
     třech ročnících byli u toho jen tři lidé. Bez tohohle by se medaile
     rozdávaly i lidem, kteří tehdy hráli sami za sebe jinde.

     Klíč je název sezóny z API, hodnota seznam jmen nebo entry ID.
     Sezóna, která tu není, se počítá pro všechny členy ligy. */
  officialSeasons: {
    '2020/21': ['Krystof Benka', 'Filip Buddeus', 'Adam Vrzal'],
    '2021/22': ['Krystof Benka', 'Filip Buddeus', 'Adam Vrzal'],
    '2022/23': ['Krystof Benka', 'Filip Buddeus', 'Adam Vrzal'],
  },

  /* Kdo se do ligy přidal později. Doplňuje `officialSeasons` pro roky,
     kdy nebyla soupiska pevná — vypsat u každé sezóny všechny členy by
     bylo dlouhé a rozbilo by se to při každém dalším příchodu.

     Sezóny před uvedenou se počítají jako „hrál FPL, ale mimo tuhle ligu“.
     Kdo tu není, počítá se od začátku. Klíč je jméno nebo entry ID. */
  memberSince: {
    'Adam Marko': '2025/26',
  },
};

const S = {a:['OK','ok'],d:['Pochybný','wn'],i:['Zraněný','al'],
           s:['Suspendovaný','al'],u:['Nedostupný','al'],n:['Neregistrovaný','al']};
const POS = {1:'GKP',2:'DEF',3:'MID',4:'FWD'};
const $ = id => document.getElementById(id);
// Apostrof je v seznamu schválně: dneska jsou všechny atributy v dvojitých
// uvozovkách, ale stačí jedna výjimka a chybějící &#39; se stane dírou.
const esc = s => String(s).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ------------------------------------------------------------
   Přístup k FPL API.

   Tři vrstvy nad prostým fetch, každá řeší jeden konkrétní problém:

   1. api()      — jeden dotaz, s opakováním při 429. FPL rate limit
                   nevrací trvalou chybu, jen říká „počkej“.
   2. cached()   — paměť na dobu života stránky. Miniliga a hub tahají
                   přesně stejné adresy; podruhé už se nikam nechodí.
   3. pooled()   — fronta s omezenou souběžností. Padesátičlenná liga
                   znamená sto dotazů; poslané najednou skončí na 429.
   ------------------------------------------------------------ */

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(p, tries = 3){
  for(let attempt = 0; ; attempt++){
    const r = await fetch('/api/fpl?path=' + encodeURIComponent(p));
    const ct = r.headers.get('content-type') || '';

    if(!ct.includes('application/json')){
      throw new Error('Serverová funkce /api/fpl neodpovídá (' + r.status + '). '
        + 'Zkontroluj, že je nasazený soubor api/fpl.js a package.json.');
    }

    const data = await r.json();
    if(r.ok){ API_LAST = Date.now(); return data; }

    // 429 není chyba, je to žádost o strpení. Čekáme déle po každém pokusu.
    if(r.status === 429 && attempt < tries - 1){
      const hinted = Number(r.headers.get('retry-after')) || 0;
      await sleep(Math.max(hinted * 1000, 700 * Math.pow(2, attempt)));
      continue;
    }

    throw new Error((data.error || 'Chyba') + ' — ' + p + ' (' + r.status + ')');
  }
}

/* Kdy se naposled něco doopravdy stáhlo. Pruh se stavem dat z toho
   dělá čas „data před 3 min“ — bez něj se nedá poznat rozdíl mezi
   „nic se nezměnilo“ a „appka se od rána nezeptala“. */
let API_LAST = null;

let API_CACHE = new Map();

function cached(p){
  if(!API_CACHE.has(p)) API_CACHE.set(p, api(p).catch(e => { API_CACHE.delete(p); throw e; }));
  return API_CACHE.get(p);
}

/* Zahodí z cache všechno, co odpovídá vzoru.

   Bez tohohle by tlačítko „Aktualizovat“ nic neaktualizovalo: cache žije
   po celou dobu života stránky, takže by se vrátila tatáž data, jen by
   se překreslila. Po deadlinu nebo během kola je to přesně to, co člověk
   nechce. */
function dropCached(re){
  for(const key of [...API_CACHE.keys()]) if(re.test(key)) API_CACHE.delete(key);
}

/* Zpracuje seznam po `limit` položkách naráz.
   onDone(hotovo, celkem) se volá po každé — panely tím ukazují postup. */
async function pooled(items, fn, limit = 5, onDone = null){
  const out = new Array(items.length);
  let next = 0, done = 0;

  async function worker(){
    while(next < items.length){
      const i = next++;
      try { out[i] = await fn(items[i], i); }
      catch(e){ out[i] = null; }
      done++;
      if(onDone) onDone(done, items.length);
    }
  }

  await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
  return out;
}

/* Pořadí miniligy chodí po 50 na stránku. Bez tohohle se liga o 120 lidech
   tiše ořízne na prvních 50 a nikdo se to nedozví. */
const LEAGUE_CAP = 200;

async function fetchStandings(lid, onPage = null){
  let page = 1, all = [], st = null;

  while(true){
    const suffix = page === 1 ? '' : '?page_standings=' + page;
    const data = await cached('leagues-classic/' + lid + '/standings/' + suffix);
    if(!st) st = data;

    all = all.concat(data.standings.results);
    if(onPage) onPage(all.length);

    if(!data.standings.has_next || all.length >= LEAGUE_CAP) break;
    page++;
  }

  return {league: st.league, members: all.slice(0, LEAGUE_CAP), truncated: all.length >= LEAGUE_CAP};
}

let BOOT = null, FIX = null;
let MY_SQUAD = null;   // Set(playerId) — naplní se po načtení vlastní sestavy
/* Body za probíhající kolo počítá render() ze živých dat. Přehled je
   potřebuje taky a přepočítávat je podruhé by znamenalo držet dvě
   definice téhož čísla. */
let LAST_LIVE_TOTAL = null;
let ENTRY_ID = null;   // aktuálně otevřený tým; klíčuje localStorage i cache

async function load(id){
  ENTRY_ID = parseInt(id, 10);
  $('msg').textContent = 'Načítám…';
  $('out').innerHTML = '<div class="skel"><i></i><i></i><i></i><i></i><i></i></div>';
  try{
    if(!BOOT){ [BOOT, FIX] = await Promise.all([api('bootstrap-static/'), api('fixtures/')]); }
    startCountdown();
    drawRail();
    drawStatus();
    if(typeof drawChip === 'function') drawChip();

    const cur = BOOT.events.find(e => e.is_current);
    const nxt = BOOT.events.find(e => e.is_next);
    const startGw = nxt ? nxt.id : (cur ? cur.id + 1 : 1);
    const pickGw = cur ? cur.id : 1;

    const entry = await api('entry/' + id + '/');
    setWhoName(entry);

    let picks = null;
    if(cur){
      try { picks = await api('entry/' + id + '/event/' + pickGw + '/picks/'); }
      catch(e){ picks = null; }
    }

    // Body, které hráči v probíhajícím kole reálně mají. Dokud kolo běží,
    // je to zajímavější než projekce na to příští — projekci si člověk
    // otevře v neděli večer, ale v sobotu chce vědět, jak na tom je.
    let live = null;
    if(cur){
      try {
        live = liveStats(await cached('event/' + pickGw + '/live/'));
      } catch(e){ live = null; }
    }

    if(picks){
      render(entry, picks, startGw, {live, gw: pickGw, finished: cur && cur.finished});
      $('msg').textContent = '';
      HOME = {entry, picks, startGw, liveTotal: LAST_LIVE_TOTAL};
      drawHome();
    } else {
      HOME = {entry, picks: null, startGw, liveTotal: null};
      drawHome();
      renderPreseason(entry, startGw);
      $('msg').innerHTML = 'Sestava zatím není veřejná — FPL ji zpřístupní až po deadlinu '
        + 'GW' + startGw + '. Zatím ukazuju stav hráčů v celé lize.';
    }
  }catch(e){
    $('msg').innerHTML = errBox(e.message, null, () => load(ENTRY_ID));
  }
}

/* ============================================================
   EFEKTIVNÍ SESTAVA — autosuby a kapitánská páska

   FPL nepočítá body podle toho, koho manažer postavil, ale podle toho,
   kdo nakonec hrál. Když někdo ze základu neodehraje ani minutu,
   nastoupí za něj náhradník z lavičky v pořadí 12→15, pokud to dovolí
   formace. A když neodehraje kapitán, přechází násobička na
   vicekapitána.

   Appka tohle dřív nedělala nikde: dres na Přehledu, živá tabulka
   Miniligy, H2H skóre i ceny kola sčítaly hráče s `multiplier > 0` a nic
   víc. Po dohraném kole tím ukazovaly méně bodů, než manažer doopravdy
   měl — a u H2H to znamenalo zápas, který mohl skončit obráceně, než
   jak dopadl.

   Proto jedna funkce a čtyři místa, která ji volají. Kdyby FPL pravidla
   změnilo, mění se to tady, ne na čtyřech místech s pokaždé trochu
   jiným zaokrouhlením.

   Vstup:
     pk    — objekt z entry/{id}/event/{gw}/picks/
     stats — Map(playerId → {minutes, total_points}) z event/{gw}/live/
     gw    — číslo kola; slouží k dohledání rozpisu

   Výstup: {rows, total, benchTotal, toPlay, capId, subs}
   ============================================================ */

/* Odehrál hráč pro tohle kolo všechno, co měl?

   Podstatné pro autosuby: dokud jeho tým ještě hraje, není nula nula —
   je to „zatím“. FPL substituci provede až po posledním zápase kola,
   takže dřív ji dělat nesmíme ani my, jinak by se během soboty střídalo
   tam a zpátky.

   Bez rozpisu (nebo u hráče bez zápasu) se odpovídá `false`: raději
   nesubstituovat než substituovat na základě dohadu. */
function playerDone(pid, gw){
  const el = (BOOT && BOOT.elements || []).find(p => p.id === pid);
  if(!el || !Array.isArray(FIX)) return false;
  const fs = FIX.filter(f => f.event === gw &&
    (f.team_h === el.team || f.team_a === el.team));
  if(!fs.length) return false;   // blank: střídat za koho není proč čekat, ale ani není jistota
  return fs.every(f => f.finished || f.finished_provisional);
}

/* Smí sestava vypadat takhle? FPL uznává 1 brankáře, aspoň 3 obránce
   a aspoň jednoho útočníka; víc pravidel netřeba, zbytek z toho plyne
   (na patnáctičlenný kádr nezbyde než mít aspoň dva záložníky). */
function validShape(types){
  const c = t => types.filter(x => x === t).length;
  return types.length === 11 && c(1) === 1 && c(2) >= 3 && c(4) >= 1;
}

function resolveLineup(pk, stats, gw){
  const els = Object.fromEntries((BOOT.elements || []).map(p => [p.id, p]));
  const st = id => stats && stats.get(id) || null;
  const mins = id => { const x = st(id); return x ? (x.minutes || 0) : 0; };
  const pts  = id => { const x = st(id); return x ? (x.total_points || 0) : 0; };

  const picks = (pk.picks || []).slice().sort((a, b) => a.position - b.position);
  const bench = picks.filter(x => x.position > 11);

  /* Bench Boost hraje celý kádr, takže není koho a za koho střídat.
     Rozeznává se podle násobičky na lavičce, ne podle názvu čipu —
     `active_chip` u cizích manažerů občas chybí. */
  const bboost = pk.active_chip === 'bboost' || bench.some(x => x.multiplier > 0);

  // Efektivní násobička; výchozí je ta z picku.
  const mult = new Map(picks.map(x => [x.element, x.multiplier]));
  const subs = [];   // [{out, in}] — jen pro zobrazení

  if(!bboost){
    const xi = picks.filter(x => x.position <= 11).map(x => x.element);
    const typ = id => (els[id] ? els[id].element_type : 0);
    const lavice = bench.map(x => x.element);

    for(const out of xi.slice()){
      if(mins(out) > 0 || !playerDone(out, gw)) continue;

      for(const cand of lavice){
        if(mins(cand) <= 0 || subs.some(s => s.in === cand)) continue;

        // Brankář se střídá jen za brankáře; u ostatních rozhoduje formace.
        const zkus = xi.map(id => (id === out ? cand : id)).map(typ);
        if(!validShape(zkus)) continue;

        const i = xi.indexOf(out);
        xi[i] = cand;
        mult.set(cand, 1);
        mult.set(out, 0);
        subs.push({out, in: cand});
        break;
      }
    }
  }

  /* Kapitánská páska. Když kapitán neodehrál a jeho zápasy skončily,
     přebírá ji vicekapitán — i s trojnásobkem, pokud je aktivní Triple
     Captain. Když nehrál ani vicekapitán, nezdvojuje se nikdo. */
  const cptn = picks.find(x => x.is_captain);
  const vice = picks.find(x => x.is_vice_captain);
  let capId = cptn ? cptn.element : null;

  if(cptn && mins(cptn.element) === 0 && playerDone(cptn.element, gw) && vice){
    const nasobek = cptn.multiplier > 1 ? cptn.multiplier : 2;
    mult.set(cptn.element, mult.get(cptn.element) > 0 ? 1 : 0);
    if(mult.get(vice.element) > 0 || mins(vice.element) > 0){
      mult.set(vice.element, nasobek);
      capId = vice.element;
    }
  }

  const rows = picks.map(x => ({
    pick: x, element: x.element, mult: mult.get(x.element) || 0,
    raw: pts(x.element), pts: pts(x.element) * (mult.get(x.element) || 0),
    minutes: mins(x.element), played: mins(x.element) > 0,
    subbedIn: subs.some(s => s.in === x.element),
    subbedOut: subs.some(s => s.out === x.element),
    captain: x.element === capId,
  }));

  const cost = (pk.entry_history && pk.entry_history.event_transfers_cost) || 0;
  const total = rows.reduce((a, r) => a + r.pts, 0) - cost;
  const benchTotal = rows.filter(r => !r.mult).reduce((a, r) => a + r.raw, 0);
  const toPlay = rows.filter(r => r.mult > 0 && !r.played).length;

  return {rows, total, benchTotal, toPlay, capId, subs, cost, bboost};
}

/* Mapa hráč → statistiky z event/{gw}/live/. Všechny volající chtějí
   totéž, tak ať to nedělá každý po svém. */
function liveStats(data){
  return new Map(((data && data.elements) || []).map(e => [e.id, e.stats || {}]));
}

function fdr(teamId, startGw, n){
  const out = [];
  for(const f of FIX){
    if(f.event === null || f.event < startGw || f.event >= startGw + n) continue;
    if(f.team_h === teamId) out.push([f.event, f.team_a, 'H', f.team_h_difficulty]);
    else if(f.team_a === teamId) out.push([f.event, f.team_h, 'A', f.team_a_difficulty]);
  }
  out.sort((a,b) => a[0]-b[0]);
  const avg = out.length ? out.reduce((s,x) => s+x[3], 0)/out.length : null;
  return {list: out, avg};
}

/* Zápasy jednoho týmu v jednom konkrétním kole.
   Délka pole je to podstatné: 0 = blank, 2 = double. FPL tuhle informaci
   nikde neposkytuje přímo, plyne až z rozpisu. */
function gwFixtures(teamId, gw){
  const out = [];
  for(const f of FIX){
    if(f.event !== gw) continue;
    if(f.team_h === teamId) out.push({opp: f.team_a, home: true, d: f.team_h_difficulty});
    else if(f.team_a === teamId) out.push({opp: f.team_h, home: false, d: f.team_a_difficulty});
  }
  return out;
}

/* Přehled blanků a doublů napříč ligou pro rozsah kol. */
function gwShape(startGw, n){
  const out = [];
  for(let gw = startGw; gw < startGw + n; gw++){
    const blanks = [], doubles = [];
    for(const t of BOOT.teams){
      const c = gwFixtures(t.id, gw).length;
      if(c === 0) blanks.push(t);
      else if(c > 1) doubles.push(t);
    }
    out.push({gw, blanks, doubles});
  }
  return out;
}

function renderPreseason(entry, startGw){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  const flagged = BOOT.elements
    .filter(p => p.status !== 'a' || p.chance_of_playing_next_round !== null)
    .map(p => ({p, team: teams[p.team],
                chance: p.chance_of_playing_next_round === null ? 100 : p.chance_of_playing_next_round}))
    .sort((a,b) => (a.chance - b.chance) || (parseFloat(b.p.selected_by_percent) - parseFloat(a.p.selected_by_percent)));

  const fdrRows = BOOT.teams.map(t => {
    const f = fdr(t.id, startGw, 5);
    return {short: t.short_name, name: t.name, avg: f.avg, n: f.list.length,
            prog: f.list.map(x => teams[x[1]].short_name + (x[2] === 'H' ? ' (D)' : ' (V)')).join(' · ')};
  }).filter(r => r.avg !== null).sort((a,b) => a.avg - b.avg);

  $('out').innerHTML = `
    <div class="meta">
      <div><div class="k">Tým</div><div class="v">${esc(entry.name)}</div></div>
      <div><div class="k">Manažer</div><div class="v">${esc(entry.player_first_name + ' ' + entry.player_last_name)}</div></div>
      <div><div class="k">Další kolo</div><div class="v">GW${startGw}</div></div>
      <div><div class="k">Hlášení</div><div class="v">${flagged.length}</div></div>
    </div>

    <h2>Zranění a suspendovaní · celá liga</h2>
    <table>
      <thead><tr>
        <th>Hráč</th><th class="hide-s">Tým</th><th>Poz</th>
        <th class="n">Cena</th><th class="n hide-s">Vlastní %</th>
        <th>Stav</th><th class="hide-s">Zpráva</th>
      </tr></thead>
      <tbody>${flagged.map(s => `<tr>
        <td><b>${esc(s.p.web_name)}</b></td>
        <td class="hide-s">${esc(s.team.short_name)}</td>
        <td>${POS[s.p.element_type]}</td>
        <td class="n">${(s.p.now_cost/10).toFixed(1)}</td>
        <td class="n hide-s">${s.p.selected_by_percent}</td>
        <td class="st ${S[s.p.status][1]}">${S[s.p.status][0]}${s.chance < 100 ? ' ' + s.chance + '%' : ''}</td>
        <td class="hide-s" style="color:var(--mute);font-size:12.5px">${esc(s.p.news || '—')}</td>
      </tr>`).join('')}</tbody>
    </table>

    <h2>Program na 5 kol · nejlehčí nahoře</h2>
    <table>
      <thead><tr><th>Tým</th><th class="n">FDR</th><th class="n">Záp.</th><th>Soupeři</th></tr></thead>
      <tbody>${fdrRows.map(r => `<tr>
        <td><b>${esc(r.short)}</b></td>
        <td class="n">${r.avg.toFixed(2)}</td>
        <td class="n">${r.n}</td>
        <td style="color:var(--mute);font-size:12.5px">${esc(r.prog)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

function render(entry, picks, startGw, liveCtx){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));

  MY_SQUAD = new Set(picks.picks.map(pk => pk.element));
  // Teď teprve víme, kdo má v kterém kole volno — kolejnice dostane tečky.
  drawRail();

  const live = liveCtx && liveCtx.live;
  const liveGw = liveCtx ? liveCtx.gw : null;

  /* Efektivní sestava po autosubech a po případném přesunu kapitánské
     pásky. Bez ní by dres ukazoval nulu u hráče, za kterého FPL dávno
     nasadilo náhradníka — a součet kola by byl nižší než na webu FPL. */
  const lineup = live ? resolveLineup(picks, live, liveGw) : null;
  const efekt = lineup
    ? new Map(lineup.rows.map(r => [r.element, r])) : null;

  const squad = picks.picks.map(pk => {
    const p = els[pk.element];
    const f = fdr(p.team, startGw, 5);

    // Body, které hráč v probíhajícím kole opravdu má, včetně násobiče
    // za kapitána. `played` odlišuje nulu od „ještě nenastoupil“ —
    // to jsou dvě úplně jiné zprávy.
    const st = live ? live.get(pk.element) : null;
    const ef = efekt ? efekt.get(pk.element) : null;
    const gwPts = ef ? ef.pts : null;

    return {p, pk, team: teams[p.team], f, ef,
            // Kdo přišel autosubem, hraje — i když ho manažer nepostavil.
            starting: ef ? ef.mult > 0 : pk.position <= 11,
            st, gwPts,
            played: st ? st.minutes > 0 : false,
            chance: p.chance_of_playing_next_round === null ? 100 : p.chance_of_playing_next_round};
  });

  const rows = {1:[],2:[],3:[],4:[]};
  squad.filter(s => s.starting).forEach(s => rows[s.p.element_type].push(s));

  // Součet za kolo — to je číslo, kvůli kterému se člověk během soboty dívá.
  const liveTotal = lineup ? lineup.total : null;
  LAST_LIVE_TOTAL = liveTotal;
  if(typeof drawChip === 'function') drawChip();

  const benchTotal = lineup ? lineup.benchTotal : null;
  const toPlay = lineup ? lineup.toPlay : null;

  /* Na dresu je během kola to, co hráč skutečně nasbíral. FDR na příští
     kolo se vrátí, jakmile kolo skončí a začne se plánovat další. */
  const shirt = s => {
    /* Páska podle toho, kdo ji opravdu má: když kapitán neodehrál,
       přešla na vicekapitána a dres to musí ukázat, jinak nesedí
       zdvojené body s označením. */
    const jeCap = s.ef ? s.ef.captain : s.pk.is_captain;
    const cap = jeCap ? '<span class="cap">C</span>'
              : s.pk.is_vice_captain ? '<span class="cap v">V</span>' : '';

    const foot = live
      ? (s.played
          ? `<div class="pts ${s.gwPts >= 6 ? 'hi' : s.gwPts >= 3 ? 'md' : 'lo'}">${s.gwPts}</div>`
          : '<div class="pts wait">–</div>')
      : `<div class="fd">FDR ${s.f.avg ? s.f.avg.toFixed(1) : '–'}</div><div class="mn"></div>`;

    const foot2 = live
      ? `<div class="mn${s.played ? '' : ' wait'}">${
          s.played ? s.st.minutes + '′' : 'zatím nehrál'}</div>`
      : '';

    return `<div class="shirt ${s.p.status}${live && s.played ? ' done' : ''}${
        live && !s.played ? ' wait' : ''}">
      ${cap}
      <span class="kit">${kit(s.team.short_name)}</span>
      <div class="nm">${esc(s.p.web_name)}</div>
      <div class="tm">${esc(s.team.short_name)}</div>
      ${foot}${foot2}
    </div>`;
  };

  /* --- kapitán, optimální jedenáctka a tvar programu ---
     Tohle je jediná část panelu, která něco doporučuje. Všechno ostatní
     jen popisuje stav; tady appka říká, co by udělala jinak. */

  /* Hlavní číslo je oficiální projekce FPL (`ep_next`). Můj model slouží
     jen jako druhý pohled a jako záloha, když FPL projekci nepošle —
     a u double kol, která `ep_next` nezohledňuje, protože je vždy
     za jedno kolo bez ohledu na počet zápasů. */
  const withXp = squad.map(s => {
    const ep = epNext(s.p);
    const model = projectGw(s.p, startGw);
    const games = gwFixtures(s.p.team, startGw).length;
    return {...s, ep, model, games,
            // v doublu má FPL projekce jen jeden zápas, model oba
            xp: ep === null ? model : (games > 1 ? Math.max(ep, model) : ep)};
  });
  const best = bestEleven(withXp);

  /* Doporučení kapitána podle xP a optimální jedenáctka odsud odešly.

     Důvod: `ep_next` chodí od FPL zaokrouhlené na desetinu a u špičkových
     hráčů vychází prakticky stejně, takže z něj pořadí nevznikne. Appka
     pak sama psala „doporučit jednoho z nich nemá čím“ — což je poctivé,
     ale k ničemu. Místo toho ukazujeme rozpis a necháváme rozhodnutí
     na uživateli. */
  const capHtml = easiestFixtures(squad, startGw) + topPriceBlock(squad, startGw);

  // Blanky a doubly v následujících kolech, ale jen ty, které se týkají tebe.
  const shapeWarn = gwShape(startGw, 6).map(x => {
    const blank = x.blanks.filter(t => squad.some(s => s.p.team === t.id));
    const dbl = x.doubles.filter(t => squad.some(s => s.p.team === t.id));
    if(!blank.length && !dbl.length) return null;
    const cntB = squad.filter(s => blank.some(t => t.id === s.p.team)).length;
    const cntD = squad.filter(s => dbl.some(t => t.id === s.p.team)).length;
    return `<div class="alert ${cntB >= 4 ? 'bad' : ''}">
      <div class="top"><span class="who">GW${x.gw}</span>
        ${cntB ? `<span class="tag">${cntB} hráčů nehraje</span>` : ''}
        ${cntD ? `<span class="tag">${cntD} hráčů hraje dvakrát</span>` : ''}
      </div>
      <div class="txt">${
        cntB ? 'Blank: ' + blank.map(t => esc(t.short_name)).join(', ') + '. ' : ''}${
        cntD ? 'Double: ' + dbl.map(t => esc(t.short_name)).join(', ') + '.' : ''}</div>
    </div>`;
  }).filter(Boolean);

  const shapeHtml = shapeWarn.length
    ? `<h2>Co tě čeká v rozpisu${info(`Blank znamená nula bodů od celého klubu. Když ti vypadnou čtyři
       a víc hráčů, je to kolo pro free hit — podrobnosti v záložce Program.`)}</h2><div class="alerts">${shapeWarn.join('')}</div>
       `
    : '';

  const problems = squad.filter(s => s.p.status !== 'a' || s.chance < 100);
  problems.sort((a,b) => (a.starting === b.starting ? a.chance - b.chance : (a.starting ? -1 : 1)));

  const alertHtml = problems.length ? problems.map(s => `
    <div class="alert ${s.chance <= 50 ? 'bad' : ''}">
      <div class="top">
        <span class="who">${esc(s.p.web_name)}</span>
        <span class="tag">${esc(s.team.short_name)} · ${POS[s.p.element_type]}</span>
        <span class="tag">${s.starting ? 'Základ' : 'Lavička'}</span>
        <span class="tag">${S[s.p.status][0]} · ${s.chance}%</span>
      </div>
      ${s.p.news ? `<div class="txt">${esc(s.p.news)}</div>` : ''}
    </div>`).join('')
    : '<div class="alert" style="border-left-color:var(--ok)"><div class="top"><span class="who">Nikdo není hlášený jako zraněný ani suspendovaný.</span></div></div>';

  /* --- přehled kádru po pozicích ---

     Jedna dlouhá tabulka patnácti řádků nemá strukturu. Rozdělení podle
     pozic dá součty za skupinu (kde mám zabité peníze) a hlavně umožní
     dát ke každému hráči rozpis dalších tří kol — to je věc, kvůli které
     lidi chodí na jiné weby. */

  computeFdrCuts(startGw, 3);

  const gwCell = f => {
    const opp = teams[f.opp];
    const label = opp ? (f.home ? opp.short_name.toUpperCase() : opp.short_name.toLowerCase()) : '?';
    return `<span class="${fdrClass(f.od)}" title="${esc(opp ? opp.name : '')} ${
      f.home ? 'doma' : 'venku'}">${esc(label)}<small>${f.od.toFixed(1)}</small></span>`;
  };

  const nextThree = p => {
    const out = [];
    for(let gw = startGw; gw < startGw + 3; gw++){
      const fxs = gwFixtures(p.team, gw);
      if(!fxs.length){
        out.push('<span class="blank" title="Blank — klub v tomhle kole nehraje">–<small>bl</small></span>');
      } else {
        // Double: obě zkratky do jedné buňky, ať kolo zůstane kolem.
        out.push(fxs.map(f => gwCell({...f, od: ownFdr(p.team, f.opp, f.home, f.d)})).join(''));
      }
    }
    return `<span class="tick3">${out.join('')}</span>`;
  };

  const priceMove = p => {
    const d = p.cost_change_start || 0;
    if(!d) return '';
    return `<i class="mv ${d > 0 ? 'up' : 'down'}" title="Od začátku sezóny ${
      d > 0 ? 'zdražil' : 'zlevnil'} o ${Math.abs(d / 10).toFixed(1)}m">${d > 0 ? '▲' : '▼'}</i>`;
  };

  const pRow = s2 => {
    const owned = parseFloat(s2.p.selected_by_percent) || 0;
    const dot = s2.p.status !== 'a' || s2.chance <= 50 ? 'bad'
              : s2.chance < 100 ? 'warn' : 'ok';

    /* Hodnoty pro řazení jdou do data-atributů, ne do parsování textu.
       V buňkách je „5.5▲“, „8.7 %“ a „–“ — z toho by se čísla tahala
       regulárem a první nečíselný stav (blank, nehrál) by řazení tiše
       rozhodil. Chybějící hodnota je -1, aby padala na konec. */
    return `<div class="prow${s2.starting ? '' : ' benched'}${owned < 5 ? ' diff' : ''}"
      data-cena="${s2.p.now_cost}"
      data-body="${s2.p.total_points}"
      data-forma="${parseFloat(s2.p.form) || 0}"
      data-fdr="${s2.f.avg != null ? s2.f.avg : -1}"
      data-gw="${live ? (s2.played ? s2.gwPts : -1) : -1}"
      data-own="${owned}"
      data-pos="${s2.p.element_type}"
      data-poradi="${s2.pk.position}">
      <span class="who">
        <i class="dot ${dot}" title="${esc(S[s2.p.status][0])}"></i>
        ${crest(s2.p.team, 'sm')}
        <b>${esc(s2.p.web_name)}</b>
        <em>${esc(s2.team.short_name)}</em>
        ${s2.pk.is_captain ? '<span class="badge cap">C</span>'
          : s2.pk.is_vice_captain ? '<span class="badge">V</span>' : ''}
        ${owned < 5 ? '<span class="badge dif">diferenciál</span>' : ''}
        ${s2.chance < 100 ? `<span class="badge warn">${s2.chance}&nbsp;%</span>` : ''}
      </span>
      <span class="n" data-l="Cena">${(s2.p.now_cost / 10).toFixed(1)}${priceMove(s2.p)}</span>
      <span class="n" data-l="Body"><b>${s2.p.total_points}</b></span>
      <span class="n" data-l="Forma">${s2.p.form}</span>
      <span class="n" data-l="FDR">${s2.f.avg ? s2.f.avg.toFixed(1) : '–'}</span>
      ${live ? `<span class="n gwpts" data-l="GW${liveGw}">${s2.played
        ? `<b>${s2.gwPts}</b>` : '<span class="wait">–</span>'}</span>` : ''}
      ${nextThree(s2.p)}
      <span class="n own" data-l="Vlastní">${owned.toFixed(1)}&nbsp;%</span>
    </div>`;
  };

  const GROUPS = [
    [1, 'Brankáři'], [2, 'Obránci'], [3, 'Záložníci'], [4, 'Útočníci'],
  ];

  /* Hlavička je tlačítko v obou režimech. Po pozicích řadí uvnitř
     skupin, v režimu Celkem přes celý kádr — v obou případech dělá to,
     co slibuje, jen v jiném rozsahu.

     Směr: u FDR dává smysl začít od nejmenšího (nejlehčí los), u všeho
     ostatního od největšího. */
  const th = (key, label, cls) => `<span class="${cls}"
    data-sort="${key}" role="button" tabindex="0">${label}<i class="sar"></i></span>`;

  const head = `<div class="phead${live ? ' live' : ''}">
    <span>Hráč</span>
    ${th('cena', 'Cena', 'n')}${th('body', 'Body', 'n')}
    ${th('forma', 'Forma', 'n')}${th('fdr', 'FDR', 'n')}
    ${live ? th('gw', 'GW' + liveGw, 'n') : ''}
    <span class="tickhead">GW${startGw}–${startGw + 2}</span>
    ${th('own', 'Vlastní', 'n')}
  </div>`;

  const groupHtml = GROUPS.map(([type, label]) => {
    const inGroup = squad.filter(x => x.p.element_type === type && x.starting);
    if(!inGroup.length) return '';
    const cost = inGroup.reduce((a2, x) => a2 + x.p.now_cost, 0) / 10;
    return `<div class="pgroup">${esc(label)}
        <span>${inGroup.length} nasazen${inGroup.length === 1 ? 'ý' : 'í'} · ${cost.toFixed(1)}m</span>
      </div>
      ${inGroup.map(pRow).join('')}`;
  }).join('');

  const benchList = squad.filter(x => !x.starting)
    .sort((x, y) => x.pk.position - y.pk.position);
  const benchXp = benchList.reduce((a2, x) => a2 + (x.xp || 0), 0);

  const benchHtml = benchList.length ? `<div class="pgroup bench-h">Lavička
      <span>${benchList.length} hráči · ${benchXp.toFixed(1)} xP${
        live ? ` · ${benchTotal} bodů` : ''}</span>
    </div>${benchList.map(pRow).join('')}` : '';

  /* Řádky jsou v DOM jednou. Přepínač i řazení jen přeskládají to,
     co už tam je — žádné druhé vykreslení, žádná druhá kopie dat,
     která by se mohla rozejít s první. */
  const squadTable = `<div class="subnav" role="tablist" aria-label="Zobrazení kádru">
      <button type="button" role="tab" data-squadview="pos"
        aria-selected="${SQUAD_VIEW === 'pos'}">Po pozicích</button>
      <button type="button" role="tab" data-squadview="all"
        aria-selected="${SQUAD_VIEW === 'all'}">Kádr celkem</button>
    </div>
    <div class="squadlist${live ? ' live' : ''}${
      SQUAD_VIEW === 'all' ? ' flat' : ''}" id="squadlist">
      ${head}${groupHtml}${benchHtml}
    </div>
    <div class="fdrleg">
      <span><i class="f1"></i>snadný</span><span><i class="f2"></i></span>
      <span><i class="f3"></i>průměr</span><span><i class="f4"></i></span>
      <span><i class="f5"></i>těžký</span><span><i class="blank"></i>blank</span>
      <span class="hint">VELKÁ = doma · malá = venku · dvě zkratky v poli = double</span>
    </div>`;

  $('out').innerHTML = `
    <div class="meta">
      <div><div class="k">Tým</div><div class="v">${esc(entry.name)}</div></div>
      <div><div class="k">Manažer</div><div class="v">${esc(entry.player_first_name + ' ' + entry.player_last_name)}</div></div>
      <div><div class="k">Body</div><div class="v">${entry.summary_overall_points ?? '–'}</div></div>
      <div><div class="k">Pořadí</div><div class="v">${entry.summary_overall_rank ? entry.summary_overall_rank.toLocaleString('cs-CZ') : '–'}</div></div>
      <div><div class="k">Další kolo</div><div class="v">GW${startGw}</div></div>
    </div>

    <div class="pitch">
      ${live ? `<div class="livebar${liveCtx.finished ? ' done' : ''}">
        <div class="big">${liveTotal}<span>bodů v GW${liveGw}</span></div>
        <div><b>${benchTotal}</b><span>na lavičce</span></div>
        <div><b>${toPlay || '–'}</b><span>ještě nehrálo</span></div>
        <div class="txt">${liveCtx.finished
          ? 'Kolo je uzavřené, čísla jsou konečná.'
          : 'Průběžně — bonusy z BPS se po zápase ještě mohou změnit.'}</div>
      </div>` : ''}
      ${[4,3,2,1].map(t => `<div class="row">${rows[t].map(shirt).join('')}</div>`).join('')}
    </div>

    ${capHtml}

    <h2>Upozornění</h2>
    <div class="alerts">${alertHtml}</div>

    ${shapeHtml}

    <h2>Kádr${info(`<b>Po pozicích</b> drží hráče ve skupinách i s cenou za
    skupinu. <b>Kádr celkem</b> je jeden seznam všech patnácti, který se dá
    seřadit kliknutím na hlavičku sloupce — podle ceny, bodů, formy, FDR,
    bodů posledního kola i vlastnictví. Druhé kliknutí obrátí směr.<br><br>${live
      ? `Sloupec GW${liveGw} jsou body, které hráč v tomhle kole opravdu má (u kapitána
         už zdvojené). `
      : ''}Sloupec FDR je průměr přes dalších pět kol, barevný rozpis vedle něj ukazuje
    konkrétní soupeře na tři kola. ${strengthsReady()
      ? 'Obtížnost počítám z útočné a obranné síly obou týmů a barvy jsou relativní — '
        + 'nejtěžší pětina zápasů v daném okně je červená.'
      : strengthsUsable()
      ? 'Útočná a obranná síla zatím v datech není, takže počítám z <b>celkové síly '
        + 'týmů</b> (stupnice 1–5). Domácí a venkovní zápas rozliším, ale čísla jsou '
        + 'hrubší, než budou za pár kol.'
      : '<b>Používám oficiální FDR od FPL</b>, protože síly týmů zatím nejsou v datech '
        + 'vyplněné vůbec.'}`)}</h2>
    
    ${squadTable}`;

  /* Zobrazení i řazení přežívají překreslení sestavy (⟳, změna kola).
     Volá se až po zápisu do DOM — applySquadSort si řádky hledá. */
  applySquadSort();
}

/* ============================================================
   ÚVODNÍ STRÁNKA

   Sestava je hustý panel: patnáct řádků, rozpis, program, ceny.
   Odpovídá na „jak na tom jsem“, ale ne na „musím dneska něco
   udělat?“ — a to je jediná otázka, kterou si člověk klade každý den.

   Přehled proto neukazuje nic nového. Vytahuje jen to, co má lhůtu:
   kdo nenastoupí, komu se dnes v noci pohne cena a co se děje
   s hráči na watchlistu. Všechno ostatní zůstává tam, kde bylo.

   Panel se překresluje ze stavu, který už appka má (HOME), takže
   nestahuje ani jeden dotaz navíc. Když sestava ještě není veřejná,
   ukáže se aspoň watchlist a odpočet.
   ============================================================ */
/* Jméno v hlavičce.

   Do načtení sestavy tam stojí ID týmu (#60480) — jediné, co v tu chvíli
   víme. Jakmile dorazí entry/{id}/, přepíšeme ho na název týmu a iniciály
   manažera: „Prague Patriots (KB)“. Číslo nikomu nic neříká, název ano.

   Na úzké hlavičce se text ořízne přes text-overflow; iniciály jsou proto
   ve vlastním prvku, který se nezmenšuje — když se nevejde všechno,
   zmizí nejdřív konec názvu, ne to, čí je tým. */
function initials(entry){
  return [entry.player_first_name, entry.player_last_name]
    .map(x => (x || '').trim()[0] || '')
    .join('')
    .toUpperCase();
}

function setWhoName(entry){
  const el = $('whoName');
  if(!el || !entry) return;
  const ini = initials(entry);
  el.innerHTML = `<span class="tn">${esc(entry.name || ('#' + ENTRY_ID))}</span>${
    ini ? `<span class="ini">${esc(ini)}</span>` : ''}`;
  el.title = (entry.name || '') + (ini ? ' · ' + ini : '');
}

let HOME = null;

/* Formát zbývajícího času do deadlinu. Vteřiny nikoho nezajímají,
   ale rozdíl mezi „za 2 dny“ a „za 4 hodiny“ je celé sdělení. */
function untilText(ms){
  if(ms <= 0) return 'deadline prošel';
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if(d >= 1) return `za ${d} d ${h % 24} h`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `za ${h} h ${m} min`;
}

function homeMetrics(){
  const {entry, picks, liveTotal} = HOME;
  const cards = [];
  const card = (label, val, sub) => cards.push(
    `<div class="hcard"><span class="lb">${esc(label)}</span>
      <b>${val}</b>${sub ? `<span class="sb">${sub}</span>` : ''}</div>`);

  const cur = BOOT.events.find(e => e.is_current);
  const pts = Number.isFinite(liveTotal) && liveTotal !== null
    ? liveTotal : (entry ? entry.summary_event_points : null);
  card('Body' + (cur ? ' GW' + cur.id : ''), pts === null ? '—' : pts);

  if(entry && entry.summary_overall_rank)
    card('Celkové pořadí', entry.summary_overall_rank.toLocaleString('cs-CZ'));
  else card('Body celkem', entry ? entry.summary_overall_points : '—');

  if(entry && Number.isFinite(entry.last_deadline_value))
    card('Hodnota týmu', (entry.last_deadline_value / 10).toFixed(1),
      'v bance ' + ((entry.last_deadline_bank || 0) / 10).toFixed(1) + 'm');

  /* Volné přestupy umíme jen tehdy, když už proběhl dopočet v jiné
     záložce. Odhadovat je tady znovu by znamenalo další dotaz na
     historii přestupů — a špatné číslo je horší než žádné. */
  const ft = ftOverride();
  if(ft !== null) card('Volné přestupy', ft, 'ručně nastaveno');
  else if(picks && picks.entry_history)
    card('Přestupy v kole', picks.entry_history.event_transfers,
      picks.entry_history.event_transfers_cost
        ? '−' + picks.entry_history.event_transfers_cost + ' b' : 'bez pokuty');

  return `<div class="hcards">${cards.join('')}</div>`;
}

/* Hráči, kteří potřebují zásah — seřazení podle naléhavosti.
   Blank je taky problém, i když hráč je zdravý. */
function homeAttention(){
  const {picks, startGw} = HOME;
  if(!picks) return '';

  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const items = [];

  picks.picks.forEach(pk => {
    const p = els[pk.element];
    if(!p) return;
    const chance = p.chance_of_playing_next_round;
    const tm = teams[p.team].short_name;
    const news = p.news ? p.news.replace(/\s*\(.*$/, '') : '';

    if(p.status === 'i' || p.status === 's' || p.status === 'u'
       || p.status === 'n' || chance === 0){
      items.push({rank: 0, cls: 'al', p, tm,
        txt: (p.status === 's' ? 'suspendovaný' : p.status === 'i' ? 'zraněný'
              : 'nedostupný') + (news ? ' · ' + news.toLowerCase() : '')});
    } else if(chance !== null && chance < 100){
      items.push({rank: 1, cls: 'wn', p, tm,
        txt: chance + ' % · pod otazníkem' + (news ? ' · ' + news.toLowerCase() : '')});
    } else if(gwFixtures(p.team, startGw).length === 0){
      items.push({rank: 2, cls: 'mute', p, tm, txt: 'v GW' + startGw + ' nehraje (blank)'});
    }
  });

  items.sort((a, b) => a.rank - b.rank);

  if(!items.length) return `<div class="hbox">
    <h3><i class="hi ok">✓</i>Vyžaduje pozornost</h3>
    <p class="note">Nic. Celý kádr je zdravý a všichni v GW${startGw} hrají.</p>
  </div>`;

  return `<div class="hbox">
    <h3><i class="hi al">!</i>Vyžaduje pozornost<span class="cnt">${items.length}</span></h3>
    ${items.map(x => `<div class="hrow">
      <em>${esc(x.tm)}</em>
      <b>${esc(x.p.web_name)}</b>
      <span class="${x.cls}">${esc(x.txt)}</span>
    </div>`).join('')}
  </div>`;
}

/* Cenové pohyby omezené na hráče, kterých se mě týkají: můj kádr
   vlevo, watchlist vpravo. Zbytek ligy patří do záložky Ceny. */
function homePrices(){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const projFor = (p, o) =>
    (p.price_change_projections || []).find(x => x.offset === o) || null;

  const line = r => `<div class="hrow">
    <em>${esc(teams[r.p.team].short_name)}</em>
    <b>${esc(r.p.web_name)}</b>
    <span class="pc ${r.like > 0 ? 'ok' : r.like < 0 ? 'al' : 'mute'}">${
      (r.like > 0 ? '▲ ' : r.like < 0 ? '▼ ' : '')}${r.pct.toFixed(0)} %</span>
  </div>`;

  const mineRows = (MY_SQUAD ? [...MY_SQUAD] : [])
    .map(id => BOOT.elements.find(p => p.id === id))
    .filter(Boolean)
    .map(p => {
      const t = projFor(p, 0);
      const pct = parseFloat(p.price_change_percent);
      return {p, like: t ? (t.likelihood || 0) : 0, pct: Number.isFinite(pct) ? pct : 0};
    })
    .filter(r => Math.abs(r.pct) >= 25 || r.like)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 5);

  const watch = watchRows().slice(0, 5);

  const mineBox = `<div class="hbox">
    <h3><i class="hi">£</i>Ceny — můj kádr</h3>
    ${mineRows.length ? mineRows.map(line).join('')
      : '<p class="note">Nikomu z tvých hráčů se ukazatel výrazně nehýbe.</p>'}
  </div>`;

  const watchBox = `<div class="hbox">
    <h3><i class="hi">★</i>Watchlist<button type="button" class="lnkbtn"
      data-goto="t-prices">Spravovat</button></h3>
    ${watch.length ? watch.map(line).join('')
      : `<p class="note">Zatím nikoho nesleduješ. V záložce Ceny klikni na
         hvězdičku u hráče, kterého chceš hlídat.</p>`}
    ${watch.length ? '' : storageNote('Watchlist')}
  </div>`;

  return `<div class="hgrid">${mineBox}${watchBox}</div>`;
}

/* Nejvyšší projekce FPL v kádru. Není to doporučení kapitána —
   appka ho vědomě nedává, protože `ep_next` chodí zaokrouhlené
   a mezi špičkovými hráči nerozliší. Je to jen orientace. */
function homeOutlook(){
  const {picks, startGw} = HOME;
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));

  let epBox = '';
  if(picks){
    const best = picks.picks
      .map(pk => els[pk.element])
      .filter(Boolean)
      .map(p => ({p, ep: epNext(p)}))
      .filter(x => x.ep !== null)
      .sort((a, b) => b.ep - a.ep)
      .slice(0, 3);

    epBox = `<div class="hbox">
      <h3><i class="hi">↗</i>Nejvyšší projekce na GW${startGw}${info(`Číslo je
        oficiální <code>ep_next</code> od FPL, ne můj odhad. U double kol
        počítá jen s jedním zápasem.`)}</h3>
      ${best.length ? best.map(x => {
        const fx = gwFixtures(x.p.team, startGw);
        const opp = fx.map(f => (teams[f.opp] ? teams[f.opp].short_name : '?')
          + (f.home ? ' (D)' : ' (V)')).join(', ') || 'blank';
        return `<div class="hrow">
          <em>${esc(teams[x.p.team].short_name)}</em>
          <b>${esc(x.p.web_name)}</b>
          <span class="mute">${esc(opp)}</span>
          <span class="pc">${x.ep.toFixed(1)}</span>
        </div>`;
      }).join('') : '<p class="note">FPL zatím projekce neposílá.</p>'}
    </div>`;
  }

  // Blanky a doubly kádru v nejbližších čtyřech kolech.
  const shape = gwShape(startGw, 4).map(x => {
    const b = MY_SQUAD ? x.blanks.filter(t =>
      BOOT.elements.some(p => MY_SQUAD.has(p.id) && p.team === t.id)) : [];
    const d = MY_SQUAD ? x.doubles.filter(t =>
      BOOT.elements.some(p => MY_SQUAD.has(p.id) && p.team === t.id)) : [];
    if(!b.length && !d.length) return null;
    return `<div class="hrow"><em>GW${x.gw}</em>
      <b>${b.length ? b.length + '× blank' : ''}${b.length && d.length ? ' · ' : ''}${
        d.length ? d.length + '× double' : ''}</b>
      <span class="mute">${esc([...b, ...d].map(t => t.short_name).join(', '))}</span>
    </div>`;
  }).filter(Boolean);

  const shapeBox = `<div class="hbox">
    <h3><i class="hi">▦</i>Rozpis na čtyři kola</h3>
    ${shape.length ? shape.join('')
      : '<p class="note">Žádný blank ani double se tvého kádru v nejbližších čtyřech kolech netýká.</p>'}
  </div>`;

  return `<div class="hgrid">${epBox || shapeBox}${epBox ? shapeBox : ''}</div>`;
}

/* ============================================================
   KÁDR: PO POZICÍCH / CELKEM

   Sestava se dá číst dvěma způsoby a každý odpovídá na jinou otázku.
   Po pozicích: „kolik mám zabité v obraně“. Celkem: „kdo z mých
   patnácti má nejhorší los“ — a na to skupiny překážejí.

   Přepínač nic nepřekresluje. Patnáct řádků je v DOM jednou a obě
   zobrazení s nimi jen jinak zacházejí: skupinové hlavičky se v
   režimu Celkem schovají CSS pravidlem a řádky se přeskládají podle
   data-atributů. Kdyby se místo toho vykresloval druhý seznam,
   existovala by data dvakrát — a stačilo by opravit jedno místo ze
   dvou, aby si tabulka začala odporovat sama se sebou.

   Volba se drží v proměnné, ne v localStorage: je to způsob čtení
   jedné obrazovky, ne nastavení appky. Po reloadu je zpátky výchozí
   rozdělení po pozicích, které je pro většinu pohledů užitečnější.
   ============================================================ */
let SQUAD_VIEW = 'pos';        // 'pos' | 'all'
let SQUAD_SORT = null;         // {key, dir} — null = pořadí v sestavě

/* Sloupce, u kterých „lepší“ znamená menší číslo. FDR je jediný:
   nejlehčí los je 1, ne 5. Ostatní se řadí od největšího. */
const SORT_ASC_FIRST = new Set(['fdr']);

/* Rozřezání seznamu na skupiny: hlavička a řádky, které pod ni patří.

   Čte se z původního pořadí, ne z aktuálního stavu DOM — jinak by se
   po prvním přeskládání rozpadlo, které řádky ke které skupině patří.
   Původní pořadí si seznam zapamatuje při prvním doteku; překreslení
   sestavy vyrobí nový element, takže se paměť sama zahodí. */
function squadGroups(list){
  if(!list._order) list._order = [...list.children];

  const out = [];
  let akt = null;
  for(const el of list._order){
    if(el.classList.contains('pgroup')){ akt = {head: el, rows: []}; out.push(akt); }
    else if(el.classList.contains('prow')){
      if(!akt){ akt = {head: null, rows: []}; out.push(akt); }
      akt.rows.push(el);
    }
  }
  return out;
}

function squadSorter(){
  const key = SQUAD_SORT ? SQUAD_SORT.key : null;
  const dir = SQUAD_SORT ? SQUAD_SORT.dir : 1;
  const num = (el, k) => parseFloat(el.dataset[k]);

  return (a, b) => {
    // Bez aktivního řazení platí pořadí ze sestavy.
    if(!key) return num(a, 'poradi') - num(b, 'poradi');
    const va = num(a, key), vb = num(b, key);
    // -1 je „hodnota není“ (blank, nehrál). Patří na konec při obou směrech.
    if(va < 0 !== vb < 0) return va < 0 ? 1 : -1;
    return (va - vb) * dir || (num(a, 'poradi') - num(b, 'poradi'));
  };
}

function applySquadSort(){
  const list = $('squadlist');
  if(!list) return;

  list.classList.toggle('flat', SQUAD_VIEW === 'all');

  list.querySelectorAll('[data-sort]').forEach(h => {
    const on = SQUAD_SORT && SQUAD_SORT.key === h.dataset.sort;
    h.setAttribute('aria-sort', on
      ? (SQUAD_SORT.dir === 1 ? 'ascending' : 'descending') : 'none');
  });

  const skupiny = squadGroups(list);
  if(!skupiny.length) return;
  const cmp = squadSorter();

  if(SQUAD_VIEW === 'all'){
    /* Jeden seznam: skupiny padají a řadí se všech patnáct dohromady.
       Hlavičky jdou na konec — jsou schované, ale musí být z cesty,
       jinak by mezi řádky zůstala prázdná místa po nich. */
    const rows = skupiny.flatMap(g => g.rows).sort(cmp);
    skupiny.forEach(g => { if(g.head) list.appendChild(g.head); });
    rows.forEach(r => list.appendChild(r));
    return;
  }

  /* Po pozicích: každá skupina se seřadí sama v sobě a vrátí se pod
     svou hlavičku. Tohle byla ta chyba — řádky se připojovaly na konec
     seznamu, takže skončily všechny pod poslední hlavičkou (Lavička)
     a skupiny nad nimi zůstaly prázdné. */
  skupiny.forEach(g => {
    if(g.head) list.appendChild(g.head);
    g.rows.slice().sort(cmp).forEach(r => list.appendChild(r));
  });
}

document.addEventListener('click', ev => {
  const sw = ev.target.closest('button[data-squadview]');
  if(sw){
    SQUAD_VIEW = sw.dataset.squadview;
    document.querySelectorAll('button[data-squadview]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.squadview === SQUAD_VIEW)));
    applySquadSort();
    return;
  }

  const th = ev.target.closest('.squadlist [data-sort]');
  if(th){
    const key = th.dataset.sort;
    SQUAD_SORT = SQUAD_SORT && SQUAD_SORT.key === key
      ? {key, dir: -SQUAD_SORT.dir}
      : {key, dir: SORT_ASC_FIRST.has(key) ? 1 : -1};
    applySquadSort();
  }
});

// Klávesnice: hlavička je tlačítko, tak se musí chovat jako tlačítko.
document.addEventListener('keydown', ev => {
  if(ev.key !== 'Enter' && ev.key !== ' ') return;
  const th = ev.target.closest && ev.target.closest('.squadlist [data-sort]');
  if(th){ ev.preventDefault(); th.click(); }
});

/* ============================================================
   CENY POSLEDNÍHO KOLA NA PŘEHLEDU

   Ceny počítá buildAwards() v js/tabs.js a dosud žily jen v Hubu.
   Na Přehled patří proto, že jsou to jediná čísla o lize, která se
   čtou zpětně — kdo vyhrál kolo se člověk chce dozvědět, ne si to
   jít vyhledat.

   Data pro ně stojí desítky dotazů (pořadí + historie + sestavy
   všech členů), takže se nestahují při startu appky. Hub si je
   načte sám, když se otevře; když se neotevřel, spustí to Přehled
   na pozadí a po dojetí se překreslí. Do té doby je na místě panelu
   kostra, ne prázdno — panel tak nemění výšku a nic nepodskočí.

   HUB_FOR_HOME hlídá, že se to spustí jednou. Bez toho by každé
   překreslení Přehledu (a to dělá i změna watchlistu) pustilo další
   várku dotazů.
   ============================================================ */
let HUB_FOR_HOME = false;

function homeAwardsLoad(){
  if(HUB_FOR_HOME || typeof loadHub !== 'function') return;
  const lid = CONFIG.leagueId || localStorage.getItem(LEAGUE_KEY);
  if(!lid) return;
  HUB_FOR_HOME = true;

  /* Hub si tímhle odbyl i své vlastní načtení — kdyby se otevřel
     potom, TAB_INIT by pustil loadHub podruhé. */
  TAB_DONE.add('t-hub');

  Promise.resolve()
    .then(() => loadHub())
    // Kapitánské ceny potřebují navíc body hráčů kola. renderHub()
    // si je tahá sám na pozadí, ale my nevíme kdy — tak si počkáme.
    .then(() => HUB && nactiKolo(HUB.cur.id))
    .then(() => drawHome())
    .catch(() => { HUB_FOR_HOME = false; });
}

function homeAwards(){
  // Ceny stojí na kódu z js/tabs.js. Ten se načítá až po core.js,
  // takže se na jeho funkce smí sahat jen za běhu, ne při definici.
  const box = inner => `<div class="hbox hawards">
    <h3><i class="hi">🏆</i>Ceny posledního kola${
      typeof HUB !== 'undefined' && HUB ? ` · GW${HUB.cur.id}` : ''
      }<button type="button" class="lnkbtn" data-goto="t-hub">Hub ligy</button></h3>
    ${inner}</div>`;

  const lid = CONFIG.leagueId || localStorage.getItem(LEAGUE_KEY);
  if(!lid){
    return box(`<p class="note">Ceny se počítají z výsledků miniligy — zadej
      si její ID v záložce Miniliga.</p>`);
  }

  if(typeof HUB === 'undefined' || !HUB){
    homeAwardsLoad();
    return box('<div class="skel"><i></i><i></i></div>');
  }

  const awards = buildAwards(HUB.cur.id, NEWS_PICKS.get(HUB.cur.id),
                             NEWS_LIVE.get(HUB.cur.id));
  if(!awards.length){
    return box('<p class="note">Za poslední kolo zatím nejsou data.</p>');
  }

  /* Dokud kolo neprojde dopočtem bonusů, jsou ceny průběžné. Stejný
     štítek jako v Hubu — jinak by Přehled tvrdil něco jiného. */
  const phase = gwPhase(HUB.cur.id);
  const zive = phase !== 'final'
    ? `<span class="livetag">${phase === 'running' ? 'živě' : 'čeká na bonusy'}</span>`
    : '';

  return box(`${zive}<div class="awards mini">${awards.map(a => {
    const meta = AWARD_META[a.key];
    const bez = a.val === '—' ? ' bezceny' : '';
    return `<div class="award ${meta.cls}${bez}">
      <div class="emoji" aria-hidden="true">${meta.emoji}</div>
      <div class="title">${meta.title}</div>
      <div class="who">${a.who}</div>
      <div class="val">${a.val}</div>
    </div>`;
  }).join('')}</div>`);
}

function drawHome(){
  const out = $('hmout');
  if(!out || !BOOT) return;

  if(!HOME){
    out.innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';
    return;
  }

  const nxt = BOOT.events.find(e => e.is_next);
  const dl = nxt ? new Date(nxt.deadline_time) : null;

  out.innerHTML = `
    <div class="hhead">
      <div>
        <h2>Přehled</h2>
        <p class="note">Co potřebuješ vědět, než otevřeš sestavu.</p>
      </div>
      ${dl ? `<span class="hdl">GW${nxt.id} · deadline ${
        untilText(dl - new Date())}</span>` : ''}
    </div>
    ${homeMetrics()}
    ${homeAttention()}
    ${homePrices()}
    ${homeOutlook()}
    ${typeof homeH2H === 'function'
      ? `<div class="hgrid">${homeH2H()}${homeAwards()}</div>` : homeAwards()}
    ${typeof homeNews === 'function' ? `<div class="hgrid one">${homeNews()}</div>` : ''}`;
}

/* Odkazy „Spravovat“ a spol. přepínají záložky. Delegovaně, protože
   se přehled překresluje při každé změně watchlistu. */
document.addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-goto]');
  if(btn) selectTab(btn.dataset.goto);
});

/* ============ ZALOZKY ============ */
const TABS = [['t-home','p-home'], ['t-squad','p-squad'],
              ['t-league','p-league'], ['t-hub','p-hub'], ['t-h2h','p-h2h'], ['t-news','p-news'],
              ['t-inj','p-inj'], ['t-players','p-players'], ['t-plan','p-plan'],
              ['t-prices','p-prices'], ['t-adv','p-adv']];
/* Plánovač byl ['t-planner','p-planner']. Vyřazením z TABS přestal
   existovat pro navigaci, přepínání i mobilní plachtu — a to je celé
   vypnutí. Panel i js/planner.js zůstávají na místě, takže návrat je
   jeden řádek tady a jeden v index.html. */

// Co se má spustit při prvním otevření záložky (lazy načítání).
/* Co se má stát při prvním otevření záložky.

   Ligové záložky se dřív načítaly až po kliknutí na tlačítko, protože
   stojí desítky dotazů. Jenže to tlačítko bylo jediné, co na panelu bylo —
   nikdo ho nemohl minout a nikdo si ho nevybral dobrovolně.

   Načítáme proto při otevření záložky, ne při startu appky: kdo se na ligu
   nepodívá, nic nestáhne, a kdo ano, nemusí klikat. Druhá ligová záložka
   je pak skoro zadarmo — per-member dotazy jdou přes cached() a jsou to
   přesně tytéž adresy.

   Tlačítka zůstala jako „Aktualizovat“; po deadlinu se hodí. */
const TAB_INIT = {
  't-league':  () => autoLoadLeague(),
  't-hub':     () => loadHub(),
  't-h2h':     () => loadH2H(),
  't-news':    () => loadNews(),
  't-inj':     () => loadInjuries(),
  't-plan':    () => loadPlan(),
  't-prices':  () => loadPrices(),
  't-adv':     () => loadAdvisor(),
};

/* Miniliga potřebuje ID, které TAB_INIT nezná. Když chybí, nemá smysl
   spouštět nic — jen to řekneme. */
function autoLoadLeague(){
  const lid = CONFIG.leagueId || localStorage.getItem(LEAGUE_KEY);
  if(!lid){ $('lmsg').textContent = 'Nemáš zadané ID miniligy.'; return; }
  return loadLeague(lid);
}
const TAB_DONE = new Set();

function selectTab(tid){
  TABS.forEach(([t, p]) => {
    const on = t === tid;
    $(t).setAttribute('aria-selected', on);
    $(t).tabIndex = on ? 0 : -1;
    $(p).hidden = !on;
  });
  $(tid).focus();

  /* Panely mají tabindex="-1", takže se dá fokus přesunout na obsah.
     Bez tohohle zůstala klávesnice na tlačítku a odečítač se o změně
     obsahu nedozvěděl. */
  const pid = (TABS.find(([t]) => t === tid) || [])[1];
  if(pid && $(pid)) $(pid).setAttribute('aria-busy', 'false');

  // Adresní řádek drží krok s tím, co je vidět — odkaz na kolo se pak
  // dá poslat dál. Kolo doplňuje záložka H2H sama, když ho přepne.
  if(typeof setHash === 'function'){
    setHash(tid, tid === 't-h2h' && typeof H2H_GW !== 'undefined' ? H2H_GW : null);
  }

  if(TAB_INIT[tid] && !TAB_DONE.has(tid)){ TAB_DONE.add(tid); TAB_INIT[tid](); }
}

TABS.forEach(([tid]) => {
  $(tid).tabIndex = tid === 't-home' ? 0 : -1;
  $(tid).addEventListener('click', () => selectTab(tid));

  // role="tablist" slibuje ovládání šipkami. Dřív ho slibovala a neplnila.
  $(tid).addEventListener('keydown', ev => {
    const usable = TABS.filter(([t]) => !$(t).disabled).map(([t]) => t);
    const i = usable.indexOf(tid);
    if(i < 0) return;
    let next = null;
    if(ev.key === 'ArrowRight') next = usable[(i + 1) % usable.length];
    if(ev.key === 'ArrowLeft')  next = usable[(i - 1 + usable.length) % usable.length];
    if(ev.key === 'Home')       next = usable[0];
    if(ev.key === 'End')        next = usable[usable.length - 1];
    if(next){ ev.preventDefault(); selectTab(next); }
  });
});

/* ============================================================
   TVRDÉ OBNOVENÍ

   Appka drží stažené odpovědi v API_CACHE po celou dobu života
   stránky. To je záměr — přepínání záložek je pak zadarmo. Cena je,
   že když se něco nestáhne (FPL vrátí 403, spadne wifi uprostřed
   dotazu), zůstane ta chyba viset až do ručního reloadu prohlížeče.

   Tlačítko dělá to, co by člověk čekal od F5, ale bez ztráty stavu:
   vyhodí cache, zapomene, které záložky už běžely, a načte znovu
   sestavu i právě otevřenou záložku. Bootstrap a rozpis se zahazují
   taky, protože právě v nich bývá zdroj zaseknutí.
   ============================================================ */
let RELOADING = false;

async function hardReload(){
  if(RELOADING) return;
  RELOADING = true;

  const btn = $('reload');
  if(btn){ btn.disabled = true; btn.classList.add('spin'); }

  try{
    // Kompletní vyprázdnění. BOOT a FIX se stahují znovu v load().
    API_CACHE = new Map();
    BOOT = null;
    FIX = null;
    PLAYERS = null;
    HUB = null;
    NEWS_GW = null;
    NEWS_PICKS.clear();
  NEWS_LIVE.clear();
  HALL_ALL = false;
    LEAGUE_OWN = null;
    TR_STATE = null;
    PLANNER = null;

    // Otevřenou záložku si zapamatujeme, ať člověk neskončí jinde,
    // než byl. Ostatní se načtou samy, až na ně přijde řada.
    const open = (TABS.find(([t]) => $(t).getAttribute('aria-selected') === 'true')
                  || ['t-home'])[0];
    TAB_DONE.clear();

    if(ENTRY_ID) await load(ENTRY_ID);

    if(TAB_INIT[open]){ TAB_DONE.add(open); await TAB_INIT[open](); }
  }catch(e){
    const m = $('msg');
    if(m) m.textContent = e.message;
  }finally{
    RELOADING = false;
    if(btn){ btn.disabled = false; btn.classList.remove('spin'); }
  }
}

if($('reload')) $('reload').addEventListener('click', hardReload);

/* ============ ODPOČET DO DEADLINU ============
   Nejlevnější užitečná věc v celé appce: nejčastější chyba v FPL není
   špatný transfer, ale zapomenutý deadline. */
let CD_TIMER = null;

function stopCountdown(){
  if(CD_TIMER) clearInterval(CD_TIMER);
  CD_TIMER = null;
  const el = $('countdown');
  if(el) el.hidden = true;
}

function startCountdown(){
  if(!BOOT) return;
  const nxt = BOOT.events.find(e => e.is_next);
  const el = $('countdown');
  if(!nxt || !el) return;

  const deadline = new Date(nxt.deadline_time).getTime();

  /* Dva řádky: co, a za jak dlouho. Jedna dlouhá řádka drobným
     monospacem se v hlavičce nedala přečíst.

     Jednotky taky zkracujeme podle toho, kolik zbývá — pět dní se měří
     na dny a hodiny, poslední hodina na minuty. Ukazovat „5 d 4 h 54 min“
     je přesnost, kterou nikdo nevyužije. */
  const tick = () => {
    const left = deadline - Date.now();
    if(left <= 0){
      el.innerHTML = `<span class="lbl">GW${nxt.id}</span>
        <span class="val">Deadline prošel</span>`;
      el.className = 'cd live';
      clearInterval(CD_TIMER);
      return;
    }
    const d = Math.floor(left / 86400000);
    const h = Math.floor(left / 3600000) % 24;
    const m = Math.floor(left / 60000) % 60;

    const val = d >= 1 ? `${d} d ${h} h`
              : h >= 1 ? `${h} h ${String(m).padStart(2, '0')} min`
              : `${m} min`;

    el.innerHTML = `<span class="lbl">Deadline GW${nxt.id}</span>
      <span class="val">za ${val}</span>`;
    // pod šest hodin je to varování, ne informace
    el.className = 'cd' + (left < 3600000 ? ' late' : left < 6 * 3600000 ? ' soon' : '');
  };

  el.hidden = false;
  el.title = 'Deadline ' + new Date(deadline).toLocaleString('cs-CZ');
  tick();
  CD_TIMER = setInterval(tick, 30000);
}

/* ============ MINILIGA ============ */
const COLORS = ['#3FBF7F','#F2A93B','#E8453C','#5B8DEF','#C77DFF',
                '#2DD4BF','#F472B6','#A3E635','#FB923C','#94A3B8'];

async function loadLeague(lid){
  $('lmsg').textContent = 'Načítám ligu…';
  $('lout').innerHTML = '';
  try{
    if(!BOOT){ [BOOT, FIX] = await Promise.all([api('bootstrap-static/'), api('fixtures/')]); }

    const cur = BOOT.events.find(e => e.is_current);

    const {league, members, truncated} = await fetchStandings(lid,
      n => { $('lmsg').textContent = 'Načítám pořadí… ' + n + ' týmů'; });

    if(!members.length){
      $('lmsg').textContent = 'Liga nemá žádné členy, nebo ještě nezačala sezóna.';
      return;
    }

    // Historie i sestavy jdou frontou, ne najednou. Padesát týmů = sto dotazů;
    // poslané naráz je FPL odmítne a graf pak tiše přijde o půlku čar.
    const prog = label => (done, total) => {
      $('lmsg').textContent = `${label} ${done}/${total}`;
    };

    const hist = await pooled(members, m => cached('entry/' + m.entry + '/history/'),
      5, prog('Načítám historii…'));

    let picks = [];
    if(cur){
      picks = await pooled(members, m => cached('entry/' + m.entry + '/event/' + cur.id + '/picks/'),
        5, prog('Načítám sestavy…'));
    }

    renderLeague({league}, members, hist, picks, cur, truncated);
    $('lmsg').textContent = '';
  }catch(e){
    $('lmsg').innerHTML = errBox(e.message, 't-league');
  }
}

/* Vývoj pořadí v lize.

   Dvě věci, na kterých graf dřív ztroskotal u větších lig:
   – body se braly přes current[g], tedy podle pozice v poli. Kdo vstoupil
     do hry později, měl celou křivku posunutou. Teď se indexuje podle round.
   – padesát čar v deseti barvách na výšku 300 px nedávalo přečíst nic.
     Nad CHART_MAX kreslíme jen špičku tabulky plus tvoji čáru, zbytek
     jen jako tichý šedý kontext. */
const CHART_MAX = 12;

function rankChart(members, hist){
  const maps = hist.map(pointsByRound);
  const gws = Math.max(0, ...maps.map(m => m.size ? Math.max(...m.keys()) : 0));
  if(gws < 2) return '<p class="note">Graf se objeví po druhém odehraném kole.</p>';

  // kumulativní body pro každé kolo; chybějící kolo drží poslední známý stav
  const series = members.map((m, i) => {
    const pts = [];
    let sum = 0;
    for(let g = 1; g <= gws; g++){
      const ev = maps[i].get(g);
      if(ev) sum = ev.total_points;
      pts.push(sum);
    }
    return {name: m.player_name, team: m.entry_name, entry: m.entry, pts};
  });

  const ranks = series.map(() => []);
  for(let g = 0; g < gws; g++){
    const order = series.map((s, i) => [i, s.pts[g]]).sort((a, b) => b[1] - a[1]);
    order.forEach(([i], pos) => ranks[i].push(pos + 1));
  }

  const myId = ENTRY_ID || parseInt(localStorage.getItem('fpl_entry') || '0', 10);
  const n = members.length;

  // Kdo dostane vlastní barvu a jméno v legendě.
  const highlighted = new Set();
  members.forEach((m, i) => { if(i < CHART_MAX) highlighted.add(i); });
  members.forEach((m, i) => { if(m.entry === myId) highlighted.add(i); });

  const rows = Math.min(n, CHART_MAX + 2);
  const W = 700, H = 46 + rows * 22, PL = 34, PR = 14, PT = 12, PB = 26;
  const x = g => PL + (gws === 1 ? 0 : (g * (W - PL - PR)) / (gws - 1));
  const y = r => PT + (n === 1 ? 0 : ((r - 1) * (H - PT - PB)) / (n - 1));

  // Popisků na svislé ose je jen tolik, kolik se jich vejde čitelně.
  const step = Math.max(1, Math.ceil(n / 12));

  const grid = [];
  for(let g = 0; g < gws; g++){
    grid.push(`<line class="gl" x1="${x(g)}" y1="${PT}" x2="${x(g)}" y2="${H - PB}"/>`);
    if(gws <= 20 || g % 2 === 0)
      grid.push(`<text class="ax" x="${x(g)}" y="${H - PB + 14}" text-anchor="middle">${g + 1}</text>`);
  }
  for(let r = 1; r <= n; r += step)
    grid.push(`<text class="ax" x="${PL - 8}" y="${y(r) + 3}" text-anchor="end">${r}</text>`);

  const color = i => COLORS[[...highlighted].indexOf(i) % COLORS.length];

  // Nezvýrazněné čáry kreslíme první, ať je špička nahoře.
  const draw = idx => {
    const s2 = series[idx];
    const d = ranks[idx].map((r, g) => (g ? 'L' : 'M') + x(g).toFixed(1) + ' ' + y(r).toFixed(1)).join(' ');
    const mine = s2.entry === myId;
    if(!highlighted.has(idx))
      return `<path d="${d}" stroke="var(--line)" opacity=".5"/>`;
    return `<path d="${d}" stroke="${color(idx)}" class="${mine ? 'me' : ''}" opacity="${mine ? 1 : .82}"/>`;
  };

  const paths = series.map((_, i) => i).filter(i => !highlighted.has(i)).map(draw).join('')
              + series.map((_, i) => i).filter(i => highlighted.has(i)).map(draw).join('');

  const legend = [...highlighted].map(i =>
    `<span><i style="background:${color(i)}"></i>${
      series[i].entry === myId ? '<b>' + esc(series[i].name) + '</b>' : esc(series[i].name)}</span>`).join('');

  const rest = n - highlighted.size;

  return `<div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Vývoj pořadí v lize po kolech">
        ${grid.join('')}${paths}
      </svg>
      <div class="legend">${legend}${
        rest > 0 ? `<span><i style="background:var(--line)"></i>ostatní (${rest})</span>` : ''}</div>
    </div>
    <p class="note">Svislá osa je pořadí v lize, vodorovná číslo kola. Tvoje čára je silnější.${
      rest > 0 ? ' Zvýrazněná je jen špička tabulky a ty; zbytek ligy tvoří šedé pozadí.' : ''}</p>`;
}

function renderLeague(st, members, hist, picks, cur, truncated){
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));

  /* Snapshot pořadí. Ukládá se jen jednou za kolo a jen pro dohraná kola —
     průběžné pořadí by za pár minut bylo zastaralé a zkreslilo by posun. */
  if(cur && cur.finished) saveSnap(cur.id, members);
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const myId = ENTRY_ID || parseInt(localStorage.getItem('fpl_entry') || '0', 10);

  /* --- tabulka poradi --- */
  const table = `<table>
    <thead><tr>
      <th class="n">#</th><th>Manažer</th><th class="hide-s">Tým</th>
      <th class="n">GW</th><th class="n">Celkem</th><th class="n hide-s">Změna</th>
    </tr></thead>
    <tbody>${members.map(m => {
      const move = m.last_rank ? m.last_rank - m.rank : 0;
      return `<tr${m.entry === myId ? ' class="me"' : ''}>
        <td class="n">${m.rank}${deltaChip(m.rank, rankDelta(m.entry, cur ? cur.id : 0))}</td>
        <td><b>${cur ? squadBtn(m.entry, cur.id, m.player_name, m.entry_name)
          : esc(m.player_name)}</b></td>
        <td class="hide-s" style="color:var(--mute)">${esc(m.entry_name)}</td>
        <td class="n">${m.event_total}</td>
        <td class="n">${m.total}</td>
        <td class="n hide-s ${move > 0 ? 'ok' : move < 0 ? 'al' : ''}">${
          move > 0 ? '▲' + move : move < 0 ? '▼' + (-move) : '–'}</td>
      </tr>`;
    }).join('')}</tbody></table>`;

  if(!cur || !picks.some(Boolean)){
    $('lout').innerHTML = `<h2>${esc(CONFIG.leagueName || st.league.name)} · ${members.length} týmů</h2>${table}
      <p class="note">Sestavy, rozdíly a graf se zobrazí, jakmile proběhne první kolo.</p>`;
    return;
  }

  /* --- kdo koho ma --- */
  const owners = {};   // playerId -> [jmena manazeru]
  const caps = {};     // playerId -> [jmena]
  const byEntry = {};  // entryId -> Set(playerId)

  members.forEach((m, i) => {
    const pk = picks[i];
    if(!pk) return;
    byEntry[m.entry] = new Set();
    pk.picks.forEach(p => {
      byEntry[m.entry].add(p.element);
      (owners[p.element] = owners[p.element] || []).push(m.player_name);
      if(p.is_captain) (caps[p.element] = caps[p.element] || []).push(m.player_name);
    });
  });

  const n = Object.keys(byEntry).length;

  /* Vlastnictví v lize si uložíme i mimo tuhle funkci — potřebují ho
     diferenciály v Transferech. Dřív tu podobná proměnná byla a zmizela
     s panelem „Před deadlinem“; tahle drží jen to, co je opravdu potřeba. */
  LEAGUE_OWN = {owners, n};

  const ranked = Object.entries(owners)
    .map(([pid, list]) => ({p: els[pid], list, pct: Math.round((list.length / n) * 100)}))
    .filter(o => o.p)
    .sort((a, b) => b.list.length - a.list.length ||
                    parseFloat(b.p.selected_by_percent) - parseFloat(a.p.selected_by_percent));

  const ownTable = `<table>
    <thead><tr><th>Hráč</th><th class="hide-s">Tým</th>
      <th class="n">V lize</th><th style="width:90px">Podíl</th>
      <th class="hide-s">Kdo</th><th class="n">Kapitán</th></tr></thead>
    <tbody>${ranked.slice(0, 40).map(o => `<tr>
      <td><span class="who">${crest(o.p.team, 'sm')}<b>${esc(o.p.web_name)}</b></span></td>
      <td class="hide-s">${esc(teams[o.p.team].short_name)}</td>
      <td class="n">${o.list.length}/${n}</td>
      <td><div class="bar-w"><i style="width:${o.pct}%"></i></div></td>
      <td class="hide-s" style="color:var(--mute);font-size:12px">${esc(o.list.join(', '))}</td>
      <td class="n">${caps[o.p.id] ? caps[o.p.id].length : '–'}</td>
    </tr>`).join('')}</tbody></table>`;

  /* --- rozdily proti me --- */
  let diffHtml = '<p class="note">Načti si nejdřív svoji sestavu v záložce Sestava, ať vím, s kým porovnávat.</p>';
  const mine = byEntry[myId];

  if(mine){
    const chip = (pid, cls) => {
      const p = els[pid];
      const list = owners[pid] || [];
      return `<span class="chip ${cls}"><b>${esc(p.web_name)}</b>
        <span class="ct">${esc(teams[p.team].short_name)} · ${list.length}/${n}</span></span>`;
    };

    const uniq = [...mine].filter(pid => owners[pid].length === 1);
    const missing = ranked.filter(o => !mine.has(o.p.id) && o.list.length >= Math.ceil(n / 2));
    const universal = ranked.filter(o => o.list.length === n).map(o => o.p.id);

    diffHtml = `
      <h2>Máš jen ty · ${uniq.length}</h2>
      ${uniq.length ? `<div class="own">${uniq.map(pid => chip(pid, 'unique')).join('')}</div>
        <p class="note">Tady získáváš nebo ztrácíš náskok. Nikdo jiný v lize je nemá.</p>`
        : '<p class="note">Žádný hráč, kterého bys měl jen ty.</p>'}

      <h2>Nemáš, ale většina ligy ano · ${missing.length}</h2>
      ${missing.length ? `<div class="own">${missing.map(o => chip(o.p.id, 'miss')).join('')}</div>
        <p class="note">Když tihle bodují, propadáš se v tabulce, aniž bys udělal chybu.</p>`
        : '<p class="note">Nic ti neuniká — všechny populární hráče v lize máš.</p>'}

      <h2>Má úplně každý · ${universal.length}</h2>
      ${universal.length ? `<div class="own">${universal.map(pid => chip(pid, 'mine')).join('')}</div>
        <p class="note">Na těchhle se pořadí nerozhodne, body dostanou všichni stejně.</p>`
        : '<p class="note">Neexistuje hráč, kterého by měli všichni.</p>'}`;
  }

  const SECTIONS = [
    ['Pořadí', table],
    ['Měsíc', `<div id="phasebox"><p class="note">Vyber měsíc…</p></div>`],
    ['Živě', `<div id="livebox"><p class="note">Načítám průběžné body…</p></div>`],
    ['Vývoj', rankChart(members, hist)],
    ['Rozdíly', diffHtml],
    ['Kdo koho má', ownTable],
    ['Historie', '<div id="histbox"></div>'],
  ];

  const cap = truncated
    ? `<p class="note">Liga je větší než ${LEAGUE_CAP} členů — pracuju s prvními ${LEAGUE_CAP}
       podle pořadí.</p>`
    : '';

  $('lout').innerHTML = `
    <h2>${esc(CONFIG.leagueName || st.league.name)} · ${members.length} týmů · GW${cur.id}</h2>
    ${cap}
    <div class="subnav" role="tablist">
      ${SECTIONS.map((s, i) =>
        `<button class="sub-btn" role="tab" aria-selected="${i === 0}" data-sec="${i}">${esc(s[0])}</button>`
      ).join('')}
    </div>
    ${SECTIONS.map((s, i) =>
      `<div class="sec" id="sec-${i}"${i ? ' hidden' : ''}>${s[1]}</div>`
    ).join('')}`;

  $('lout').querySelectorAll('.sub-btn').forEach(b => {
    b.addEventListener('click', () => {
      $('lout').querySelectorAll('.sub-btn').forEach(x =>
        x.setAttribute('aria-selected', x === b));
      SECTIONS.forEach((_, i) => { $('sec-' + i).hidden = String(i) !== b.dataset.sec; });
    });
  });

  mountPhases(st.league.id, cur, myId);

  // Historie je desítky dotazů, tak ji spustíme až když si o ni člověk řekne.
  const histBtn = [...$('lout').querySelectorAll('.sub-btn')]
    .find(b => b.textContent.trim() === 'Historie');
  if(histBtn) histBtn.addEventListener('click', () => {
    if(!$('histbox').dataset.loaded){
      $('histbox').dataset.loaded = '1';
      loadLeagueHistory(members, myId);
    }
  }, {once: false});

  // Živá tabulka se dopočítá až po vykreslení — nezdržuje zbytek panelu.
  renderLive(members, picks, cur, myId);
}

/* ------------------------------------------------------------
   Průběžné body během kola.

   Oficiální pořadí v FPL se přepočítává až po skončení všech zápasů.
   Endpoint event/{gw}/live/ ale dává body jednotlivých hráčů okamžitě,
   takže se dá poskládat, jak liga stojí právě teď — včetně bonusů,
   které se počítají průběžně z BPS.
   ------------------------------------------------------------ */
async function renderLive(members, picks, cur, myId){
  const box = $('livebox');
  if(!box) return;

  if(cur.finished){
    box.innerHTML = '<p class="note">Kolo je uzavřené — průběžné pořadí se shoduje '
      + 's oficiálním v záložce Pořadí.</p>';
    return;
  }

  let live;
  try { live = await cached('event/' + cur.id + '/live/'); }
  catch(e){ box.innerHTML = '<p class="note">Průběžné body se nepodařilo načíst: '
    + esc(e.message) + '</p>'; return; }

  const pts = liveStats(live);
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));

  const rows = members.map((m, i) => {
    const pk = picks[i];
    if(!pk) return null;

    // Autosuby i kapitánská páska řeší resolveLineup — tabulka jinak
    // ukazovala nižší čísla, než jaká mají manažeři doopravdy.
    const L = resolveLineup(pk, pts, cur.id);
    const before = m.total - (m.event_total || 0);   // body před tímhle kolem

    return {
      name: m.player_name, team: m.entry_name, entry: m.entry,
      gw: L.total, total: before + L.total, cost: L.cost, toPlay: L.toPlay,
      subs: L.subs.length,
      cap: L.capId && els[L.capId] ? els[L.capId].web_name : '—',
    };
  }).filter(Boolean);

  if(!rows.length){ box.innerHTML = '<p class="note">Sestavy pro tohle kolo zatím nejsou.</p>'; return; }

  rows.sort((a, b) => b.total - a.total);

  const body = rows.map((r, i) => `<tr${r.entry === myId ? ' class="me"' : ''}>
      <td>${i + 1}</td>
      <td>${squadBtn(r.entry, cur.id, r.team, r.name)}<span class="sub">${esc(r.name)}</span></td>
      <td>${esc(r.cap)}${r.subs ? `<span class="sub">${r.subs}× střídání</span>` : ''}</td>
      <td>${r.toPlay ? r.toPlay : '–'}</td>
      <td><b>${r.gw}</b>${r.cost ? `<span class="sub">−${r.cost} za přestupy</span>` : ''}</td>
      <td>${r.total}</td>
    </tr>`).join('');

  box.innerHTML = `<table>
      <thead><tr><th>#</th><th>Tým</th><th>Kapitán</th><th>Nehrálo</th>
        <th>Kolo</th><th>Celkem</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="note">Průběžné pořadí podle bodů, které hráči mají právě teď. Bonusy jsou
    předběžné — FPL je dopočítává z BPS a po skončení zápasu se ještě mohou změnit.
    Sloupec „Nehrálo“ říká, kolik hráčů ze sestavy ještě nenastoupilo. Automatická
    střídání z lavičky i přesun kapitánské pásky na vicekapitána jsou započítané.</p>`;
}

/* ============ HRÁČI + PROJEKCE ============ */

// Kolik bodů dá FPL za gól a čisté konto podle pozice.
const GOAL_PTS = {1: 10, 2: 6, 3: 5, 4: 4};
const CS_PTS   = {1: 4,  2: 4, 3: 1, 4: 0};

// Defenzivní příspěvky (bootstrap: game_config.scoring.defensive_contribution).
// Práh je počet akcí za zápas, po jehož překročení padnou body.
const DC_PTS       = {1: 0,  2: 2,  3: 2,  4: 2};
const DC_THRESHOLD = {1: 0,  2: 10, 3: 12, 4: 12};

/*
  Odhad bodů pro jedno kolo. Je to hrubý model, ne předpověď — staví na tom,
  že dlouhodobé xG a xA jsou lepší ukazatel budoucnosti než odehrané body,
  které jsou plné náhody.

  Model počítá zápas po zápase, ne kolo po kole. To je podstatný rozdíl:
  v doublu hráč nastoupí dvakrát a jeho hodnota se zhruba zdvojnásobí,
  v blanku je nula. Dřívější verze počítala vždy jeden zápas a v obou
  případech se mýlila o sto procent.

  Jeden zápas se skládá ze čtyř částí:
    1) pravděpodobnost, že hráč vůbec nastoupí (z minut a hlášené dostupnosti)
    2) očekávané góly a asistence na 90 minut, přepočtené body podle pozice
    3) šance na čisté konto odvozená z obtížnosti soupeře
    4) odhad bonusových bodů z dosavadního poměru bonusů na zápas
*/

/* Kolik kol už se odehrálo. Dřív se počet zápasů odhadoval z minut
   (minutes / 75), což míchalo dohromady střídajícího hráče se stabilním
   členem základu. `starts` a počet dokončených kol jsou přesnější. */
function roundsPlayed(){
  const done = BOOT.events.filter(e => e.finished).length;
  return Math.max(1, done);
}

function appearances(p){
  // Starty známe přesně; střídání dopočítáme z minut nad rámec startů.
  const starts = p.starts || 0;
  const subMinutes = Math.max(0, p.minutes - starts * 78);
  return Math.max(starts + Math.round(subMinutes / 25), p.minutes > 0 ? 1 : 0);
}

function perMatchXp(p, difficulty, isHome){
  const chance = p.chance_of_playing_next_round === null ? 100 : p.chance_of_playing_next_round;
  const apps = appearances(p);
  const rounds = roundsPlayed();
  const starts = p.starts || 0;

  // Podíl kol, ve kterých byl v základu. Rozhoduje o tom, jestli vůbec hraje.
  const startRate = Math.min(1, starts / rounds);
  const pPlay = (chance / 100) * (p.minutes > 0 ? Math.max(.2, startRate) : 0);
  const expMin = pPlay * (p.minutes / Math.max(apps, 1));

  const xg90 = parseFloat(p.expected_goals_per_90 || 0);
  const xa90 = parseFloat(p.expected_assists_per_90 || 0);
  const share = Math.min(1, expMin / 90);

  const fd = difficulty === null || difficulty === undefined ? 3 : difficulty;

  // čisté konto: FDR 2 je lehký soupeř, 5 těžký; doma o něco pravděpodobnější
  const pCS = Math.max(.04, Math.min(.6, .46 - .09 * (fd - 2) + (isHome ? .04 : -.04)));

  // proti slabšímu soupeři se šance tvoří snáz, proti silnějšímu hůř
  const attFactor = Math.max(.65, Math.min(1.35, 1 + (3 - fd) * .13)) * (isHome ? 1.06 : .94);

  const appearance = pPlay * (expMin >= 60 ? 2 : 1);
  let attack = share * attFactor * (xg90 * GOAL_PTS[p.element_type] + xa90 * 3);

  // Exekutoři standardek mají systematicky vyšší výnos, než jejich role napovídá.
  // Penaltu kope jen jeden hráč v týmu a xG ji zachytí až se zpožděním.
  if(p.penalties_order === 1) attack += .35 * GOAL_PTS[p.element_type] * .18;
  if(p.corners_and_indirect_freekicks_order === 1) attack += .30;

  const defence = CS_PTS[p.element_type] ? share * pCS * CS_PTS[p.element_type] : 0;
  const conceded = p.element_type <= 2 ? -share * (1 - pCS) * 0.7 : 0;

  const bonus = pPlay * ((p.bonus || 0) / rounds);

  // Defenzivní příspěvky: 2 body za dosažení prahu (10 akcí u obránců,
  // 12 u záložníků a útočníků). Brankáři je nedostávají.
  // Bez tohohle model systematicky podhodnocoval defenzivní záložníky —
  // u nich to bývá klidně třetina reálného zisku za kolo.
  const dcT = DC_THRESHOLD[p.element_type];
  let defcon = 0;
  if(dcT && DC_PTS[p.element_type]){
    const dc90 = parseFloat(p.defensive_contribution_per_90 || 0);
    if(dc90 > 0){
      // Sezónní průměr sám o sobě neříká, jak často práh padne: hráč
      // s průměrem přesně na prahu ho trefí zhruba v půlce zápasů, ne vždy.
      // Logistická křivka kolem prahu je hrubá, ale poctivější než ostrý krok.
      const pHit = 1 / (1 + Math.exp(-(dc90 - dcT) / (dcT * .22)));
      defcon = share * pHit * DC_PTS[p.element_type];
    }
  }

  return Math.max(0, appearance + attack + defence + conceded + bonus + defcon);
}

/* Body za celé kolo = součet přes všechny zápasy, které tým v tom kole má.
   Blank vrací 0, double zhruba dvojnásobek. */
function projectGw(p, gw){
  const fx = gwFixtures(p.team, gw);
  return fx.reduce((sum, f) => sum + perMatchXp(p, f.d, f.home), 0);
}

/* Součet přes n kol dopředu — pro plánování transferů a čipů. */
function projectRange(p, startGw, n){
  let sum = 0;
  for(let g = startGw; g < startGw + n; g++) sum += projectGw(p, g);
  return sum;
}


/* ------------------------------------------------------------
   Optimální jedenáctka z patnácti.

   FPL vyžaduje 1 brankáře, 3–5 obránců, 2–5 záložníků a 1–3 útočníky.
   Projdeme všechny povolené formace a vybereme tu s nejvyšším součtem
   projekce. Je jich patnáct, takže hrubá síla je tady namístě.
   ------------------------------------------------------------ */
const FORMATIONS = [];
for(let d = 3; d <= 5; d++)
  for(let m = 2; m <= 5; m++)
    for(let f = 1; f <= 3; f++)
      if(1 + d + m + f === 11) FORMATIONS.push({2: d, 3: m, 4: f});

function bestEleven(squad){
  // squad: [{p, xp}, …] — všech 15
  const byPos = {1: [], 2: [], 3: [], 4: []};
  squad.forEach(s => byPos[s.p.element_type].push(s));
  Object.values(byPos).forEach(a => a.sort((x, y) => y.xp - x.xp));

  if(!byPos[1].length) return null;

  let best = null;
  for(const f of FORMATIONS){
    if(byPos[2].length < f[2] || byPos[3].length < f[3] || byPos[4].length < f[4]) continue;

    const xi = [byPos[1][0], ...byPos[2].slice(0, f[2]),
                ...byPos[3].slice(0, f[3]), ...byPos[4].slice(0, f[4])];
    const total = xi.reduce((a, b) => a + b.xp, 0);

    if(!best || total > best.total) best = {xi, total, shape: `${f[2]}-${f[3]}-${f[4]}`};
  }

  if(!best) return null;
  const inXi = new Set(best.xi.map(s => s.p.id));
  best.bench = squad.filter(s => !inXi.has(s.p.id)).sort((a, b) => b.xp - a.xp);
  return best;
}


/* ------------------------------------------------------------
   Oficiální čísla od FPL.

   `ep_next` a `ep_this` jsou projekce, které počítá samo FPL a posílá je
   v bootstrapu u každého hráče. Jsou to jediná projekční čísla, která
   nejsou moje — a proto jsou v přehledech hlavní. Můj vlastní model
   zůstává jen tam, kde FPL nic nedává (výhled na víc kol, double kola).
   ------------------------------------------------------------ */
function epNext(p){
  const v = parseFloat(p.ep_next);
  return Number.isFinite(v) ? v : null;
}
function epThis(p){
  const v = parseFloat(p.ep_this);
  return Number.isFinite(v) ? v : null;
}

/* Bezpečné čtení čísla z několika možných názvů pole.

   FPL přidává statistiky mezi sezónami a názvy se občas mění (defenzivní
   příspěvky přibyly nedávno). Tohle vrátí null, když pole neexistuje,
   a volající pak řádek prostě nezobrazí — místo aby psal NaN. */
function stat(p, ...keys){
  for(const k of keys){
    if(p[k] === undefined || p[k] === null || p[k] === '') continue;
    const v = parseFloat(p[k]);
    if(Number.isFinite(v)) return v;
  }
  return null;
}

/* Statistiky, které dávají smysl pro danou pozici.

   Útočníka soudíš podle zapojení do gólů, obránce podle toho, kolik jeho
   tým inkasuje, brankáře podle zákroků. Míchat je do jedné tabulky znamená
   sloupce, které u půlky hráčů nic neříkají. */
function positionStats(p){
  const rows = [];
  const add = (label, value, note) => {
    if(value !== null && value !== undefined) rows.push({label, value, note});
  };

  const per90 = (a, b) => {
    const v = stat(p, a);
    return v === null ? null : v.toFixed(2);
  };

  // Společné pro všechny: kolik toho vůbec odehrál.
  add('Odehrané minuty', p.minutes);
  add('Starty', p.starts);

  if(p.element_type === 1){
    // Brankář: zákroky jsou jeho jediný vlastní bodovaný výkon.
    add('Zákroky', stat(p, 'saves'), 'bod za každé 3');
    add('Zákroky / 90', per90('saves_per_90'));
    add('Chycené penalty', stat(p, 'penalties_saved'), '5 bodů za každou');
    add('Čistá konta', stat(p, 'clean_sheets'));
    add('Inkasované góly', stat(p, 'goals_conceded'));
    add('xGC / 90', per90('expected_goals_conceded_per_90'), 'očekávané inkasované');
  }

  if(p.element_type === 2){
    add('Čistá konta', stat(p, 'clean_sheets'));
    add('Inkasované góly', stat(p, 'goals_conceded'));
    add('xGC / 90', per90('expected_goals_conceded_per_90'), 'očekávané inkasované');
    add('xGI / 90', per90('expected_goal_involvements_per_90'), 'góly + asistence');
    // Defenzivní příspěvky přibyly nedávno; když je FPL neposílá, řádek zmizí.
    add('Defenzivní příspěvky', stat(p, 'defensive_contribution'), '2 body za 10 akcí');
    add('DefCon / 90', per90('defensive_contribution_per_90'));
  }

  if(p.element_type === 3){
    add('xGI', stat(p, 'expected_goal_involvements'));
    add('xGI / 90', per90('expected_goal_involvements_per_90'), 'góly + asistence');
    add('xG / 90', per90('expected_goals_per_90'));
    add('xA / 90', per90('expected_assists_per_90'));
    add('xGC / 90', per90('expected_goals_conceded_per_90'), 'čisté konto = 1 bod');
    add('Defenzivní příspěvky', stat(p, 'defensive_contribution'), '2 body za 12 akcí');
  }

  if(p.element_type === 4){
    add('xGI', stat(p, 'expected_goal_involvements'));
    add('xGI / 90', per90('expected_goal_involvements_per_90'), 'góly + asistence');
    add('xG / 90', per90('expected_goals_per_90'));
    add('xA / 90', per90('expected_assists_per_90'));
    add('Góly', stat(p, 'goals_scored'));
    add('Asistence', stat(p, 'assists'));
  }

  // Role na standardkách — FPL to říká přímo, není co odhadovat.
  const sp = [];
  if(p.penalties_order === 1) sp.push('penalty');
  if(p.direct_freekicks_order === 1) sp.push('přímé kopy');
  if(p.corners_and_indirect_freekicks_order === 1) sp.push('rohy');
  if(sp.length) rows.push({label: 'Standardky', value: sp.join(', '), text: true});

  add('ICT index', stat(p, 'ict_index'));
  if(p.ict_index_rank_type) rows.push({
    label: 'ICT v rámci pozice', value: '#' + p.ict_index_rank_type, text: true});

  return rows;
}

function statGrid(p){
  const rows = positionStats(p);
  if(!rows.length) return '';
  return `<div class="pstats">${rows.map(r => `<div>
      <div class="k">${esc(r.label)}</div>
      <div class="v">${esc(String(r.value))}</div>
      ${r.note ? `<div class="nt">${esc(r.note)}</div>` : ''}
    </div>`).join('')}</div>`;
}

/* Jméno na porovnatelný tvar: bez diakritiky, bez interpunkce, malé.
   „Dúbravka“ i „Dubravka“ tak najdeš stejným dotazem.

   Pozor: tahle funkce odešla omylem spolu s panelem „Před deadlinem“,
   přestože ji používá i hledání v Hráčích a v Plánovači. Projevilo se to
   jako „normName is not defined“ až po napsání do vyhledávacího pole. */
function normName(s){
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z ]/g, '').trim();
}

function playerRows(){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const cur = BOOT.events.find(e => e.is_current);
  const nxt = BOOT.events.find(e => e.is_next);
  const startGw = nxt ? nxt.id : (cur ? cur.id + 1 : 1);

  return BOOT.elements.map(p => {
    const f = fdr(p.team, startGw, 5);
    const price = p.now_cost / 10;
    const gwFx = gwFixtures(p.team, startGw);
    return {
      p, team: teams[p.team], price,
      fdr: f.avg,
      gwCount: gwFx.length,          // 0 = blank, 2 = double
      ep: epNext(p),                 // oficiální projekce FPL na příští kolo
      xp: projectGw(p, startGw),     // můj model — jen pro DGW a výhled
      xp5: projectRange(p, startGw, 5),
      value: p.total_points / price,
      xgi: parseFloat(p.expected_goal_involvements_per_90 || 0),
      chance: p.chance_of_playing_next_round === null ? 100 : p.chance_of_playing_next_round,
    };
  });
}

let PLAYERS = null;
