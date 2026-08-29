/* Minileague Squad Check — stav dat, odkazy a společné drobnosti

   Čtyři věci, které byly dosud rozeseté po záložkách, každá trochu jinak:

     1. STAV DAT. Appka umí rozeznat běžící kolo, čekání na bonusy
        a dopočítané kolo, ale říkala to jen na některých panelech.
        Otázka „je tohle už konečné?“ přitom během kola nezmizí, ať se
        člověk dívá kamkoli. Proto jeden pruh pod hlavičkou.

     2. ČAS POSLEDNÍCH DAT. Bez něj se nedá poznat rozdíl mezi „nic se
        nezměnilo“ a „appka se od rána nic nezeptala“.

     3. ODKAZ NA KONKRÉTNÍ KOLO. `#h2h/gw7` se dá poslat do skupinového
        chatu. Dosud šlo odkázat jen na appku jako celek.

     4. ZKUSIT ZNOVU. Chybová hláška bez tlačítka nutí k reloadu celé
        stránky, což zahodí i to, co se načetlo v pořádku.

   Soubory js/ se načítají jako klasické <script> v pevném pořadí a
   sdílejí jeden globální scope; pořadí je vypsané v index.html.
   ============================================================ */

/* ------------------------------------------------------------
   Stav dat
   ------------------------------------------------------------ */

const STAV_TXT = {
  running: ['wn', 'kolo běží', 'Bonusy se počítají až po posledním zápase.'],
  unchecked: ['wn', 'čeká na bonusy',
    'Zápasy skončily, FPL ještě nepotvrdilo bonusové body.'],
  final: ['ok', 'dopočítáno', 'Body jsou konečné.'],
};

function stavCas(ts){
  if(!ts) return 'zatím nic';
  const d = new Date(ts);
  const min = Math.round((Date.now() - ts) / 60000);
  if(min < 1) return 'právě teď';
  if(min < 60) return 'před ' + min + ' min';
  return d.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute: '2-digit'});
}

/* Dvojitý deadline: dvě kola do tří dnů po sobě.

   Stává se to při přesunutém kole a je to přesně ta situace, kdy odpočet
   v hlavičce mate — ukazuje nejbližší termín a neřekne, že hned za ním
   je další. */
function dvojityDeadline(){
  if(!BOOT) return null;
  const dalsi = (BOOT.events || [])
    .filter(e => new Date(e.deadline_time).getTime() > Date.now())
    .sort((a, b) => new Date(a.deadline_time) - new Date(b.deadline_time))
    .slice(0, 2);
  if(dalsi.length < 2) return null;
  const rozdil = new Date(dalsi[1].deadline_time) - new Date(dalsi[0].deadline_time);
  return rozdil < 3 * 86400000 ? dalsi : null;
}

function drawStatus(){
  const el = $('statusbar');
  if(!el || !BOOT) return;

  const cur = BOOT.events.find(e => e.is_current);
  const nxt = BOOT.events.find(e => e.is_next);
  if(!cur && !nxt){ el.hidden = true; return; }

  const faze = cur && typeof gwPhase === 'function' ? gwPhase(cur.id) : null;
  const [cls, txt, vysvetleni] = STAV_TXT[faze] || STAV_TXT.running;
  const dvoj = dvojityDeadline();

  /* Deadline patří sem, ne do lišty: nahoře překrýval stavový čip a musel
     se zkracovat, tady se vejde i s číslem kola. */
  const deadline = nxt
    ? `<span class="sbdl"><b>GW${nxt.id}</b> ${esc(untilText(
        new Date(nxt.deadline_time).getTime() - Date.now()))}</span>`
    : '';

  el.hidden = false;
  el.innerHTML = `<div class="wrap">
    ${cur ? `<span class="livetag ${cls}">GW${cur.id} · ${txt}</span>
      <span class="sbnote">${esc(vysvetleni)}</span>` : ''}
    ${dvoj ? `<span class="livetag wn">Pozor: GW${dvoj[0].id} i GW${dvoj[1].id}
      do tří dnů</span>` : ''}
    <span class="sbspace"></span>
    ${deadline}
    <span class="sbtime" id="sbtime">data ${esc(stavCas(API_LAST))}</span>
  </div>`;
}

/* Čas i odpočet se posouvají samy, i když se nic nenačítá — od toho
   tam jsou. Překreslujeme celý pruh, protože odpočet je jeho součástí. */
setInterval(() => { try{ drawStatus(); }catch(e){} }, 30000);

/* ------------------------------------------------------------
   Zvýraznění změny

   Když se čísla přepíšou sama, musí to být vidět — jinak člověk neví,
   jestli se něco stalo, nebo jestli obnova nefunguje.
   ------------------------------------------------------------ */
function flash(el){
  if(!el || !el.classList) return;
  el.classList.remove('flash');
  void el.offsetWidth;          // vynutí restart animace
  el.classList.add('flash');
}

/* ------------------------------------------------------------
   Zkusit znovu

   Vrací hlášku i s tlačítkem. `tab` je id záložky, která se má načíst
   znovu; bez něj se jen zopakuje předaná funkce.
   ------------------------------------------------------------ */
const RETRY_FN = new Map();
let RETRY_SEQ = 0;

function errBox(zprava, tab, fn){
  const id = 'r' + (++RETRY_SEQ);
  if(fn) RETRY_FN.set(id, fn);
  return `<p class="errbox" role="alert"><span>${esc(zprava)}</span>
    <button type="button" class="small" data-retry="${id}"
      data-retrytab="${esc(tab || '')}">Zkusit znovu</button></p>`;
}

document.addEventListener('click', async ev => {
  const btn = ev.target.closest('[data-retry]');
  if(!btn) return;
  const {retry, retrytab} = btn.dataset;
  btn.disabled = true;
  btn.textContent = 'Načítám…';

  try{
    const fn = RETRY_FN.get(retry);
    if(fn){ await fn(); RETRY_FN.delete(retry); return; }

    /* Bez vlastní funkce se záložka načte znovu od začátku: zahodíme
       její data z cache, ať se nevrátí tatáž chyba z paměti. */
    if(retrytab && TAB_INIT[retrytab]){
      dropCached(/^(leagues-classic|entry|event)\//);
      TAB_DONE.delete(retrytab);
      TAB_DONE.add(retrytab);
      await TAB_INIT[retrytab]();
    }
  }catch(e){
    btn.disabled = false;
    btn.textContent = 'Zkusit znovu';
  }
});

/* ------------------------------------------------------------
   Sdílení

   navigator.share je na telefonu; na desktopu skončí v schránce.
   Obojí je „dostal jsem to ven z appky“, což je celý účel.
   ------------------------------------------------------------ */
async function shareText(titulek, text){
  try{
    if(navigator.share){ await navigator.share({title: titulek, text}); return 'sdíleno'; }
  }catch(e){
    if(e && e.name === 'AbortError') return null;   // uživatel to zrušil
  }
  try{
    await navigator.clipboard.writeText(text);
    return 'zkopírováno';
  }catch(e){ return null; }
}

document.addEventListener('click', async ev => {
  const btn = ev.target.closest('[data-share]');
  if(!btn) return;
  const puvodni = btn.textContent;
  const res = await shareText(btn.dataset.sharetitle || 'Squad Check',
                              btn.dataset.share);
  if(res){
    btn.textContent = res === 'sdíleno' ? 'Hotovo' : 'Zkopírováno';
    setTimeout(() => { btn.textContent = puvodni; }, 2000);
  }
});

/* ------------------------------------------------------------
   Odkaz na kolo

   Tvar `#h2h/gw7`. Záložka je povinná, kolo nepovinné. Čte se při
   startu a zapisuje se při přepnutí — takže adresní řádek pořád
   odpovídá tomu, co je vidět.
   ------------------------------------------------------------ */
const HASH_TAB = {
  home: 't-home', squad: 't-squad', league: 't-league', hub: 't-hub',
  h2h: 't-h2h', news: 't-news', inj: 't-inj', players: 't-players',
  prices: 't-prices', adv: 't-adv', plan: 't-plan',
};

let HASH_TICHO = false;   // vlastní zápis nesmí vyvolat vlastní čtení

function setHash(tab, gw){
  const klic = Object.keys(HASH_TAB).find(k => HASH_TAB[k] === tab);
  if(!klic) return;
  const nova = '#' + klic + (gw ? '/gw' + gw : '');
  if(location.hash === nova) return;
  HASH_TICHO = true;
  history.replaceState(null, '', nova);
  setTimeout(() => { HASH_TICHO = false; }, 0);
}

function readHash(){
  const m = /^#([a-z0-9]+)(?:\/gw(\d+))?$/i.exec(location.hash || '');
  if(!m) return null;
  const tab = HASH_TAB[m[1].toLowerCase()];
  return tab ? {tab, gw: m[2] ? Number(m[2]) : null} : null;
}

/* Otevře, na co odkaz míří. Volá se po načtení sestavy, protože dřív
   nemá záložka co zobrazit. */
async function applyHash(){
  const h = readHash();
  if(!h) return;
  if(h.gw && typeof H2H_GW !== 'undefined' && h.tab === 't-h2h') H2H_GW = h.gw;
  selectTab(h.tab);
}

window.addEventListener('hashchange', () => {
  if(HASH_TICHO) return;
  applyHash();
});
