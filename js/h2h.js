/* Minileague Squad Check — H2H miniliga

   Losování dvojic, vyhodnocení zápasů a tabulka. Celá záložka stojí
   na jednom rozhodnutí: los není náhoda, ale funkce. Appka nemá
   sdílené úložiště — každý člen ji má ve svém prohlížeči — takže
   kdyby se dvojice opravdu losovaly, uviděl by každý jiného soupeře.

   Dvojice se proto odvozují z (ID ligy, číslo kola, seznam členů)
   přes seedovaný generátor. Všichni počítají totéž, protože počítají
   z týchž dat, a nic se nikam neukládá.

   Soubory js/ se načítají jako klasické <script> v pevném pořadí a
   sdílejí jeden globální scope: nic se neexportuje ani neimportuje,
   ale hoisting přes hranici souboru neplatí. Pořadí je proto součást
   kontraktu a je vypsané v index.html.
   ============================================================ */

const H2H_WIN = 3, H2H_DRAW = 1;

/* Klouzavé okno: proti komu jsem hrál v posledních třech kolech,
   toho v tomhle kole nedostanu. Když takové párování neexistuje,
   okno se zkracuje — viz h2hPairRound(). */
const H2H_WINDOW = 3;

let H2H_GW = null;        // vybrané kolo v záložce
let H2H_CACHE = null;     // {key, rounds} — přepočet celé sezóny není zadarmo

/* Od kterého kola se H2H hraje.

   Pravidlo ligy, ne nastavení uživatele. Dřív to byl výběr v panelu,
   což byla chyba: každý člen by si mohl zvolit jiné číslo a viděl by
   jinou tabulku než ostatní — a přitom o tom, kdy liga začíná, se
   nerozhoduje v prohlížeči.

   Změna čísla tady platí pro všechny, protože se losuje deterministicky
   z ID ligy a čísla kola. */
const H2H_START = 2;
function h2hStart(){ return H2H_START; }

/* ------------------------------------------------------------
   Zamrazená kola

   Los se odvozuje ze seznamu členů. To má jednu slabinu: když někdo
   ligu opustí, seznam se změní a dvojice se přepočítají — včetně těch
   dohraných. Tabulka by den po odchodu vypadala jinak než předtím.

   Řešení: jakmile je kolo dopočítané, uloží se do Firestore a od té
   chvíle se čte odtamtud místo počítání. Zapisuje ten, kdo se na
   dohrané kolo podívá první; pravidla dovolují jen `create`, takže
   druhý zápis neprojde a historii nejde přepsat ani omylem.

   Bez přihlášení to funguje dál, jen bez zámku — dvojice se pořád
   počítají a pro stabilní ligu vyjdou stejně.
   ------------------------------------------------------------ */
let H2H_FROZEN = {};      // {gw: {matches, ghost, okno}}
let H2H_FROZEN_LID = null;

async function h2hLoadFrozen(lid){
  if(!window.FB || !FB_USER || H2H_FROZEN_LID === lid) return;
  try{
    H2H_FROZEN = await window.FB.h2hRead(lid) || {};
    H2H_FROZEN_LID = lid;
    H2H_CACHE = null;
  }catch(e){
    // Zámek je pojistka, ne podmínka. Bez něj se prostě počítá.
    console.warn('H2H: zamrazená kola se nepodařilo načíst', e);
  }
}

async function h2hFreezeDone(lid){
  if(!window.FB || !FB_USER) return;
  let zapsano = 0;

  for(const round of h2hSeason()){
    if(round.frozen || gwPhase(round.gw) !== 'final') continue;
    try{
      await window.FB.h2hFreeze(lid, round.gw, {
        gw: round.gw, matches: round.matches,
        ghost: round.ghost ?? null, okno: round.okno,
      });
      H2H_FROZEN[String(round.gw)] = {
        gw: round.gw, matches: round.matches,
        ghost: round.ghost ?? null, okno: round.okno,
      };
      zapsano++;
    }catch(e){
      /* Nejčastější chyba tady je „už tam je“ — někdo z ligy byl
         rychlejší. To není problém, to je přesně účel zámku. */
      console.warn('H2H: kolo ' + round.gw + ' se nezamrazilo', e.message);
    }
  }
  if(zapsano){ H2H_CACHE = null; renderH2H(); }
}

/* ------------------------------------------------------------
   Seedovaný generátor

   mulberry32: čtyři řádky, rovnoměrné rozdělení, a hlavně stejná
   posloupnost pro stejný seed v každém prohlížeči. Math.random()
   by tady byl přesně ta chyba, kterou celý soubor obchází.
   ------------------------------------------------------------ */
function h2hRandom(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function h2hSeed(lid, gw){
  // Kolo se násobí prvočíslem, ať sousední kola nedají podobný seed.
  return (Number(lid) || 0) * 7919 + gw * 104729;
}

/* ------------------------------------------------------------
   Účastníci kola

   Bere se z historie, ne z pořadí ligy. Kdo vstoupil do FPL v pátém
   kole, nemůže hrát čtvrté. A hlavně: pořadí v tabulce se v průběhu
   sezóny mění, takže kdyby los vycházel z něj, přepisovaly by se
   zpětně i dohrané zápasy. Řadí se proto podle entry ID, které je
   neměnné.
   ------------------------------------------------------------ */
/* Poslední kolo, které je opravdu v historii.

   Tohle nejde odvodit z HUB.cur.id. FPL přepne is_current na nové kolo
   hned po dopočtu předchozího, tedy dávno před jeho deadlinem — takže
   „aktuální kolo“ klidně existuje, aniž by v něm kdokoli hrál. Když se
   podle něj hledali účastníci, nesplnil podmínku nikdo: prázdný los,
   prázdná tabulka a hláška, že tvůj tým v lize není.

   Bere se proto nejvyšší kolo, které má v historii aspoň jeden člen. */
/* Číslo kola z jednoho záznamu historie.

   FPL v `entry/{id}/history/` pojmenovává kolo `event`, ne `round` —
   `round` je klíč z jiných částí toho API. Tenhle soubor se ptal na
   `round`, takže historie vypadala prázdná: účastníci se nenašli,
   poslední odehrané kolo vyšlo na nulu a dohraná kola tvrdila „ještě
   nezačalo“. Skóre přesto sedělo, protože se propadlo na záložní
   hodnotu z pořadí ligy — jenže ta platí jen pro právě běžící kolo,
   takže starší kola by zůstala bez bodů.

   Přijímají se obě jména. Kdyby FPL klíč zase přejmenovalo, je to
   jedno místo. */
function h2hRound(e){
  return e && (e.event != null ? e.event : e.round);
}

function h2hLastPlayed(){
  let max = 0;
  (HUB.hists || []).forEach(h => {
    (h && h.current || []).forEach(e => {
      const g = h2hRound(e);
      if(g > max) max = g;
    });
  });
  return max;
}

function h2hParticipants(gw){
  const {members, hists} = HUB;

  // Kolo, které ještě nezačalo, nemá v historii nikoho. Hraje ho ten,
  // kdo je v lize teď — tedy účastníci posledního odehraného kola.
  const posledni = h2hLastPlayed();
  const ref = gw > posledni ? posledni : gw;

  const podleHistorie = members
    .map((m, i) => ({m, i}))
    .filter(x => {
      const h = hists[x.i];
      return h && h.current && h.current.some(e => h2hRound(e) === ref);
    });

  /* Před prvním odehraným kolem sezóny žádná historie není. Hrají tedy
     všichni, kdo jsou v lize — jinak by první kolo zůstalo bez losu. */
  const ucastnici = podleHistorie.length >= 2
    ? podleHistorie
    : members.map((m, i) => ({m, i}));

  return ucastnici.sort((a, b) => a.m.entry - b.m.entry);
}

/* ------------------------------------------------------------
   Živé body kola

   Historie i pořadí ligy se u běžícího kola aktualizují se zpožděním —
   dokud FPL kolo nedopočítá, obojí klidně tvrdí nulu. Panel pak během
   sobotního odpoledne ukazoval samé 0:0, což je horší než chybějící
   údaj: vypadá to jako výsledek.

   Endpoint event/{gw}/live/ dává body jednotlivých hráčů okamžitě, tak
   se skóre skládá z něj a ze sestav, které hub načítá tak jako tak.
   Do tabulky to nesahá — ta pořád počítá jen kola ve stavu `final`.
   ------------------------------------------------------------ */
let H2H_LIVE = null;      // {gw, pts: Map, ts}
let H2H_TIMER = null;

async function h2hEnsureLive(){
  if(!HUB || !HUB.cur) return;
  const gw = HUB.cur.id;
  if(gwPhase(gw) === 'final'){ H2H_LIVE = null; return; }

  // Během kola se čísla mění po každém zápase, takže cache appky tady
  // nestačí — po minutě se ptáme znovu.
  if(H2H_LIVE && H2H_LIVE.gw === gw && Date.now() - H2H_LIVE.ts < 60000) return;

  try{
    H2H_LIVE = {gw, stats: liveStats(await api('event/' + gw + '/live/')),
                ts: Date.now()};
  }catch(e){
    // Živé body jsou vylepšení, ne podmínka. Bez nich se propadneme
    // na historii jako dřív.
    console.warn('H2H: živé body se nepodařilo načíst', e);
  }
}

function h2hLiveScore(i, gw){
  if(!H2H_LIVE || H2H_LIVE.gw !== gw) return null;
  const pk = HUB.picks && HUB.picks[i];
  if(!pk || !pk.picks) return null;

  /* Autosuby a kapitánskou pásku řeší resolveLineup. Bez toho by zápas
     mohl skončit obráceně, než jak dopadl — a to je u H2H ta poslední
     věc, kterou si appka může dovolit. */
  return resolveLineup(pk, H2H_LIVE.stats, gw).total;
}

/* Body do zápasu. Odečítám pokutu za přestupy — H2H bez toho odmění
   toho, kdo si vzal tři mínusy, stejně jako toho, kdo si je nevzal.
   Nativní H2H ve FPL to počítá stejně. */
function h2hScore(i, gw){
  const h = HUB.hists[i];

  /* Kdo má přednost, živý dopočet nebo historie?

     Během kola historie zaostává — tam vede živý dopočet. Jakmile jsou
     ale zápasy dohrané, FPL už do historie zapsalo číslo se vším všudy
     a to je pro jistotu autoritativnější než náš vlastní součet. Proto
     se živě počítá jen ve fázi `running`, a i tam jen dokud historie
     pro to kolo nic nemá. */
  const zaznam = h && h.current && h.current.find(e => h2hRound(e) === gw);
  if(!zaznam && gwPhase(gw) === 'running'){
    const zive = h2hLiveScore(i, gw);
    if(zive !== null) return zive;
  }

  if(zaznam) return (zaznam.points || 0) - (zaznam.event_transfers_cost || 0);

  // Dohrané kolo bez záznamu v historii: pořád je lepší vlastní součet
  // než nula z pořadí ligy.
  const zive = h2hLiveScore(i, gw);
  if(zive !== null) return zive;

  // Běžící kolo bývá v historii až po dohrání; pořadí ligy ho nese živě.
  const m = HUB.members[i];
  if(gw === HUB.cur.id && Number.isFinite(m.event_total)) return m.event_total;
  return null;
}

/* ------------------------------------------------------------
   Párování jednoho kola

   Backtracking, ne opakované míchání. Rozdíl je podstatný: míchání
   dokola po N pokusech vzdá i tehdy, když řešení existuje — jen ho
   nenašlo. Backtracking ho najde vždycky, nebo dokáže, že není.

   Pořadí kandidátů je zamíchané seedovaným generátorem, takže výsledek
   je náhodný na pohled, ale identický u všech.
   ------------------------------------------------------------ */
function h2hMatch(ids, zakaz, rnd){
  if(!ids.length) return [];

  const [a, ...zbytek] = ids;
  const kandidati = zbytek.slice();

  // Fisher–Yates seedovaným generátorem.
  for(let i = kandidati.length - 1; i > 0; i--){
    const j = Math.floor(rnd() * (i + 1));
    [kandidati[i], kandidati[j]] = [kandidati[j], kandidati[i]];
  }

  for(const b of kandidati){
    if(zakaz.has(a + '|' + b)) continue;
    const dal = h2hMatch(zbytek.filter(x => x !== b), zakaz, rnd);
    if(dal) return [[a, b], ...dal];
  }
  return null;
}

/* Dvojice jednoho kola i s ošetřením lichého počtu a se zkrácením
   okna, když plné omezení nejde splnit.

   `historie` je pole už vylosovaných kol (od nejstaršího), protože
   zákaz opakování se čte z něj. */
function h2hPairRound(gw, historie){
  const lid = CONFIG.leagueId || localStorage.getItem(LEAGUE_KEY);
  const ucastnici = h2hParticipants(gw);
  const rnd = h2hRandom(h2hSeed(lid, gw));

  if(ucastnici.length < 2){
    return {gw, matches: [], ghost: null, okno: H2H_WINDOW, ucastnici};
  }

  let ids = ucastnici.map(x => x.m.entry);
  let ghost = null;

  /* Lichý počet: jeden hráč nastupuje proti průměru kola. Volný los
     by znamenal buď tři body zadarmo, nebo trest za smůlu — takhle
     se pořád hraje o výsledek podle vlastního výkonu.

     Ducha dostane ten, kdo ho měl nejméněkrát. Rotuje to samo a bez
     evidence: stačí spočítat předchozí kola. */
  if(ids.length % 2 === 1){
    const kolikrat = new Map(ids.map(id => [id, 0]));
    historie.forEach(r => { if(r.ghost != null)
      kolikrat.set(r.ghost, (kolikrat.get(r.ghost) || 0) + 1); });

    const min = Math.min(...ids.map(id => kolikrat.get(id) || 0));
    const naradu = ids.filter(id => (kolikrat.get(id) || 0) === min);
    ghost = naradu[Math.floor(rnd() * naradu.length)];
    ids = ids.filter(id => id !== ghost);
  }

  /* Okno se zkracuje, až když plné omezení nemá řešení. U šesti hráčů
     a okna tří kol je to reálná situace, ne teoretická — a tiché
     porušení pravidla by bylo horší než porušení, o kterém se ví.
     Použité okno proto putuje do UI. */
  for(let okno = H2H_WINDOW; okno >= 0; okno--){
    const zakaz = new Set();
    historie.slice(-okno).forEach(r => r.matches.forEach(([a, b]) => {
      zakaz.add(a + '|' + b); zakaz.add(b + '|' + a);
    }));

    const matches = h2hMatch(ids, zakaz, h2hRandom(h2hSeed(lid, gw)));
    if(matches) return {gw, matches, ghost, okno, ucastnici};
  }

  return {gw, matches: [], ghost, okno: 0, ucastnici};
}

/* Kola, která mají H2H smysl: všechna odehraná plus dvě dopředu.

   Dvě, ne jedno: los dalšího kola se hodí vědět při plánování přestupů,
   ne až po deadlinu. Víc než dvě nemá cenu — seznam členů se může
   změnit a los by se stejně přepočítal. */
const H2H_AHEAD = 2;

function h2hGws(){
  const out = [];
  const posledni = h2hLastPlayed();

  for(let g = h2hStart(); g <= posledni; g++){
    const ev = BOOT.events.find(e => e.id === g);
    if(ev) out.push(g);
  }

  /* Nadcházející kola se počítají od prvního neodehraného, ne od
     is_next. FPL označí jako is_next až kolo po tom aktuálním — takže
     hned po dopočtu prvního kola je is_current GW2 a is_next GW3, a
     kolo, které se za dva dny hraje, by ze seznamu vypadlo. */
  const prvni = Math.max(h2hStart(), posledni + 1);
  for(let k = 0; k < H2H_AHEAD; k++){
    const g = prvni + k;
    if(g <= 38 && !out.includes(g)) out.push(g);
  }
  return out.sort((a, b) => a - b);
}

/* Celá sezóna najednou. Musí se počítat dopředu od prvního kola,
   protože zákaz opakování se odvozuje z předchozích losů. */
function h2hSeason(){
  const lid = CONFIG.leagueId || localStorage.getItem(LEAGUE_KEY);
  const gws = h2hGws();
  const key = [lid, HUB.members.length, gws.join(','),
               Object.keys(H2H_FROZEN).join('.')].join('#');
  if(H2H_CACHE && H2H_CACHE.key === key) return H2H_CACHE.rounds;

  const rounds = [];
  gws.forEach(g => {
    /* Zamrazené kolo se nepočítá, jen načte. Platí to i pro klouzavé
       okno: zákaz opakování se čte z toho, co se opravdu hrálo, ne
       z toho, co by dnešní seznam členů vylosoval. */
    const z = H2H_FROZEN[String(g)];
    if(z && Array.isArray(z.matches)){
      rounds.push({gw: g, matches: z.matches, ghost: z.ghost ?? null,
                   okno: z.okno ?? H2H_WINDOW, frozen: true,
                   ucastnici: h2hParticipants(g)});
      return;
    }
    rounds.push(h2hPairRound(g, rounds));
  });
  H2H_CACHE = {key, rounds};
  return rounds;
}

/* ------------------------------------------------------------
   Výsledek zápasu

   Duch skóruje průměr ostatních účastníků kola, zaokrouhlený na celé
   číslo. Zaokrouhlení je tam kvůli remízám: s desetinou by remíza
   proti duchovi prakticky nemohla nastat.
   ------------------------------------------------------------ */
function h2hGhostScore(round){
  const body = round.ucastnici
    .filter(x => x.m.entry !== round.ghost)
    .map(x => h2hScore(x.i, round.gw))
    .filter(x => x !== null);
  if(!body.length) return null;
  return Math.round(body.reduce((a, b) => a + b, 0) / body.length);
}

function h2hByEntry(entry){
  const i = HUB.members.findIndex(m => m.entry === entry);
  return i < 0 ? null : {m: HUB.members[i], i};
}

/* Zápasy kola ve tvaru, který se dá rovnou vykreslit. */
function h2hFixtures(round){
  const out = round.matches.map(([a, b]) => {
    const A = h2hByEntry(a), B = h2hByEntry(b);
    return A && B ? {
      a: A, b: B,
      sa: h2hScore(A.i, round.gw), sb: h2hScore(B.i, round.gw),
      ghost: false,
    } : null;
  }).filter(Boolean);

  if(round.ghost != null){
    const A = h2hByEntry(round.ghost);
    if(A) out.push({a: A, b: null, sa: h2hScore(A.i, round.gw),
                    sb: h2hGhostScore(round), ghost: true});
  }
  return out;
}

/* ------------------------------------------------------------
   Tabulka

   Počítají se jen kola ve stavu `final`. Není to formalita: bonusové
   body umí překlopit výhru o jeden bod na remízu, a tabulka, která
   se den po kole sama přepíše, je horší než tabulka, která na to
   počká.

   Rozstřel: H2H body, pak celkové FPL body — stejně jako nativní
   H2H liga ve FPL.
   ------------------------------------------------------------ */
function h2hTable(){
  const rows = new Map();
  const radek = x => {
    if(!rows.has(x.m.entry)) rows.set(x.m.entry, {
      m: x.m, i: x.i, z: 0, v: 0, r: 0, p: 0, pro: 0, proti: 0, body: 0,
    });
    return rows.get(x.m.entry);
  };

  // Všichni současní členové jsou v tabulce, i kdyby ještě nehráli.
  h2hParticipants(h2hLastPlayed() || HUB.cur.id).forEach(radek);

  h2hSeason().filter(r => gwPhase(r.gw) === 'final').forEach(round => {
    h2hFixtures(round).forEach(f => {
      if(f.sa === null || f.sb === null) return;

      const A = radek(f.a);
      A.z++; A.pro += f.sa; A.proti += f.sb;
      if(f.sa > f.sb){ A.v++; A.body += H2H_WIN; }
      else if(f.sa === f.sb){ A.r++; A.body += H2H_DRAW; }
      else A.p++;

      // Duch nemá řádek — je to fikce, ne člen ligy.
      if(f.ghost) return;
      const B = radek(f.b);
      B.z++; B.pro += f.sb; B.proti += f.sa;
      if(f.sb > f.sa){ B.v++; B.body += H2H_WIN; }
      else if(f.sa === f.sb){ B.r++; B.body += H2H_DRAW; }
      else B.p++;
    });
  });

  return [...rows.values()].sort((a, b) =>
    b.body - a.body || (b.m.total || 0) - (a.m.total || 0));
}

/* Zápas jednoho týmu v daném kole — pro Přehled i pro kartu nahoře. */
function h2hMyFixture(gw, entry){
  const round = h2hSeason().find(r => r.gw === gw);
  if(!round) return null;
  return h2hFixtures(round).find(f =>
    f.a.m.entry === entry || (f.b && f.b.m.entry === entry)) || null;
}

/* Otočí zápas tak, aby `entry` byl vždycky vlevo. */
function h2hOrient(f, entry){
  if(!f) return null;
  if(f.a.m.entry === entry) return f;
  return {a: f.b, b: f.a, sa: f.sb, sb: f.sa, ghost: f.ghost};
}

/* ============================================================
   VYKRESLENÍ
   ============================================================ */

const H2H_STAV = {
  running: ['wn', 'živě'],
  unchecked: ['wn', 'čeká na bonusy'],
  final: ['ok', 'konečné'],
};

/* Začalo už kolo?

   Nestačí se ptát historie: ta se u běžícího kola plní se zpožděním,
   takže první sobotní zápas by ještě běžel „vs“. Rozpis to ví hned —
   jakmile má kolo rozehraný zápas, hraje se. */
function h2hZacalo(gw){
  if(gw <= h2hLastPlayed()) return true;
  return Array.isArray(FIX) && FIX.some(f => f.event === gw && f.started);
}

function h2hVysledek(f){
  if(f.sa === null || f.sb === null) return {cls: '', txt: '–'};
  if(f.sa > f.sb) return {cls: 'w', txt: 'výhra'};
  if(f.sa < f.sb) return {cls: 'l', txt: 'prohra'};
  return {cls: 'd', txt: 'remíza'};
}

/* Jméno manažera je odkaz na jeho sestavu — pro duchy kola pochopitelně
   ne, ten žádnou nemá. Bez `gw` (box na Přehledu) zůstává obyčejný text. */
function h2hJmeno(x, gw){
  if(!x) return 'Duch kola';
  if(gw == null || typeof squadBtn !== 'function') return esc(x.m.player_name);
  return squadBtn(x.m.entry, gw, x.m.player_name, x.m.entry_name);
}
function h2hTym(x){
  return x ? esc(x.m.entry_name) : 'průměr ostatních';
}

/* ------------------------------------------------------------
   Vzájemná bilance dvou manažerů

   „S tebou mám 3:1“ je věta, která u H2H padne pokaždé — a appka na ni
   dosud neuměla odpovědět, přestože všechna data k tomu měla. Počítají
   se jen dopočítaná kola a jen kola před tím právě zobrazeným, aby
   bilance neobsahovala zápas, na který se člověk zrovna dívá.
   ------------------------------------------------------------ */
function h2hBilance(entryA, entryB, doKola){
  if(entryA == null || entryB == null) return null;
  let v = 0, r = 0, p = 0;

  for(const round of h2hSeason()){
    if(round.gw >= doKola || gwPhase(round.gw) !== 'final') continue;
    const f = h2hFixtures(round).find(x =>
      (x.a.m.entry === entryA && x.b && x.b.m.entry === entryB) ||
      (x.b && x.b.m.entry === entryA && x.a.m.entry === entryB));
    if(!f || f.sa === null || f.sb === null) continue;

    const [mine, jeho] = f.a.m.entry === entryA ? [f.sa, f.sb] : [f.sb, f.sa];
    if(mine > jeho) v++; else if(mine < jeho) p++; else r++;
  }
  return (v + r + p) ? {v, r, p} : null;
}

/* Forma posledních pěti dopočítaných kol jako značky, ne jen barvy.
   Barva sama o sobě je pro část lidí prázdné místo. */
function h2hForma(entry, doKola){
  const out = [];
  for(const round of h2hSeason()){
    if(round.gw >= doKola || gwPhase(round.gw) !== 'final') continue;
    const f = h2hFixtures(round).find(x =>
      x.a.m.entry === entry || (x.b && x.b.m.entry === entry));
    if(!f || f.sa === null || f.sb === null) continue;
    const [mine, jeho] = f.a.m.entry === entry ? [f.sa, f.sb] : [f.sb, f.sa];
    out.push(mine > jeho ? ['w', 'V'] : mine < jeho ? ['l', 'P'] : ['d', 'R']);
  }
  return out.slice(-5);
}

function h2hFormaHtml(entry, doKola){
  const f = h2hForma(entry, doKola);
  if(!f.length) return '<span class="forma" aria-label="Forma: zatím žádné kolo">'
    + '<i class="none" aria-hidden="true">–</i></span>';
  return `<span class="forma" aria-label="Forma: ${f.map(x => x[1]).join(', ')}">
    ${f.map(([c, t]) => `<i class="${c}" aria-hidden="true">${t}</i>`).join('')}</span>`;
}

/* ------------------------------------------------------------
   Průběh kola

   Skóre samo o sobě nestačí: pět bodů náskoku znamená něco jiného, když
   soupeři zbývá pět hráčů, a něco jiného, když už dohrál. Počítá se
   z rozpisu a ze sestav, tedy z dat, která panel stejně má.
   ------------------------------------------------------------ */
function h2hZbyva(i, gw){
  if(!H2H_LIVE || H2H_LIVE.gw !== gw) return null;
  const pk = HUB.picks && HUB.picks[i];
  if(!pk || !pk.picks) return null;

  const L = resolveLineup(pk, H2H_LIVE.stats, gw);
  let ceka = 0, hraje = 0;
  for(const r of L.rows){
    if(r.mult <= 0) continue;
    if(r.played) continue;
    // Rozehraný zápas znamená „je na hřišti“, nerozehraný „přijde na řadu“.
    const el = (BOOT.elements || []).find(p => p.id === r.element);
    const fx = el ? FIX.filter(f => f.event === gw &&
      (f.team_h === el.team || f.team_a === el.team)) : [];
    if(fx.some(f => f.started && !f.finished)) hraje++; else ceka++;
  }
  return {ceka, hraje};
}

function h2hPrubeh(x, gw){
  if(!x) return '';
  const z = h2hZbyva(x.i, gw);
  if(!z || (!z.ceka && !z.hraje)) return '';
  const casti = [];
  if(z.hraje) casti.push(z.hraje + ' na hřišti');
  if(z.ceka) casti.push(z.ceka + ' čeká');
  return `<span class="zbyva">${casti.join(' · ')}</span>`;
}

function h2hCard(f, gw, velka){
  const v = h2hVysledek(f);
  const zacalo = h2hZacalo(gw);

  /* Výsledek nesmí být jen barva rámečku — pro část lidí je to prázdné
     místo. Slovo je v aria-labelu, značka i ve viditelném textu. */
  const znak = v.cls === 'w' ? '▲' : v.cls === 'l' ? '▼' : v.cls === 'd' ? '=' : '';

  const bil = velka && f.b ? h2hBilance(f.a.m.entry, f.b.m.entry, gw) : null;
  const bilTxt = bil
    ? `<span class="bilance" title="Dosavadní vzájemné zápasy">Vzájemně
        ${bil.v}–${bil.r}–${bil.p}</span>` : '';

  return `<div class="h2hm${velka ? ' big' : ''} ${v.cls}"${
      velka ? ' aria-live="polite"' : ''}>
    <div class="side">
      <b>${h2hJmeno(f.a, gw)}</b><em>${h2hTym(f.a)}</em>
      ${velka ? h2hPrubeh(f.a, gw) : ''}
    </div>
    <div class="sc" aria-label="${zacalo
      ? `${f.sa ?? '–'} ku ${f.sb ?? '–'}, ${v.txt}` : 'zatím nezačalo'}">${zacalo
      ? `<span>${f.sa ?? '–'}</span><i>:</i><span>${f.sb ?? '–'}</span>
         ${znak ? `<em class="vysl" aria-hidden="true">${znak}</em>` : ''}`
      : '<u>vs</u>'}</div>
    <div class="side r">
      <b>${h2hJmeno(f.b, gw)}${f.ghost ? '<span class="badge">duch</span>' : ''}</b>
      <em>${h2hTym(f.b)}</em>
      ${velka ? h2hPrubeh(f.b, gw) : ''}
    </div>
    ${bilTxt}
  </div>`;
}

/* Text karty kola do chatu. Prostý text schválně: obrázek se v mobilních
   klientech zmenší tak, že se skóre nepřečte, kdežto tohle se dá i citovat. */
function h2hShareText(f, gw){
  const jm = x => x ? x.m.player_name : 'Duch kola';
  const lig = CONFIG.leagueName || 'Miniliga';
  const stav = gwPhase(gw) === 'final' ? '' : ' (průběžně)';
  return `${lig} · GW${gw}${stav}\n`
    + `${jm(f.a)} ${f.sa ?? '–'} : ${f.sb ?? '–'} ${jm(f.b)}\n`
    + location.origin + '/#h2h/gw' + gw;
}

/* Informace, ne ovládání. Kdo tabulku otevře v listopadu, musí vědět,
   že se nezačínalo prvním kolem — jinak vypadá jako by chyběla data. */
function h2hStartNote(){
  return `<p class="h2hstart">Liga se hraje od <b>GW${H2H_START}</b>.</p>`;
}

function h2hPanel(){
  const gws = h2hGws();
  if(!gws.length){
    return h2hStartNote() + `<p class="note">Od GW${H2H_START} zatím žádné
      kolo nezačalo. Jakmile bude nejbližší kolo na řadě, objeví se tady
      dvojice.</p>`;
  }

  /* Výchozí kolo je to nejbližší nedohrané — na to se člověk dívá před
     deadlinem. Když je celá sezóna odehraná, poslední z ní. */
  const prvni = gws.find(g => g > h2hLastPlayed());
  const sel = H2H_GW && gws.includes(H2H_GW)
    ? H2H_GW : (prvni != null ? prvni : gws[gws.length - 1]);
  const round = h2hSeason().find(r => r.gw === sel);
  const zapasy = round ? h2hFixtures(round) : [];
  const zacalo = h2hZacalo(sel);
  const [cls, stav] = zacalo ? H2H_STAV[gwPhase(sel)] : ['', 'ještě nezačalo'];

  const prepinac = `<div class="gwnav" role="tablist" aria-label="Kolo H2H">
    ${gws.map(g => `<button type="button" role="tab" data-h2hgw="${g}"
      aria-selected="${g === sel}">GW${g}</button>`).join('')}
  </div>`;

  /* Odkud dvojice jsou. Bez tohohle se nedá poznat, jestli tabulka
     stojí na zamrazených výsledcích, nebo na dnešním přepočtu. */
  const zamek = round && round.frozen
    ? '<span class="livetag ok">zamrazeno</span>'
    : (window.FB && typeof FB_USER !== 'undefined' && FB_USER
        ? '' : '<span class="livetag">bez přihlášení</span>');

  const muj = h2hOrient(h2hMyFixture(sel, ENTRY_ID), ENTRY_ID);
  const mujBox = muj
    ? `<div class="secline"><h4>Tvůj zápas</h4>
         <span class="livetag ${cls}">${stav}</span>${zamek}
         ${H2H_LIVE && H2H_LIVE.gw === sel
           ? `<span class="sbtime" id="h2htime">aktualizováno ${
               new Date(H2H_LIVE.ts).toLocaleTimeString('cs-CZ',
                 {hour: '2-digit', minute: '2-digit'})}</span>` : ''}
         <button type="button" class="small" data-sharetitle="H2H"
           data-share="${esc(h2hShareText(muj, sel))}">Sdílet</button></div>
       ${h2hCard(muj, sel, true)}`
    : `<p class="note">V tomhle kole tvůj tým v lize není.</p>`;

  const ostatni = zapasy.filter(f =>
    f.a.m.entry !== ENTRY_ID && (!f.b || f.b.m.entry !== ENTRY_ID));

  const seznam = ostatni.length
    ? `<div class="secline"><h4>Ostatní zápasy</h4></div>
       <div class="h2hlist">${ostatni.map(f => h2hCard(f, sel)).join('')}</div>`
    : '';

  /* Zkrácené okno se přiznává. Kdyby se to zamlčelo, vypadalo by to
     jako chyba losování — a nikdo by nevěděl, že to byla nutnost. */
  const okno = round && round.okno < H2H_WINDOW
    ? `<p class="note wn">Při ${H2H_WINDOW} kolech bez opakování soupeře
       nešlo tohle kolo vylosovat, takže se omezení zkrátilo na
       ${round.okno === 0 ? 'žádné' : round.okno + ' kola'}. Stává se to
       u malé ligy, kde je kombinací málo.</p>`
    : '';

  const t = h2hTable();
  const odehrano = h2hSeason().filter(r => gwPhase(r.gw) === 'final').length;

  const tabulka = `<div class="secline"><h4>Tabulka</h4>
      <span class="livetag ok">${odehrano} ${odehrano === 1 ? 'kolo' : 'kol'}</span>
    </div>
    ${`<table class="h2ht">
      <thead><tr><th>#</th><th>Tým</th><th class="n">Z</th><th class="n">V</th>
        <th class="n">R</th><th class="n">P</th><th class="n">Skóre</th>
        <th class="n">Body</th><th class="hide-s">Forma</th></tr></thead>
      <tbody>${t.map((r, i) => `<tr class="${r.m.entry === ENTRY_ID ? 'me' : ''}">
        <td class="n">${i + 1}</td>
        <td><b>${squadBtn(r.m.entry, sel, r.m.entry_name, r.m.player_name)}</b>
          <u>${esc(r.m.player_name)}</u></td>
        <td class="n">${r.z}</td><td class="n">${r.v}</td>
        <td class="n">${r.r}</td><td class="n">${r.p}</td>
        <td class="n">${r.pro}:${r.proti}</td>
        <td class="n"><b>${r.body}</b></td>
        <td class="hide-s">${h2hFormaHtml(r.m.entry, sel)}</td>
      </tr>`).join('')}</tbody>
    </table>`}
    ${odehrano ? '' : `<p class="note">Zatím není dopočítané žádné kolo, takže
      jsou všichni na nule. Jakmile FPL potvrdí bonusy, tabulka se naplní —
      dřív ne, protože bonus umí překlopit výhru o bod na remízu.</p>`}`;

  return h2hStartNote() + prepinac + okno + mujBox + seznam + tabulka;
}

function renderH2H(){
  const lig = CONFIG.leagueName || (HUB.st && HUB.st.league.name) || 'Miniliga';
  $('h2hout').innerHTML = `
    <h2>H2H · ${esc(lig)}${info(`<b>Jak se losuje.</b> Dvojice se nelosují na
      serveru — appka žádný nemá. Počítají se z ID ligy, čísla kola a seznamu
      členů seedovaným generátorem, takže všem vyjdou stejné, aniž by se
      cokoli ukládalo.<br><br>
      <b>Odkdy se hraje.</b> Liga startuje kolem GW${H2H_START}; dřívější
      kola se nelosují ani nepočítají do tabulky.<br><br>
      <b>Neopakování soupeře.</b> Proti komu jsi hrál v posledních
      ${H2H_WINDOW} kolech, toho v tomhle kole nedostaneš. Když takové
      párování neexistuje (u malé ligy se to stává), omezení se zkrátí —
      a panel to napíše.<br><br>
      <b>Lichý počet.</b> Jeden hráč nastupuje proti <b>duchovi kola</b>,
      který skóruje průměr bodů ostatních účastníků zaokrouhlený na celé
      číslo. Volný los by znamenal tři body zdarma, nebo trest za smůlu;
      takhle se pořád hraje o výsledek. Ducha dostává ten, kdo ho měl
      nejméněkrát.<br><br>
      <b>Body.</b> Výhra ${H2H_WIN}, remíza ${H2H_DRAW}, prohra 0. Do zápasu
      se počítají body kola <b>po odečtení pokut za přestupy</b>. Při shodě
      rozhodují celkové body FPL, stejně jako v nativní H2H lize.<br><br>
      <b>Kdy je to konečné.</b> Do tabulky jde kolo až po dopočtu bonusů.
      Bonus umí překlopit výhru o bod na remízu, takže dřív by se tabulka
      sama přepisovala.`)}</h2>
    ${h2hPanel()}`;
}

async function loadH2H(){
  $('h2hmsg').textContent = '';
  const lid = CONFIG.leagueId || localStorage.getItem(LEAGUE_KEY);
  if(!lid){ $('h2hmsg').textContent = 'Nemáš zadané ID miniligy.'; return; }

  if(!HUB){
    $('h2hmsg').textContent = 'Načítám ligu…';
    $('h2hout').innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';
    try{ await loadHub(); }
    catch(e){ $('h2hmsg').innerHTML = errBox(e.message, 't-h2h'); return; }
  }
  if(!HUB){ $('h2hmsg').innerHTML = errBox('Ligu se nepodařilo načíst.', 't-h2h'); return; }

  $('h2hmsg').textContent = '';

  /* Zamrazená kola se načtou před vykreslením, jinak by panel na chvíli
     ukázal přepočtené dvojice a pak je pod rukama vyměnil. */
  await h2hLoadFrozen(lid);
  await h2hEnsureLive();

  /* Kdyby vykreslení spadlo, prázdný panel neřekne nic — a „nevidím
     nic“ se pak hledá půl hodiny. Radši ať je vidět, co se stalo. */
  try{ renderH2H(); }
  catch(e){
    $('h2hmsg').innerHTML = errBox('H2H se nepodařilo vykreslit: ' + e.message, 't-h2h');
    console.error('H2H:', e);
    return;
  }

  // Zamrazení až po vykreslení: je to úklid, ne podmínka zobrazení.
  h2hFreezeDone(lid);
  h2hAutoRefresh();
}

/* Během běžícího kola se skóre samo obnovuje. Timer se zakládá jen jeden
   a končí ve chvíli, kdy záložka není vidět nebo je kolo dopočítané —
   jinak by appka na pozadí donekonečna tahala data, na která se nikdo
   nedívá. */
function h2hAutoRefresh(){
  if(H2H_TIMER) return;
  H2H_TIMER = setInterval(async () => {
    const panel = $('p-h2h');
    if(!panel || panel.hidden || document.hidden) return;
    if(!HUB || !HUB.cur || gwPhase(HUB.cur.id) === 'final'){
      clearInterval(H2H_TIMER); H2H_TIMER = null; return;
    }
    const pred = JSON.stringify(H2H_LIVE ? [...H2H_LIVE.stats.keys()].length : 0);
    await h2hEnsureLive();
    try{
      renderH2H();
      /* Tiché přepsání čísel vypadá jako by se nic nedělo. Záblesk u
         vlastního zápasu a čas poslední obnovy říkají, že appka žije. */
      const karta = document.querySelector('#h2hout .h2hm.big');
      if(karta && typeof flash === 'function') flash(karta);
      if(typeof drawStatus === 'function') drawStatus();
      void pred;
    }catch(e){ console.error('H2H:', e); }
  }, 60000);
}

document.addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-h2hgw]');
  if(btn){
    H2H_GW = Number(btn.dataset.h2hgw);
    renderH2H();
    // Adresa drží krok s tím, co je vidět — odkaz na kolo se dá poslat dál.
    if(typeof setHash === 'function') setHash('t-h2h', H2H_GW);
  }
});

/* ------------------------------------------------------------
   Box na Přehledu

   Jedna věta, kterou člověk před deadlinem chce: proti komu hraju.
   Data jsou tatáž jako u cen kola, takže tenhle box nestojí nic navíc.
   ------------------------------------------------------------ */
function homeH2H(){
  const box = inner => `<div class="hbox">
    <h3><i class="hi">⚔</i>H2H${
      typeof HUB !== 'undefined' && HUB && H2H_HOME_GW != null
        ? ` · GW${H2H_HOME_GW}` : ''
      }<button type="button" class="lnkbtn" data-goto="t-h2h">Detail</button></h3>
    ${inner}</div>`;

  const lid = CONFIG.leagueId || localStorage.getItem(LEAGUE_KEY);
  if(!lid) return box('<p class="note">Zadej ID miniligy v záložce Miniliga.</p>');
  if(typeof HUB === 'undefined' || !HUB) return box('<div class="skel"><i></i></div>');

  const gws = h2hGws();
  const gw = gws.find(g => g > h2hLastPlayed()) ?? gws[gws.length - 1];
  if(gw == null) return box('<p class="note">Zatím není co losovat.</p>');
  H2H_HOME_GW = gw;

  const f = h2hOrient(h2hMyFixture(gw, ENTRY_ID), ENTRY_ID);
  if(!f) return box('<p class="note">V tomhle kole tvůj tým v lize není.</p>');

  const zacalo = h2hZacalo(gw);
  const v = h2hVysledek(f);
  return box(`<div class="hrow h2hrow ${v.cls}">
      <b>${h2hJmeno(f.b)}${f.ghost ? '<span class="badge">duch</span>' : ''}</b>
      <span class="mute">${h2hTym(f.b)}</span>
      <span class="pc">${zacalo ? `${f.sa ?? '–'} : ${f.sb ?? '–'}` : 'vs'}</span>
    </div>
    <p class="note">${zacalo
      ? `${v.txt === '–' ? 'Zápas běží' : 'Zatím ' + v.txt} · ${
          gwPhase(gw) === 'final' ? 'konečné' : 'čeká na dopočet'}`
      : 'Soupeř pro nadcházející kolo.'}</p>`);
}

let H2H_HOME_GW = null;
