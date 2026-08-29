/* Minileague Squad Check — horní lišta (desktop)

   Jedenáct záložek v pruhu pod hlavičkou nebyla navigace, ale seznam.
   Tady z toho je pětice denně otevíraných sekcí, tlačítko „Víc“ hned za
   nimi a hledání, které skočí kamkoli. Dohromady to ubere tři pruhy
   chromu: záložky, stav dat i kolejnice sezóny se vejdou do jednoho.

   Stejný princip jako u mobilní skořápky: TENHLE SOUBOR NEDRŽÍ ŽÁDNÝ
   STAV. Segment i nabídka jen klikají na skutečná tlačítka v `.nav`
   a opisují jejich `aria-selected`. Kdyby si držely vlastní „která
   záložka je otevřená“, rozešly by se s ostatní navigací hned, jak by
   někdo přepnul zobrazení nebo otevřel odkaz s `#h2h/gw7`.

   Musí se načítat po core.js (čte TABS a obaluje selectTab) a před
   boot.js.
   ============================================================ */
(function topBar(){
  /* Pět sekcí, které se otevírají denně. Zbytek jde do nabídky —
     ne proto, že je méně důležitý, ale protože se otevírá jednou za
     kolo, a stálé místo v liště si tím neplatí. */
  const PRIMARY = ['t-home', 't-hub', 't-h2h', 't-prices', 't-adv'];
  const NAZEV = {'t-home': 'Home', 't-hub': 'Hub ligy', 't-h2h': 'H2H',
                 't-prices': 'Ceny', 't-adv': 'Poradce'};

  const host = document.getElementById('topnav');
  if(!host) return;

  const REST = TABS.map(([t]) => t).filter(t => !PRIMARY.includes(t));
  const popis = tid => (document.getElementById(tid) || {}).textContent || tid;

  /* ---------- segment ---------- */
  host.innerHTML = `
    <div class="seg" role="tablist" aria-label="Hlavní sekce">
      ${PRIMARY.map(tid => `<button type="button" role="tab" data-top="${tid}"
        aria-selected="false">${esc(NAZEV[tid] || popis(tid))}</button>`).join('')}
      <span class="div" aria-hidden="true"></span>
      <span class="morewrap">
        <button type="button" class="more" id="topmore" aria-expanded="false"
          aria-haspopup="menu">Víc <i class="chev" aria-hidden="true">▾</i></button>
        <div class="sheet" id="topsheet" role="menu" hidden></div>
      </span>
    </div>`;

  const seg = host.querySelector('.seg');
  const more = document.getElementById('topmore');
  const sheet = document.getElementById('topsheet');

  /* ---------- nabídka ----------
     Skládá se při každém otevření: dostupnost přihlášení i název týmu
     se mění za běhu a zamrazená kopie by lhala. */
  function akce(id, text){
    /* `hidden` je property, ne CSS: tlačítka v liště jsou schovaná
       stylem, ale sync.js jimi pořád hýbe (přihlášení). Čteme tedy
       skutečný stav, ne to, jestli je vidět. */
    const src = document.getElementById(id);
    if(!src || src.hidden || src.disabled) return '';
    return `<button type="button" role="menuitem" data-topclick="${id}">${esc(text)}</button>`;
  }

  /* Kolik hráčů z mého kádru je hlášených. Schovaná sekce potřebuje
     důvod, proč si na ni vzpomenout dřív, než tam člověka něco pošle. */
  function zraneni(){
    if(!MY_SQUAD || !BOOT) return 0;
    return (BOOT.elements || []).filter(p => MY_SQUAD.has(p.id) &&
      (p.status !== 'a' || (p.chance_of_playing_next_round !== null &&
                            p.chance_of_playing_next_round < 100))).length;
  }

  function buildSheet(){
    const n = zraneni();
    sheet.innerHTML =
      '<div class="lbl">Další sekce</div>' +
      REST.map(tid => {
        const dis = (document.getElementById(tid) || {}).disabled;
        const znacka = tid === 't-inj' && n
          ? `<span class="badge">${n}</span>` : '';
        return `<button type="button" role="menuitem" data-top="${tid}"
          ${dis ? 'disabled' : ''}>${esc(popis(tid))}${znacka}</button>`;
      }).join('') +
      '<hr>' +
      akce('reload', 'Aktualizovat data') +
      akce('theme', document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'Světlý režim' : 'Tmavý režim') +
      akce('viewmode', 'Přepnout zobrazení') +
      akce('gauth', 'Přihlásit') +
      akce('logout', 'Změnit ID');
  }

  function openSheet(){
    buildSheet();
    sheet.hidden = false;
    more.setAttribute('aria-expanded', 'true');
    const prvni = sheet.querySelector('button:not([disabled])');
    if(prvni) prvni.focus();
  }
  function closeSheet(vratFokus){
    if(sheet.hidden) return;
    sheet.hidden = true;
    more.setAttribute('aria-expanded', 'false');
    if(vratFokus) more.focus();
  }

  document.addEventListener('click', ev => {
    if(ev.target.closest('#topmore')){
      sheet.hidden ? openSheet() : closeSheet(true);
      return;
    }
    const tab = ev.target.closest('[data-top]');
    if(tab && host.contains(tab)){
      closeSheet(false);
      const real = document.getElementById(tab.dataset.top);
      if(real && !real.disabled) real.click();
      return;
    }
    const act = ev.target.closest('[data-topclick]');
    if(act){
      closeSheet(false);
      const real = document.getElementById(act.dataset.topclick);
      if(real) real.click();
      return;
    }
    if(!ev.target.closest('.morewrap')) closeSheet(false);
  });

  document.addEventListener('keydown', ev => {
    if(ev.key === 'Escape' && !sheet.hidden){ closeSheet(true); return; }

    // Šipky uvnitř otevřené nabídky; jinak by se z ní vypadlo na první Tab.
    if(!sheet.hidden && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')){
      const polozky = [...sheet.querySelectorAll('button:not([disabled])')];
      const i = polozky.indexOf(document.activeElement);
      const dalsi = polozky[(i + (ev.key === 'ArrowDown' ? 1 : -1) + polozky.length)
        % polozky.length];
      if(dalsi){ ev.preventDefault(); dalsi.focus(); }
    }
  });

  /* ---------- stavový čip ----------
     Během kola průběžné body, jinak odpočet do deadlinu. Je to tatáž
     informace, kterou nese pruh se stavem dat — na širokém displeji ale
     stačí jednou, a tady je blíž k tomu, kvůli čemu se člověk dívá. */
  function drawChip(){
    const chip = document.getElementById('topstate');
    if(!chip || !BOOT) return;

    const cur = BOOT.events.find(e => e.is_current);
    const nxt = BOOT.events.find(e => e.is_next);
    const faze = cur && typeof gwPhase === 'function' ? gwPhase(cur.id) : null;

    if(cur && faze === 'running'){
      chip.className = 'state live';
      chip.innerHTML = `<i class="dot" aria-hidden="true"></i>GW${cur.id}
        ${LAST_LIVE_TOTAL != null
          ? `<span class="sep" aria-hidden="true">·</span><b>${LAST_LIVE_TOTAL} b</b>` : ''}`;
      chip.title = 'Kolo běží, bonusy se dopočítají po posledním zápase';
    }else if(cur && faze === 'unchecked'){
      chip.className = 'state wait';
      chip.innerHTML = `<i class="dot" aria-hidden="true"></i>GW${cur.id}
        <span class="sep" aria-hidden="true">·</span><b>bonusy</b>`;
      chip.title = 'Zápasy skončily, FPL ještě nepotvrdilo bonusové body';
    }else if(nxt){
      const left = new Date(nxt.deadline_time) - Date.now();
      const d = Math.floor(left / 86400000), h = Math.floor(left / 3600000) % 24;
      const m = Math.floor(left / 60000) % 60;
      chip.className = 'state' + (left < 6 * 3600000 ? ' soon' : '');
      chip.innerHTML = `<i class="dot" aria-hidden="true"></i>Deadline
        <span class="sep" aria-hidden="true">·</span><b>${
          d >= 1 ? d + ' d ' + h + ' h' : h >= 1 ? h + ' h ' + m + ' min' : m + ' min'}</b>`;
      chip.title = 'Deadline GW' + nxt.id + ' — '
        + new Date(nxt.deadline_time).toLocaleString('cs-CZ');
    }else{
      chip.className = 'state';
      chip.textContent = 'mimo sezónu';
    }
    chip.hidden = false;
  }
  window.drawChip = drawChip;
  setInterval(drawChip, 30000);

  /* ---------- hledání ----------
     Sekce a manažeři ligy. Hráči tu schválně nejsou: appka nemá kam je
     otevřít, takže by položka slibovala něco, co neumí splnit. */
  const pal = document.getElementById('palette');
  const pin = document.getElementById('palinput');
  const pout = document.getElementById('palout');
  let PAL_I = 0, PAL_ITEMS = [];

  function polozky(dotaz){
    const q = dotaz.trim().toLowerCase();
    const out = [];

    for(const [tid] of TABS){
      const b = document.getElementById(tid);
      if(!b || b.disabled) continue;
      const t = (NAZEV[tid] || popis(tid)).trim();
      if(!q || t.toLowerCase().includes(q)) out.push({typ: 'Sekce', text: t, tid});
    }

    if(q && typeof HUB !== 'undefined' && HUB && HUB.members){
      for(const m of HUB.members){
        if(!(m.player_name + ' ' + m.entry_name).toLowerCase().includes(q)) continue;
        out.push({typ: 'Manažer', text: m.player_name, sub: m.entry_name,
                  entry: m.entry});
        if(out.length > 14) break;
      }
    }
    return out.slice(0, 14);
  }

  function renderPal(){
    PAL_ITEMS = polozky(pin.value);
    PAL_I = Math.min(PAL_I, Math.max(0, PAL_ITEMS.length - 1));
    pout.innerHTML = PAL_ITEMS.length
      ? PAL_ITEMS.map((it, i) => `<button type="button" data-pal="${i}"
          class="${i === PAL_I ? 'on' : ''}"><span class="t">${esc(it.text)}</span>
          ${it.sub ? `<span class="s">${esc(it.sub)}</span>` : ''}
          <span class="k">${it.typ}</span></button>`).join('')
      : '<p class="empty">Nic takového tu není. Zkus jméno manažera nebo název sekce.</p>';
  }

  function openPal(){
    if(!pal) return;
    pal.hidden = false;
    pin.value = '';
    PAL_I = 0;
    renderPal();
    pin.focus();
  }
  function closePal(){ if(pal) pal.hidden = true; }

  function spustit(it){
    if(!it) return;
    closePal();
    if(it.tid){
      const b = document.getElementById(it.tid);
      if(b && !b.disabled) b.click();
    }else if(it.entry && typeof openSquad === 'function' && HUB && HUB.cur){
      openSquad(it.entry, HUB.cur.id, it.text, it.sub);
    }
  }

  if(pal){
    document.getElementById('palopen').addEventListener('click', openPal);
    pal.querySelector('.scrim').addEventListener('click', closePal);
    pin.addEventListener('input', () => { PAL_I = 0; renderPal(); });

    pin.addEventListener('keydown', ev => {
      if(ev.key === 'ArrowDown'){ ev.preventDefault(); PAL_I++; }
      else if(ev.key === 'ArrowUp'){ ev.preventDefault(); PAL_I--; }
      else if(ev.key === 'Enter'){ ev.preventDefault(); spustit(PAL_ITEMS[PAL_I]); return; }
      else return;
      PAL_I = (PAL_I + PAL_ITEMS.length) % Math.max(1, PAL_ITEMS.length);
      renderPal();
    });

    pout.addEventListener('click', ev => {
      const b = ev.target.closest('[data-pal]');
      if(b) spustit(PAL_ITEMS[Number(b.dataset.pal)]);
    });

    document.addEventListener('keydown', ev => {
      if((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k'){
        ev.preventDefault();
        pal.hidden ? openPal() : closePal();
      }
      if(ev.key === 'Escape' && !pal.hidden) closePal();
    });
  }

  /* ---------- zvýraznění aktivní sekce ----------
     Když je otevřená sekce z nabídky, tlačítko „Víc“ převezme její jméno
     a rozsvítí se jako záložka. Bez toho by u šesti schovaných sekcí
     nebylo poznat, kde člověk je. */
  function syncTop(){
    const open = (TABS.find(([t]) =>
      (document.getElementById(t) || {}).getAttribute &&
      document.getElementById(t).getAttribute('aria-selected') === 'true')
      || ['t-home'])[0];

    seg.querySelectorAll('[data-top]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.top === open)));

    const skryta = REST.includes(open);
    more.classList.toggle('active', skryta);
    more.setAttribute('aria-selected', String(skryta));
    more.innerHTML = (skryta ? esc(popis(open)) : 'Víc')
      + ' <i class="chev" aria-hidden="true">▾</i>';
  }

  const prevSelect = selectTab;
  selectTab = function(tid){ prevSelect(tid); syncTop(); };
  syncTop();
})();
