/* Minileague Squad Check — plánovač přestupů

   Plánovač přestupů na další kola včetně ukládání do localStorage.

   Soubory js/ se načítají jako klasické <script> v pevném pořadí a
   sdílejí jeden globální scope: nic se neexportuje ani neimportuje,
   ale hoisting přes hranici souboru neplatí. Pořadí je proto součást
   kontraktu a je vypsané v index.html.
   ============================================================ */
/* ============================================================
   PLÁNOVAČ PŘESTUPŮ

   Záložka Transfery odpovídá na „koho vyměnit teď“. Reálné
   rozhodnutí ale zní „vydržet kolo, vzít dva volné a udělat to
   naráz“ — a na to appka doteď neuměla odpovědět.

   Plánovač drží tahy v několika kolech dopředu a průběžně počítá:
     · zůstatek v bance po každém tahu,
     · volné přestupy (FPL jich teď kumuluje až pět),
     · body za hity (−4 za každý přestup nad rámec volných),
     · čistý zisk podle projekce na zbytek plánovaného okna.

   Nic se nikam neodesílá — přestupy pořád uděláš na webu FPL.
   Tohle je počítadlo, ne ovladač.
   ============================================================ */

const PLANNER_GWS = 4;
const PLANNER_KEY = () => 'fpl_planner:' + (ENTRY_ID || '0');

let PLANNER = null;   // {startGw, squad, bank, freeAt, moves:[{gw,out,in}]}

function loadMoves(){
  try{ return JSON.parse(localStorage.getItem(PLANNER_KEY()) || '[]'); }
  catch(e){ return []; }
}
function saveMoves(m){
  try{ lsSet(PLANNER_KEY(), JSON.stringify(m)); }catch(e){}
}

/* Kolik volných přestupů mám na začátku plánování.

   FPL od letoška kumuluje víc než jeden: nevyužitý se přenese,
   strop je 1 + max_extra_free_transfers. Přesné číslo posílá
   picks.entry_history, tak ho bereme odtud a nedopočítáváme. */
function ftCap(){
  return 1 + ((BOOT.game_settings && BOOT.game_settings.max_extra_free_transfers) || 0);
}

/* Kolik volných přestupů mám k dispozici pro dané kolo.

   FPL tohle číslo veřejně neposílá — v `picks.entry_history` prostě není.
   Dřív se proto natvrdo předpokládala jednička, což u kohokoli, kdo si
   přestup nechal přenést, sedělo jen náhodou.

   Dá se ale dopočítat z historie přestupů, kterou už stahujeme kvůli
   nákupním cenám:
     · před prvním deadlinem jsou přestupy neomezené a nic nespotřebují,
     · od GW2 začínáš s jedním,
     · každé další kolo: nevyužitý zbytek + 1, strop 1 + max_extra_free_transfers,
     · po wildcardu nebo free hitu máš příští kolo zase jeden.

   Poslední pravidlo si ověř — pokud by ho FPL změnilo, projeví se to jen
   u lidí, kteří čip letos použili, a přepsat se to dá ručně. */
function deriveFreeTransfers(transfers, chips, targetGw){
  const cap = ftCap();

  const usedIn = {};
  for(const t of (transfers || [])){
    const ev = Number(t.event);
    if(Number.isFinite(ev)) usedIn[ev] = (usedIn[ev] || 0) + 1;
  }

  const resetAfter = new Set((chips || [])
    .filter(c => c.name === 'wildcard' || c.name === 'freehit')
    .map(c => Number(c.event)));

  let free = 1;                                   // stav pro GW2
  for(let gw = 2; gw < targetGw; gw++){
    free = resetAfter.has(gw)
      ? 1
      : Math.min(cap, Math.max(0, free - (usedIn[gw] || 0)) + 1);
  }
  return Math.max(0, Math.min(cap, free));
}

/* Ruční přepis, kdyby dopočet nesouhlasil s tím, co ukazuje FPL.
   Stejný princip jako u prodejních cen: spočítat, ukázat zdroj, nechat opravit. */
const FT_KEY = () => 'fpl_ft:' + (ENTRY_ID || '0');

function ftOverride(){
  const v = parseInt(localStorage.getItem(FT_KEY()), 10);
  return Number.isFinite(v) && v >= 0 && v <= ftCap() ? v : null;
}

/* Průchod plánem kolo po kole.

   Bankou a volnými přestupy se prochází v čase, protože obojí se
   mezi koly mění — a právě to je informace, kvůli které plánovač
   existuje. Nedá se to spočítat na jednom místě naráz. */
function simulatePlan(moves){
  const byId = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const start = PLANNER.startGw;
  const cap = 1 + ((BOOT.game_settings && BOOT.game_settings.max_extra_free_transfers) || 0);

  let bank = Math.round(PLANNER.bank * 10);   // v desetinách, ať se nezaokrouhluje
  let free = PLANNER.free;
  let hits = 0;
  let gain = 0;

  // Aktuální kádr jako množina; postupně se mění podle tahů.
  const squad = new Set(PLANNER.squad.map(x => x.p.id));
  const rows = [];

  for(let i = 0; i < PLANNER_GWS; i++){
    const gw = start + i;
    const mine = moves.filter(m => m.gw === gw);
    const detail = [];
    let gwErr = null;

    for(const m of mine){
      const out = byId[m.out], inp = byId[m.in];
      if(!out || !inp){ gwErr = 'Hráč už v datech není.'; continue; }
      if(!squad.has(out.id)) gwErr = `${out.web_name} v tu chvíli v kádru není.`;
      if(squad.has(inp.id)) gwErr = `${inp.web_name} v kádru už je.`;

      bank += Math.round(sellPrice(out) * 10) - inp.now_cost;
      squad.delete(out.id); squad.add(inp.id);

      // Zisk počítáme na kola od tahu do konce okna — dřívější tah
      // má víc kol na to, aby se vyplatil.
      const n = PLANNER_GWS - i;
      const moveGain = projectRange(inp, gw, n) - projectRange(out, gw, n);
      gain += moveGain;

      detail.push({out, in: inp, gain: moveGain});
    }

    const used = mine.length;
    const paid = Math.max(0, used - free);
    hits += paid;

    /* `free` na začátku iterace je počet PRO tohle kolo — to je číslo,
       které uživatele zajímá. Dřív se do řádku ukládala až hodnota po
       navýšení, takže karta GW2 hlásila počet platný pro GW3 a celý
       sloupec byl posunutý o kolo. Hity se počítaly správně, chyboval
       jen výpis. */
    const freeBefore = free;
    free = Math.min(cap, Math.max(0, free - used) + 1);   // příští kolo jeden zpět

    rows.push({gw, detail, bank: bank / 10,
               free: freeBefore, freeNext: free, paid, err: gwErr});
  }

  return {rows, bank: bank / 10, hits, gain, net: gain - hits * 4};
}

/* Čeština má tři tvary: 1 volný přestup, 2–4 volné přestupy, 0 a 5+
   volných přestupů. „2 volných“ je drobnost, ale čte se to jako chyba. */
function ftLabel(n){
  const word = n === 1 ? 'volný přestup'
             : (n >= 2 && n <= 4) ? 'volné přestupy'
             : 'volných přestupů';
  return `<b>${n}</b> ${word}`;
}

function renderPlanner(){
  if(!PLANNER) return;
  const moves = loadMoves().filter(m =>
    m.gw >= PLANNER.startGw && m.gw < PLANNER.startGw + PLANNER_GWS);
  const sim = simulatePlan(moves);
  const byId = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  // Kádr po dosud naplánovaných tazích. Nabídka „ven“ musí ukazovat tenhle
  // stav, ne původní patnáctku — jinak by šlo prodat hráče, kterého jsi
  // v předchozím kole už pustil.
  const owned = new Set(PLANNER.squad.map(x => x.p.id));
  for(const m of moves){ owned.delete(m.out); owned.add(m.in); }

  const gwRows = sim.rows.map(r => {
    const list = r.detail.length
      ? r.detail.map(d => `<div class="pmove">
          ${crest(d.out.team, 'sm')}<span>${esc(d.out.web_name)}</span>
          <span class="ar">→</span>
          ${crest(d.in.team, 'sm')}<span>${esc(d.in.web_name)}</span>
          <span class="cost">${((d.in.now_cost / 10) - sellPrice(d.out)) >= 0 ? '+' : ''}${
            ((d.in.now_cost / 10) - sellPrice(d.out)).toFixed(1)}m</span>
          <span class="cost gain" title="rozdíl projekcí od tohohle kola do konce plánu">${
            d.gain >= 0 ? '+' : ''}${d.gain.toFixed(1)} b</span>
          <button class="rm" type="button" data-del="${r.gw}:${d.out.id}"
            aria-label="Zrušit tah ${esc(d.out.web_name)} za ${esc(d.in.web_name)}">×</button>
        </div>`).join('')
      : '<p class="pempty">Beze změny — necháváš kádr, jak je.</p>';

    return `<section class="pgw${r.paid ? ' hit' : ''}">
      <header class="pgw-h">
        <h4>GW${r.gw}</h4>
        <span class="ft${r.bank < 0 ? ' neg' : ''}">
          <b>${r.bank.toFixed(1)}m</b> v bance</span>
        <span class="ft${r.free ? '' : ' neg'}">${ftLabel(r.free)}</span>
        ${r.paid ? `<span class="ft neg"><b>−${r.paid * 4}</b> bodů za hit</span>` : ''}
        <button class="small ghost" type="button" data-open="${r.gw}"
          aria-expanded="false">Přidat přestup</button>
      </header>
      ${r.err ? `<p class="pempty err">${esc(r.err)}</p>` : ''}
      ${list}
      <div class="padd" id="padd-${r.gw}" hidden>
        <label>Kdo jde ven
          <select data-out="${r.gw}">
            <option value="">Vyber hráče z kádru…</option>
            ${[...owned].map(id => byId[id]).filter(Boolean)
              .sort((a, b) => a.element_type - b.element_type || b.now_cost - a.now_cost)
              .map(p => `<option value="${p.id}">${POS[p.element_type]} ·
                ${esc(p.web_name)} · ${sellPrice(p).toFixed(1)}m</option>`).join('')}
          </select>
        </label>
        <label>Kdo přijde
          <input type="search" data-search="${r.gw}" placeholder="Hledej podle jména…"
            autocomplete="off" disabled>
          <select data-in="${r.gw}" size="6" disabled>
            <option value="">Nejdřív vyber, kdo jde ven</option>
          </select>
          <span class="cnt" data-cnt="${r.gw}"></span>
        </label>
        <button class="small" data-add="${r.gw}" type="button">Přidat do plánu</button>
      </div>
    </section>`;
  }).join('');

  $('plnout').innerHTML = `
    <h2>Plán na ${PLANNER_GWS} kola${info(`<b>Co je „zisk z projekce“:</b> u každého tahu vezmu
      svůj model a spočítám, kolik bodů nasbírá příchozí hráč od kola tahu
      do konce plánovaného okna — a odečtu totéž pro odcházejícího. Model
      počítá minutovou jistotu, sílu soupeřů, defenzivní příspěvky
      i dvojitá a volná kola. Je to <b>můj odhad, ne oficiální číslo FPL</b>;
      to najdeš jako „projekce FPL“ u hráče a platí vždy jen na jedno kolo.
      Součty přes několik kol jsou ze své podstaty hrubé — ber je jako
      pořadí, ne jako předpověď.`)}</h2>
    <div class="psum">
      <div><div class="k">Tahů v plánu</div><div class="v">${moves.length}</div></div>
      <div><div class="k">Body za hity</div>
        <div class="v${sim.hits ? ' neg' : ''}">${sim.hits ? '−' + sim.hits * 4 : '0'}</div></div>
      <div><div class="k">Zisk z projekce</div>
        <div class="v">${sim.gain >= 0 ? '+' : ''}${sim.gain.toFixed(1)}</div>
        <div class="k2">bodů za ${PLANNER_GWS} kol</div></div>
      <div><div class="k">Čistě</div>
        <div class="v ${sim.net >= 0 ? 'pos' : 'neg'}">${sim.net >= 0 ? '+' : ''}${sim.net.toFixed(1)}</div></div>
    </div>
    <div class="ftbar">
      <label>Volné přestupy do GW${PLANNER.startGw}
        <input class="pin" id="ftin" type="number" min="0" max="${ftCap()}"
               step="1" value="${PLANNER.free}">
      </label>
      ${PLANNER.manual
        ? `<span class="edited">upraveno ručně</span>
           <button class="lnk" id="ftreset">vrátit dopočet (${PLANNER.derived})</button>`
        : '<span class="est">dopočteno z historie přestupů</span>'}
      <span class="fthint">Nesouhlasí s tím, co ukazuje FPL? Přepiš to —
        celý plán se přepočítá.</span>
    </div>
    ${sim.net < 0 && moves.length
      ? '<p class="note warnbox">Takhle plán <b>body ztrácí</b>. Buď některý tah '
        + 'odlož o kolo (ušetříš hit), nebo ho zruš.</p>'
      : ''}
    ${sim.bank < 0
      ? '<p class="note warnbox">Rozpočet nevychází — někde jdeš do minusu. '
        + 'Potřebuješ levnější příchod nebo dražší odchod.</p>'
      : ''}
    <div class="plan-rows">${gwRows}</div>
    
    <p class="note">Každý přestup nad rámec volných stojí <b>4 body</b>. Volný
      přestup se ti po každém kole vrátí, strop je
      ${1 + ((BOOT.game_settings && BOOT.game_settings.max_extra_free_transfers) || 0)} —
      proto se vyplatí tahy rozložit. Zisk počítám jako součet projekcí od kola
      tahu do konce okna, takže dřívější přestup má víc kol na to, aby se
      zaplatil.</p>
    <button class="lnk" id="plnclear">Vyprázdnit plán</button>
    ${storageNote('Rozpracovaný plán')}`;

  const q = $('plnout');

  // Formulář je zabalený, dokud si o něj neřekneš. Čtyři rozbalené formuláře
  // vedle sebe byly hlavní důvod, proč záložka působila nahňácaně.
  q.querySelectorAll('button[data-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const box = $('padd-' + btn.dataset.open);
      const show = box.hidden;
      box.hidden = !show;
      btn.setAttribute('aria-expanded', String(show));
      btn.textContent = show ? 'Zavřít' : 'Přidat přestup';
      if(show) box.querySelector('select[data-out]').focus();
    });
  });

  /* Nabídka příchozích. Dřív to bylo 40 jmen podle vlastnictví bez možnosti
     hledat, takže to vypadalo, že tam půlka ligy chybí. Teď je v seznamu
     každý hráč dané pozice, který se vejde do rozpočtu, a jde v něm hledat.
     Počet nahoře říká, s kolika hráči se vlastně pracuje. */
  const fillIn = (gw, force) => {
    const outSel = q.querySelector(`select[data-out="${gw}"]`);
    const inSel = q.querySelector(`select[data-in="${gw}"]`);
    const search = q.querySelector(`input[data-search="${gw}"]`);
    const cnt = q.querySelector(`[data-cnt="${gw}"]`);
    const out = byId[outSel.value];

    if(!out){
      inSel.disabled = search.disabled = true;
      inSel.innerHTML = '<option value="">Nejdřív vyber, kdo jde ven</option>';
      cnt.textContent = '';
      return;
    }

    const row = sim.rows.find(r => String(r.gw) === String(gw)) || {bank: PLANNER.bank};
    const budget = Math.round((row.bank + sellPrice(out)) * 10);
    const needle = normName(search.value || '');

    const all = BOOT.elements.filter(p =>
      p.element_type === out.element_type && !owned.has(p.id)
      && p.status !== 'u' && p.status !== 'n');

    const fits = all.filter(p => p.now_cost <= budget);
    const shown = fits.filter(p => !needle
      || normName(p.web_name + ' ' + p.second_name).includes(needle));

    shown.sort((a, b) =>
      parseFloat(b.selected_by_percent) - parseFloat(a.selected_by_percent));

    inSel.disabled = search.disabled = false;
    inSel.innerHTML = shown.length
      ? shown.map(p => `<option value="${p.id}">${esc(p.web_name)} ·
          ${esc(teams[p.team].short_name)} · ${(p.now_cost / 10).toFixed(1)}m ·
          ${parseFloat(p.selected_by_percent).toFixed(1)} %</option>`).join('')
      : '<option value="" disabled>Nikdo neodpovídá</option>';

    // Poctivé počítadlo: kolik hráčů pozice existuje, kolik jich rozpočet
    // pustí a kolik zbylo po hledání. Bez toho není poznat, jestli je seznam
    // krátký kvůli penězům, nebo kvůli překlepu ve jméně.
    cnt.textContent = `${shown.length} z ${fits.length} v rozpočtu ${
      (budget / 10).toFixed(1)}m · ${all.length} na pozici celkem`;
    if(force) search.value = '';
  };

  q.querySelectorAll('select[data-out]').forEach(sel =>
    sel.addEventListener('change', () => fillIn(sel.dataset.out, true)));
  q.querySelectorAll('input[data-search]').forEach(inp =>
    inp.addEventListener('input', () => fillIn(inp.dataset.search, false)));

  q.querySelectorAll('button[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const gw = Number(btn.dataset.add);
      const o = q.querySelector(`select[data-out="${gw}"]`).value;
      const i = q.querySelector(`select[data-in="${gw}"]`).value;
      if(!o || !i){ $('plnmsg').textContent = 'Vyber hráče na obou stranách.'; return; }
      $('plnmsg').textContent = '';
      saveMoves([...loadMoves(), {gw, out: Number(o), in: Number(i)}]);
      renderPlanner();
    });
  });

  q.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [gw, out] = btn.dataset.del.split(':').map(Number);
      const rest = loadMoves();
      const at = rest.findIndex(m => m.gw === gw && m.out === out);
      if(at >= 0) rest.splice(at, 1);
      saveMoves(rest);
      renderPlanner();
    });
  });

  $('ftin').addEventListener('change', () => {
    const v = parseInt($('ftin').value, 10);
    if(Number.isFinite(v) && v >= 0 && v <= ftCap()){
      lsSet(FT_KEY(), String(v));
      PLANNER.free = v;
      PLANNER.manual = true;
    }else{
      lsDel(FT_KEY());
      PLANNER.free = PLANNER.derived;
      PLANNER.manual = false;
    }
    renderPlanner();
  });

  const ftr = $('ftreset');
  if(ftr) ftr.addEventListener('click', () => {
    lsDel(FT_KEY());
    PLANNER.free = PLANNER.derived;
    PLANNER.manual = false;
    renderPlanner();
  });

  $('plnclear').addEventListener('click', () => { saveMoves([]); renderPlanner(); });
}

async function loadPlanner(){
  $('plnmsg').textContent = 'Načítám kádr…';
  $('plnout').innerHTML = '<div class="skel"><i></i><i></i><i></i><i></i><i></i></div>';
  try{
    // Plánovač stojí na stejných datech jako Transfery. Když tam člověk
    // ještě nebyl, dotáhneme si je sami místo abychom ho posílali pryč.
    if(!TR_STATE) await analyzeTransfers();
    if(!TR_STATE){ $('plnmsg').textContent = 'Nejdřív si nech načíst sestavu.'; return; }

    /* Historii přestupů máme z analyzeTransfers, čipy dotáhneme sem —
       jeden dotaz navíc a je z něj poznat, kdy se počítadlo resetovalo. */
    let transfers = [], chips = [];
    try{ transfers = await cached('entry/' + ENTRY_ID + '/transfers/'); }catch(e){}
    try{ chips = (await cached('entry/' + ENTRY_ID + '/history/')).chips || []; }catch(e){}

    const derived = deriveFreeTransfers(transfers, chips, TR_STATE.startGw);
    const manual = ftOverride();

    PLANNER = {
      startGw: TR_STATE.startGw,
      squad: TR_STATE.squad,
      bank: bankValue(),
      free: manual === null ? derived : manual,
      derived,
      manual: manual !== null,
    };
    $('plnmsg').textContent = '';
    renderPlanner();
  }catch(e){
    $('plnmsg').innerHTML = errBox(e.message, null, () => loadPlanner());
    $('plnout').innerHTML = '';
  }
}
