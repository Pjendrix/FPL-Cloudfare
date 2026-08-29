/* Minileague Squad Check — obsah záložek

   Vykreslování jednotlivých sekcí: nejlehčí los, Top hráči, historie
   miniligy, diferenciály, ceny a watchlist, měsíční tabulky.
   Zdaleka největší soubor projektu.

   Soubory js/ se načítají jako klasické <script> v pevném pořadí a
   sdílejí jeden globální scope: nic se neexportuje ani neimportuje,
   ale hoisting přes hranici souboru neplatí. Pořadí je proto součást
   kontraktu a je vypsané v index.html.
   ============================================================ */
/* ============================================================
   NEJLEHČÍ LOS

   Nahrazuje doporučení kapitána podle xP. Důvod: `ep_next` od FPL je
   zaokrouhlené na desetinu a u špičkových hráčů vychází skoro stejně
   (Haaland 4.0, Fernandes 4.0), takže z něj pořadí prostě nevznikne —
   appka pak vážně tvrdila „jsou nerozeznatelní“ a byla k ničemu.

   Tenhle blok nic nedoporučuje. Ukáže dva týmy s nejlehčím losem
   v příštím kole, proti komu hrají, spočtenou obtížnost — a koho z těch
   týmů máš v kádru. Rozhodnutí necháme na tobě; tohle je podklad.
   ============================================================ */

/* Obtížnost týmu v daném kole. Double kolo bereme jako průměr obou
   zápasů: dva středně těžké zápasy jsou pro kapitána často lepší než
   jeden lehký, ale nechceme, aby to přebilo skutečně lehký los. */
function teamGwFdr(teamId, gw){
  // gwFixtures vrací už rozbalené {opp, home, d}, ne syrové zápasy.
  const fx = gwFixtures(teamId, gw);
  if(!fx.length) return null;
  const vals = fx.map(f => ownFdr(teamId, f.opp, f.home, f.d));
  return {
    fdr: vals.reduce((a, b) => a + b, 0) / vals.length,
    fixtures: fx,
  };
}

/* Řádek „tým vs soupeř“ s odznaky a barevnou obtížností. */
function fixtureLine(teamId, info){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  return info.fixtures.map(f => `<span class="fxpair">
      ${crest(teamId, 'sm')}<b>${esc(teams[teamId].short_name)}</b>
      <span class="vs">${f.home ? 'doma s' : 'venku na'}</span>
      ${crest(f.opp, 'sm')}<b>${esc(teams[f.opp].short_name)}</b>
    </span>`).join('<span class="amp">a</span>');
}

function easiestFixtures(squad, startGw){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  const ranked = BOOT.teams
    .map(t => ({t, ...(teamGwFdr(t.id, startGw) || {})}))
    .filter(x => Number.isFinite(x.fdr))
    .sort((a, b) => a.fdr - b.fdr)
    .slice(0, 2);

  if(!ranked.length)
    return '<p class="note">Rozpis na příští kolo zatím není k dispozici.</p>';

  const cards = ranked.map((x, i) => {
    const mine = squad.filter(s => s.p.team === x.t.id)
      .sort((a, b) => b.p.now_cost - a.p.now_cost);

    return `<div class="easy">
      <div class="easyhead">
        <span class="rk">${i + 1}.</span>
        <span class="fx">${fixtureLine(x.t.id, x)}</span>
        <span class="fdr ${fdrClass(x.fdr)}">${x.fdr.toFixed(1)}</span>
      </div>
      ${mine.length
        ? `<div class="easymine">${mine.map(s => `<span class="pl">
             <b>${esc(s.p.web_name)}</b>
             <em>${(s.p.now_cost / 10).toFixed(1)}m</em>
             ${s.starting ? '' : '<u>lavička</u>'}
           </span>`).join('')}</div>`
        : '<p class="easynone">Z tohohle týmu nemáš nikoho.</p>'}
    </div>`;
  }).join('');

  return `<h2>Nejlehčí los na GW${startGw}${info(`Dva týmy, které mají v příštím kole nejlehčí zápas.
      Obtížnost počítám ze síly obou týmů, ne z pevného FDR od FPL, a rozlišuju
      domácí zápas od venkovního. U dvojitého kola beru průměr obou zápasů.
      <b>Není to doporučení na kapitána</b> — lehký los sám o sobě body nedělá.
      Je to podklad: tohle jsou týmy, kde se dá čekat, že se bude hrát na jednu
      branku.`)}</h2>
    <div class="easygrid">${cards}</div>
    `;
}

/* Tři nejdražší hráči v kádru a co je čeká.

   Nejdražší hráči jsou ti, na kterých sezóna stojí — a taky ti, u kterých
   se nejvíc vyplatí vědět, jestli je čeká lehký nebo těžký zápas. */
function topPriceBlock(squad, startGw){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const top = [...squad]
    .sort((a, b) => b.p.now_cost - a.p.now_cost)
    .slice(0, 3);

  if(!top.length) return '';

  return `<h2>Tvoji tři nejdražší${info(`Nejdražší hráči v kádru a co je čeká v GW${startGw}.
      Číslo vpravo je obtížnost zápasu na stupnici 1–5.`)}</h2>
    <div class="pricetop">${top.map(s => {
      const info = teamGwFdr(s.p.team, startGw);
      return `<div class="ptrow">
        <span class="who">${crest(s.p.team, 'sm')}
          <b>${esc(s.p.web_name)}</b>
          <em class="sub">${esc(teams[s.p.team].short_name)}</em></span>
        <span class="cost">${(s.p.now_cost / 10).toFixed(1)}m</span>
        <span class="fx">${info
          ? fixtureLine(s.p.team, info)
          : '<span class="blankfx">volné kolo</span>'}</span>
        <span class="fdr ${info ? fdrClass(info.fdr) : 'blank'}">${
          info ? info.fdr.toFixed(1) : '–'}</span>
      </div>`;
    }).join('')}</div>
    `;
}

/* ============================================================
   TOP HRÁČI

   Dřív to byla filtrovatelná tabulka všech ~700 hráčů. Fungovala,
   ale odpovídala na otázku „najdi mi konkrétního hráče“ — a tu si
   člověk položí zřídka. Častější je „kdo je letos nejlepší v X“,
   a na to se z jedné dlouhé tabulky odpovídalo řazením a klikáním.

   Teď jsou to žebříčky: každá kategorie jeden box, top 10 v každém.
   Pod nimi porovnání dvou libovolných hráčů vedle sebe.
   ============================================================ */

/* Kategorie: [klíč, nadpis, popisek, formát čísla, povolené pozice].

   Pole se čtou přes stat(), takže když je FPL v dané sezóně neposílá,
   box to řekne místo aby ukazoval samé nuly. */
/* Řádek 1: body podle pozice. Nejčastější otázka na začátku sezóny
   nezní „kdo dal nejvíc gólů“, ale „kdo je letos nejlepší záložník“ —
   a na tu se z gólové tabulky odpovídá špatně, protože obránce
   s pěti čistými konty v ní vůbec není. */
const TOP_POINTS = [
  ['total_points', 'Brankáři', 'nejvíc bodů za sezónu', v => v, [1]],
  ['total_points', 'Obránci', 'nejvíc bodů za sezónu', v => v, [2]],
  ['total_points', 'Záložníci', 'nejvíc bodů za sezónu', v => v, [3]],
  ['total_points', 'Útočníci', 'nejvíc bodů za sezónu', v => v, [4]],
];

/* Řádky 2 a 3: osm kategorií, mřížka je čtyřsloupcová, takže se
   zalomí přesně na čtyři a čtyři. Pořadí není náhodné — nahoře to,
   co se opravdu stalo, dole očekávané hodnoty. */
const TOP_FIELD = [
  ['goals_scored', 'Góly', 'branky za sezónu', v => v, null],
  ['assists', 'Asistence', 'nahrávky na gól', v => v, null],
  ['defensive_contribution', 'DEFCON',
    'defenzivní příspěvky · 2 body za práh', v => v, null],
  ['bonus', 'Bonusy', 'bonusové body z BPS', v => v, null],
  ['expected_goals', 'xG', 'očekávané góly z kvality šancí',
    v => v.toFixed(2), null],
  ['expected_assists', 'xA', 'očekávané asistence',
    v => v.toFixed(2), null],
  ['expected_goal_involvements', 'xGI', 'xG a xA dohromady',
    v => v.toFixed(2), null],
  ['expected_goal_involvements_per_90', 'xGI / 90',
    'očekávané zapojení na 90 minut', v => v.toFixed(2), null],
];

const TOP_GK = [
  ['clean_sheets', 'Čistá konta', 'zápasy bez inkasovaného gólu', v => v, [1]],
  ['saves', 'Zákroky', 'bod za každé tři', v => v, [1]],
  ['saves_per_90', 'Zákroky / 90', 'vytíženost brankáře', v => v.toFixed(2), [1]],
  ['bonus', 'Bonusy brankářů', 'bonusové body z BPS', v => v, [1]],
];

/* Jeden žebříček. `types` omezí pozice — brankářské kategorie nemá smysl
   počítat přes hráče v poli a góly zase přes brankáře. */
function topBoard([key, title, cap, fmt, types]){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  const pool = BOOT.elements.filter(p => {
    if(types) return types.includes(p.element_type) && stat(p, key) !== null;
    return p.element_type !== 1 && stat(p, key) !== null;
  });

  const rows = pool
    .map(p => ({p, v: stat(p, key)}))
    .filter(x => x.v > 0)
    .sort((a, b) => b.v - a.v || b.p.total_points - a.p.total_points)
    .slice(0, 10);

  if(!rows.length)
    return `<div class="tbox">
      <h4>${esc(title)}</h4><p class="cap">${esc(cap)}</p>
      <p class="tempty">Tuhle statistiku FPL zatím neposílá, nebo ji nikdo
        nemá nenulovou.</p></div>`;

  /* Trofej u prvních tří — stejné medaile jako v žebříčku historických
     sezón, ať appka nemá dva různé způsoby, jak říct „třetí místo“.
     Medaile nahrazuje pořadové číslo, nepřidává se k němu. */
  return `<div class="tbox">
    <h4>${esc(title)}${info(`Top 10 za celou sezónu. Klikni na jméno pro detail
      hráče. Zvýrazněné řádky jsou hráči z tvé sestavy.`)}</h4><p class="cap">${esc(cap)}</p>
    <ol class="tlist">${rows.map((x, i) => `<li class="${
        MY_SQUAD && MY_SQUAD.has(x.p.id) ? 'me' : ''}">
      ${i < 3 ? `<i class="tmdl" title="${i + 1}. místo">${MEDAL[i + 1]}</i>` : ''}
      <button type="button" class="tname" data-pid="${x.p.id}">
        ${crest(x.p.team, 'sm')}
        <b>${esc(x.p.web_name)}</b>
        <em>${esc(teams[x.p.team].short_name)}</em>
      </button>
      <span class="tval">${esc(String(fmt(x.v)))}</span>
    </li>`).join('')}</ol>
  </div>`;
}

/* ------------------------------------------------------------
   Porovnání dvou hráčů.

   Nejčastější otázka v FPL nezní „kdo je nejlepší“, ale „koho
   z těch dvou“. Dřív se hráči vybírali tlačítkem v dlouhé tabulce;
   teď jsou to dva seznamy s hledáním, takže jde porovnat kdokoli
   s kýmkoli bez lovení řádku.
   ------------------------------------------------------------ */
let CMP_A = null, CMP_B = null;

function comparePickers(){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const opts = sel => BOOT.elements
    .slice()
    .sort((a, b) => b.total_points - a.total_points)
    .map(p => `<option value="${p.id}"${String(sel) === String(p.id) ? ' selected' : ''}>${
      POS[p.element_type]} · ${esc(p.web_name)} · ${esc(teams[p.team].short_name)} · ${
      p.total_points} b</option>`).join('');

  return `<div class="cmpbar">
    <label>První hráč
      <input type="search" id="cmpqa" placeholder="Hledej podle jména…" autocomplete="off">
      <select id="cmpa"><option value="">Vyber hráče…</option>${opts(CMP_A)}</select>
    </label>
    <span class="cmpvs">vs</span>
    <label>Druhý hráč
      <input type="search" id="cmpqb" placeholder="Hledej podle jména…" autocomplete="off">
      <select id="cmpb"><option value="">Vyber hráče…</option>${opts(CMP_B)}</select>
    </label>
  </div>`;
}

/* Řádek porovnání: [popisek, text A, text B, číslo A, číslo B, je vyšší lepší?].
   U ceny a inkasovaných gólů je lepší nižší — proto ten poslední příznak. */
function compareRows(a, b){
  const num = (p, k) => stat(p, k) || 0;
  const both = (label, fn, fmt, higher = true) =>
    [label, fmt(fn(a)), fmt(fn(b)), fn(a), fn(b), higher];

  const rows = [
    both('Body celkem', p => p.total_points, v => v),
    both('Body za zápas', p => parseFloat(p.points_per_game) || 0, v => v.toFixed(1)),
    both('Forma', p => parseFloat(p.form) || 0, v => v.toFixed(1)),
    both('Projekce FPL · příští kolo', p => epNext(p) || 0, v => v.toFixed(1)),
    both('Cena', p => p.now_cost / 10, v => v.toFixed(1) + 'm', false),
    both('Body za milion', p => p.total_points / (p.now_cost / 10), v => v.toFixed(1)),
    both('Minuty', p => p.minutes, v => v),
    both('Starty', p => p.starts || 0, v => v),
    both('Vlastní %', p => parseFloat(p.selected_by_percent) || 0, v => v.toFixed(1) + ' %'),
    both('Bonusové body', p => p.bonus || 0, v => v),
  ];

  // Brankáře a hráče v poli soudíme podle jiných věcí.
  if(a.element_type === 1 && b.element_type === 1){
    rows.push(both('Čistá konta', p => num(p, 'clean_sheets'), v => v));
    rows.push(both('Zákroky', p => num(p, 'saves'), v => v));
    rows.push(both('Zákroky / 90', p => num(p, 'saves_per_90'), v => v.toFixed(2)));
    rows.push(both('Inkasované góly', p => num(p, 'goals_conceded'), v => v, false));
  }else{
    rows.push(both('Góly', p => p.goals_scored || 0, v => v));
    rows.push(both('Asistence', p => p.assists || 0, v => v));
    rows.push(both('xG', p => num(p, 'expected_goals'), v => v.toFixed(2)));
    rows.push(both('xA', p => num(p, 'expected_assists'), v => v.toFixed(2)));
    rows.push(both('xGI / 90', p => num(p, 'expected_goal_involvements_per_90'),
      v => v.toFixed(2)));
    rows.push(both('DEFCON', p => num(p, 'defensive_contribution'), v => v));
  }

  rows.push(both('ICT index', p => num(p, 'ict_index'), v => v.toFixed(1)));
  return rows;
}

function drawCompare(){
  const box = $('pcompare');
  if(!box) return;

  const a = CMP_A ? BOOT.elements.find(p => p.id === CMP_A) : null;
  const b = CMP_B ? BOOT.elements.find(p => p.id === CMP_B) : null;
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  let body;
  if(!a || !b){
    body = ``;
  }else if(a.id === b.id){
    body = '<p class="note">To je dvakrát ten samý hráč — vyber dva různé.</p>';
  }else{
    const rows = compareRows(a, b).map(([label, va, vb, na, nb, higher]) => {
      const aw = higher ? na > nb : na < nb;
      const bw = higher ? nb > na : nb < na;
      return `<tr>
        <td class="${aw ? 'win' : ''}">${esc(String(va))}</td>
        <td class="lbl">${esc(label)}</td>
        <td class="${bw ? 'win' : ''}">${esc(String(vb))}</td>
      </tr>`;
    }).join('');

    /* Verdikt počítám z projekce na pět kol dopředu, ne ze sezónních
       součtů. Ty říkají, kdo byl lepší — ne kdo bude, a to je otázka,
       kterou si člověk u porovnání klade. */
    const start = planStartGw();
    const xa = projectRange(a, start, 5), xb = projectRange(b, start, 5);
    const diff = Math.abs(xa - xb);
    const lead = xa > xb ? a : b, other = xa > xb ? b : a;
    const dPrice = (lead.now_cost - other.now_cost) / 10;

    body = `<div class="chead">
        <div><b>${esc(a.web_name)}</b><span>${esc(teams[a.team].short_name)} ·
          ${POS[a.element_type]} · ${(a.now_cost / 10).toFixed(1)}m</span></div>
        <div class="vs">vs</div>
        <div><b>${esc(b.web_name)}</b><span>${esc(teams[b.team].short_name)} ·
          ${POS[b.element_type]} · ${(b.now_cost / 10).toFixed(1)}m</span></div>
      </div>
      <table class="ctab"><tbody>${rows}</tbody></table>
      <p class="note">${diff < 1.5
        ? `Přes příštích pět kol jsou prakticky nerozeznatelní (rozdíl
           ${diff.toFixed(1)} bodu). Rozhodni podle ceny nebo podle toho,
           koho má tvoje miniliga.`
        : `Přes příštích pět kol vede <b>${esc(lead.web_name)}</b> o
           ${diff.toFixed(1)} bodu. ${dPrice > 0
             ? `Stojí ale o ${dPrice.toFixed(1)}m víc — ptej se, jestli ten
                rozdíl jinde v sestavě nevyužiješ líp.`
             : dPrice < 0 ? 'A je zároveň levnější.' : 'Za stejné peníze.'}`}
        ${a.element_type !== b.element_type
          ? '<br><b>Pozor:</b> porovnáváš různé pozice, takže se liší i bodování — '
            + 'čisté konto dá obránci 4 body, záložníkovi 1 a útočníkovi žádný.'
          : ''}</p>`;
  }

  box.innerHTML = `<h2>Porovnání dvou hráčů${info(`Vyber dva hráče a porovnám je
      vedle sebe. Zelené pole ukazuje, kdo v daném ukazateli vede. Sada řádků se
      mění podle pozice: dva brankáři dostanou zákroky a inkasované góly, hráči
      v poli xG, xA a defenzivní příspěvky. U ceny a inkasovaných gólů vyhrává
      nižší číslo. Verdikt dole počítám z projekce na pět kol dopředu, ne ze
      sezónních součtů — ty říkají, kdo byl lepší, ne kdo bude.`)}</h2>${comparePickers()}
    <div class="cmpout">${body}</div>`;

  /* Hledání seznam nefiltruje, ale vybere nejlepší shodu. Filtrovat
     <select> znamená mazat a znovu stavět stovky <option> při každém
     stisku klávesy — tohle je rychlejší a hlavně ti pod rukama nezmizí
     hráč, kterého jsi právě vybral. */
  const wire = (qid, sid, set) => {
    const sel = $(sid), q = $(qid);
    sel.addEventListener('change', () => {
      set(sel.value ? Number(sel.value) : null);
      drawCompare();
    });
    q.addEventListener('input', () => {
      const needle = normName(q.value);
      if(!needle) return;
      const hit = BOOT.elements
        .filter(p => normName(p.web_name + ' ' + p.second_name).includes(needle))
        .sort((x, y) => y.total_points - x.total_points)[0];
      if(hit){ set(hit.id); drawCompare(); }
    });
  };
  wire('cmpqa', 'cmpa', v => { CMP_A = v; });
  wire('cmpqb', 'cmpb', v => { CMP_B = v; });
}

function drawTopPlayers(){
  $('pout').innerHTML = [
    `<h2>Nejvíc bodů podle pozice${info(`Top 10 v každé řadě za celou sezónu.
      Zvýrazněné řádky jsou hráči z tvé sestavy — kádr si nech načíst v záložce
      Sestava. Klikni na jméno pro detail hráče.`)}</h2>`,
    `<div class="tgrid">${TOP_POINTS.map(topBoard).join('')}</div>`,
    '<h2>Hráči v poli</h2>',
    `<div class="tgrid">${TOP_FIELD.map(topBoard).join('')}</div>`,
    '<h2>Brankáři</h2>',
    `<div class="tgrid">${TOP_GK.map(topBoard).join('')}</div>`,
  ].join('');

  $('pout').querySelectorAll('button.tname').forEach(btn =>
    btn.addEventListener('click', () => showPlayer(Number(btn.dataset.pid))));

  drawCompare();
}

async function loadPlayers(){
  $('pmsg').textContent = '';
  try{
    /* Rozpis je potřeba kvůli projekci ve verdiktu porovnání. Dřív se sem
       došlo s BOOT načteným a FIX null, funkce spadla a záložka zůstala
       prázdná bez jediného slova. Tichá chyba je horší než hlasitá. */
    if(!BOOT) BOOT = await api('bootstrap-static/');
    if(!FIX) FIX = await api('fixtures/');
    if(!PLAYERS){
      $('pout').innerHTML = '<div class="skel"><i></i><i></i><i></i><i></i><i></i></div>';
      PLAYERS = playerRows();
    }
    drawTopPlayers();
  }catch(e){
    $('pmsg').innerHTML = errBox(e.message, 't-players');
    $('pout').innerHTML = '';
  }
}

async function showPlayer(pid){
  const row = PLAYERS.find(r => r.p.id === pid);
  $('pdetail').innerHTML = '<div class="detail"><p class="note">Načítám historii…</p></div>';
  $('pdetail').scrollIntoView({behavior: 'smooth', block: 'nearest'});

  let sum;
  try { sum = await api('element-summary/' + pid + '/'); }
  catch(e){ $('pdetail').innerHTML = `<div class="detail"><p class="note">${esc(e.message)}</p></div>`; return; }

  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const hist = sum.history || [];
  const last5 = hist.slice(-5);

  const agg = last5.reduce((a, h) => ({
    pts: a.pts + h.total_points, min: a.min + h.minutes,
    g: a.g + h.goals_scored, as: a.as + h.assists,
    xg: a.xg + parseFloat(h.expected_goals || 0),
    xa: a.xa + parseFloat(h.expected_assists || 0),
    bps: a.bps + h.bonus,
  }), {pts: 0, min: 0, g: 0, as: 0, xg: 0, xa: 0, bps: 0});

  const pillCls = v => v >= 7 ? 'p-hi' : v >= 3 ? 'p-md' : 'p-lo';

  const pills = last5.length
    ? `<div class="pills">${last5.map(h => `<span class="pill ${pillCls(h.total_points)}">
        ${h.total_points}<small>GW${h.round}</small></span>`).join('')}</div>`
    : '<p class="note">Zatím žádné odehrané zápasy v této sezóně.</p>';

  const season = hist.reduce((a, h) => ({
    pts: a.pts + h.total_points, min: a.min + h.minutes,
    g: a.g + h.goals_scored, as: a.as + h.assists,
  }), {pts: 0, min: 0, g: 0, as: 0});

  const upcoming = (sum.fixtures || []).slice(0, 5).map(f => {
    const opp = teams[f.is_home ? f.team_a : f.team_h];
    return `${opp ? opp.short_name : '?'}${f.is_home ? ' (D)' : ' (V)'} · ${f.difficulty}`;
  }).join(' | ');

  const table = hist.length ? `<table style="margin-top:14px">
    <thead><tr><th>GW</th><th class="hide-s">Soupeř</th><th class="n">Min</th>
      <th class="n">G</th><th class="n">A</th><th class="n hide-s">xG</th>
      <th class="n hide-s">xA</th><th class="n">Bon</th><th class="n">Body</th></tr></thead>
    <tbody>${hist.slice().reverse().slice(0, 12).map(h => {
      const opp = teams[h.opponent_team];
      return `<tr>
        <td>${h.round}</td>
        <td class="hide-s">${opp ? esc(opp.short_name) : '–'}${h.was_home ? ' (D)' : ' (V)'}</td>
        <td class="n">${h.minutes}</td>
        <td class="n">${h.goals_scored}</td>
        <td class="n">${h.assists}</td>
        <td class="n hide-s">${parseFloat(h.expected_goals || 0).toFixed(2)}</td>
        <td class="n hide-s">${parseFloat(h.expected_assists || 0).toFixed(2)}</td>
        <td class="n">${h.bonus}</td>
        <td class="n"><b>${h.total_points}</b></td>
      </tr>`;
    }).join('')}</tbody></table>` : '';

  // Předchozí sezóny — jediná obrana proti malému vzorku u hráče,
  // který letos odehrál pár set minut.
  const past = (sum.history_past || []).slice(-4).reverse();
  const pastHtml = past.length ? `
    <h2>Předchozí sezóny</h2>
    <table>
      <thead><tr><th>Sezóna</th><th class="n">Body</th><th class="n">Minuty</th>
        <th class="n hide-s">Cena start</th><th class="n hide-s">Cena konec</th></tr></thead>
      <tbody>${past.map(x => `<tr>
        <td>${esc(x.season_name)}</td>
        <td class="n"><b>${x.total_points}</b></td>
        <td class="n">${x.minutes}</td>
        <td class="n hide-s">${(x.start_cost / 10).toFixed(1)}</td>
        <td class="n hide-s">${(x.end_cost / 10).toFixed(1)}</td>
      </tr>`).join('')}</tbody>
    </table>`
    : '<p class="note">V Premier League zatím neodehrál žádnou předchozí sezónu.</p>';

  $('pdetail').innerHTML = `<div class="detail">
    <button class="close" id="pclose" aria-label="Zavřít">×</button>
    <h3>${esc(row.p.first_name)} ${esc(row.p.second_name)}</h3>
    <div class="who">${esc(row.team.name)} · ${POS[row.p.element_type]} · ${row.price.toFixed(1)}m</div>

    <div class="kpis eprow">
      <div><div class="k">Projekce FPL · příští kolo</div>
        <div class="v big">${row.ep === null ? '–' : row.ep.toFixed(1)}</div></div>
      <div><div class="k">Projekce FPL · toto kolo</div>
        <div class="v">${epThis(row.p) === null ? '–' : epThis(row.p).toFixed(1)}</div></div>
      <div><div class="k">Body za zápas</div><div class="v">${row.p.points_per_game}</div></div>
      <div><div class="k">Forma</div><div class="v">${row.p.form}</div></div>
    </div>

    <h2>Statistiky podle pozice${info(`Všechno naměřená čísla z FPL, nic dopočítaného.
    ${row.p.element_type === 1 ? 'U brankáře rozhodují zákroky a čistá konta.'
      : row.p.element_type === 2 ? 'U obránce sleduj xGC — kolik jeho tým očekávaně inkasuje.'
      : row.p.element_type === 3 ? 'Záložník bere body z obou stran: zapojení do gólů i čisté konto.'
      : 'U útočníka je podstatné xGI — jak často se dostává ke gólovým situacím.'}`)}</h2>
    ${statGrid(row.p)}
    

    <h2 style="margin-top:16px">Posledních 5 kol</h2>
    ${pills}
    <div class="kpis">
      <div><div class="k">Body</div><div class="v">${agg.pts}</div></div>
      <div><div class="k">Minuty</div><div class="v">${agg.min}</div></div>
      <div><div class="k">G + A</div><div class="v">${agg.g}+${agg.as}</div></div>
      <div><div class="k">xG + xA</div><div class="v">${(agg.xg + agg.xa).toFixed(2)}</div></div>
      <div><div class="k">Bonus</div><div class="v">${agg.bps}</div></div>
    </div>
    ${last5.length ? `<p class="note">${
      (agg.g + agg.as) > (agg.xg + agg.xa) + 1
        ? 'Skóruje nad očekávání — část bodů je štěstí a nemusí vydržet.'
        : (agg.xg + agg.xa) > (agg.g + agg.as) + 1
          ? 'Šance si vytváří, ale nepromítly se do bodů — může se to obrátit.'
          : 'Body zhruba odpovídají vytvořeným šancím.'}</p>` : ''}

    <h2>Celá sezóna</h2>
    <div class="kpis">
      <div><div class="k">Body</div><div class="v">${season.pts}</div></div>
      <div><div class="k">Zápasy</div><div class="v">${hist.length}</div></div>
      <div><div class="k">Minuty</div><div class="v">${season.min}</div></div>
      <div><div class="k">G + A</div><div class="v">${season.g}+${season.as}</div></div>
      <div><div class="k">Vlastní %</div><div class="v">${row.p.selected_by_percent}</div></div>
      <div><div class="k">Model · 5 kol</div><div class="v">${row.xp5.toFixed(1)}</div></div>
    </div>
    ${upcoming ? `<p class="note">Program: ${esc(upcoming)}</p>` : ''}
    ${pastHtml}
    ${table}
  </div>`;

  $('pclose').addEventListener('click', () => { $('pdetail').innerHTML = ''; });
}


$('t-players').addEventListener('click', () => { loadPlayers(); });

/* ============ TRANSFERY ============
   Postup:
     1. načti sestavu a stav banky
     2. priorita 1 — zranění, suspenze, nebo 3 zápasy v řadě s FDR 4+
     3. priorita 2 — 3 a více zápasů po sobě pod 3 body
     4. ke každému problému najdi náhrady, které se vejdou do rozpočtu
*/

function nextFixtures(teamId, startGw, n){
  const out = [];
  for(const f of FIX){
    if(f.event === null || f.event < startGw) continue;
    if(f.team_h === teamId) out.push({gw: f.event, opp: f.team_a, home: true, d: f.team_h_difficulty});
    else if(f.team_a === teamId) out.push({gw: f.event, opp: f.team_h, home: false, d: f.team_a_difficulty});
  }
  return out.sort((a, b) => a.gw - b.gw).slice(0, n);
}

async function analyzeTransfers(){
  $('trmsg').textContent = 'Načítám sestavu…';
  $('trout').innerHTML = '<div class="skel"><i></i><i></i><i></i><i></i><i></i></div>';
  try{
    if(!BOOT){ [BOOT, FIX] = await Promise.all([api('bootstrap-static/'), api('fixtures/')]); }
    if(!PLAYERS) PLAYERS = playerRows();

    const entryId = CONFIG.entryId || localStorage.getItem('fpl_entry');
    if(!entryId){ $('trmsg').textContent = 'Nejdřív si načti sestavu v záložce Sestava.'; return; }

    const cur = BOOT.events.find(e => e.is_current);
    const nxt = BOOT.events.find(e => e.is_next);
    const startGw = nxt ? nxt.id : (cur ? cur.id + 1 : 1);

    if(!cur){
      $('trmsg').textContent = 'Sezóna ještě nezačala — analýza dává smysl až po prvním kole.';
      return;
    }

    const picks = await api('entry/' + entryId + '/event/' + cur.id + '/picks/');
    const bank = (picks.entry_history.bank || 0) / 10;

    // Nákupní ceny. Když endpoint selže, spadneme na cenu na začátku sezóny —
    // to je pořád lepší než ruční zadávání, jen to nezachytí pozdější nákupy.
    try{
      BUY_COST = buildBuyCost(await cached('entry/' + entryId + '/transfers/'));
    }catch(e){
      BUY_COST = null;
    }

    $('trmsg').textContent = 'Procházím ' + picks.picks.length + ' hráčů…';

    // historie kazdeho hrace v kadru — kvuli bodum za posledni zapasy
    const summaries = (await pooled(picks.picks,
      pk => cached('element-summary/' + pk.element + '/').then(r => r.history || []),
      5, (d, t) => { $('trmsg').textContent = `Procházím kádr… ${d}/${t}`; })).map(x => x || []);

    const els0 = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
    const squad = picks.picks.map(pk => ({p: els0[pk.element], pick: pk})).filter(x => x.p);

    // ulozime si to, aby slo prepocitat po rucni uprave cen bez novych dotazu
    TR_STATE = {picks, summaries, squad, apiBank: bank, startGw};
    renderTransfers();
    $('trmsg').textContent = '';
  }catch(e){
    $('trmsg').innerHTML = errBox(e.message, null, () => analyzeTransfers());
  }
}

/* --- rucni korekce cen -------------------------------------------------
   FPL veřejně nedává prodejní cenu (při zdražení vrací jen polovinu zisku),
   takže odhad z aktuální ceny bývá o desetinu vedle. Uživatel si ji může
   přepsat podle toho, co vidí ve své sestavě na FPL; ukládá se do prohlížeče.
*/
let TR_STATE = null;

/* Ruční prodejní ceny a banka patří ke konkrétnímu týmu, ne k prohlížeči.
   Dřív byly klíče sdílené, takže po přepnutí na jiné ID se objevily cizí
   částky u cizí sestavy. Klíčujeme proto podle entry ID. */
const SELL_KEY = () => 'fpl_sell:' + (ENTRY_ID || '0');
const BANK_KEY = () => 'fpl_bank:' + (ENTRY_ID || '0');

function loadSell(){
  try { return JSON.parse(localStorage.getItem(SELL_KEY()) || '{}'); }
  catch(e){ return {}; }
}
function saveSell(o){ lsSet(SELL_KEY(), JSON.stringify(o)); }

/* ------------------------------------------------------------
   Nákupní ceny z entry/{id}/transfers/.

   Dřív se prodejní ceny zadávaly ručně, protože FPL je v picks
   neposílá. Endpoint transfers/ ale posílá u každého přestupu
   `element_in_cost` — nákupní cenu v desetinách milionu.

   Hráč, kterého jsi nikdy nekupoval, je z původního kádru: jeho
   nákupní cena je `now_cost - cost_change_start`.

   Klíčem je poslední přestup dovnitř. Když hráče prodáš a za tři
   kola koupíš zpátky dráž, platí ta novější cena.
   ------------------------------------------------------------ */
let BUY_COST = null;   // {playerId: cena v desetinách} nebo null = nenačteno

function buildBuyCost(transfers){
  const map = {};
  const byPlayer = {};
  for(const t of (transfers || [])){
    const prev = byPlayer[t.element_in];
    // event může chybět u přestupů udělaných před prvním kolem
    const ev = Number.isFinite(t.event) ? t.event : 0;
    if(!prev || ev >= prev.ev) byPlayer[t.element_in] = {ev, cost: t.element_in_cost};
  }
  for(const [pid, v] of Object.entries(byPlayer))
    if(Number.isFinite(v.cost)) map[pid] = v.cost;
  return map;
}

/* Nákupní cena v desetinách. Vrací null, když ji nedokážeme určit. */
function buyCost(p){
  if(BUY_COST && Number.isFinite(BUY_COST[p.id])) return BUY_COST[p.id];
  // Hráč z původního kádru: odečteme celkový pohyb ceny od začátku sezóny.
  const start = p.now_cost - (p.cost_change_start || 0);
  return Number.isFinite(start) && start > 0 ? start : null;
}

/* Pravidlo FPL: ze zisku dostaneš zpátky polovinu, zaokrouhlenou dolů
   na desetinu milionu. Ztráta se naopak promítne celá. */
function sellFromBuy(nowCost, buy){
  if(!Number.isFinite(buy)) return nowCost;
  if(nowCost <= buy) return nowCost;
  return buy + Math.floor((nowCost - buy) / 2);
}

/* Ruční přepis prodejní ceny zmizel spolu se záložkou Transfery, kde
   se editoval. Nákupní ceny z transfers/ jsou přesnější než cokoli,
   co by člověk psal ručně, takže tu nic nechybí — jen se přestal číst
   starý localStorage, kde komu zůstaly staré přepisy. */
function sellPrice(p){
  return sellFromBuy(p.now_cost, buyCost(p)) / 10;
}

/* Odkud číslo je: 'manual' | 'api' | 'start'. Řídí popisek v UI —
   „upraveno“ a „spočítáno z nákupní ceny“ nejsou totéž. */
function sellSource(p){
  const v = parseFloat(loadSell()[p.id]);
  if(Number.isFinite(v) && v > 0) return 'manual';
  if(BUY_COST && Number.isFinite(BUY_COST[p.id])) return 'api';
  return 'start';
}
function isOverridden(p){ return sellSource(p) === 'manual'; }
function bankValue(){
  const v = parseFloat(localStorage.getItem(BANK_KEY()));
  return Number.isFinite(v) && v >= 0 ? v : (TR_STATE ? TR_STATE.apiBank : 0);
}


/* ------------------------------------------------------------
   Hledání náhrad.

   Filtry se aplikují v pořadí od nejtvrdšího po nejměkčí a průběžně se
   počítá, kolik hráčů kde vypadlo. Když nezbude nikdo, víme přesně proč
   a můžeme to říct — dřív appka v každém případě tvrdila „nevejde se do
   rozpočtu“, i když skutečnou příčinou byl minutový práh.

   Minutový práh se navíc škáluje podle toho, kolik kol se odehrálo.
   Pevných 180 minut znamenalo, že v prvních dvou kolech neprošel nikdo
   a záložka byla k ničemu přesně v době, kdy se transfery řeší nejvíc.
   ------------------------------------------------------------ */
function findReplacements(it, budget, owned, clubCount, startGw, byId){
  const rounds = roundsPlayed();

  // Po dvou kolech chceme 40 minut, po devíti 180. Nikdy víc než 180.
  // Pevných 180 znamenalo, že na začátku sezóny neprošel nikdo.
  const minMinutes = Math.min(180, Math.max(0, rounds - 1) * 20);

  /* Pořadí návrhů určuje jedno jediné číslo: kolik procent hráčů v FPL
     daného hráče vlastní. Žádná projekce, žádná forma, žádný rozpis.

     Je to vědomá volba, ne zjednodušení z lenosti. Vysoké vlastnictví
     znamená, že se od zbytku pole neodchýlíš — když ten hráč zaboduje,
     zabodujou i ostatní a ty neztrácíš. Opačná strana mince: takhle se
     náskok nezískává, jen nepropadá. Statistiky zůstávají dostupné pod
     tlačítkem, ale do pořadí nemluví. */
  const enrich = r => ({
    ...r,
    f3: nextFixtures(r.p.team, startGw, 3),
    owned: parseFloat(r.p.selected_by_percent) || 0,
    lastWeek: r.p.event_points,
  });

  const steps = [
    ['stejná pozice',        r => r.p.element_type === it.p.element_type],
    ['nemáš ho v kádru',     r => !owned.has(r.p.id)],
    ['limit 3 z klubu',      r => (clubCount[r.p.team] || 0) < 3],
    ['zdravý a k dispozici', r => r.chance >= 75 && r.p.status === 'a'],
    ['odehrané minuty',      r => r.p.minutes >= minMinutes],
    ['vejde se do rozpočtu', r => r.price <= budget + 0.001],
  ];

  // Počty po každém kroku — bez nich se nedá poznat, který filtr škrtí.
  const counts = [];
  let pool = PLAYERS;

  for(const [label, fn] of steps){
    pool = pool.filter(fn);
    counts.push({label, left: pool.length});
  }

  const cands = pool.map(enrich)
    .sort((a, b) => b.owned - a.owned)
    .slice(0, 5);

  // Kdo prošel vším kromě ceny — a o kolik peněz jde. Tohle je odpověď
  // na otázku „a kdybych sehnal ještě půl milionu?“, kterou si člověk
  // v tuhle chvíli stejně položí.
  const affordable = steps.slice(0, -1)
    .reduce((acc, [, fn]) => acc.filter(fn), PLAYERS);

  const nearMiss = affordable
    .filter(r => r.price > budget + 0.001)
    .map(enrich)
    .sort((a, b) => b.owned - a.owned)
    .slice(0, 3)
    .map(r => ({...r, missing: r.price - budget}));

  const cheapest = affordable.length
    ? Math.min(...affordable.map(r => r.price)) : null;

  return {
    cands, pool, counts, nearMiss, cheapest, minMinutes,
    diag: cands.length ? '' : explainNoCandidates(
      {counts, cheapest, nearMiss, budget, minMinutes, pos: it.p.element_type}),
  };
}

/* Když nic nenajdeme, musí být z výstupu jasné proč — jinak si uživatel
   domyslí špatnou příčinu a jde uvolňovat peníze, které nejsou problém.
   Dřív appka v každém případě tvrdila „nevejde se do rozpočtu“. */
function explainNoCandidates({counts, cheapest, nearMiss, budget, minMinutes, pos}){
  // První krok, po kterém nezbyl nikdo.
  const dead = counts.find(c => c.left === 0);

  let lead;
  if(!dead){
    lead = 'Něco je špatně v samotném hledání — filtry prošly, ale seznam je prázdný.';
  } else if(dead.label === 'vejde se do rozpočtu'){
    lead = cheapest !== null
      ? `Nejlevnější použitelný ${POS[pos]} stojí <b>${cheapest.toFixed(1)}m</b>,
         ty máš <b>${budget.toFixed(1)}m</b>. Chybí ti
         <b>${(cheapest - budget).toFixed(1)}m</b>.`
      : `Za ${budget.toFixed(1)}m na téhle pozici nikdo není.`;
  } else if(dead.label === 'odehrané minuty'){
    lead = `Kandidáti do rozpočtu existují, ale nikdo z nich zatím neodehrál
      ${minMinutes} minut.`;
  } else if(dead.label === 'zdravý a k dispozici'){
    lead = 'Do rozpočtu se vejdou jen hráči, kteří jsou zranění nebo pod otazníkem.';
  } else if(dead.label === 'limit 3 z klubu'){
    lead = 'Zbývající hráči jsou z klubů, odkud už máš tři — víc FPL nedovolí.';
  } else {
    lead = `Filtr „${dead.label}“ nenechal nikoho.`;
  }

  const near = nearMiss.length
    ? `<div class="near">
        <b>Kdybys uvolnil víc peněz:</b>
        ${nearMiss.map(r => `<span class="chip">
          <b>${esc(r.p.web_name)}</b>
          <span class="ct">${esc(r.team.short_name)} · ${r.price.toFixed(1)}m
            · vlastní ${r.owned.toFixed(1)} % · chybí ${r.missing.toFixed(1)}m</span></span>`).join('')}
      </div>` : '';

  const table = `<details class="why">
    <summary>Proč nic nenašlo</summary>
    <table class="funnel"><tbody>
      ${counts.map(c => `<tr><td>${esc(c.label)}</td>
        <td class="n ${c.left ? '' : 'al'}">${c.left}</td></tr>`).join('')}
    </tbody></table>
    <p class="note">Kolik hráčů zbylo po každém kroku. Nula ukazuje, kde se to zaseklo.</p>
  </details>`;

  return `<p class="note">${lead}</p>${near}${table}`;
}

function renderTransfers(){
  const {picks, summaries, startGw} = TR_STATE;
  const bank = bankValue();
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const owned = new Set(picks.picks.map(pk => pk.element));
  const byId = Object.fromEntries(PLAYERS.map(r => [r.p.id, r]));

  const issues = [];

  picks.picks.forEach((pk, i) => {
    const p = els[pk.element];
    if(!p) return;
    const hist = summaries[i];
    const fx = nextFixtures(p.team, startGw, 3);
    const chance = p.chance_of_playing_next_round === null ? 100 : p.chance_of_playing_next_round;
    const reasons = [];
    let prio = 0;

    // --- priorita 1: dostupnost ---
    if(p.status === 's'){ reasons.push('Suspendovaný'); prio = 1; }
    else if(p.status === 'i'){ reasons.push('Zraněný'); prio = 1; }
    else if(p.status === 'u' || p.status === 'n'){ reasons.push('Nedostupný'); prio = 1; }
    else if(chance < 100){
      reasons.push('Šance nastoupit jen ' + chance + ' %');
      prio = chance <= 50 ? 1 : Math.max(prio, 2);
    }

    /* --- program ---

       Dvě věci, na kterých staré pravidlo padalo:

       1) Používalo statické FDR od FPL, které je symetrické — Arsenal
          proti Chelsea má stejnou čtyřku jako Burnley proti Chelsea.
          Pro Arsenal je to ale vyrovnaný zápas. `ownFdr()` počítá sílu
          obou týmů, takže hráč silného klubu už není trestaný za to,
          že hraje proti jiným silným klubům.

       2) Práh „dva ze tří těžkých“ flagoval prakticky každého hráče
          špičkového týmu. Teď rozhoduje průměr přes celý blok, ne počet
          jednotlivých zápasů — a musí být opravdu zlý. */
    const withOwn = fx.map(f => ({...f, od: ownFdr(p.team, f.opp, f.home, f.d)}));
    const avgOwn = withOwn.length
      ? withOwn.reduce((a2, f) => a2 + f.od, 0) / withOwn.length : 3;

    const fxText = withOwn.map(f =>
      (teams[f.opp] ? teams[f.opp].short_name : '?')
      + (f.home ? ' (D)' : ' (V)') + ' ' + f.od.toFixed(1)).join(', ');

    /* Hráč, který boduje, se neprodává kvůli rozpisu. Forma i body na
       zápas jsou naměřená čísla od FPL — když jsou dobrá, program musí
       být opravdu brutální, aby to přebilo. */
    const form = parseFloat(p.form) || 0;
    const ppg = parseFloat(p.points_per_game) || 0;
    const performing = form >= 4 || ppg >= 4.5;

    if(withOwn.length === 3 && avgOwn >= 4.3 && !performing){
      reasons.push('Velmi těžký blok: ' + fxText);
      prio = Math.max(prio, 1);
    } else if(withOwn.length === 3 && avgOwn >= 3.9 && !performing){
      reasons.push('Náročný program: ' + fxText);
      prio = Math.max(prio, 2);
    }

    /* --- bodová sucha ---
       Sucho počítáme jen ze zápasů, kde hráč reálně hrál. Tři pětiminutová
       střídání nejsou bodová krize, ale nedostatek příležitosti. */
    const played = hist.filter(h => h.minutes >= 60);
    let dry = 0;
    for(let k = played.length - 1; k >= 0; k--){
      if(played[k].total_points <= 3) dry++; else break;
    }
    if(dry >= 3 && !performing){
      const pts = played.slice(-dry).map(h => h.total_points).join(', ');
      reasons.push('Poslední ' + dry + ' zápasy pod 3 body (' + pts + ')');
      prio = prio === 1 ? 1 : 2;
    }

    if(prio) issues.push({p, pk, prio, reasons, fx: withOwn, dry, chance, avgOwn});
  });

  if(!issues.length){
    $('trout').innerHTML = `<div class="ok-box">
      <b>Sestava je v pořádku.</b>
      <p class="note">Nikdo není zraněný ani suspendovaný, nikoho nečeká vyloženě zlý
      blok zápasů a nikdo netrpí bodovým suchem. Hráči, kteří bodují, se neflagují —
      dobrá forma přebije i těžký program. V bance máš ${bank.toFixed(1)}m.</p>
    </div>
    <div class="diffs">${buildDifferentials()}</div>`;
    return;
  }

  issues.sort((a, b) => a.prio - b.prio || b.dry - a.dry);

  const blocks = issues.map(it => {
    const sell = sellPrice(it.p);
    const budget = bank + sell;
    const edited = isOverridden(it.p);

    // FPL dovoluje nejvýš tři hráče z jednoho klubu. Po odchodu tohohle
    // hráče se počty přepočítají — jinak by appka klidně navrhla čtvrtého
    // Arsenalisty a transfer by nešel provést.
    const clubCount = {};
    picks.picks.forEach(x => {
      if(x.element === it.p.id) return;
      const q = els[x.element];
      if(q) clubCount[q.team] = (clubCount[q.team] || 0) + 1;
    });

    const {cands, diag} = findReplacements(it, budget, owned, clubCount, startGw, byId);

    const candHtml = cands.length ? `
      <div class="candhead">
        <span>Hráč</span><span>Tým</span><span class="n">Cena</span>
        <span class="n">Vlastní</span><span class="n">Body min. kolo</span>
        <span class="n">Minuty</span><span></span>
      </div>
      ${cands.map(c => `<div class="cand2">
        <span class="nm"><b>${esc(c.p.web_name)}</b></span>
        <span class="tm">${esc(c.team.short_name)}</span>
        <span class="n" data-l="Cena">${c.price.toFixed(1)}m</span>
        <span class="n own" data-l="Vlastní"><b>${c.owned.toFixed(1)}&nbsp;%</b></span>
        <span class="n" data-l="Min. kolo">${c.lastWeek} b</span>
        <span class="n" data-l="Minut">${c.p.minutes}</span>
        <span class="n">
          <button class="info" type="button" aria-expanded="false"
                  data-stats="${it.p.id}-${c.p.id}"
                  aria-label="Statistiky hráče ${esc(c.p.web_name)}">i</button>
        </span>
      </div>
      <div class="statpop" id="stats-${it.p.id}-${c.p.id}" hidden>
        <h5>${esc(c.p.web_name)} · ${esc(c.team.short_name)} · ${POS[c.p.element_type]}</h5>
        ${statGrid(c.p)}
        <p class="note">Program: ${c.f3.map(f =>
          (teams[f.opp] ? esc(teams[f.opp].short_name) : '?') + ' ' + f.d).join(' · ') || '–'}
          · projekce FPL ${c.ep === null ? '–' : c.ep.toFixed(1)}</p>
      </div>`).join('')}
      <p class="note">Seřazeno <b>výhradně podle vlastnictví</b> — kolik procent
      hráčů FPL je má v týmu. Statistiky jsou pod tlačítkem <b>i</b> a do pořadí
      nemluví. Vysoké vlastnictví tě drží s polem; náskok se takhle nezískává.</p>`
      : diag;

    /* Karta je složená: v zavřeném stavu jen jméno, zařazení a důvod.
       Statistiky a návrhy náhrad se rozbalí až na vyžádání — patnáct
       rozbalených karet pod sebou nikdo nepřečte. */
    const mineEp = byId[it.p.id] ? byId[it.p.id].ep : null;

    return `<details class="issue p${it.prio}">
      <summary>
        <div class="hdr">
          <b>${esc(it.p.web_name)}</b>
          <span class="tag">${esc(teams[it.p.team].short_name)} · ${POS[it.p.element_type]}
            · ${(it.p.now_cost / 10).toFixed(1)}m</span>
          <span class="tag">${it.prio === 1 ? 'Priorita 1' : 'Priorita 2'}</span>
          <span class="tag ep">xP FPL ${mineEp === null ? '–' : mineEp.toFixed(1)}</span>
        </div>
        <p class="why">${it.reasons.map(r => '• ' + esc(r)).join('<br>')}</p>
        <span class="more">Rozbalit statistiky a náhrady</span>
      </summary>

      <div class="issue-body">
        <div class="candhead">
          <span>Hráč</span><span>Tým</span><span class="n">Cena</span>
          <span class="n">Vlastní</span><span class="n">Body min. kolo</span>
          <span class="n">Minuty</span><span></span>
        </div>
        <div class="cand2 own-row">
          <span class="nm"><b>${esc(it.p.web_name)}</b></span>
          <span class="tm">${esc(teams[it.p.team].short_name)}</span>
          <span class="n" data-l="Cena">${(it.p.now_cost / 10).toFixed(1)}m</span>
          <span class="n own" data-l="Vlastní"><b>${parseFloat(it.p.selected_by_percent).toFixed(1)}&nbsp;%</b></span>
          <span class="n" data-l="Min. kolo">${it.p.event_points} b</span>
          <span class="n" data-l="Minut">${it.p.minutes}</span>
          <span class="n">
            <button class="info" type="button" aria-expanded="false"
                    data-stats="self-${it.p.id}"
                    aria-label="Statistiky hráče ${esc(it.p.web_name)}">i</button>
          </span>
        </div>
        <div class="statpop" id="stats-self-${it.p.id}" hidden>
          <h5>${esc(it.p.web_name)} · ${POS[it.p.element_type]}</h5>
          ${statGrid(it.p)}
        </div>

        <div class="budget">
          <label>Prodejní cena
            <input class="pin" type="number" step="0.1" min="0" max="20"
                   data-pid="${it.p.id}" value="${sell.toFixed(1)}">m
          </label>
          + banka ${bank.toFixed(1)}m = <b>${budget.toFixed(1)}m</b>
          ${{manual: '<span class="edited">upraveno ručně</span>',
             api:    '<span class="est">z nákupní ceny ' +
                     (buyCost(it.p) / 10).toFixed(1) + 'm</span>',
             start:  '<span class="est">z ceny na startu sezóny</span>'
            }[sellSource(it.p)]}
        </div>

        <h4>Možné náhrady</h4>
        ${candHtml}
      </div>
    </details>`;
  });

  const p1 = issues.filter(i => i.prio === 1).length;
  const bankEdited = Number.isFinite(parseFloat(localStorage.getItem(BANK_KEY())));

  $('trout').innerHTML = `
    <h2>Nalezeno ${issues.length} problémů · ${p1} akutních${info(`${BUY_COST
      ? 'Prodejní ceny počítám z <b>tvých skutečných nákupních cen</b> (endpoint '
        + 'transfers/). Ze zisku ti FPL vrací polovinu zaokrouhlenou dolů — to je '
        + 'v čísle zahrnuté. Přepsat je můžeš, ale většinou nebudeš muset.'
      : '<b>Historii přestupů se nepodařilo načíst</b>, takže počítám z ceny na '
        + 'začátku sezóny. U hráčů koupených během sezóny to bude vedle — přepiš je '
        + 'ručně.'}`)}</h2>
    <div class="budget" style="border-top:0;padding-top:0">
      <label>V bance
        <input class="pin" id="bankin" type="number" step="0.1" min="0" max="100"
               value="${bank.toFixed(1)}">m
      </label>
      ${bankEdited ? `<span class="edited">upraveno</span>
        <button class="lnk" id="bankreset">vrátit ${TR_STATE.apiBank.toFixed(1)}m z FPL</button>` : ''}
    </div>
    
    ${blocks.join('')}
    <button class="lnk" id="sellreset" style="margin-top:14px">Zahodit ruční přepisy</button>
    ${storageNote('Ruční přepis cen a banky')}
    <div class="diffs">${buildDifferentials()}</div>`;

  /* Tlačítko „i“ místo hover tooltipu — na dotykovém displeji se hover
     nedá vyvolat a tooltip by tam byl nedostupný. */
  $('trout').querySelectorAll('button.info').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const box = $('stats-' + btn.dataset.stats);
      if(!box) return;
      const show = box.hidden;
      box.hidden = !show;
      btn.setAttribute('aria-expanded', String(show));
      btn.classList.toggle('on', show);
    });
  });

  // prepocet po uprave — bez novych dotazu na API
  $('trout').querySelectorAll('input.pin[data-pid]').forEach(inp => {
    inp.addEventListener('change', () => {
      const o = loadSell();
      const v = parseFloat(inp.value);
      if(Number.isFinite(v) && v > 0) o[inp.dataset.pid] = v;
      else delete o[inp.dataset.pid];
      saveSell(o);
      renderTransfers();
    });
  });

  $('bankin').addEventListener('change', () => {
    const v = parseFloat($('bankin').value);
    if(Number.isFinite(v) && v >= 0) lsSet(BANK_KEY(), String(v));
    else lsDel(BANK_KEY());
    renderTransfers();
  });

  const br = $('bankreset');
  if(br) br.addEventListener('click', () => {
    lsDel(BANK_KEY());
    renderTransfers();
  });

  $('sellreset').addEventListener('click', () => {
    lsDel(SELL_KEY());
    lsDel(BANK_KEY());
    renderTransfers();
  });
}

$('trgo').addEventListener('click', async () => {
  $('trgo').disabled = true;
  await analyzeTransfers();
  $('trgo').disabled = false;
});

/* ============ HUB LIGY ============ */
let HUB = null;
let LEAGUE_OWN = null;   // {owners: {playerId: [jmena]}, n} — plni renderLeague

async function loadHub(){
  $('hubmsg').textContent = 'Načítám ligu…';
  $('hubout').innerHTML = '';
  try{
    if(!BOOT){ [BOOT, FIX] = await Promise.all([api('bootstrap-static/'), api('fixtures/')]); }
    if(!PLAYERS) PLAYERS = playerRows();

    const lid = CONFIG.leagueId || localStorage.getItem('fpl_league');
    if(!lid){ $('hubmsg').textContent = 'Nejdřív si načti ligu v záložce Miniliga.'; return; }

    const cur = BOOT.events.find(e => e.is_current);
    if(!cur){ $('hubmsg').textContent = 'Sezóna ještě nezačala.'; return; }

    const {league, members} = await fetchStandings(lid,
      n => { $('hubmsg').textContent = 'Načítám pořadí… ' + n + ' týmů'; });
    if(!members.length){ $('hubmsg').textContent = 'Liga nemá členy.'; return; }

    // cached() znamená, že po načtení Miniligy je tohle skoro zadarmo —
    // jsou to přesně tytéž adresy.
    const hists = await pooled(members, m => cached('entry/' + m.entry + '/history/'),
      5, (d, t) => { $('hubmsg').textContent = `Načítám historii… ${d}/${t}`; });

    const picks = await pooled(members, m => cached('entry/' + m.entry + '/event/' + cur.id + '/picks/'),
      5, (d, t) => { $('hubmsg').textContent = `Načítám sestavy… ${d}/${t}`; });

    HUB = {st: {league}, members, hists, picks, cur};
    renderHub();
    $('hubmsg').textContent = '';
  }catch(e){
    $('hubmsg').innerHTML = errBox(e.message, 't-hub');
  }
}

// poradi v lize po jednotlivych kolech, z kumulativnich bodu
/* Body po kolech, indexované podle čísla kola — ne podle pozice v poli.

   Manažer, který do FPL vstoupil až v GW5, má current[0].round === 5.
   Čtení přes current[g] mu proto posunulo celou křivku o čtyři kola doleva. */
function pointsByRound(h){
  const map = new Map();
  if(h && h.current) for(const ev of h.current) map.set(ev.round, ev);
  return map;
}

function leagueRanks(members, hists){
  const maps = hists.map(pointsByRound);
  const gws = Math.max(0, ...maps.map(m => m.size ? Math.max(...m.keys()) : 0));
  const ranks = members.map(() => []);

  for(let g = 1; g <= gws; g++){
    const pts = members.map((m, i) => {
      const ev = maps[i].get(g);
      return [i, ev ? ev.total_points : -1];
    }).sort((a, b) => b[1] - a[1]);
    pts.forEach(([i], pos) => ranks[i].push(pos + 1));
  }
  return {ranks, gws};
}

/* Stav kola. FPL přepne `is_current` hned po deadlinu, takže „aktuální
   kolo“ neznamená „odehrané kolo“ — mezi tím je celý víkend, během
   kterého se čísla mění po každém zápase.

   Rozlišujeme tři fáze, protože každá znamená jinou míru důvěry:
     · running   — kolo běží, body se ještě sčítají
     · unchecked — zápasy dohrané, ale bonusy se dopočítávají
     · final     — data_checked, čísla už se nezmění

   `data_checked` je jediné pole, které FPL nastaví až po připsání
   bonusů. `finished` přijde dřív, takže na definitivnost nestačí.

   Jenže obojí je na úrovni celého kola a FPL je přepíná se zpožděním —
   klidně půl dne po posledním zápase, někdy až v úterý ráno. Do té doby
   appka tvrdila „kolo běží“, i když se dávno dohrálo a bonusy byly
   připsané. Proto se ptáme rovnou rozpisu, který se aktualizuje hned:

     · některý zápas ještě neskončil          → running
     · všechny dohrané, bonusy nejsou v datech → unchecked
     · všechny dohrané a bonusy zapsané        → final

   Bonus je ve `stats` každého zápasu položka `bonus`; FPL ji doplní
   ve chvíli, kdy jsou body definitivní. To je přesně ten okamžik, po
   kterém má smysl novinky pustit — nezávisle na tom, kdy se FPL uráčí
   překlopit `data_checked`. */
function fixtureBonusDone(f){
  const s = (f.stats || []).find(x => x.identifier === 'bonus');
  if(!s) return false;
  return (s.h && s.h.length > 0) || (s.a && s.a.length > 0);
}

function gwPhaseFromFixtures(gwId){
  if(!Array.isArray(FIX)) return null;
  const fs = FIX.filter(f => f.event === gwId);
  if(!fs.length) return null;
  // Rozpis smí fázi jen posunout dopředu, nikdy zpátky: když v něm zápasy
  // dohrané nejsou, rozhodnou dál příznaky kola.
  if(!fs.every(f => f.finished || f.finished_provisional)) return null;
  return fs.every(f => f.finished && fixtureBonusDone(f)) ? 'final' : 'unchecked';
}

function gwPhase(gwId){
  const ev = BOOT.events.find(e => e.id === gwId);
  if(!ev) return 'running';
  if(ev.data_checked) return 'final';
  const zRozpisu = gwPhaseFromFixtures(gwId);
  if(zRozpisu) return zRozpisu;
  if(ev.finished) return 'unchecked';
  return 'running';
}

/* Kola, která má smysl nabídnout k prohlížení: všechna zahájená,
   od prvního po aktuální. Historie se bere z `hists`, takže starší
   kola nestojí ani jeden dotaz navíc — kromě kapitánů, viz níže. */
function newsGws(){
  const cur = HUB.cur;
  const out = [];
  for(let g = 1; g <= cur.id; g++){
    const ev = BOOT.events.find(e => e.id === g);
    if(ev && (ev.finished || ev.is_current || ev.data_checked)) out.push(g);
  }
  return out;
}

/* Novinky za konkrétní kolo.

   `picksFor` jsou sestavy toho kola. Pro aktuální kolo je má HUB
   načtené; pro starší se dotahují na kliknutí (viz loadNewsGw), aby
   otevření hubu nestálo dotaz za každé kolo sezóny. Když nejsou,
   kapitánská novinka se prostě vynechá — je to jediná, která je
   potřebuje. */
/* Řádky kola pro každého člena ligy.

   Primární zdroj je historie týmu (`entry/{id}/history/`). Ta se ale
   plní se zpožděním — po prvním kole sezóny tam řádek chvíli není
   vůbec, takže hub hlásil „za tohle kolo zatím nejsou data“ i ve
   chvíli, kdy se dávno dohrálo.

   Pořadí ligy přitom nese `event_total` a je živé: aktualizuje se
   průběžně během kola. Použijeme ho jako záložní zdroj pro aktuální
   kolo. Průběžný řádek je označený (`zeStandings`), protože nese jen
   body a součet — ne přestupy ani lavičku, takže zprávy, které je
   potřebují, se u něj vynechají místo aby hlásily nuly. */
function gwRows(gwId){
  const {members, hists} = HUB;

  /* Třetí zdroj: sestavy a body hráčů toho kola.

     Historie chybí nejen u běžícího kola — na začátku sezóny nemá FPL
     řádek ani pro dohrané GW1, a pořadí ligy zná jen kolo aktuální.
     Archiv starších kol pak hlásil „za tohle kolo zatím nejsou data“,
     přestože sestavy i body appka kvůli cenám stejně stahuje. Když
     jsou, spočítá se kolo z nich; jinak se nedělá nic. */
  const picks = NEWS_PICKS.get(gwId);
  const live = NEWS_LIVE.get(gwId);
  const zeSestav = (i) => {
    const pk = picks && picks[i];
    if(!pk || !pk.picks || !live) return null;
    const L = resolveLineup(pk, liveStats(live), gwId);
    return {round: gwId, points: L.total, total_points: null, zeSestav: true};
  };

  return members.map((m, i) => {
    const h = hists[i];
    let ev = h && h.current.find(x => x.round === gwId);
    if(!ev && gwId === HUB.cur.id && Number.isFinite(m.event_total)){
      ev = {round: gwId, points: m.event_total, total_points: m.total,
            zeStandings: true};
    }
    if(!ev) ev = zeSestav(i);
    return {m, i, ev};
  }).filter(x => x.ev);
}

function buildNews(gwId, picksFor){
  const {members, hists} = HUB;
  const cur = {id: gwId != null ? gwId : HUB.cur.id};
  const picks = picksFor || [];
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const news = [];
  const phase = gwPhase(cur.id);

  const gw = gwRows(cur.id);

  if(!gw.length) return news;

  const sorted = gw.slice().sort((a, b) => b.ev.points - a.ev.points);
  const top = sorted[0], second = sorted[1], bottom = sorted[sorted.length - 1];
  const gap = second ? top.ev.points - second.ev.points : 0;

  news.push({
    cls: 'good', kicker: 'Kolo ' + cur.id,
    head: esc(top.m.player_name) + ' vyhrál kolo s ' + top.ev.points + ' body',
    body: second
      ? (gap >= 15
          ? `Náskok <b>${gap} bodů</b> na druhého — to už není náhoda, to je jiná liga.`
          : gap === 0
            ? `O první místo se dělí s <b>${esc(second.m.player_name)}</b>.`
            : `Druhý <b>${esc(second.m.player_name)}</b> zaostal o ${gap} bodů.`)
      : '',
  });

  if(bottom !== top){
    news.push({
      cls: 'bad', kicker: 'Průšvih kola',
      head: esc(bottom.m.player_name) + ' zvládl jen ' + bottom.ev.points + ' bodů',
      body: `O <b>${top.ev.points - bottom.ev.points}</b> méně než vítěz kola.`,
    });
  }

  // kapitani
  const caps = members.map((m, i) => {
    const pk = picks[i];
    if(!pk) return null;
    const c = pk.picks.find(x => x.is_captain);
    return c ? {m, pid: c.element} : null;
  }).filter(Boolean);

  if(caps.length){
    const count = {};
    caps.forEach(c => count[c.pid] = (count[c.pid] || 0) + 1);
    const popular = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    const popId = parseInt(popular[0], 10);

    const rebels = caps.filter(c => c.pid !== popId);
    if(rebels.length && rebels.length <= Math.ceil(caps.length / 2)){
      /* Body rebela se berou ze stejné mapy jako zbytek novinek — tedy
         i z živého pořadí. Dřív se sahalo přímo do historie, takže při
         běžícím kole novinka tiše zmizela, i když všechno ostatní šlo. */
      const evPodleTymu = new Map(gw.map(x => [x.m.entry, x.ev]));
      const best = rebels
        .map(r => ({...r, ev: evPodleTymu.get(r.m.entry)}))
        .filter(r => r.ev)
        .sort((a, b) => b.ev.points - a.ev.points)[0];
      if(best){
        news.push({
          cls: 'warn', kicker: 'Kapitánská volba',
          head: `${popular[1]} z ${caps.length} manažerů vsadilo na ${esc(els[popId] ? els[popId].web_name : '?')}`,
          body: `Proti proudu šel <b>${esc(best.m.player_name)}</b> s kapitánem
            <b>${esc(els[best.pid] ? els[best.pid].web_name : '?')}</b> a udělal ${best.ev.points} bodů.`,
        });
      }
    }
  }

  // dan za transfery
  const taxed = gw.filter(x => !x.ev.zeStandings && x.ev.event_transfers_cost > 0)
    .sort((a, b) => b.ev.event_transfers_cost - a.ev.event_transfers_cost);
  if(taxed.length){
    const t = taxed[0];
    news.push({
      cls: 'warn', kicker: 'Netrpělivost',
      head: `${esc(t.m.player_name)} zaplatil ${t.ev.event_transfers_cost} bodů za transfery`,
      body: `Udělal <b>${t.ev.event_transfers}</b> přesunů a skončil na ${t.ev.points} bodech.
        Bez trestu by měl ${t.ev.points + t.ev.event_transfers_cost}.`,
    });
  }

  // lavicka
  const bench = gw.filter(x => !x.ev.zeStandings)
    .sort((a, b) => b.ev.points_on_bench - a.ev.points_on_bench)[0];
  if(bench && bench.ev.points_on_bench >= 8){
    news.push({
      cls: 'bad', kicker: 'Lavička hanby',
      head: `${esc(bench.m.player_name)} nechal ${bench.ev.points_on_bench} bodů na lavičce`,
      body: 'Body, které měl v týmu a nedostal je.',
    });
  }

  /* Průměr kola. Vystačí s body, takže funguje i z živého pořadí —
     a v prvním kole sezóny, kdy ještě není s čím srovnávat pořadí,
     je to jediná novinka, která dává lize kontext. */
  if(gw.length >= 3){
    const soucet = gw.reduce((a, x) => a + x.ev.points, 0);
    const prumer = Math.round(soucet / gw.length);
    const nad = gw.filter(x => x.ev.points > prumer).length;
    news.push({
      cls: 'warn', kicker: 'Průměr kola',
      head: `Liga dala v průměru ${prumer} bodů`,
      body: `Nad průměrem skončilo <b>${nad}</b> z ${gw.length} manažerů. `
        + `Rozpětí od ${bottom.ev.points} do ${top.ev.points} bodů.`,
    });
  }

  /* Nejtěsnější souboj. Zajímavá je dvojice, která se v kole minula
     o pár bodů — v malé lize je to obvykle ten příběh, o kterém se
     pak píše do chatu. */
  if(gw.length >= 3){
    let nej = null;
    for(let i = 1; i < sorted.length; i++){
      const d = sorted[i - 1].ev.points - sorted[i].ev.points;
      if(nej === null || d < nej.d) nej = {d, a: sorted[i - 1], b: sorted[i], poz: i};
    }
    if(nej && nej.d <= 3 && nej.poz > 1){
      news.push({
        cls: 'warn', kicker: 'O fous',
        head: nej.d === 0
          ? `${esc(nej.a.m.player_name)} a ${esc(nej.b.m.player_name)} skončili na stejných bodech`
          : `${esc(nej.a.m.player_name)} přeskočil ${esc(nej.b.m.player_name)} o ${nej.d} body`,
        body: `Oba kolem <b>${nej.a.ev.points}</b> bodů — nejtěsnější souboj kola.`,
      });
    }
  }

  /* V čele celkově. Body za kolo a celkové pořadí jsou dvě různé zprávy;
     vítěz kola nemusí vést ligu a naopak. */
  const celkem = gw.filter(x => Number.isFinite(x.ev.total_points))
    .sort((a, b) => b.ev.total_points - a.ev.total_points);
  if(celkem.length >= 2){
    const lidr = celkem[0], druhy = celkem[1];
    const naskok = lidr.ev.total_points - druhy.ev.total_points;
    news.push({
      cls: 'good', kicker: 'V čele ligy',
      head: `${esc(lidr.m.player_name)} vede s ${lidr.ev.total_points} body`,
      body: lidr.m.entry === top.m.entry
        ? `Vyhrál kolo a zároveň vede tabulku — náskok <b>${naskok}</b> bodů na `
          + `${esc(druhy.m.player_name)}.`
        : `Kolo sice vyhrál ${esc(top.m.player_name)}, tabulku ale drží `
          + `<b>${esc(lidr.m.player_name)}</b> s náskokem ${naskok} bodů.`,
    });
  }

  /* Pohyb v tabulce.

     Tohle je jediná novinka, která se během rozehraného kola nedá
     ukázat ani s výhradou: porovnávala by rozehraný stav s posledním
     dokončeným, takže by hlásila skoky, které se do neděle několikrát
     otočí. Radši ji vynecháme, než abychom ji opravovali každou hodinu. */
  const {ranks, gws} = leagueRanks(members, hists);
  const idx = cur.id;   // pořadí po tomhle kole je na indexu id-1
  if(gws >= 2 && idx >= 2 && phase !== 'running'){
    const moves = members.map((m, i) => ({
      m, delta: ranks[i][idx - 2] - ranks[i][idx - 1],
      from: ranks[i][idx - 2], to: ranks[i][idx - 1],
    })).filter(x => Number.isFinite(x.delta));
    const up = moves.slice().sort((a, b) => b.delta - a.delta)[0];
    const down = moves.slice().sort((a, b) => a.delta - b.delta)[0];
    if(up && up.delta >= 2){
      news.push({
        cls: 'good', kicker: 'Skok kola',
        head: `${esc(up.m.player_name)} vyskočil o ${up.delta} míst`,
        body: `Z <b>${up.from}.</b> na <b>${up.to}. místo</b>.`,
      });
    }
    if(down && down.delta <= -2){
      news.push({
        cls: 'bad', kicker: 'Pád kola',
        head: `${esc(down.m.player_name)} spadl o ${-down.delta} míst`,
        body: `Z <b>${down.from}.</b> na <b>${down.to}. místo</b>.`,
      });
    }
  }

  return news;
}

function buildBoards(){
  const {members, hists} = HUB;
  const myId = parseInt(CONFIG.entryId || localStorage.getItem('fpl_entry') || '0', 10);

  const stats = members.map((m, i) => {
    const h = hists[i];
    const cs = h ? h.current : [];
    const pts = cs.map(x => x.points);
    const mean = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 0;
    const sd = pts.length > 1
      ? Math.sqrt(pts.reduce((a, b) => a + (b - mean) ** 2, 0) / pts.length) : 0;
    const last = cs[cs.length - 1];
    return {
      m,
      tax: cs.reduce((a, x) => a + x.event_transfers_cost, 0),
      moves: cs.reduce((a, x) => a + x.event_transfers, 0),
      bench: cs.reduce((a, x) => a + x.points_on_bench, 0),
      sd, mean,
      value: last ? last.value / 10 : 0,
      total: last ? last.total_points : 0,
      chips: (h && h.chips) ? h.chips : [],
    };
  });

  const board = (title, cap, arr, fmt, asc) => {
    const rows = arr.slice().sort((a, b) => asc ? a.v - b.v : b.v - a.v).slice(0, 5);
    return `<div class="board">
      <h4>${esc(title)}</h4>
      <p class="cap">${esc(cap)}</p>
      <ol>${rows.map(r => `<li class="${r.id === myId ? 'me' : ''}">${esc(r.n)}
        <span>${fmt(r.v)}</span></li>`).join('')}</ol>
    </div>`;
  };

  const pick = f => stats.map(s => ({n: s.m.player_name, id: s.m.entry, v: f(s)}));

  const chipNames = {wildcard: 'Wildcard', '3xc': 'Triple captain',
                     bboost: 'Bench boost', freehit: 'Free hit', manager: 'Manager'};
  const chipRows = stats.filter(s => s.chips.length).map(s =>
    `<li>${esc(s.m.player_name)} <span>${s.chips.map(c =>
      (chipNames[c.name] || c.name) + ' GW' + c.event).join(', ')}</span></li>`).join('');

  return `<div class="boards">
    ${board('Daň za transfery', 'Body odevzdané za přesuny', pick(s => s.tax), v => '−' + v)}
    ${board('Zmrzlá lavička', 'Body, co protekly na lavičce', pick(s => s.bench), v => v)}
    ${board('Nejaktivnější', 'Počet transferů za sezónu', pick(s => s.moves), v => v)}
    ${board('Nejstabilnější', 'Nejmenší rozptyl bodů po kolech', pick(s => s.sd),
            v => v.toFixed(1), true)}
    ${board('Efektivita kádru', 'Body na milion hodnoty týmu',
            pick(s => s.value ? s.total / s.value : 0), v => v.toFixed(1))}
    <div class="board">
      <h4>Spálené žolíky</h4>
      <p class="cap">Kdo už co použil</p>
      <ol>${chipRows || '<li style="list-style:none;margin-left:-19px;color:var(--mute)">Zatím nikdo.</li>'}</ol>
    </div>
  </div>`;
}

function buildHealth(){
  const {members, picks, cur} = HUB;
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const nxt = BOOT.events.find(e => e.is_next);
  const startGw = nxt ? nxt.id : cur.id + 1;

  const rows = members.map((m, i) => {
    const pk = picks[i];
    if(!pk) return null;
    const squad = pk.picks.map(x => els[x.element]).filter(Boolean);

    /* Dvě různé zprávy, ne dvě čtení téže.

       Původně sloupec „Nehraje“ počítal nedostupné hráče a „Pod otazníkem“
       úplně všechny označené — tedy včetně těch nedostupných. Yates se
       statusem `i` se tak objevil v obou sloupcích a vypadalo to, že má
       Kryštof problémy dva. Kategorie proto musí být disjunktní: kdo je
       v `out`, do otazníků už nepatří. */
    const isOut = p => p.status === 'i' || p.status === 's' || p.status === 'u'
      || p.status === 'n' || p.chance_of_playing_next_round === 0;

    const out = squad.filter(isOut);
    const doubt = squad.filter(p => !isOut(p) &&
      (p.status !== 'a' ||
       (p.chance_of_playing_next_round !== null &&
        p.chance_of_playing_next_round < 100)));
    const flagged = out.concat(doubt);
    const fdrs = squad.map(p => {
      const f = nextFixtures(p.team, startGw, 3);
      return f.length ? f.reduce((a, x) => a + x.d, 0) / f.length : 3;
    });
    const avgFdr = fdrs.reduce((a, b) => a + b, 0) / (fdrs.length || 1);
    return {m, flagged, out, doubt, avgFdr,
            names: flagged.map(p => p.web_name + ' (' + teams[p.team].short_name + ')'
              + (isOut(p) ? '' : ' ?'))};
  }).filter(Boolean);

  rows.sort((a, b) => b.out.length - a.out.length || b.doubt.length - a.doubt.length);

  return `<table>
    <thead><tr><th>Manažer</th><th class="n">Nehraje</th><th class="n">Pod otazníkem</th>
      <th class="n">FDR kádru</th><th class="hide-s">Kdo</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td><b>${HUB && HUB.cur
        ? squadBtn(r.m.entry, HUB.cur.id, r.m.player_name, r.m.entry_name)
        : esc(r.m.player_name)}</b></td>
      <td class="n ${r.out.length >= 3 ? 'al' : r.out.length ? 'wn' : ''}">${r.out.length}</td>
      <td class="n ${r.doubt.length ? 'wn' : ''}">${r.doubt.length}</td>
      <td class="n ${r.avgFdr >= 3.6 ? 'al' : r.avgFdr <= 2.6 ? 'ok' : ''}">${r.avgFdr.toFixed(2)}</td>
      <td class="hide-s" style="color:var(--mute);font-size:12px">${esc(r.names.join(', ')) || '—'}</td>
    </tr>`).join('')}</tbody></table>
  <p class="note">Sloupce se nepřekrývají: kdo nehraje, do otazníků se
  už nepočítá. Otazníkem je hráč s šancí nastoupit 25–75 %; ve sloupci
  „Kdo“ ho pozná podle otazníku za jménem. FDR kádru je průměrná obtížnost
  dalších tří zápasů přes všech 15 hráčů — nižší je lepší.</p>`;
}

function buildCollective(){
  const {members, picks, cur} = HUB;
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  const valid = picks.filter(Boolean);
  const n = valid.length;
  if(!n) return '<p class="note">Sestavy zatím nejsou dostupné.</p>';

  // kapitanska mapa
  const capCount = {};
  members.forEach((m, i) => {
    const pk = picks[i];
    if(!pk) return;
    const c = pk.picks.find(x => x.is_captain);
    if(c) (capCount[c.element] = capCount[c.element] || []).push(m.player_name);
  });
  const capRows = Object.entries(capCount)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([pid, list]) => {
      const p = els[pid];
      return `<div class="row2">
        <span class="nm2">${esc(p ? p.web_name : '?')}</span>
        <span class="bar2"><i style="width:${Math.round(list.length / n * 100)}%"></i></span>
        <span class="ct2">${list.length}/${n}</span>
      </div>`;
    }).join('');

  // sablona: jak moc jsou si sestavy podobne
  const own = {};
  members.forEach((m, i) => {
    const pk = picks[i];
    if(!pk) return;
    pk.picks.forEach(x => own[x.element] = (own[x.element] || 0) + 1);
  });
  const core = Object.entries(own).filter(([, c]) => c >= Math.ceil(n * 0.5));
  const universal = Object.entries(own).filter(([, c]) => c === n);
  const templatePct = Math.round(core.length / 15 * 100);

  // liga proti proudu: kde se vlastnictvi lisi od globalu
  const contrarian = Object.entries(own)
    .map(([pid, c]) => {
      const p = els[pid];
      if(!p) return null;
      return {p, local: c / n * 100, global: parseFloat(p.selected_by_percent)};
    })
    .filter(Boolean)
    .map(x => ({...x, diff: x.local - x.global}))
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 6);

  return `
    <h2>Kapitánská mapa · GW${cur.id}</h2>
    <div class="capmap">${capRows}</div>

    <h2>Efekt šablony${info(`${
      templatePct >= 60
        ? 'Liga hraje skoro stejný tým — rozhodne se to na pár rozdílných hráčích a kapitánovi.'
        : templatePct >= 35
          ? 'Sestavy se překrývají zhruba z třetiny. Prostor odlišit se tu pořád je.'
          : 'Každý si jede po svém — tabulka se může házet kolo od kola.'}`)}</h2>
    <div class="kpis">
      <div><div class="k">Jádro ligy</div><div class="v">${core.length}</div></div>
      <div><div class="k">Má každý</div><div class="v">${universal.length}</div></div>
      <div><div class="k">Shoda</div><div class="v">${templatePct} %</div></div>
    </div>
    

    <h2>Liga proti proudu${info(`Kde je tvoje liga jinde než zbytek světa. Kladný rozdíl znamená,
    že vy na hráče věříte víc než ostatní.`)}</h2>
    <table>
      <thead><tr><th>Hráč</th><th class="hide-s">Tým</th>
        <th class="n">V lize</th><th class="n">Globálně</th><th class="n">Rozdíl</th></tr></thead>
      <tbody>${contrarian.map(x => `<tr>
        <td><b>${esc(x.p.web_name)}</b></td>
        <td class="hide-s">${esc(teams[x.p.team].short_name)}</td>
        <td class="n">${x.local.toFixed(0)} %</td>
        <td class="n">${x.global.toFixed(1)} %</td>
        <td class="n ${x.diff > 0 ? 'ok' : 'al'}">${x.diff > 0 ? '+' : ''}${x.diff.toFixed(0)}</td>
      </tr>`).join('')}</tbody>
    </table>
    `;
}

/* ============ CENY KOLA ============

   Čtyři hlavní ceny stojí nad novinkami. Dvě z nich (výherce, smolař)
   vystačí s historií, kterou hub načítá tak jako tak. Kapitánské ceny
   potřebují navíc sestavy kola a body jednotlivých hráčů — obojí se
   dotahuje líně, viz loadNewsGw. Když chybí, karta se prostě vynechá;
   mřížka se tím zúží, ale nezůstane v ní díra s pomlčkou. */

/* Body hráčů daného kola jako mapa id → body. Bez `event/{gw}/live/`
   bychom u kapitána znali jen jméno, ne jeho výkon. */
function liveMap(live){
  const m = new Map();
  if(live && Array.isArray(live.elements)){
    for(const e of live.elements){
      m.set(e.id, e.stats ? (e.stats.total_points || 0) : 0);
    }
  }
  return m;
}

/* Kapitáni kola i s body po zdvojení. Trojnásobný kapitán (TC) má
   multiplier 3, takže se bere z picku a ne natvrdo dvojka. */
function capRows(picksFor, live, gw){
  const picks = picksFor || [];
  const body = liveMap(live);
  const stats = liveStats(live);
  if(!picks.length || !body.size) return [];
  return HUB.members.map((m, i) => {
    const pk = picks[i];
    if(!pk || !pk.picks) return null;

    /* Kapitán, který se doopravdy počítal. Když ten nasazený neodehrál,
       přebral pásku vicekapitán — dřív se v tom případě zdvojovala nula
       a cena šla nesprávnému hráči. */
    const L = resolveLineup(pk, stats, gw != null ? gw : HUB.cur.id);
    const c = L.rows.find(r => r.captain);
    if(!c || !body.has(c.element)) return null;
    const mult = c.mult > 1 ? c.mult : 2;
    return {m, i, pid: c.element, mult, pts: body.get(c.element) * mult,
            raw: body.get(c.element)};
  }).filter(Boolean);
}

/* Hráči, které manažer nechal na lavičce, i s body. */
function lavickaRows(pk, live, gw){
  const body = liveMap(live);
  if(!pk || !pk.picks || !body.size) return [];

  /* Kdo se autosubem dostal do hry, na lavičce neseděl — obviňovat
     manažera z bodů, které nakonec dostal, je horší než cenu neudělit. */
  const L = resolveLineup(pk, liveStats(live), gw != null ? gw : HUB.cur.id);
  const hral = new Set(L.rows.filter(r => r.mult > 0).map(r => r.element));

  return pk.picks
    .filter(p => p.position >= 12 && p.position <= 15 && !hral.has(p.element))
    .map(p => ({pid: p.element, pts: body.get(p.element) || 0}));
}

/* Nejlepší hráč z lavičky. Doplňuje cenu pro smolaře o jméno —
   samotné číslo neřekne, koho to mrzí. */
function nejLavicka(pk, live, gwId){
  const nej = lavickaRows(pk, live, gwId).sort((a, b) => b.pts - a.pts)[0];
  return nej && nej.pts > 0 ? nej : null;
}

/* Body na lavičce pro jeden řádek kola.

   Historie týmu (`entry/{id}/history/`) je nese hotové, ale plní se se
   zpožděním — po prvním kole sezóny tam řádek chvíli není vůbec a body
   se berou z živého pořadí ligy, které lavičku nezná. Dřív to znamenalo,
   že cena pro smolaře v GW1 prostě nebyla. Sestavy a body hráčů přitom
   máme, takže si součet spočítáme sami; z historie se bere jen tehdy,
   když tam je. Vrací null, když se nedá zjistit vůbec — to je pořád
   lepší než tvrdit nulu. */
function lavickaBody(row, pk, live, gwId){
  if(row.ev && !row.ev.zeStandings && Number.isFinite(row.ev.points_on_bench)){
    return row.ev.points_on_bench;
  }
  const lav = lavickaRows(pk, live, gwId);
  return lav.length ? lav.reduce((a, x) => a + x.pts, 0) : null;
}

/* Smolař kola: nejvíc bodů nechaných na lavičce. */
/* Smolaři kola: všichni, kdo nechali na lavičce nejvíc bodů.

   Vrací celou skupinu na maximu, ne jen prvního — cena se při shodě
   dělí a nad polovinou ligy propadá, stejně jako u kapitánů. Do počtu
   se berou jen manažeři, u kterých se lavička dá spočítat; kdo má
   `null` (chybí historie i sestavy), do statistiky nepatří. */
function smolari(gw, picksFor, live, gwId){
  const picks = picksFor || [];
  const s = gw.map(x => ({...x, lav: lavickaBody(x, picks[x.i], live, gwId)}))
    .filter(x => Number.isFinite(x.lav));
  if(!s.length) return {vsichni: [], nej: []};
  const max = Math.max(...s.map(x => x.lav));
  return {vsichni: s, nej: max > 0 ? s.filter(x => x.lav === max) : []};
}

/* Zpětně kompatibilní jednička — používá ji síň slávy, kde se počítá
   jen to, kdo cenu dostal. */
function smolar(gw, picksFor, live, gwId){
  const {nej} = smolari(gw, picksFor, live, gwId);
  return nej.length ? nej[0] : null;
}

/* Diagnostika kapitánských cen.

   Ceny se počítají ze dvou zdrojů (sestavy + body hráčů kola) a když
   jeden z nich přijde v nečekaném tvaru, karta prostě není. Tohle
   vypíše, kde se řetěz trhá, aby se to nemuselo hádat z toho, co na
   stránce chybí. Volá se ručně z konzole: debugCeny(1). */
window.debugCeny = function(gw){
  const g = gw || NEWS_GW || (HUB && HUB.cur.id);
  if(!HUB){ console.log('HUB není načtený — otevři nejdřív Hub ligy.'); return; }
  const picks = NEWS_PICKS.get(g), live = NEWS_LIVE.get(g);
  const body = liveMap(live);
  console.log('kolo', g, '· fáze', gwPhase(g));
  console.log('členů ligy:', HUB.members.length);
  console.log('sestav:', picks ? picks.length : '(nenačteno)',
    '· z toho prázdných:', picks ? picks.filter(p => !p || !p.picks).length : '-');
  console.log('hráčů v mapě bodů:', body.size,
    '· live:', live ? 'objekt' : String(live));
  const caps = capRows(picks, live, g);
  console.log('spárovaných kapitánů:', caps.length);
  console.table(caps.map(c => ({
    manazer: c.m.player_name, kapitan: c.pid, raw: c.raw,
    mult: c.mult, body: c.pts,
  })));
  const bezBodu = (picks || []).map((pk, i) => {
    if(!pk || !pk.picks) return null;
    const c = pk.picks.find(x => x.is_captain);
    if(!c) return HUB.members[i].player_name + ': žádný is_captain';
    if(!body.has(c.element)) return HUB.members[i].player_name
      + ': kapitán ' + c.element + ' není v mapě bodů';
    return null;
  }).filter(Boolean);
  if(bezBodu.length) console.log('nespárováno:', bezBodu);
  console.log('ceny:', buildAwards(g, picks, live).map(a => a.key).join(', ') || '(žádné)');
};

const AWARD_META = {
  win:   {cls: 'a-win',   emoji: '🏆', title: 'Výherce kola'},
  bench: {cls: 'a-bench', emoji: '🪑', title: 'Smolař kola'},
  cap:   {cls: 'a-cap',   emoji: '👑', title: 'Kapitán týdne'},
  flop:  {cls: 'a-flop',  emoji: '🤡', title: 'Kapitánský propadák'},
};

/* Vrátí pole cen ve tvaru {key, who, val, sub}. Prázdné pole znamená,
   že za kolo zatím nejsou žádná data — panel to řekne místo mřížky. */
function buildAwards(gwId, picksFor, liveFor){
  const id = gwId != null ? gwId : HUB.cur.id;
  const gw = gwRows(id);
  const out = [];
  if(!gw.length) return out;

  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const jmeno = pid => esc(els[pid] ? els[pid].web_name : '?');

  // vyherce
  const sorted = gw.slice().sort((a, b) => b.ev.points - a.ev.points);
  const top = sorted[0], second = sorted[1];
  const delici = sorted.filter(x => x.ev.points === top.ev.points);
  out.push({
    key: 'win',
    who: delici.length > 1
      ? delici.map(x => esc(x.m.player_name)).join(' & ')
      : esc(top.m.player_name),
    whoHtml: (delici.length > 1 ? delici : [top])
      .map(x => squadBtn(x.m.entry, id, x.m.player_name, x.m.entry_name)).join(' & '),
    val: top.ev.points + ' b',
    sub: delici.length > 1
      ? 'O první místo se dělí na stejných bodech.'
      : second
        ? (top.ev.points - second.ev.points >= 15
            ? `Náskok <b>${top.ev.points - second.ev.points} bodů</b> — to už není náhoda.`
            : `O <b>${top.ev.points - second.ev.points}</b> před ${esc(second.m.player_name)}.`)
        : '',
  });

  /* Smolař — nejvíc bodů na lavičce. Platí tu totéž pravidlo jako
     u kapitánů: cena je odlišení, takže se při polovině ligy a víc
     neuděluje. Deset lidí se stejnou lavičkou není smolař, to je kolo. */
  const {vsichni: lavVsichni, nej: lavNej} = smolari(gw, picksFor, liveFor, id);
  if(lavNej.length){
    const vsichniStejne = lavNej.length === lavVsichni.length;
    const vetsinaLav = lavNej.length * 2 >= lavVsichni.length;
    /* `who` zůstává prostým textem — čte ho síň slávy i testy. Klikatelná
       varianta jde vedle jako `whoHtml`, takže karta může odkazovat na
       sestavu, aniž by se text ceny stal HTML. */
    const jmenaLav = list => list.length <= 3
      ? list.map(c => esc(c.m.player_name)).join(', ')
      : esc(list[0].m.player_name) + ' a další ' + (list.length - 1);

    if(vsichniStejne && lavVsichni.length > 1){
      out.push({
        key: 'bench', who: 'Nikdo se neodlišil', val: lavNej[0].lav + ' b',
        sub: `Všech ${lavVsichni.length} manažerů nechalo na lavičce stejně.`,
      });
    }else if(vetsinaLav){
      out.push({
        key: 'bench', who: 'Bez ceny', val: '—',
        sub: `Stejně bodů na lavičce nechala většina ligy `
          + `(${lavNej.length} z ${lavVsichni.length}) — cena se za tohle kolo neuděluje.`,
      });
    }else{
      const kdo = lavNej[0];
      const nej = lavNej.length === 1 ? nejLavicka((picksFor || [])[kdo.i], liveFor, id) : null;
      out.push({
        key: 'bench',
        who: jmenaLav(lavNej),
        whoHtml: lavNej.length <= 3
          ? lavNej.map(c => squadBtn(c.m.entry, id, c.m.player_name, c.m.entry_name)).join(', ')
          : null,
        val: kdo.lav + ' b',
        sub: lavNej.length > 1
          ? 'Na lavičce nechali stejně — o cenu se dělí.'
          : nej
            ? `Nechal na lavičce — <b>${jmeno(nej.pid)}</b> za ${nej.pts} bodů.`
            : 'Body, které měl v týmu a nedostal je.',
      });
    }
  }

  // kapitanske ceny
  /* Kapitánské ceny.

     Cena má smysl jen jako odlišení. Když se na krajní hodnotě sejde
     polovina ligy nebo víc, není to výkon, ale průměr kola — cena se
     tehdy neuděluje a karta to řekne. Práh je ostrý na polovině:
     4 z 10 cenu ještě dostanou, 5 z 10 už ne.

     Obě strany se posuzují zvlášť. Když devět lidí vsadí na stejného
     kapitána a jeden ne, kapitánská cena propadne, ale ten jeden pořád
     může dostat propadáka — a naopak. */
  const caps = capRows(picksFor, liveFor, id);
  if(caps.length >= 2){
    const dle = caps.slice().sort((a, b) => b.pts - a.pts);
    const nej = dle[0], nic = dle[dle.length - 1];
    const vitezove = dle.filter(c => c.pts === nej.pts);
    const posledni = dle.filter(c => c.pts === nic.pts);
    const vetsina = list => list.length * 2 >= caps.length;

    const jmena = list => list.length <= 3
      ? list.map(c => esc(c.m.player_name)).join(', ')
      : esc(list[0].m.player_name) + ' a další ' + (list.length - 1);

    /* Když skupina drží jednoho hráče, řekneme to jménem — je to
       konkrétnější než „dopadli stejně“. */
    const duvod = list => list.every(c => c.pid === list[0].pid)
      ? `Stejného kapitána (${jmeno(list[0].pid)}) měla většina ligy`
      : 'Většina ligy skončila na stejných bodech';

    if(nej.pts === nic.pts){
      /* Celá liga na jednom čísle — dělit ani vyhlašovat není co.
         Karty ale zůstanou obě: kdyby jedna zmizela, vypadalo by to,
         že se propadák z nějakého důvodu nepočítal. */
      out.push({
        key: 'cap',
        who: 'Nikdo se neodlišil',
        val: nej.pts + ' b',
        sub: `Všech ${caps.length} kapitánů dalo stejně. `
          + 'Kolo se rozhodlo jinde než na páskách.',
      });
      out.push({
        key: 'flop',
        who: 'Nikdo se neodlišil',
        val: nic.pts + ' b',
        sub: 'Nikdo nepropadl víc než ostatní — všichni na stejných bodech.',
      });
    }else{
      out.push(vetsina(vitezove)
        ? {key: 'cap', who: 'Bez ceny', val: '—',
           sub: `${duvod(vitezove)} — cena se za tohle kolo neuděluje.`}
        : {key: 'cap', who: jmena(vitezove), val: nej.pts + ' b',
           whoHtml: vitezove.length <= 3 ? vitezove.map(c =>
             squadBtn(c.m.entry, id, c.m.player_name, c.m.entry_name)).join(', ') : null,
           sub: `${jmeno(nej.pid)} (${nej.raw} × ${nej.mult})`
             + (vitezove.length > 1 ? ' — o cenu se dělí.'
               : caps.filter(c => c.pid === nej.pid).length === 1
                 ? ' — jako jediný v lize.' : '.')});

      out.push(vetsina(posledni)
        ? {key: 'flop', who: 'Bez ceny', val: '—',
           sub: `${duvod(posledni)} — cena se za tohle kolo neuděluje.`}
        : {key: 'flop', who: jmena(posledni), val: nic.pts + ' b',
           whoHtml: posledni.length <= 3 ? posledni.map(c =>
             squadBtn(c.m.entry, id, c.m.player_name, c.m.entry_name)).join(', ') : null,
           sub: `${jmeno(nic.pid)} (${nic.raw} × ${nic.mult})`
             + (posledni.length > 1 ? ' — a nebyl v tom sám.' : '.')});
    }
  }

  return out;
}

/* ------------------------------------------------------------
   Síň slávy: kolikrát kdo které ceny získal za celou sezónu.

   Výhry a lavička se dopočítají z historie, kterou hub drží — nula
   dotazů navíc. Kapitánské sloupce potřebují sestavy a body kola;
   ty jsou jen pro kola, která už někdo otevřel, nebo pro všechna
   po stisku „Načíst celou sezónu“. `pokryto` proto vrací počet kol,
   ze kterých kapitánské sloupce vznikly, aby se dalo poznat, že jsou
   neúplné, místo aby tabulka tiše lhala.
   ------------------------------------------------------------ */
function hallOfFame(){
  const rows = HUB.members.map(m => ({
    m, win: 0, bench: 0, cap: 0, flop: 0,
  }));
  const podleEntry = new Map(rows.map(r => [r.m.entry, r]));
  let kol = 0, pokryto = 0;

  for(const g of newsGws()){
    /* Do bilance sezóny jde jen dopočítané kolo. Rozehrané se mění po
       každém zápase a u čekajícího na bonusy může tříbodový bonus otočit
       vítěze i propadáka — tabulka by pak přepisovala historii. */
    if(gwPhase(g) !== 'final') continue;
    const gw = gwRows(g);
    if(!gw.length) continue;
    kol++;

    const sorted = gw.slice().sort((a, b) => b.ev.points - a.ev.points);
    const max = sorted[0].ev.points;
    sorted.filter(x => x.ev.points === max).forEach(x => {
      const r = podleEntry.get(x.m.entry); if(r) r.win++;
    });

    const lav = smolar(gw, NEWS_PICKS.get(g), NEWS_LIVE.get(g), g);
    if(lav){
      const r = podleEntry.get(lav.m.entry); if(r) r.bench++;
    }

    const caps = capRows(NEWS_PICKS.get(g), NEWS_LIVE.get(g), g);
    if(caps.length >= 2){
      const dle = caps.slice().sort((a, b) => b.pts - a.pts);
      if(dle[0].pts !== dle[dle.length - 1].pts){
        pokryto++;
        const a = podleEntry.get(dle[0].m.entry); if(a) a.cap++;
        const b = podleEntry.get(dle[dle.length - 1].m.entry); if(b) b.flop++;
      }
    }
  }

  rows.sort((a, b) => b.win - a.win || a.flop - b.flop || b.cap - a.cap
    || a.m.player_name.localeCompare(b.m.player_name, 'cs'));
  return {rows, kol, pokryto};
}

/* ------------------------------------------------------------
   Panel novinek: přepínač kol + stav + samotné zprávy.

   Sestavy starších kol držíme v NEWS_PICKS, aby druhé kliknutí na
   totéž kolo nic nestahovalo. cached() by to zvládl taky, ale takhle
   je vidět, co panel drží.
   ------------------------------------------------------------ */
let NEWS_GW = null;
const NEWS_PICKS = new Map();
const NEWS_LIVE = new Map();
let HALL_ALL = false;   // stiskl někdo „Načíst celou sezónu“?

const PHASE_NOTE = {
  running: ['wn', 'Kolo běží',
    'Body se ještě sčítají a pořadí se po každém zápase mění. Definitivní '
    + 'čísla budou po dopočtu bonusů.'],
  unchecked: ['wn', 'Čeká se na bonusy',
    'Zápasy jsou dohrané, ale bonusové body FPL ještě potvrzuje. Čísla se '
    + 'můžou o kousek posunout.'],
  final: ['ok', 'Konečné výsledky',
    'Bonusy jsou připsané, čísla už se nezmění.'],
};

function newsPanel(){
  const gws = newsGws();
  const sel = NEWS_GW || HUB.cur.id;
  const phase = gwPhase(sel);
  const [cls, titulek, popis] = PHASE_NOTE[phase];

  const prepinac = gws.length > 1
    ? `<div class="gwnav" role="tablist" aria-label="Kolo novinek">
        ${gws.map(g => {
          const p = gwPhase(g);
          return `<button type="button" role="tab" data-newsgw="${g}"
            aria-selected="${g === sel}"
            title="${p === 'final' ? 'Konečné výsledky'
              : p === 'unchecked' ? 'Čeká se na bonusy' : 'Kolo běží'}"
            >GW${g}${p === 'running' ? '<i class="dot live"></i>'
              : p === 'unchecked' ? '<i class="dot wait"></i>' : ''}</button>`;
        }).join('')}
      </div>`
    : '';

  const stav = `<p class="note store ${cls === 'ok' ? 'ok' : ''} phase">
    <b>${titulek}</b> — ${popis}</p>`;

  /* Vítěz kola a lavička mají vlastní cenu nahoře — v seznamu zpráv
     by to byla tatáž věta podruhé. */
  const news = buildNews(sel, NEWS_PICKS.get(sel))
    .filter(x => !/^Kolo \d+$|^Lavička hanby$/.test(x.kicker));
  const zpravy = news.map(x => `<div class="news ${x.cls}">
      <div class="kicker">${esc(x.kicker)}</div>
      <div class="head">${x.head}</div>
      ${x.body ? `<div class="body">${x.body}</div>` : ''}
    </div>`).join('');

  const awards = buildAwards(sel, NEWS_PICKS.get(sel), NEWS_LIVE.get(sel));
  if(!awards.length && !news.length){
    /* Prázdné kolo neznamená prázdný panel: síň slávy je součet celé
       sezóny a s vybraným kolem nemá nic společného. Dřív mizela spolu
       s cenami a vypadalo to, že se ztratila. */
    const cekame = !NEWS_PICKS.has(sel) || !NEWS_LIVE.has(sel);
    return prepinac + stav
      + `<p class="note">${cekame
          ? 'Načítám sestavy a body tohohle kola…'
          : 'Za tohle kolo se nepodařilo dopočítat ani ceny, ani zprávy.'}</p>`
      + hallPanel();
  }

  /* Dokud se kolo nedopočítá, jsou ceny průběžné. Ať je to vidět na
     kartě, ne jen v hlášce nad panelem — tabulka síně slávy je bere
     až po dopočtu bonusů. */
  const zive = phase !== 'final'
    ? `<span class="livetag">${phase === 'running' ? 'živě' : 'čeká na bonusy'}</span>`
    : '';

  const ceny = awards.length
    ? `<div class="secline"><h4>Ceny kola</h4>${zive}</div>
       <div class="awards">${awards.map(a => {
         const meta = AWARD_META[a.key];
         const bez = a.val === '—' ? ' bezceny' : '';
         return `<div class="award ${meta.cls}${bez}">
           <div class="emoji" aria-hidden="true">${meta.emoji}</div>
           <div class="title">${meta.title}</div>
           <div class="who">${a.whoHtml || a.who}</div>
           <div class="val">${a.val}</div>
           ${a.sub ? `<div class="sub">${a.sub}</div>` : ''}
         </div>`;
       }).join('')}</div>`
    : '';

  /* Kapitánské ceny potřebují sestavy a body kola. Když chybí, řekneme
     to místo toho, abychom tiše ukázali o dvě ceny míň — a rozlišíme,
     jestli se ještě načítají, nebo jestli dotaz selhal. */
  const maPicks = NEWS_PICKS.has(sel) && (NEWS_PICKS.get(sel) || []).length;
  const maLive = NEWS_LIVE.has(sel) && NEWS_LIVE.get(sel);
  const chybiPicks = awards.some(a => a.key === 'cap') ? ''
    : (!NEWS_PICKS.has(sel) || !NEWS_LIVE.has(sel))
      ? '<p class="note">Kapitánské ceny dopočítám po načtení sestav…</p>'
      : (!maPicks || !maLive)
        ? `<p class="note">Kapitánské ceny teď nejdou spočítat — nepodařilo se
            načíst ${!maPicks ? 'sestavy' : 'body hráčů'} tohohle kola.
            Zkus <b>⟳</b> v hlavičce.</p>`
        : '';

  const zbytek = zpravy
    ? `<div class="secline"><h4>Co se ještě stalo</h4></div>` + zpravy
    : '';

  return prepinac + stav + ceny + chybiPicks + zbytek + hallPanel();
}

/* Tabulka cen za celou sezónu. Kapitánské sloupce se počítají jen
   z kol, pro která máme sestavy — tlačítko je dotáhne pro všechna. */
function hallPanel(){
  const {rows, kol, pokryto} = hallOfFame();
  if(kol < 1 || rows.length < 2) return '';

  const SLOUPCE = [
    ['win', '🏆', 'Výhry'], ['bench', '🪑', 'Smůla'],
    ['cap', '👑', 'Kapitán'], ['flop', '🤡', 'Propadák'],
  ];
  const max = {};
  SLOUPCE.forEach(([k]) => max[k] = Math.max(...rows.map(r => r[k])));

  const hlavicka = SLOUPCE.map(([, e, t]) =>
    `<th class="c"><span aria-hidden="true">${e}</span>${t}</th>`).join('');

  const telo = rows.map(r => `<tr>
      <td class="name">${HUB && HUB.cur
        ? squadBtn(r.m.entry, HUB.cur.id, r.m.player_name, r.m.entry_name)
        : esc(r.m.player_name)}</td>
      ${SLOUPCE.map(([k]) => {
        const v = r[k];
        const tridy = ['c', v > 0 ? 'has' : '', v > 0 && v === max[k] ? 'lead' : ''];
        return `<td class="${tridy.filter(Boolean).join(' ')}"><i>${v}</i></td>`;
      }).join('')}
    </tr>`).join('');

  const chybi = kol - pokryto;
  const pozn = chybi > 0
    ? `<p class="note">Kapitánské sloupce mám z ${pokryto} z ${kol} kol —
        zbytek potřebuje sestavy. ${HALL_ALL ? ''
          : `<button type="button" class="hallmore" data-hallall="1">Načíst celou sezónu</button>`}</p>`
    : `<p class="note">Ze všech ${kol} dopočítaných kol sezóny.
        Zlatě je maximum ve sloupci.</p>`;

  return `<div class="secline"><h4>Síň slávy</h4></div>
    <div class="hall"><table>
      <thead><tr><th>Manažer</th>${hlavicka}</tr></thead>
      <tbody>${telo}</tbody>
    </table></div>${pozn}`;
}

/* Přepnutí kola. Sestavy starších kol se stahují až teď — otevření
   hubu by jinak stálo dotaz za každé kolo sezóny krát počet členů. */
async function loadNewsGw(g){
  NEWS_GW = g;
  const host = $('hs-0');
  if(host) host.innerHTML = newsPanel();

  await nactiKolo(g);
  if(NEWS_GW === g && $('hs-0')) $('hs-0').innerHTML = newsPanel();
}

/* Sestavy a body jednoho kola. `live` je jeden dotaz na kolo, sestavy
   jeden na člena — proto se tohle nedělá při otevření hubu. */
async function nactiKolo(g){
  if(!NEWS_PICKS.has(g)){
    try{
      NEWS_PICKS.set(g, await pooled(HUB.members,
        m => cached('entry/' + m.entry + '/event/' + g + '/picks/'), 5));
    }catch(e){
      // Bez sestav prostě nebudou kapitánské ceny. Zbytek panelu
      // je na nich nezávislý, takže tohle není důvod nic hlásit.
      NEWS_PICKS.set(g, []);
    }
  }
  if(!NEWS_LIVE.has(g)){
    /* Rozlišujeme „ještě nenačteno“ (klíč v mapě není) od „nepovedlo se“
       (klíč je, hodnota null). Dřív se ukládalo null v obou případech,
       takže `has()` vrátilo true a panel schoval i hlášku, která měla
       říct, proč kapitánské ceny nejsou. */
    try{ NEWS_LIVE.set(g, await cached('event/' + g + '/live/')); }
    catch(e){ NEWS_LIVE.set(g, null); }
  }
}

/* Dotáhne sestavy všech dohraných kol, aby síň slávy měla i kapitány.
   Je to počet kol × počet členů dotazů, takže to jde jen na kliknutí. */
async function nactiCelouSezonu(btn){
  HALL_ALL = true;
  if(btn){ btn.disabled = true; btn.textContent = 'Načítám…'; }
  const kola = newsGws().filter(g => gwPhase(g) === 'final');
  for(const g of kola){
    await nactiKolo(g);
    if(btn) btn.textContent = `Načítám… ${kola.indexOf(g) + 1}/${kola.length}`;
  }
  if($('hs-0')) $('hs-0').innerHTML = newsPanel();
}

document.addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-newsgw]');
  if(btn) loadNewsGw(Number(btn.dataset.newsgw));
  const vse = ev.target.closest('button[data-hallall]');
  if(vse) nactiCelouSezonu(vse);
});

function renderHub(){
  // Sestavy aktuálního kola už HUB načetl — ať se nestahují znovu.
  if(!NEWS_PICKS.has(HUB.cur.id)) NEWS_PICKS.set(HUB.cur.id, HUB.picks);
  if(NEWS_GW === null) NEWS_GW = HUB.cur.id;

  /* Body hráčů aktuálního kola hub sám o sobě nepotřebuje — dotáhnou
     se na pozadí a panel se překreslí, až kapitánské ceny půjdou spočítat. */
  if(!NEWS_LIVE.has(HUB.cur.id)){
    nactiKolo(HUB.cur.id).then(() => {
      if(NEWS_GW === HUB.cur.id && $('hs-0')) $('hs-0').innerHTML = newsPanel();
    });
  }

  const SECS = [
    ['Novinky', newsPanel()],
    ['Žebříčky', buildBoards()],
    ['Zdraví kádrů', buildHealth()],
    ['Celá liga', buildCollective()],
  ];

  $('hubout').innerHTML = `
    <h2>${esc(CONFIG.leagueName || HUB.st.league.name)} · po ${HUB.cur.id}. kole${info(`${strengthsReady()
      ? 'Obtížnost počítám z útočné a obranné síly obou týmů, ne z pevného FDR, které '
        + 'FPL nastaví v srpnu a pak už nemění. Barvy jsou <b>relativní</b> — každé pásmo '
        + 'dostane zhruba pětinu zápasů.'
      : strengthsUsable()
      ? 'Útočná a obranná síla zatím v datech není, tak počítám z <b>celkové síly týmů</b> '
        + '(stupnice 1–5) — pořád to rozliší domácí zápas od venkovního, jen hruběji. '
        + 'Barvy jsou relativní, každé pásmo dostane zhruba pětinu zápasů.'
      : '<b>Zdroj obtížnosti: oficiální FDR od FPL.</b> Síly týmů, ze kterých počítám '
        + 'vlastní hodnocení, zatím v datech nejsou vyplněné — FPL je doplní po několika '
        + 'odehraných kolech a čísla se pak zjemní.'}
    <b>VELKÁ</b> písmena znamenají domácí zápas,
    <b>malá</b> venkovní. Dvě zkratky v jednom políčku je double, pomlčka blank.
    Tabulka je seřazená od nejpříznivějšího programu.`)}</h2>
    <div class="subnav" role="tablist">
      ${SECS.map((s, i) => `<button class="sub-btn" role="tab"
        aria-selected="${i === 0}" data-hs="${i}">${esc(s[0])}</button>`).join('')}
    </div>
    ${SECS.map((s, i) => `<div class="sec" id="hs-${i}"${i ? ' hidden' : ''}>${s[1]}</div>`).join('')}`;

  $('hubout').querySelectorAll('.sub-btn').forEach(b => {
    b.addEventListener('click', () => {
      $('hubout').querySelectorAll('.sub-btn').forEach(x =>
        x.setAttribute('aria-selected', x === b));
      SECS.forEach((_, i) => { $('hs-' + i).hidden = String(i) !== b.dataset.hs; });
    });
  });
}

$('hubgo').addEventListener('click', async () => {
  $('hubgo').disabled = true;
  dropCached(/^(leagues-classic|entry)\//);
  await loadHub();
  $('hubgo').disabled = false;
});


/* ============ PROGRAM: rozpis, ceny, čipy ============

   Čtyři pohledy na to, co teprve přijde. Všechny stojí na `fixtures/`
   a `bootstrap-static/`, takže je to zadarmo — data už máme.
*/

const PLAN_GWS = 6;

function planStartGw(){
  const nxt = BOOT.events.find(e => e.is_next);
  const cur = BOOT.events.find(e => e.is_current);
  return nxt ? nxt.id : (cur ? cur.id + 1 : 1);
}

/* --- 1. Ticker: mřížka klubů × kol, obarvená podle obtížnosti ---

   FDR z FPL je statické — nastaví se před sezónou a nemění se, i když
   tým mezitím spadne na dno. Počítáme proto vlastní z útočné a obranné
   síly obou týmů, které bootstrap poskytuje a nikdo je nepoužívá. */
/* Vrací null, dokud FPL síly týmů nedopočítá.

   Na začátku sezóny jsou `strength_attack_*` a `strength_defence_*` nuly.
   Poměr sil pak vyšel 0, vzorec spadl hluboko pod stupnici a `Math.max(1, …)`
   všechno srovnal na 1.0 — celá liga vypadala jako samé lehké zápasy.
   Tichý nesmysl, který vypadal jako platné číslo. */
function teamStrengths(t, home){
  const att = home ? t.strength_attack_home : t.strength_attack_away;
  const def = home ? t.strength_defence_home : t.strength_defence_away;
  const a = parseFloat(att), d = parseFloat(def);
  if(Number.isFinite(a) && Number.isFinite(d) && a > 0 && d > 0) return {att: a, def: d};

  // Záloha: strength_overall_* na stupnici 1–5. FPL je vyplňuje i v době,
  // kdy jsou strength_attack_* a strength_defence_* ještě nuly — což platí
  // celý začátek sezóny. Dřív se v tu chvíli zahodila i tahle čísla a appka
  // spadla na statické FDR, které nerozliší domácí zápas od venkovního.
  const o = parseFloat(home ? t.strength_overall_home : t.strength_overall_away);
  if(!Number.isFinite(o) || o <= 0) return null;

  // Převod na stejné měřítko jako strength_attack_* (kolem 1000–1400),
  // aby poměr sil v ownFdr() vycházel ve stejném řádu jako s ostrými daty.
  const scaled = 1000 + (o - 3) * 110;
  return {att: scaled, def: scaled, approx: true};
}

/* Máme ostrá čísla útoku a obrany, nebo jedeme na hrubší náhradě?
   Rozlišujeme to proto, že hláška pod rozpisem má říkat pravdu. */
function strengthsReady(){
  return BOOT.teams.every(t => {
    const h = teamStrengths(t, true), a = teamStrengths(t, false);
    return h && a && !h.approx && !a.approx;
  });
}

/* Dá se z toho vůbec počítat vlastní FDR? Stačí i hrubá záloha. */
function strengthsUsable(){
  return BOOT.teams.every(t => teamStrengths(t, true) && teamStrengths(t, false));
}

/* `fallback` je oficiální FDR z rozpisu. Použije se, dokud nejsou k dispozici
   síly týmů — statická trojka od FPL je pořád lepší než vymyšlená jednička. */
function ownFdr(teamId, oppId, home, fallback){
  const t = BOOT.teams.find(x => x.id === teamId);
  const o = BOOT.teams.find(x => x.id === oppId);
  const fb = Number.isFinite(fallback) ? fallback : 3;
  if(!t || !o) return fb;

  // Jak silný je soupeř proti nám: jeho obrana brzdí náš útok a naopak.
  const me = teamStrengths(t, home);
  const opp = teamStrengths(o, !home);
  if(!me || !opp) return fb;

  // Poměr sil kolem 1.0 = vyrovnaný zápas. Škálujeme na známou stupnici 1–5.
  const ratio = ((opp.def / me.att) + (opp.att / me.def)) / 2;
  const raw = 3 + (ratio - 1) * 7 + (home ? -0.35 : 0.35);
  if(!Number.isFinite(raw)) return fb;
  return Math.max(1, Math.min(5, raw));
}

/* Prahy pro obarvení se počítají z rozdělení, ne z pevných čísel.

   Pevné hranice (pod 2.2 zelená, nad 4.1 červená) fungovaly jen náhodou.
   Síly týmů v bootstrapu se u většiny klubů liší málo, takže se skoro
   všechny zápasy vešly do jednoho pásma a ticker byl celý stejně zelený.
   Barevné kódování, které nerozlišuje, je horší než žádné.

   Kvintily napříč všemi zápasy v zobrazeném okně zaručí, že každé pásmo
   dostane zhruba pětinu buněk — obtížnost je tím pádem vždy relativní
   k tomu, co se v daných kolech reálně hraje. */
let FDR_CUTS = null;

function computeFdrCuts(startGw, n){
  const all = [];
  for(const t of BOOT.teams)
    for(let gw = startGw; gw < startGw + n; gw++)
      for(const f of gwFixtures(t.id, gw))
        all.push(ownFdr(t.id, f.opp, f.home, f.d));

  const DEFAULT_CUTS = [1.5, 2.5, 3.5, 4.5];
  if(all.length < 10){ FDR_CUTS = DEFAULT_CUTS; return FDR_CUTS; }

  all.sort((a, b) => a - b);

  // Když se všechny hodnoty rovnají, kvintily nemají co rozdělit a celá
  // mřížka by vyšla jednobarevně. Radši pevná stupnice než falešné odstíny.
  if(all[all.length - 1] - all[0] < 0.4){ FDR_CUTS = DEFAULT_CUTS; return FDR_CUTS; }

  const q = p => all[Math.min(all.length - 1, Math.floor(all.length * p))];
  FDR_CUTS = [q(0.2), q(0.4), q(0.6), q(0.8)];
  return FDR_CUTS;
}

function fdrClass(d){
  const c = FDR_CUTS || [2.2, 2.8, 3.4, 4.1];
  if(d <= c[0]) return 'f1';
  if(d <= c[1]) return 'f2';
  if(d <= c[2]) return 'f3';
  if(d <= c[3]) return 'f4';
  return 'f5';
}

function buildTicker(){
  const start = planStartGw();
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  computeFdrCuts(start, PLAN_GWS);

  const rows = BOOT.teams.map(t => {
    const cells = [];
    let sum = 0, count = 0;

    for(let gw = start; gw < start + PLAN_GWS; gw++){
      const fx = gwFixtures(t.id, gw);

      if(!fx.length){
        cells.push('<td class="fx blank"><span>–</span></td>');
        sum += 5; count++;     // blank je pro plánování to nejhorší
        continue;
      }

      const inner = fx.map(f => {
        const d = ownFdr(t.id, f.opp, f.home, f.d);
        sum += d; count++;
        const opp = teams[f.opp].short_name;
        return `<span class="${fdrClass(d)}">${esc(f.home ? opp.toUpperCase() : opp.toLowerCase())}</span>`;
      }).join('');

      cells.push(`<td class="fx${fx.length > 1 ? ' dbl' : ''}">${inner}</td>`);
    }

    return {t, cells, avg: count ? sum / count : 5};
  });

  rows.sort((a, b) => a.avg - b.avg);

  const head = Array.from({length: PLAN_GWS}, (_, i) => `<th>${start + i}</th>`).join('');
  const body = rows.map(r =>
    `<tr><td class="tn">${esc(r.t.name)}</td>${r.cells.join('')}<td class="num">${r.avg.toFixed(2)}</td></tr>`
  ).join('');

  return `<table class="ticker">
      <thead><tr><th>Klub</th>${head}<th>Ø</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    `;
}

/* --- 2. Blanky a doubly --- */
function buildShape(){
  const start = planStartGw();
  const shape = gwShape(start, PLAN_GWS).filter(x => x.blanks.length || x.doubles.length);

  if(!shape.length)
    return `<p class="note">Následujících ${PLAN_GWS} kol je bez blanků a doublů —
      každý klub hraje přesně jednou.</p>`;

  const mine = MY_SQUAD;

  const cards = shape.map(x => {
    const affected = list => {
      const names = list.map(t => esc(t.short_name)).join(', ');
      if(!mine) return names;
      const hit = list.filter(t => BOOT.elements.some(p => p.team === t.id && mine.has(p.id)));
      return names + (hit.length
        ? ` <b>· týká se tvých: ${hit.map(t => esc(t.short_name)).join(', ')}</b>`
        : '');
    };

    return `<div class="shape">
      <h3>GW${x.gw}</h3>
      ${x.blanks.length ? `<p class="bl"><b>Blank</b> ${affected(x.blanks)}</p>` : ''}
      ${x.doubles.length ? `<p class="db"><b>Double</b> ${affected(x.doubles)}</p>` : ''}
    </div>`;
  }).join('');

  return cards + ``;
}

/* --- 3. Predikce změn cen ---

   FPL nezveřejňuje algoritmus, ale směr je spolehlivý: rozhoduje čistý
   příliv převodů vážený tím, kolik lidí hráče drží. Přesný práh neznáme,
   tak ukazujeme pořadí tlaku, ne jistotu. */
/* Oficiální predikce zdražení a zlevnění.

   Dřív se směr odhadoval z čistého přílivu transferů dělených vlastnictvím.
   Byla to rozumná aproximace, ale FPL to dneska počítá samo a posílá to
   v bootstrapu:

     price_change_percent        naplněnost ukazatele v procentech
     price_change_hourly_rate    jak rychle se plní právě teď
     price_change_projections    [{offset, projected_percent, likelihood}]
                                 offset 0/1/2 = dnes / zítra / pozítří,
                                 likelihood −5…+5 = jistota pohybu
     price_change_locked_until   hráč se do daného času hýbat nemůže

   Bereme oficiální číslo, když existuje — stejně jako u ep_next. */
function priceMoves(){
  const projFor = (p, offset) =>
    (p.price_change_projections || []).find(x => x.offset === offset) || null;

  const scored = BOOT.elements.map(p => {
    const now = parseFloat(p.price_change_percent);
    const today = projFor(p, 0);
    const in3 = projFor(p, 2);
    if(!Number.isFinite(now) || !today) return null;

    return {
      p,
      pct: now,
      rate: p.price_change_hourly_rate || 0,
      likeToday: today.likelihood || 0,
      like3: in3 ? (in3.likelihood || 0) : (today.likelihood || 0),
      pct3: in3 ? parseFloat(in3.projected_percent) : now,
      locked: p.price_change_locked_until || null,
    };
  }).filter(Boolean);

  const up = scored.filter(x => x.likeToday > 0 || x.like3 > 0)
    .sort((a, b) => (b.likeToday - a.likeToday) || (b.pct - a.pct)).slice(0, 10);
  const down = scored.filter(x => x.likeToday < 0 || x.like3 < 0)
    .sort((a, b) => (a.likeToday - b.likeToday) || (a.pct - b.pct)).slice(0, 10);

  return {up, down, ok: scored.length > 0};
}

/* Jistota pohybu ceny.

   FPL posílá likelihood v rozsahu −5…+5. Dřív se kreslila jako řada
   teček, což byl problém hned dvakrát: pět teček vedle čtyř nikdo na
   první pohled nerozezná a nikde nebylo řečeno, co ta čísla znamenají.
   Slovo přečteš i koutkem oka.

   Procenta by tady lhala — likelihood není pravděpodobnost, je to
   pořadí tlaku na stupnici, kterou FPL nezveřejňuje. Převádíme ho
   proto na slova, ne na „80 %“. Naplněnost v procentech vedle už
   v tabulce je a ta procenta jsou skutečná. */
const LIKE_WORDS = {5: 'jisté', 4: 'skoro jisté', 3: 'pravděpodobné',
                    2: 'možné', 1: 'nejisté'};

function likeChip(v, kind){
  const n = Math.min(5, Math.abs(v || 0));
  if(!n) return '<span class="lk none">–</span>';
  const dir = v > 0 ? 'up' : 'down';
  const sipka = v > 0 ? '▲' : '▼';
  const slovo = LIKE_WORDS[n];
  return `<span class="lk ${dir} l${n}" title="${
    (v > 0 ? 'Zdražení' : 'Zlevnění')} ${kind || ''} — jistota ${n} z 5 podle FPL"
    ><i aria-hidden="true">${sipka}</i>${esc(slovo)}</span>`;
}

/* Ukazatel naplněnosti. 100 % = pohyb dnes v noci. */
function priceMeter(pct, dir){
  const w = Math.max(3, Math.min(100, Math.abs(pct)));
  return `<span class="meter ${dir}" role="img"
    aria-label="naplněno ${Math.round(Math.abs(pct))} procent"><i style="width:${w}%"></i></span>`;
}

function buildPrices(){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const mv = priceMoves();

  // Prázdný stav není vysvětlivka — patří na stránku, ne pod „i“.
  if(!mv.ok) return `<h3>Pohyby cen</h3>
    <p class="note">FPL zatím predikce cen neposílá — pole
    <code>price_change_projections</code> je v datech prázdné. Objeví se
    obvykle po prvním kole.</p>`;

  const dl = (BOOT.game_config && BOOT.game_config.settings
              && BOOT.game_config.settings.price_change_deadlines) || [];
  const nextDl = dl.map(d => new Date(d)).filter(d => d > new Date()).sort((a, b) => a - b)[0];

  const row = (x, dir) => {
    const mine = MY_SQUAD && MY_SQUAD.has(x.p.id);
    const lock = x.locked && new Date(x.locked) > new Date();
    return `<tr${mine ? ' class="me"' : ''}>
      <td>${watchStar(x.p.id)}</td>
      <td>${esc(x.p.web_name)}<span class="sub">${esc(teams[x.p.team].short_name)}</span></td>
      <td class="n">${(x.p.now_cost / 10).toFixed(1)}m</td>
      <td>${priceMeter(x.pct, dir)}<span class="sub">${x.pct.toFixed(0)} %${
        lock ? ' · zamčeno' : ''}</span></td>
      <td>${likeChip(x.likeToday, 'dnes v noci')}</td>
      <td class="hide-s">${likeChip(x.like3, 'do tří dnů')}</td>
    </tr>`;
  };

  const tbl = (rows, dir, title, note) => `
    <h3>${title}</h3>
    ${rows.length
      ? `<table><thead><tr><th></th><th>Hráč</th><th class="n">Cena</th><th>Ukazatel</th>
         <th>Dnes v noci</th><th class="hide-s">Do 3 dnů</th></tr></thead>
         <tbody>${rows.map(x => row(x, dir)).join('')}</tbody></table>`
      : '<p class="note">Nic výrazného.</p>'}
    <p class="note">${note}</p>`;

  return tbl(mv.up, 'up', 'Nejblíž ke zdražení',
      'Když ho chceš, kup ho dřív — po zdražení zaplatíš o 0,1m víc a při prodeji '
      + 'dostaneš zpátky jen půlku zisku.')
    + tbl(mv.down, 'down', 'Nejblíž ke zlevnění',
      'Zlevnění ti sebere z hodnoty týmu. Pokud ho stejně plánuješ pustit, udělej to teď.')
    + `<p class="note">Sloupec <b>Dnes v noci</b> je jistota pohybu podle FPL
       (pětistupňová škála, „jisté“ je nejvyšší), ukazatel vedle je skutečná
       naplněnost cenového měřidla v procentech. Zvýrazněné řádky jsou hráči z tvé sestavy.${
       nextDl ? ' Nejbližší změna cen: <b>' + nextDl.toLocaleString('cs-CZ',
         {weekday: 'short', hour: '2-digit', minute: '2-digit'}) + '</b>.' : ''}</p>`;
}


async function loadPlan(){
  $('plmsg').textContent = 'Načítám rozpis…';
  try{
    if(!BOOT){ [BOOT, FIX] = await Promise.all([api('bootstrap-static/'), api('fixtures/')]); }
    startCountdown();

    const start = planStartGw();
    // Ceny mají od téhle verze vlastní záložku — v Programu se v nich
    // nedalo vyznat. Doporučení čipů odešlo úplně: potřebovalo načtený
    // kádr z jiné záložky a když ho nemělo, ukazovalo jen výzvu.
    const SECTIONS = [
      ['Rozpis', buildTicker()],
      ['Blanky a doubly', buildShape()],
    ];

    $('plout').innerHTML = `
      <h2>GW${start}–${start + PLAN_GWS - 1}</h2>
      <div class="subnav" role="tablist">
        ${SECTIONS.map((x, i) =>
          `<button class="sub-btn" role="tab" aria-selected="${i === 0}" data-sec="${i}">${esc(x[0])}</button>`
        ).join('')}
      </div>
      ${SECTIONS.map((x, i) =>
        `<div class="sec" id="pl-${i}"${i ? ' hidden' : ''}>${x[1]}</div>`
      ).join('')}`;

    $('plout').querySelectorAll('.sub-btn').forEach(b => {
      b.addEventListener('click', () => {
        $('plout').querySelectorAll('.sub-btn').forEach(x =>
          x.setAttribute('aria-selected', x === b));
        SECTIONS.forEach((_, i) => { $('pl-' + i).hidden = String(i) !== b.dataset.sec; });
      });
    });

    $('plmsg').textContent = '';
  }catch(e){
    $('plmsg').innerHTML = errBox(e.message, 't-plan');
  }
}



/* ============================================================
   HISTORIE MINILIGY

   Důležité omezení, které stojí za to znát dopředu: FPL **neposílá
   pořadí miniligy za minulé sezóny**. Endpoint standings vrací vždy
   jen tu rozehranou. Co dostat jde, je `past` z entry/{id}/history/ —
   celkové body a celkové pořadí každého manažera za předchozí sezóny.

   Tabulka níž je proto sestavená z celkových bodů členů, kteří jsou
   v lize **dneska**. Není to archiv toho, jak liga tehdy dopadla:
     · kdo mezitím odešel, tu není,
     · kdo se přidal loni, má starší sezóny prázdné,
     · pořadí je přepočítané mezi současnými členy, ne historické.
   Appka to říká i uživateli — tichý nepřesný archiv by byl horší
   než žádný.
   ============================================================ */

const HIST_SEASONS = 6;

/* Poskládá matici sezóna × manažer z `past` jednotlivých členů. */
/* Kdo v dané sezóně za ligu oficiálně nastoupil.

   FPL zná jen celkové body každého manažera — netuší, že se liga
   rozrůstala postupně. Bez tohohle by medaile za ročníky, kdy hráli
   tři lidi, dostávali i ti, kdo tehdy hráli sami za sebe jinde.

   Sezóna, která v CONFIG.officialSeasons není, se počítá pro všechny. */
function matchesMember(key, m){
  return String(key) === String(m.entry) || normName(key) === normName(m.player_name);
}

function officialIn(season, m){
  // Přišel do ligy až později? Starší sezóny se nepočítají.
  // Řetězce „2023/24“ jdou porovnávat přímo — abecední pořadí je tu i to časové.
  const since = Object.entries(CONFIG.memberSince || {})
    .find(([k]) => matchesMember(k, m));
  if(since && season < since[1]) return false;

  // Sezóna s pevně danou soupiskou.
  const list = (CONFIG.officialSeasons || {})[season];
  if(!list) return true;
  return list.some(x => matchesMember(x, m));
}

/* Matice sezóna × manažer plus medaile.

   Medaile se rozdávají jen mezi těmi, kdo v dané sezóně opravdu hráli —
   kdo tehdy nebyl v lize, do pořadí nevstupuje ani nedostane poslední
   místo. */
function buildLeagueHistory(members, pasts){
  const seasons = new Set();
  const rows = [];

  members.forEach((m, i) => {
    const past = (pasts[i] && pasts[i].past) || [];
    const by = {};
    past.forEach(x => {
      if(!x || !x.season_name) return;
      seasons.add(x.season_name);
      by[x.season_name] = {pts: x.total_points, rank: x.rank};
    });
    rows.push({m, by, medals: {1: 0, 2: 0, 3: 0}, played: 0});
  });

  const cols = [...seasons].sort().slice(-HIST_SEASONS);

  const order = {};
  cols.forEach(c => {
    const hrali = rows
      .filter(r => r.by[c] && officialIn(c, r.m))
      .sort((a, b) => b.by[c].pts - a.by[c].pts);

    order[c] = new Map(hrali.map((r, i) => [r.m.entry, i + 1]));
    hrali.forEach((r, i) => { if(i < 3) r.medals[i + 1]++; });
  });

  rows.forEach(r => { r.played = cols.filter(c => r.by[c]).length; });
  return {cols, rows, order};
}

const MEDAL = {1: '🥇', 2: '🥈', 3: '🥉'};

/* Žebříček trofejí. Řadí se zlatem, pak stříbrem, pak bronzem —
   jedno první místo je víc než tři druhá. */
function trophyTable(rows){
  const score = r => r.medals[1] * 10000 + r.medals[2] * 100 + r.medals[3];
  const winners = rows.filter(r => score(r) > 0).sort((a, b) => score(b) - score(a));
  if(!winners.length) return '';

  return `<ol class="trophies">${winners.map((r, i) => `
    <li${r.m.entry === HIST_ME ? ' class="me"' : ''}>
      <span class="pos">${i + 1}</span>
      <span class="nm"><b>${esc(r.m.player_name)}</b></span>
      <span class="mdl">${[1, 2, 3].map(k => r.medals[k]
        ? `<span title="${k}. místo">${MEDAL[k]}<u>${r.medals[k]}</u></span>` : ''
      ).join('')}</span>
    </li>`).join('')}</ol>`;
}

let HIST_ME = null;

function renderLeagueHistory(members, pasts, myId){
  HIST_ME = myId;
  const {cols, rows, order} = buildLeagueHistory(members, pasts);

  if(!cols.length)
    return `<p class="note">Nikdo z členů ligy nemá v FPL zaznamenanou
      předchozí sezónu.</p>`;

  const sorted = rows.slice().sort((a, b) =>
    (b.medals[1] - a.medals[1]) || (b.played - a.played) ||
    cols.reduce((x, c) => x + (b.by[c] ? b.by[c].pts : 0), 0) -
    cols.reduce((x, c) => x + (a.by[c] ? a.by[c].pts : 0), 0));

  /* Buňka nese jen body a medaili. Pořadí a celkový rank šly do title —
     dřív pod každým číslem stály dva řádky drobného textu a tabulka se
     kvůli tomu nedala přečíst napříč. */
  const cell = (r, c) => {
    const v = r.by[c];
    if(!v) return '<td class="n empty">·</td>';
    const pos = order[c].get(r.m.entry);
    const host = !pos;   // hrál FPL, ale ne za tuhle ligu
    const tip = `${v.pts} bodů · ${host ? 'mimo ligu'
      : pos + '. v lize'}${v.rank ? ' · ' + v.rank.toLocaleString('cs-CZ') + '. celkově' : ''}`;
    return `<td class="n${host ? ' guest' : ''}" title="${esc(tip)}">
      ${pos && pos <= 3 ? `<i class="m">${MEDAL[pos]}</i>` : ''}${v.pts}</td>`;
  };

  const off = Object.keys(CONFIG.officialSeasons || {});
  const late = Object.entries(CONFIG.memberSince || {});

  return `${trophyTable(rows)}
    <table class="hist">
      <thead><tr><th>Manažer</th>${cols.map(c =>
        `<th class="n">${esc(c.replace('20', ''))}</th>`).join('')}</tr></thead>
      <tbody>${sorted.map(r => `<tr${r.m.entry === myId ? ' class="me"' : ''}>
        <td><b>${esc(r.m.player_name)}</b></td>
        ${cols.map(c => cell(r, c)).join('')}
      </tr>`).join('')}</tbody>
    </table>
    <p class="note">Čísla jsou celkové body za sezónu; najetím myší uvidíš
      pořadí. Medaile se počítají jen mezi těmi, kdo v dané sezóně za ligu
      nastoupili${off.length
        ? ` — v ročnících ${esc(off.join(', '))} to byli jen ${
            esc((CONFIG.officialSeasons[off[0]] || []).join(', '))}`
        : ''}${late.length
        ? `. Později se přidali ${esc(late.map(([k, v]) => k + ' (' + v + ')').join(', '))}`
        : ''}. Šedé číslo znamená, že člověk tu sezónu hrál FPL, ale mimo
      tuhle ligu. Tečka, že nehrál vůbec.</p>
    <p class="note">FPL neposílá pořadí miniligy za minulé sezóny, jen celkové
      body každého manažera — tabulka je proto dopočtená z lidí, kteří jsou
      v lize dneska.</p>`;
}

async function loadLeagueHistory(members, myId){
  const box = $('histbox');
  if(!box) return;
  box.innerHTML = '<div class="skel"><i></i><i></i><i></i><i></i></div>';

  try{
    // Jeden dotaz na člena. U velkých lig by to bylo moc, tak bereme
    // prvních padesát — víc se stejně do tabulky rozumně nevejde.
    const subset = members.slice(0, 50);
    const pasts = await pooled(subset,
      m => cached('entry/' + m.entry + '/history/'), 5,
      (done, total) => {
        box.innerHTML = `<p class="note">Načítám historii… ${done}/${total}</p>`;
      });

    const ok = pasts.filter(Boolean).length;
    if(!ok){ box.innerHTML = '<p class="note">Historii se nepodařilo načíst.</p>'; return; }

    box.innerHTML = (ok < subset.length
        ? `<p class="note">U ${subset.length - ok} členů se historie nenačetla,
           v tabulce chybí.</p>`
        : '')
      + renderLeagueHistory(subset, pasts, myId);
  }catch(e){
    box.innerHTML = `<p class="note">Historii se nepodařilo načíst: ${esc(e.message)}</p>`;
  }
}

/* ============================================================
   DIFERENCIÁLY

   Diferenciál je hráč, kterého skoro nikdo nemá a přitom nosí body.
   Obojí musí platit zároveň — nízké vlastnictví samo o sobě není
   přednost, většina nevlastněných hráčů je nevlastněná právem.

   Skóre proto stavíme na dvou složkách:

     výnos    = projekce mého modelu na příštích 5 kol (počítá rozpis,
                minutovou jistotu, defenzivní příspěvky i doubly)
     páka     = jak moc se ti to promítne do pořadí

   Páka není lineární. Rozdíl mezi 2 % a 12 % vlastnictví je pro tvůj
   posun v lize mnohem větší než mezi 40 % a 50 %, protože v druhém
   případě se s tebou hýbe skoro celé pole. Používáme proto
   1 / sqrt(vlastnictví), useknuté zdola, ať extrémně neznámí hráči
   s jednou dobrou statistikou neutečou nahoru.

   Nejde o „kup tohohle“. Je to seznam, kde se dívat.
   ============================================================ */

const DIFF_GWS = 5;

/* Postupně volnější stropy vlastnictví.

   Původně to byl jeden pevný strop 12 % a tvrdý filtr na minuty. Když se
   do něj nikdo nevešel, appka napsala „nikdo neprošel filtrem“ a skončila —
   což je ta nejméně užitečná odpověď, jakou mohla dát. Na začátku sezóny,
   kdy má většina hráčů pár odehraných minut, se to stávalo skoro vždycky.

   Teď se strop uvolňuje, dokud se nenajde aspoň pět jmen, a appka řekne,
   o kolik musela slevit. Prázdný seznam je horší než seznam s výhradou. */
const DIFF_TIERS = [
  {max: 6,   label: 'pod 6 % vlastnictví'},
  {max: 12,  label: 'pod 12 % vlastnictví'},
  {max: 20,  label: 'pod 20 % vlastnictví'},
  {max: 35,  label: 'pod 35 % vlastnictví'},
  {max: 101, label: 'bez omezení vlastnictví'},
];

/* Jistota minut jako číslo 0–1, ne ano/ne.

   Tvrdá podmínka na odehrané minuty nefunguje první měsíc sezóny: kdo
   odehrál dvě kola, má jich málo ze své podstaty, ne proto, že by nehrál.
   Bereme proto starty vůči odehraným kolům, a když ještě žádné nejsou,
   opřeme se o cenu — drahý hráč nesedí na lavičce. */
function minuteConfidence(p, gwPlayed){
  if(p.status === 'u' || p.status === 'n') return 0;      // odešel, nehraje
  if(p.status === 'i' || p.status === 's') return 0;      // zraněný, stopka

  const chance = p.chance_of_playing_next_round;
  const chanceMul = chance === null || chance === undefined ? 1 : chance / 100;
  if(chanceMul < 0.5) return 0;

  if(gwPlayed < 1){
    // Sezóna nezačala: minuty ani starty nic neříkají. Cena je hrubý,
    // ale jediný signál, který v tu chvíli existuje.
    return chanceMul * Math.max(0, Math.min(1, (p.now_cost / 10 - 3.8) / 2.5));
  }

  const startRate = (p.starts || 0) / gwPlayed;
  const minRate = p.minutes / (gwPlayed * 90);

  // Starty váží víc než minuty: kdo nastupuje a je střídán, je pořád jistota.
  const base = Math.min(1, startRate * 0.65 + minRate * 0.55);
  return chanceMul * base;
}

/* Zpětně kompatibilní tvrdá varianta. */
function minutesSecure(p, gwPlayed){
  return minuteConfidence(p, gwPlayed) >= 0.6;
}

function diffScore(p, startGw, ownPct, conf){
  const xp = projectRange(p, startGw, DIFF_GWS);
  const own = Math.max(1.5, ownPct);        // páka useknutá zdola
  const c = conf === undefined ? 1 : conf;
  return {xp, conf: c, leverage: 1 / Math.sqrt(own), score: (xp / Math.sqrt(own)) * c};
}

/* Vybere pět jmen a řekne, jak volný strop na to potřebovala.
   `ownOf` vrací vlastnictví v procentech — globální, nebo v rámci ligy. */
function diffRows(pool, startGw, ownOf, gwPlayed, tiers){
  const scored = pool
    .map(p => {
      const conf = minuteConfidence(p, gwPlayed === undefined ? 0 : gwPlayed);
      return {p, own: ownOf(p), ...diffScore(p, startGw, ownOf(p), conf)};
    })
    .filter(x => x.conf > 0 && x.xp > 0);

  const list = tiers || DIFF_TIERS;
  const last = list[list.length - 1];
  let rows = [];
  let used = last;

  for(const tier of list){
    const fit = scored.filter(x => x.own <= tier.max)
      .sort((a, b) => b.score - a.score);

    if(fit.length >= 5 || tier === last){
      rows = fit.slice(0, 5);
      used = tier;
      break;
    }
    // Neúplný výsledek si schováme, kdyby žádný strop nestačil.
    if(fit.length > rows.length){ rows = fit.slice(0, 5); used = tier; }
  }

  return {rows, tier: used};
}

function confLabel(c){
  return c >= 0.85 ? '<span class="ok-t">jistá</span>'
       : c >= 0.6  ? 'slušná'
       : c >= 0.35 ? '<span class="warn-t">kolísá</span>'
       : '<span class="bad-t">riziko</span>';
}

function diffTable(res, ownLabel){
  const rows = res.rows || res;
  if(!rows.length)
    return `<p class="note">V datech zatím není nikdo s nenulovou projekcí —
      to se stává jen před prvním kolem sezóny.</p>`;

  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  return `<table><thead><tr>
      <th>Hráč</th><th class="n">Cena</th><th class="n">${esc(ownLabel)}</th>
      <th class="n">Projekce ${DIFF_GWS} kol</th><th class="n">xGI/90</th>
      <th class="n">Minuty</th></tr></thead>
    <tbody>${rows.map(r => {
      const mine = MY_SQUAD && MY_SQUAD.has(r.p.id);
      const xgi = stat(r.p, 'expected_goal_involvements_per_90');
      return `<tr${mine ? ' class="me"' : ''}>
        <td><span class="who">${crest(r.p.team, 'sm')}<b>${esc(r.p.web_name)}</b>
          <em class="sub">${esc(teams[r.p.team].short_name)}</em>
          ${mine ? '<span class="badge dif">máš</span>' : ''}</span></td>
        <td class="n">${(r.p.now_cost / 10).toFixed(1)}m</td>
        <td class="n">${r.own.toFixed(1)} %</td>
        <td class="n"><b>${r.xp.toFixed(1)}</b></td>
        <td class="n">${xgi === null ? '–' : xgi.toFixed(2)}</td>
        <td class="n">${confLabel(r.conf)}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function buildDifferentials(){
  const startGw = planStartGw();
  const gwPlayed = BOOT.events.filter(e => e.finished).length;

  // --- globální ---
  const g = diffRows(BOOT.elements, startGw,
    p => parseFloat(p.selected_by_percent) || 0, gwPlayed);

  let out = `<h3>Top 5 diferenciálů · celé FPL${info(`Hráči ${esc(g.tier.label)} s nejvyšší projekcí na příštích
      ${DIFF_GWS} kol.${g.tier.max > 12
        ? ' <b>Strop jsem musel povolit</b> — pod dvanácti procenty se pět jmen'
          + ' s rozumnou projekcí nenašlo.'
        : ''}`)}</h3>
    
    ${diffTable(g, 'Vlastní')}`;

  // --- v rámci miniligy ---
  out += '<h3>Top 5 diferenciálů · tvoje miniliga</h3>';

  if(!LEAGUE_OWN){
    out += `<p class="note">Sestavy soupeřů se zatím nenačetly, takže nevím,
      koho v lize kdo vlastní. Zkus <b>Načíst data znovu</b> v hlavičce.</p>`;
  }else{
    const {owners, n} = LEAGUE_OWN;
    const ownPct = p => ((owners[p.id] || []).length / n) * 100;

    /* V lize se strop měří v lidech, ne v procentech: nejdřív koho nemá
       nikdo, pak koho má jeden, pak dva. Procenta by u desetičlenné ligy
       skákala po deseti a stropy by neodpovídaly ničemu srozumitelnému. */
    const tiers = [0, 1, 2, 3].map(k => ({
      max: (k / n) * 100 + 0.01,
      label: k === 0 ? 'které nemá nikdo v lize'
           : k === 1 ? 'které má nejvýš jeden soupeř'
           : `které mají nejvýš ${k} lidi v lize`,
    }));
    tiers.push({max: 101, label: 'bez ohledu na vlastnictví v lize'});

    const l = diffRows(BOOT.elements, startGw, ownPct, gwPlayed, tiers);

    /* Druhá pětice: pod polovinou ligy.

       Ostré diferenciály (nikdo / jeden soupeř) jsou často hráči, které
       nikdo nemá z dobrého důvodu. Pod polovinou ligy je mírnější kategorie:
       pořád na nich proti půlce soupeřů získáváš, ale výběr je širší
       a jména známější. Jedno bez druhého dává zkreslený obrázek. */
    const half = [{max: 50 - 0.01, label: 'které má míň než polovina ligy'}];
    const h = diffRows(BOOT.elements, startGw, ownPct, gwPlayed, half);

    out += `<div class="subnav" role="tablist">
        <button class="sub-btn" role="tab" aria-selected="true" data-diff="0">Ostré</button>
        <button class="sub-btn" role="tab" aria-selected="false" data-diff="1">Pod polovinou ligy</button>
      </div>
      <div class="sec" id="diff-0">
        <p class="note">Hráči, ${esc(l.tier.label)} (${n} manažerů).
          Tady se pořadí láme nejvíc — na hráči, kterého má celá liga, proti ní
          nezískáš nic, i kdyby dal hattrick.</p>
        ${diffTable(l, 'V lize')}
      </div>
      <div class="sec" id="diff-1" hidden>
        <p class="note">Hráči, které má míň než polovina ligy. Mírnější
          kategorie — proti půlce soupeřů pořád získáváš, ale výběr je širší
          a rizika menší než u těch, které nemá nikdo.</p>
        ${diffTable(h, 'V lize')}
      </div>`;
  }

  out += `<p class="note">Řadím podle projekce dělené odmocninou vlastnictví
    a násobené jistotou minut. Odmocnina proto, že rozdíl mezi 2 % a 12 %
    znamená pro tvůj posun mnohem víc než mezi 40 % a 50 % — tam se s tebou
    hýbe skoro celé pole. Sloupec „Minuty“ říká, jak jistý je nástup:
    hráč s vysokou projekcí, který kolísá, je sázka, ne plán.
    Není to pokyn ke koupi, je to seznam, kde se dívat.</p>`;

  return out;
}

/* Přepínač mezi ostrými a mírnějšími ligovými diferenciály.
   Delegovaně, protože blok se překresluje s celou záložkou Transfery. */
document.addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-diff]');
  if(!btn) return;
  const host = btn.closest('.diffs') || document;
  host.querySelectorAll('button[data-diff]').forEach(b =>
    b.setAttribute('aria-selected', String(b === btn)));
  host.querySelectorAll('[id^="diff-"]').forEach(sec => {
    sec.hidden = sec.id !== 'diff-' + btn.dataset.diff;
  });
});

/* ============================================================
   ZÁLOŽKA CENY

   Dřív to byla jedna ze čtyř sekcí v Programu a zapadalo to.
   Cena je přitom jediná věc v FPL, která se mění každou noc a na
   kterou se dá reagovat jen dopředu — zaslouží si vlastní místo.

   Tři pohledy:
     · kdo dnes v noci zdraží nebo zlevní (oficiální projekce),
     · komu se cena pohnula za poslední kolo (cost_change_event),
     · největší pohyb od začátku sezóny (cost_change_start).
   ============================================================ */

/* ------------------------------------------------------------
   WATCHLIST

   Sledovaní hráči jsou ti, které ještě nemám, ale chci vědět, kdy
   se jim pohne cena. Bez toho se na ně člověk musí každý den ptát
   ručně — a zdražení se pozná až podle toho, že už je pozdě.

   Držíme jen pole ID v localStorage pod klíčem s entry ID, takže
   po přepnutí týmu má každý svůj seznam. Žádný server, žádný účet.
   ------------------------------------------------------------ */
const WATCH_KEY = () => 'fpl_watch:' + (ENTRY_ID || '0');
let WATCH = null;

function loadWatch(){
  if(WATCH) return WATCH;
  try{
    const raw = JSON.parse(localStorage.getItem(WATCH_KEY()) || '[]');
    WATCH = new Set(Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : []);
  }catch(e){ WATCH = new Set(); }
  return WATCH;
}

function saveWatch(){
  lsSet(WATCH_KEY(), JSON.stringify([...loadWatch()]));
}

function isWatched(id){ return loadWatch().has(Number(id)); }

function toggleWatch(id){
  const w = loadWatch();
  id = Number(id);
  if(w.has(id)) w.delete(id); else w.add(id);
  saveWatch();
  return w.has(id);
}

/* Hvězdička k libovolnému hráči. Obsluha je delegovaná, takže přežije
   překreslení tabulky. */
function watchStar(id){
  const on = isWatched(id);
  return `<button type="button" class="star${on ? ' on' : ''}" data-watch="${id}"
    aria-pressed="${on}" title="${on ? 'Odebrat ze sledovaných' : 'Sledovat hráče'}"
    aria-label="${on ? 'Odebrat ze sledovaných' : 'Sledovat hráče'}">${on ? '★' : '☆'}</button>`;
}

/* Stav sledovaného hráče v jedné větě — to samé, co potřebuje homepage. */
function watchRows(){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const projFor = (p, offset) =>
    (p.price_change_projections || []).find(x => x.offset === offset) || null;

  return [...loadWatch()]
    .map(id => BOOT.elements.find(p => p.id === id))
    .filter(Boolean)
    .map(p => {
      const today = projFor(p, 0);
      const pct = parseFloat(p.price_change_percent);
      const like = today ? (today.likelihood || 0) : 0;
      return {p, team: teams[p.team], like,
              pct: Number.isFinite(pct) ? pct : 0,
              chance: p.chance_of_playing_next_round};
    })
    .sort((a, b) => Math.abs(b.like) - Math.abs(a.like)
                 || Math.abs(b.pct) - Math.abs(a.pct));
}

function buildWatch(){
  const rows = watchRows();

  /* Přidávat jde ze seznamu všech hráčů seřazených podle bodů — stejný
     vzor jako u porovnání dvou hráčů, jen bez druhého selectu. */
  const opts = BOOT.elements
    .slice()
    .sort((a, b) => b.total_points - a.total_points)
    .map(p => `<option value="${p.id}">${POS[p.element_type]} · ${esc(p.web_name)} · ${
      esc(BOOT.teams.find(t => t.id === p.team).short_name)} · ${
      (p.now_cost / 10).toFixed(1)}m</option>`).join('');

  const adder = `<div class="watchadd">
    <label>Přidat hráče
      <input type="search" id="wq" placeholder="Hledej podle jména…" autocomplete="off"
             role="combobox" aria-expanded="false" aria-controls="wsug"
             aria-autocomplete="list">
      <div class="wsug" id="wsug" role="listbox" hidden></div>
    </label>
    <label>Nebo vyber ze seznamu
      <select id="wsel"><option value="">Vyber hráče…</option>${opts}</select>
    </label>
  </div>`;

  if(!rows.length) return `<h3>Watchlist</h3>${adder}
    <p class="note">Zatím nikoho nesleduješ. Přidej hráče výš, nebo klikni na
    hvězdičku u kohokoli v tabulkách pohybů cen — pak se ti tady i na úvodní
    stránce ukáže, jak blízko je jeho cena ke změně.</p>
    ${storageNote('Watchlist')}`;

  const dirClass = l => l > 0 ? 'up' : l < 0 ? 'down' : '';
  const stateText = r => {
    if(r.p.status === 'i') return ['al', 'zraněný'];
    if(r.p.status === 's') return ['al', 'suspendovaný'];
    if(r.p.status === 'u' || r.p.status === 'n') return ['al', 'nedostupný'];
    if(r.chance !== null && r.chance < 100) return ['wn', r.chance + ' %'];
    return ['ok', 'v pořádku'];
  };

  return `<h3>Watchlist${info(`Hráči, které sleduješ. Ukazatel je naplněnost
    cenového měřidla podle FPL, sloupec „Dnes v noci“ říká, jak jistý je
    pohyb ceny při nejbližší změně.`)}</h3>
    ${adder}
    <table><thead><tr><th></th><th>Hráč</th><th class="n">Cena</th>
      <th>Ukazatel</th><th>Dnes v noci</th><th class="hide-s">Stav</th></tr></thead>
    <tbody>${rows.map(r => {
      const [cls, txt] = stateText(r);
      return `<tr${MY_SQUAD && MY_SQUAD.has(r.p.id) ? ' class="me"' : ''}>
        <td>${watchStar(r.p.id)}</td>
        <td>${esc(r.p.web_name)}<span class="sub">${esc(r.team.short_name)}</span></td>
        <td class="n">${(r.p.now_cost / 10).toFixed(1)}m</td>
        <td>${priceMeter(r.pct, dirClass(r.like) || 'up')}<span class="sub">${
          r.pct.toFixed(0)} %</span></td>
        <td>${likeChip(r.like, 'dnes v noci')}</td>
        <td class="hide-s ${cls}">${txt}</td>
      </tr>`;
    }).join('')}</tbody></table>
    <p class="note">Zvýrazněné řádky jsou hráči, které už máš v kádru.</p>
    ${storageNote('Watchlist')}`;
}

/* Jedna delegovaná obsluha pro všechny hvězdičky v appce. */
document.addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-watch]');
  if(!btn) return;
  const on = toggleWatch(btn.dataset.watch);

  // Překreslíme všechny hvězdičky téhož hráče, ne jen tu kliknutou —
  // stejný hráč bývá zároveň v tabulce pohybů i ve watchlistu.
  document.querySelectorAll(`button[data-watch="${btn.dataset.watch}"]`)
    .forEach(b => {
      b.textContent = on ? '★' : '☆';
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });

  const sec = $('pr-3');
  if(sec && !sec.hidden) sec.innerHTML = buildWatch(), wireWatch();

  /* Ve Zraněních může hvězdička řádek rovnou vyhodit ze seznamu
     (zobrazení Sledovaní), takže tabulku překreslíme celou. */
  if($('p-inj') && !$('p-inj').hidden && $('injtbl')) drawInj();

  drawHome();
});

/* Vyhledávání a select pro přidání do watchlistu. */
/* Nabídka jmen pod vyhledávacím polem.

   Dřív se hráč přidával rovnou při psaní: po třetím znaku se vzal
   nejlepší shoda a strčila do watchlistu. Kdo hledal Fernandese, dostal
   po napsání „fer“ Wieffera a ani se ho nikdo nezeptal.

   Teď se shody jen nabídnou. Přidá se ta, na kterou člověk klikne nebo
   kterou potvrdí Enterem — a dokud nepotvrdí, nestane se nic. */
function watchMatches(text){
  const needle = normName(text || '');
  if(needle.length < 2) return [];

  return BOOT.elements
    .map(p => {
      const jmeno = normName(p.web_name);
      const cele = normName(p.first_name + ' ' + p.second_name);
      // Shoda na začátku jména je skoro vždycky ta hledaná; shoda
      // uprostřed („fer“ ve „Wieffer“) je až poslední možnost.
      const rank = jmeno.startsWith(needle) ? 0
        : cele.split(' ').some(w => w.startsWith(needle)) ? 1
        : (jmeno + ' ' + cele).includes(needle) ? 2 : null;
      return rank === null ? null : {p, rank};
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || b.p.total_points - a.p.total_points)
    .slice(0, 8);
}

function watchRedraw(){
  const sec = $('pr-3');
  if(sec) sec.innerHTML = buildWatch();
  else if($('watchbox')) $('watchbox').innerHTML = buildWatch();
  wireWatch();
  drawHome();
}

function wireWatch(){
  const q = $('wq'), sel = $('wsel'), sug = $('wsug');

  if(sel) sel.addEventListener('change', () => {
    if(!sel.value) return;
    toggleWatch(sel.value);
    watchRedraw();
  });

  if(!q || !sug) return;

  let vyber = -1;   // index zvýrazněné nabídky pro ovládání klávesnicí

  const zavri = () => {
    sug.hidden = true;
    sug.innerHTML = '';
    q.setAttribute('aria-expanded', 'false');
    vyber = -1;
  };

  const kresli = () => {
    const hits = watchMatches(q.value).filter(h => !isWatched(h.p.id));
    if(!hits.length){ zavri(); return; }

    const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
    sug.innerHTML = hits.map((h, i) => `<button type="button" role="option"
      aria-selected="${i === vyber}" data-add="${h.p.id}">
      <b>${esc(h.p.web_name)}</b>
      <span>${esc((teams[h.p.team] || {}).short_name || '')} ·
        ${POS[h.p.element_type]} · ${(h.p.now_cost / 10).toFixed(1)}m</span>
    </button>`).join('');
    sug.hidden = false;
    q.setAttribute('aria-expanded', 'true');
  };

  q.addEventListener('input', () => { vyber = -1; kresli(); });

  q.addEventListener('keydown', ev => {
    const opts = [...sug.querySelectorAll('button[data-add]')];
    if(ev.key === 'Escape'){ zavri(); return; }
    if(!opts.length) return;

    if(ev.key === 'ArrowDown' || ev.key === 'ArrowUp'){
      ev.preventDefault();
      vyber = ev.key === 'ArrowDown'
        ? (vyber + 1) % opts.length
        : (vyber - 1 + opts.length) % opts.length;
      opts.forEach((b, i) => b.setAttribute('aria-selected', String(i === vyber)));
      return;
    }

    /* Enter bez vybrané nabídky bere první — ale jen když člověk
       opravdu zmáčkl Enter. Samo se nikdy nic nepřidá. */
    if(ev.key === 'Enter'){
      ev.preventDefault();
      const b = opts[vyber >= 0 ? vyber : 0];
      if(b){ toggleWatch(b.dataset.add); watchRedraw(); }
    }
  });

  sug.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-add]');
    if(!b) return;
    toggleWatch(b.dataset.add);
    watchRedraw();
  });

  q.addEventListener('blur', () => setTimeout(zavri, 150));
}

/* Hráči, kterým se cena pohnula za poslední kolo.
   cost_change_event je v desetinách milionu a resetuje se s kolem. */
function recentMovers(){
  const moved = BOOT.elements
    .filter(p => (p.cost_change_event || 0) !== 0)
    .sort((a, b) => Math.abs(b.cost_change_event) - Math.abs(a.cost_change_event)
                 || parseFloat(b.selected_by_percent) - parseFloat(a.selected_by_percent));
  return {
    up: moved.filter(p => p.cost_change_event > 0),
    down: moved.filter(p => p.cost_change_event < 0),
  };
}

function movedTable(list, dir, empty){
  if(!list.length) return `<p class="note">${empty}</p>`;
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  return `<table><thead><tr><th>Hráč</th><th class="n">Cena teď</th>
      <th class="n">Změna</th><th class="n">Vlastní</th></tr></thead>
    <tbody>${list.slice(0, 25).map(p => {
      const d = p.cost_change_event / 10;
      return `<tr${MY_SQUAD && MY_SQUAD.has(p.id) ? ' class="me"' : ''}>
        <td><span class="who">${crest(p.team, 'sm')}<b>${esc(p.web_name)}</b>
          <em class="sub">${esc(teams[p.team].short_name)}</em></span></td>
        <td class="n">${(p.now_cost / 10).toFixed(1)}m</td>
        <td class="n ${dir}">${d > 0 ? '+' : ''}${d.toFixed(1)}m</td>
        <td class="n">${parseFloat(p.selected_by_percent).toFixed(1)} %</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function buildMoved(){
  const mv = recentMovers();
  return `<h3>Zdražili</h3>
    ${movedTable(mv.up, 'up', 'Za poslední kolo nikdo nezdražil.')}
    <h3>Zlevnili${info(`Změna je za <b>poslední kolo</b> (<code>cost_change_event</code>),
      ne za celou sezónu. Zvýrazněné řádky jsou hráči z tvé sestavy — u těch,
      kteří zlevnili, ti klesá hodnota týmu.`)}</h3>
    ${movedTable(mv.down, 'down', 'Za poslední kolo nikdo nezlevnil.')}
    `;
}

function buildSeason(){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  /* Dřív se bralo prvních a posledních patnáct z jednoho seřazeného
     seznamu. Dokud se hýbalo míň než třicet cen, obě tabulky si sáhly
     do stejné hromádky a v „růstu“ pak seděli hráči, kteří zlevnili —
     jen proto, že klesli nejmíň.

     Každá tabulka si proto filtruje po svém. Když hráčů není deset,
     zbytek zůstane prázdný: prázdný řádek je poctivější než cizí. */
  const TOP = 10;
  const rostli = BOOT.elements
    .filter(p => (p.cost_change_start || 0) > 0)
    .sort((a, b) => b.cost_change_start - a.cost_change_start)
    .slice(0, TOP);
  const padali = BOOT.elements
    .filter(p => (p.cost_change_start || 0) < 0)
    .sort((a, b) => a.cost_change_start - b.cost_change_start)
    .slice(0, TOP);

  const prazdny = `<tr class="empty"><td colspan="4">—</td></tr>`;

  const tbl = list => `<table><thead><tr><th>Hráč</th><th class="n">Start</th>
      <th class="n">Teď</th><th class="n">Změna</th></tr></thead>
    <tbody>${list.map(p => {
      const d = p.cost_change_start / 10;
      return `<tr${MY_SQUAD && MY_SQUAD.has(p.id) ? ' class="me"' : ''}>
        <td><span class="who">${crest(p.team, 'sm')}<b>${esc(p.web_name)}</b>
          <em class="sub">${esc(teams[p.team].short_name)}</em></span></td>
        <td class="n">${((p.now_cost - p.cost_change_start) / 10).toFixed(1)}m</td>
        <td class="n">${(p.now_cost / 10).toFixed(1)}m</td>
        <td class="n ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d.toFixed(1)}m</td>
      </tr>`;
    }).join('') + prazdny.repeat(Math.max(0, TOP - list.length))}</tbody></table>`;

  if(!rostli.length && !padali.length)
    return '<p class="note">Od začátku sezóny se zatím žádná cena nepohnula.</p>';

  return `<h3>Největší růst</h3>${tbl(rostli)}
    <h3>Největší propad${info(`Růst hodnoty týmu je dlouhá hra: každé zdražení hráče,
      kterého držíš, ti přidá 0,1m do rozpočtu — ale při prodeji dostaneš
      zpátky jen polovinu zisku.`)}</h3>${tbl(padali)}
    `;
}

async function loadPrices(){
  $('prmsg').textContent = 'Načítám…';
  $('prout').innerHTML = '<div class="skel"><i></i><i></i><i></i><i></i></div>';
  try{
    if(!BOOT) BOOT = await api('bootstrap-static/');

    const SECTIONS = [
      ['Dnes v noci', buildPrices()],
      ['Změnili za kolo', buildMoved()],
      ['Za sezónu', buildSeason()],
      ['Watchlist', buildWatch()],
    ];

    $('prout').innerHTML = `
      <div class="subnav" role="tablist">
        ${SECTIONS.map((x, i) =>
          `<button class="sub-btn" role="tab" aria-selected="${i === 0}" data-sec="${i}">${esc(x[0])}</button>`
        ).join('')}
      </div>
      ${SECTIONS.map((x, i) =>
        `<div class="sec" id="pr-${i}"${i ? ' hidden' : ''}>${x[1]}</div>`
      ).join('')}`;

    $('prout').querySelectorAll('.sub-btn').forEach(b => {
      b.addEventListener('click', () => {
        $('prout').querySelectorAll('.sub-btn').forEach(x =>
          x.setAttribute('aria-selected', x === b));
        SECTIONS.forEach((_, i) => { $('pr-' + i).hidden = String(i) !== b.dataset.sec; });
      });
    });
    wireWatch();
    $('prmsg').textContent = '';
  }catch(e){
    $('prmsg').innerHTML = errBox(e.message, 't-prices');
    $('prout').innerHTML = '';
  }
}

/* ============================================================
   MĚSÍČNÍ TABULKY MINILIGY

   Bootstrap posílá `phases[]` — Overall a pak jednotlivé měsíce
   s rozsahem kol. Standings endpoint na ně umí filtrovat přes
   ?phase=N.

   Proč to stojí za to: v lize, kterou někdo vede o dvě stě bodů,
   dá měsíční pořadí ostatním důvod hrát dál. Implementačně je to
   jeden dotaz navíc.
   ============================================================ */
function mountPhases(leagueId, cur, myId){
  const box = $('phasebox');
  if(!box || !BOOT.phases) return;

  // Overall (id 1) přeskakujeme — to je tabulka v sekci Pořadí.
  // A měsíce, které ještě nezačaly, taky: prázdná tabulka nikomu nepomůže.
  const done = (BOOT.phases || []).filter(ph =>
    ph.id !== 1 && cur && ph.start_event <= cur.id);

  if(!done.length){
    box.innerHTML = '<p class="note">Měsíční tabulky se objeví po prvním dohraném měsíci.</p>';
    return;
  }

  const cache = {};
  const draw = async (ph) => {
    box.innerHTML = nav(ph.id)
      + '<div class="skel"><i></i><i></i><i></i><i></i></div>';

    try{
      if(!cache[ph.id])
        cache[ph.id] = await cached(
          'leagues-classic/' + leagueId + '/standings/?phase=' + ph.id);

      const rows = ((cache[ph.id].standings || {}).results || []);
      box.innerHTML = nav(ph.id) + (rows.length
        ? `<table><thead><tr><th class="n">#</th><th>Manažer</th>
             <th class="hide-s">Tým</th><th class="n">Body za měsíc</th></tr></thead>
           <tbody>${rows.map(m => `<tr${m.entry === myId ? ' class="me"' : ''}>
             <td class="n">${m.rank}</td>
             <td><b>${esc(m.player_name)}</b></td>
             <td class="hide-s" style="color:var(--mute)">${esc(m.entry_name)}</td>
             <td class="n">${m.total}</td></tr>`).join('')}</tbody></table>
           <p class="note">${esc(ph.name)} = kola ${ph.start_event}–${ph.stop_event}.
             Body jsou jen za tenhle úsek, ne od začátku sezóny.</p>`
        : '<p class="note">Pro tenhle měsíc zatím žádná data nejsou.</p>');
    }catch(e){
      box.innerHTML = nav(ph.id)
        + `<p class="note">Měsíční tabulku se nepodařilo načíst: ${esc(e.message)}</p>`;
    }
    bind();
  };

  const nav = sel => `<div class="phasenav" role="tablist">${done.map(ph =>
    `<button class="sub-btn" role="tab" aria-selected="${ph.id === sel}"
      data-ph="${ph.id}">${esc(ph.name)}</button>`).join('')}</div>`;

  const bind = () => box.querySelectorAll('button[data-ph]').forEach(b =>
    b.addEventListener('click', () =>
      draw(done.find(x => x.id === Number(b.dataset.ph)))));

  draw(done[done.length - 1]);   // výchozí je poslední rozehraný měsíc
}

/* ============================================================
   ZRANĚNÍ

   Vlastní záložka pro jedinou otázku, kterou si člověk klade
   nejčastěji před deadlinem: kdo z mých hráčů je pod otazníkem
   a koho z ostatních to sundalo.

   Data jsou celá v bootstrapu (status, chance_of_playing_next_round,
   news) — žádný dotaz navíc, takže záložka není v TAB_INIT a kreslí
   se z toho, co už appka má.

   Stav (které zobrazení, hledaný text, řazení) drží INJ. Vstupní
   pole se překresluje jen jednou při otevření záložky; při psaní se
   mění pouze tabulka, jinak by po každém písmenu utekl kurzor.
   ============================================================ */
const INJ_VIEWS = [['all', 'Celá liga'], ['squad', 'Můj kádr'],
                   ['watch', 'Sledovaní']];

let INJ = {view: 'all', q: '', key: 'chance', dir: 1};

/* Řádky pro tabulku. Bereme jen hráče, u kterých je co říct:
   nehrající status nebo šance pod 100 %. Hráč se stoprocentní
   šancí a poznámkou „returned from injury“ do seznamu zraněných
   nepatří — ten je zdravý. */
function injAll(){
  if(!BOOT) return [];
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  return BOOT.elements
    .filter(p => p.status !== 'a'
      || (p.chance_of_playing_next_round !== null
          && p.chance_of_playing_next_round < 100))
    .map(p => {
      const chance = p.chance_of_playing_next_round === null
        ? (p.status === 'a' ? 100 : 0) : p.chance_of_playing_next_round;
      // „Ankle injury - Expected back 14 Sep“ → 14 Sep
      const m = /expected back\s*[:\-]?\s*([^.(]+)/i.exec(p.news || '');
      return {p, team: teams[p.team] || {short_name: '?', name: '?'},
              chance,
              own: parseFloat(p.selected_by_percent) || 0,
              back: m ? m[1].trim() : '',
              mine: !!(MY_SQUAD && MY_SQUAD.has(p.id))};
    });
}

function injFiltered(){
  const rows = injAll().filter(r =>
    INJ.view === 'all' ? true
    : INJ.view === 'watch' ? isWatched(r.p.id)
    : r.mine);

  const needle = normName(INJ.q || '');
  const hit = needle
    ? rows.filter(r => normName(r.p.web_name + ' ' + r.p.second_name
        + ' ' + r.team.short_name + ' ' + r.team.name).includes(needle))
    : rows;

  const dir = INJ.dir;
  const cmp = {
    name:   (a, b) => a.p.web_name.localeCompare(b.p.web_name, 'cs'),
    team:   (a, b) => a.team.short_name.localeCompare(b.team.short_name),
    own:    (a, b) => a.own - b.own,
    chance: (a, b) => a.chance - b.chance,
  }[INJ.key] || ((a, b) => a.chance - b.chance);

  // Sekundární klíč je vždycky vlastnictví: při shodě šance je
  // zajímavější ten, koho má půlka ligy.
  return hit.sort((a, b) => (cmp(a, b) * dir) || (b.own - a.own));
}

function injTable(){
  const rows = injFiltered();

  if(!rows.length){
    const proc = INJ.q ? 'Hledání nic nenašlo.'
      : INJ.view === 'squad' ? 'Nikdo z tvého kádru není hlášený. Zatím.'
      : INJ.view === 'watch' ? 'Ze sledovaných hráčů nikoho nic netrápí.'
      : 'V celé lize není nikdo hlášený — to se stává jen v létě.';
    return `<p class="note">${esc(proc)}</p>`;
  }

  const th = (key, text, cls) =>
    `<th class="${cls || ''} sortable" data-sort="${key}"
      aria-sort="${INJ.key === key ? (INJ.dir === 1 ? 'ascending' : 'descending') : 'none'}"
      >${esc(text)}${INJ.key === key ? (INJ.dir === 1 ? ' ▲' : ' ▼') : ''}</th>`;

  return `<table>
    <thead><tr>
      <th></th>
      ${th('name', 'Hráč')}
      ${th('team', 'Tým', 'hide-s')}
      <th>Poz</th>
      ${th('own', 'Vlastní %', 'n hide-s')}
      ${th('chance', 'Šance', 'n')}
      <th>Stav</th>
      <th class="hide-s">Zpráva</th>
    </tr></thead>
    <tbody>${rows.map(r => `<tr${r.mine ? ' class="me"' : ''}>
      <td>${watchStar(r.p.id)}</td>
      <td><b>${esc(r.p.web_name)}</b>${r.back
        ? `<span class="injback">zpět ${esc(r.back)}</span>` : ''}</td>
      <td class="hide-s">${esc(r.team.short_name)}</td>
      <td>${POS[r.p.element_type]}</td>
      <td class="n hide-s">${r.own.toFixed(1)}</td>
      <td class="n ${r.chance === 0 ? 'al' : r.chance < 100 ? 'wn' : 'ok'}">${r.chance} %</td>
      <td class="st ${(S[r.p.status] || S.u)[1]}">${(S[r.p.status] || S.u)[0]}</td>
      <td class="hide-s" style="color:var(--mute);font-size:12.5px">${esc(r.p.news || '—')}</td>
    </tr>`).join('')}</tbody></table>
    <p class="note">Zvýrazněné řádky jsou hráči z tvého kádru. Hvězdičkou
      si kohokoli přidáš mezi sledované — objeví se pak i na Přehledu
      a v Cenách.</p>`;
}

/* Souhrn nad tabulkou: kolik z kádru je mimo a kolik pod otazníkem.
   Tohle je ta věta, kvůli které sem člověk chodí. */
function injSummary(){
  const mine = injAll().filter(r => r.mine);
  const out = mine.filter(r => r.chance === 0).length;
  const dbt = mine.filter(r => r.chance > 0 && r.chance < 100).length;

  if(!MY_SQUAD) return '<p class="note">Zadej ID týmu a uvidíš i svůj kádr.</p>';
  if(!mine.length) return `<p class="note ok">Tvůj kádr je čistý — nikdo hlášený.</p>`;

  return `<p class="note ${out ? 'wn' : ''}">Z tvého kádru ${
    out ? `<b>${out}</b> ${out === 1 ? 'nehraje' : out < 5 ? 'nehrají' : 'nehraje'}` : 'nikdo nechybí'
  }${dbt ? ` a <b>${dbt}</b> pod otazníkem` : ''}.</p>`;
}

function drawInj(){
  const box = $('injtbl');
  if(box) box.innerHTML = injTable();
  const sum = $('injsum');
  if(sum) sum.innerHTML = injSummary();
}

function loadInjuries(){
  const out = $('injout');
  if(!out) return;

  if(!BOOT){
    $('injmsg').textContent = 'Data se ještě načítají. Zkus to za chvilku.';
    return;
  }
  $('injmsg').textContent = '';

  out.innerHTML = `
    <div class="subnav" role="tablist">
      ${INJ_VIEWS.map(([k, t]) =>
        `<button class="sub-btn" role="tab" aria-selected="${k === INJ.view}"
          data-inj="${k}">${esc(t)}</button>`).join('')}
    </div>
    <div id="injsum"></div>
    <input type="search" id="injq" class="injq" placeholder="Hledej hráče nebo tým…"
      aria-label="Hledat hráče nebo tým" value="${esc(INJ.q)}">
    <div id="injtbl"></div>`;

  out.querySelectorAll('button[data-inj]').forEach(b =>
    b.addEventListener('click', () => {
      INJ.view = b.dataset.inj;
      out.querySelectorAll('button[data-inj]').forEach(x =>
        x.setAttribute('aria-selected', String(x === b)));
      drawInj();
    }));

  $('injq').addEventListener('input', ev => {
    INJ.q = ev.target.value;
    drawInj();
  });

  /* Řazení je delegované — hlavičky se překreslují s tabulkou. */
  $('injtbl').addEventListener('click', ev => {
    const th = ev.target.closest('th[data-sort]');
    if(!th) return;
    const key = th.dataset.sort;
    // Druhé kliknutí na tentýž sloupec otočí směr.
    if(INJ.key === key) INJ.dir = -INJ.dir;
    else { INJ.key = key; INJ.dir = key === 'own' ? -1 : 1; }
    drawInj();
  });

  drawInj();
}
