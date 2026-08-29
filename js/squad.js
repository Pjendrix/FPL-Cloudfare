/* Minileague Squad Check — sestava soupeře v okně

   Jedno okno pro celou appku. Kdekoli se v seznamu objeví jméno manažera,
   dá se na něj kliknout a ukáže se, s kým do kola nastoupil — bez odchodu
   ze záložky a bez druhého načtení ligy.

   Proč vlastní okno a ne <dialog>: appka běží i na starších WebView
   v režimu PWA, kde `showModal()` chybí nebo se chová jinak než na
   desktopu. Overlay s vlastním scrimem je pár řádků a chová se všude
   stejně; na mobilu se z něj navíc udělá spodní plachta jedním pravidlem
   v mobile.css, aniž by se sahalo do markupu.

   Data se berou líně: sestava (`entry/{id}/event/{gw}/picks/`) a body kola
   (`event/{gw}/live/`) se stahují až při otevření. Pro dohraná kola se
   drží v cache napořád, pro běžící se po minutě načtou znovu — jinak by
   okno ukazovalo body, které mezitím zestarly.

   Soubory js/ se načítají jako klasické <script> v pevném pořadí a sdílejí
   jeden globální scope; pořadí je vypsané v index.html.
   ============================================================ */

const SQ_POS = {1: 'Brankář', 2: 'Obrana', 3: 'Záloha', 4: 'Útok'};
const SQ_POS_SHORT = {1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD'};

/* Čipy mají v datech technické názvy; člověk zná jiné. */
const SQ_CHIPS = {
  bboost: 'Bench Boost', '3xc': 'Triple Captain',
  freehit: 'Free Hit', wildcard: 'Wildcard', manager: 'Manager',
};

let SQ_LIVE = null;      // {gw, pts, mins, ts} — body kola, viz sqLive()
let SQ_FOCUS = null;     // prvek, na který se vrátí fokus po zavření
let SQ_SEQ = 0;          // pořadí otevření: starší odpověď nesmí přepsat novější

/* Body kola. Dohrané kolo se drží v běžné cache appky, běžící ne:
   po minutě má smysl se zeptat znovu, protože přesně o to tady jde. */
async function sqLive(gw){
  const bezi = typeof gwPhase === 'function' && gwPhase(gw) !== 'final';
  if(SQ_LIVE && SQ_LIVE.gw === gw && (!bezi || Date.now() - SQ_LIVE.ts < 60000))
    return SQ_LIVE;

  const data = bezi ? await api('event/' + gw + '/live/')
                    : await cached('event/' + gw + '/live/');
  const stats = liveStats(data);
  const pts = new Map(), mins = new Map();
  for(const [id, st] of stats){
    pts.set(id, st.total_points || 0);
    mins.set(id, st.minutes || 0);
  }
  SQ_LIVE = {gw, stats, pts, mins, ts: Date.now()};
  return SQ_LIVE;
}

function sqPlayer(id){
  return (BOOT && BOOT.elements || []).find(p => p.id === id) || null;
}
function sqTeam(p){
  const t = (BOOT && BOOT.teams || []).find(x => x.id === (p && p.team));
  return t ? t.short_name : '';
}

/* Jeden řádek sestavy. Kapitánova násobička se ukazuje u bodů, ne u jména —
   „12 (×2)“ řekne rovnou, odkud se to číslo vzalo. */
function sqRow(pick, live, lavicka, ef){
  const p = sqPlayer(pick.element);
  const jmeno = p ? p.web_name : 'Neznámý hráč';
  const pos = p ? SQ_POS_SHORT[p.element_type] : '';
  const raw = live.pts.get(pick.element) || 0;
  const mult = ef ? ef.mult : (pick.multiplier > 0 ? pick.multiplier : 0);
  const min = live.mins.get(pick.element) || 0;

  const znak = (ef ? ef.captain : pick.is_captain)
      ? '<i class="cap" title="Kapitán">C</i>'
    : pick.is_vice_captain ? '<i class="cap vc" title="Náhradní kapitán">V</i>'
    : '';
  const sub = ef && ef.subbedIn ? '<i class="sub" title="Přišel střídáním">↑</i>'
            : ef && ef.subbedOut ? '<i class="sub out" title="Vystřídán">↓</i>' : '';

  return `<div class="sqp${lavicka ? ' bench' : ''}${min ? '' : ' idle'}">
    <i class="pos">${pos}</i>
    <b>${esc(jmeno)}${znak}${sub}</b>
    <em>${esc(sqTeam(p))}</em>
    <span class="pts">${lavicka ? raw : raw * (mult || 1)}${
      mult > 1 ? `<u>×${mult}</u>` : ''}</span>
  </div>`;
}

function sqBody(pk, live, gw){
  const picks = (pk.picks || []).slice().sort((a, b) => a.position - b.position);

  /* Efektivní sestava: kdo přišel autosubem, patří mezi hrající, ne na
     lavičku — a součet musí sedět s tím, co ukazuje FPL. */
  const L = resolveLineup(pk, live.stats, gw);
  const ef = new Map(L.rows.map(r => [r.element, r]));
  const hraje = x => (ef.get(x.element) || {}).mult > 0;

  const zaklad = picks.filter(hraje);
  const lav = picks.filter(x => !hraje(x));

  const cost = L.cost;
  const body = L.total;
  const nehralo = L.toPlay;
  const chip = pk.active_chip ? (SQ_CHIPS[pk.active_chip] || pk.active_chip) : null;

  /* Základ se dělí po řadách. Bez toho je to patnáct řádků za sebou a
     nepozná se z toho ani rozestavení. */
  const rady = [1, 2, 3, 4].map(t => {
    const v = zaklad.filter(x => {
      const p = sqPlayer(x.element);
      return p && p.element_type === t;
    });
    return v.length ? `<div class="sqline"><h5>${SQ_POS[t]}</h5>
      ${v.map(x => sqRow(x, live, false, ef.get(x.element))).join('')}</div>` : '';
  }).join('');

  return `<div class="sqsum">
      <div class="big">${body}<span>bodů v GW${gw}</span></div>
      <div class="meta">
        ${chip ? `<span class="livetag ok">${esc(chip)}</span>` : ''}
        ${cost ? `<span class="livetag wn">−${cost} za přestupy</span>` : ''}
        <span class="livetag">${nehralo ? nehralo + ' ze základu nenastoupilo'
          : 'základ odehrán'}</span>
      </div>
    </div>
    ${rady}
    <div class="sqline"><h5>Lavička</h5>${lav.map(x => sqRow(x, live, true, ef.get(x.element))).join('')}</div>
    ${sqDiff(picks, live, ef)}
    <p class="note">Body jsou průběžné, dokud FPL nedopočítá bonusy. Součet
      počítá automatická střídání (šipka u jména) i přesun kapitánské pásky
      na vicekapitána. Čísla u lavičky se do součtu nepočítají — leda
      s čipem Bench Boost, kde hraje celý kádr.</p>`;
}

/* Rozdíl proti mému kádru.

   U H2H je tohle ta hlavní otázka: koho má soupeř navíc a koho nemám
   já. Bez ní se musí obě sestavy porovnávat očima, což u patnácti jmen
   nikdo nedělá. Vlastní kádr známe z `MY_SQUAD`, který se plní při
   načtení sestavy; bez něj se sekce prostě nevykreslí.

   Do rozdílu se počítá celý kádr, ne jen základ: hráč na lavičce je
   pořád rozdíl mezi dvěma týmy, jen se zrovna nepočítá. */
function sqDiff(picks, live, ef){
  if(!MY_SQUAD || !MY_SQUAD.size) return '';

  const jeho = picks.map(x => x.element);
  const navic = jeho.filter(id => !MY_SQUAD.has(id));
  const chybi = [...MY_SQUAD].filter(id => !jeho.includes(id));
  if(!navic.length && !chybi.length){
    return '<div class="sqline"><h5>Rozdíl proti tvému kádru</h5>' +
      '<p class="note">Máte úplně stejných patnáct hráčů.</p></div>';
  }

  const chip = (id, znak) => {
    const p = sqPlayer(id);
    const b = live.pts.get(id);
    const r = ef && ef.get(id);
    return `<span class="sqdiff ${znak}">${znak === 'plus' ? '+' : '−'}
      ${esc(p ? p.web_name : '?')}<u>${b == null ? '–' : (r ? r.pts : b)}</u></span>`;
  };

  return `<div class="sqline"><h5>Rozdíl proti tvému kádru</h5>
    <div class="sqdiffs">
      ${navic.map(id => chip(id, 'plus')).join('')}
      ${chibiChips(chybi, live)}
    </div>
    <p class="note">Vlevo hráči, které má on a ty ne; vpravo naopak.
      U jména jsou body za tohle kolo.</p>
  </div>`;
}

function chibiChips(ids, live){
  return ids.map(id => {
    const p = sqPlayer(id);
    const b = live.pts.get(id);
    return `<span class="sqdiff minus">−${esc(p ? p.web_name : '?')}<u>${
      b == null ? '–' : b}</u></span>`;
  }).join('');
}

function sqShow(m){
  const bylo = !m.hidden;
  m.hidden = false;
  m.classList.add('on');
  document.body.classList.add('sq-lock');
  if(!bylo && !SQ_HIST){
    // Jeden záznam na jedno otevření; přepnutí na porovnání ho nepřidává.
    try{ history.pushState({sq: 1}, ''); SQ_HIST = true; }catch(e){}
  }
  const zavri = m.querySelector('.x');
  if(zavri) zavri.focus();
}

function sqClose(){
  const m = $('sqmodal');
  if(!m || m.hidden) return;
  m.hidden = true;
  m.classList.remove('on');
  document.body.classList.remove('sq-lock');
  if(SQ_HIST){ SQ_HIST = false; try{ history.back(); }catch(e){} }
  if(SQ_FOCUS && document.contains(SQ_FOCUS)) SQ_FOCUS.focus();
  SQ_FOCUS = null;
}

async function openSquad(entry, gw, jmeno, tym){
  const m = $('sqmodal');
  if(!m) return;
  const mine = ++SQ_SEQ;

  SQ_FOCUS = document.activeElement;
  $('sqmTitle').innerHTML = `${esc(jmeno || 'Sestava')}
    <span>${esc(tym || '')}${tym ? ' · ' : ''}GW${gw}
      · <a href="https://fantasy.premierleague.com/entry/${entry}/event/${gw}"
           target="_blank" rel="noopener noreferrer">tým na FPL ↗</a>
      ${ENTRY_ID && entry !== ENTRY_ID
        ? `· <button type="button" class="linklike" data-compare="${entry}"
             data-cmpgw="${gw}">porovnat s mým kádrem</button>` : ''}</span>`;
  $('sqmBody').innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';
  sqShow(m);

  try{
    const [pk, live] = await Promise.all([
      cached('entry/' + entry + '/event/' + gw + '/picks/'),
      sqLive(gw),
    ]);
    if(mine !== SQ_SEQ) return;   // mezitím se otevřela jiná sestava
    $('sqmBody').innerHTML = sqBody(pk, live, gw);
  }catch(e){
    if(mine !== SQ_SEQ) return;
    /* Nejčastější případ není výpadek, ale kolo před deadlinem: sestava
       ještě neexistuje a FPL vrací chybu. Řekněme to rovnou. */
    $('sqmBody').innerHTML = `<p class="note">Sestavu pro GW${gw} se nepodařilo
      načíst. Před deadlinem ještě není veřejná — objeví se, jakmile kolo
      začne.</p>`;
  }
}

/* ------------------------------------------------------------
   Porovnání dvou kádrů vedle sebe

   Rozdílové odrážky řeknou, kdo je jiný. Tohle řekne, jak se ta jinakost
   projevila na bodech — dva sloupce, stejné pořadí řad, součty dole.
   ------------------------------------------------------------ */
function sqSloupec(pk, live, gw, popis){
  const L = resolveLineup(pk, live.stats, gw);
  const ef = new Map(L.rows.map(r => [r.element, r]));
  const picks = (pk.picks || []).slice().sort((a, b) => a.position - b.position);
  const hraje = x => (ef.get(x.element) || {}).mult > 0;

  const rady = [1, 2, 3, 4].map(t => {
    const v = picks.filter(x => hraje(x) && sqPlayer(x.element)
      && sqPlayer(x.element).element_type === t);
    return v.map(x => sqRow(x, live, false, ef.get(x.element))).join('');
  }).join('');

  return `<div class="sqcol">
    <h5>${esc(popis)}</h5>
    <div class="big">${L.total}<span>bodů</span></div>
    ${rady}
    <div class="sqline"><h5>Lavička</h5>
      ${picks.filter(x => !hraje(x)).map(x => sqRow(x, live, true, ef.get(x.element))).join('')}
    </div>
  </div>`;
}

async function openCompare(entry, gw, jmeno){
  const m = $('sqmodal');
  if(!m || !ENTRY_ID) return;
  const mine = ++SQ_SEQ;

  $('sqmTitle').innerHTML = `Porovnání kádrů
    <span>ty vs ${esc(jmeno || 'soupeř')} · GW${gw}</span>`;
  $('sqmBody').innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';

  try{
    const [ja, on, live] = await Promise.all([
      cached('entry/' + ENTRY_ID + '/event/' + gw + '/picks/'),
      cached('entry/' + entry + '/event/' + gw + '/picks/'),
      sqLive(gw),
    ]);
    if(mine !== SQ_SEQ) return;
    $('sqmBody').innerHTML = `<div class="sqcmp">
        ${sqSloupec(ja, live, gw, 'Tvůj kádr')}
        ${sqSloupec(on, live, gw, jmeno || 'Soupeř')}
      </div>
      <p class="note">Vlevo ty, vpravo soupeř. Součty jsou po autosubech
        a po případném přesunu kapitánské pásky, takže sedí s FPL.</p>`;
  }catch(e){
    if(mine !== SQ_SEQ) return;
    $('sqmBody').innerHTML = '<p class="note">Sestavy se nepodařilo načíst.</p>';
  }
}

/* ------------------------------------------------------------
   Fokus a tlačítko Zpět

   Modální okno bez pasti na fokus je modální jen opticky: tabulátorem
   se z něj dá odejít pod scrim, kde na nic nejde kliknout. A na Androidu
   je Zpět první, po čem člověk u spodní plachty sáhne — bez ošetření to
   zavře celou PWA.
   ------------------------------------------------------------ */
let SQ_HIST = false;   // přidali jsme kvůli oknu záznam do historie?

function sqTrap(ev){
  const m = $('sqmodal');
  if(!m || m.hidden || ev.key !== 'Tab') return;
  const prvky = [...m.querySelectorAll(
    'button, a[href], input, [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null);
  if(!prvky.length) return;
  const prvni = prvky[0], posledni = prvky[prvky.length - 1];

  if(ev.shiftKey && document.activeElement === prvni){
    ev.preventDefault(); posledni.focus();
  }else if(!ev.shiftKey && document.activeElement === posledni){
    ev.preventDefault(); prvni.focus();
  }
}
document.addEventListener('keydown', sqTrap);

window.addEventListener('popstate', () => {
  // Zpět zavírá okno, ne appku. Vlastní zavření si záznam odebere samo.
  const m = $('sqmodal');
  if(m && !m.hidden){ SQ_HIST = false; sqClose(); }
});

/* Jediný posluchač pro celou appku. Tlačítko stačí označit atributy:
   data-squad = entry ID, data-sqgw = kolo, data-sqname / data-sqteam
   pro hlavičku okna. */
document.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-squad]');
  if(btn){
    ev.preventDefault();
    openSquad(Number(btn.dataset.squad), Number(btn.dataset.sqgw),
              btn.dataset.sqname || btn.textContent.trim(), btn.dataset.sqteam);
    return;
  }
  const cmp = ev.target.closest('[data-compare]');
  if(cmp){
    ev.preventDefault();
    const karta = $('sqmTitle');
    openCompare(Number(cmp.dataset.compare), Number(cmp.dataset.cmpgw),
                (karta.textContent || '').trim().split('\n')[0]);
    return;
  }
  if(ev.target.closest('[data-sqclose]')) sqClose();
});

document.addEventListener('keydown', ev => {
  if(ev.key === 'Escape') sqClose();
});

/* Značka pro klikatelné jméno. Na jednom místě, ať se stejné tlačítko
   nemusí psát v h2h.js i v tabulce miniligy. */
function squadBtn(entry, gw, jmeno, tym, cls){
  if(!entry || !gw) return esc(jmeno);
  return `<button type="button" class="sqbtn${cls ? ' ' + cls : ''}"
    data-squad="${entry}" data-sqgw="${gw}" data-sqname="${esc(jmeno)}"
    data-sqteam="${esc(tym || '')}">${esc(jmeno)}</button>`;
}
