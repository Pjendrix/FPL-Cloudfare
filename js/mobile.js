/* Minileague Squad Check — mobilní skořápka

   Spodní plovoucí navigace, plachta „Více“, obalování tabulek do
   vodorovných scrollerů a přejíždění prstem mezi sekcemi. Nedrží vlastní
   stav — jen kliká na skutečná tlačítka a opisuje jejich aria-selected.
   Musí být před boot.js: přepisuje selectTab a čte TABS.

   Soubory js/ se načítají jako klasické <script> v pevném pořadí a
   sdílejí jeden globální scope: nic se neexportuje ani neimportuje,
   ale hoisting přes hranici souboru neplatí. Pořadí je proto součást
   kontraktu a je vypsané v index.html.
   ============================================================ */
/* ============================================================
   MOBILNÍ SKOŘÁPKA

   Na telefonu appka vypadala jako zmenšený web: devět záložek v
   jednom vodorovném scrolleru, hlavička, do které se nevešel ani
   název, a panely s 28px okraji. Tohle z toho dělá appku:

     · plovoucí spodní lišta se čtyřmi sekcemi a tlačítkem Více
     · plachta „Více“ se zbytkem sekcí a s účtem
     · vodorovné scrollery kolem širokých tabulek
     · přejetí prstem mezi sekcemi

   Klíčové rozhodnutí: nic z toho nemá vlastní stav. Spodní lišta i
   plachta jen klikají na existující tlačítka v .nav a v horní liště.
   Kdyby si držely vlastní „která záložka je aktivní“, rozešly by se
   s desktopovou navigací hned, jak by někdo přepnul zobrazení.
   ============================================================ */
(function mobileShell(){
  const svg = d => '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const ICON = {
    't-home':    '<path d="M3 10.8 12 3.2l9 7.6"/><path d="M5.6 9.7V20.4h12.8V9.7"/>',
    't-squad':   '<path d="M8.4 3.6 4.4 5.9l1.5 3.2 2.3-1v12.3h7.6V8.1l2.3 1 1.5-3.2-4-2.3"/>' +
                 '<path d="M8.4 3.6a3.6 3.6 0 0 0 7.2 0"/>',
    't-league':  '<path d="M7 3.8h10v4.4a5 5 0 0 1-10 0z"/>' +
                 '<path d="M7 5.2H4.5v1.3A3 3 0 0 0 7 9.4"/>' +
                 '<path d="M17 5.2h2.5v1.3A3 3 0 0 1 17 9.4"/>' +
                 '<path d="M10.4 13.2h3.2l.6 3.4H9.8z"/><path d="M8.4 20.2h7.2"/>',
    't-hub':     '<path d="M4 10v4h3l7 3.8V6.2L7 10z"/><path d="M17.4 9.4a4 4 0 0 1 0 5.2"/>',
    /* Zranění: zdravotnický kříž v kolečku. Samotný kříž byl k
       nerozeznání od „přidat“. */
    't-inj':     '<circle cx="12" cy="12" r="8.2"/>' +
                 '<path d="M12 8.4v7.2"/><path d="M8.4 12h7.2"/>',
    't-h2h':     '<path d="M9.4 4.6 4.6 12l4.8 7.4"/><path d="M14.6 4.6 19.4 12l-4.8 7.4"/>',
    't-news':    '<path d="M4.4 5.4h12.4v13.2H6a1.6 1.6 0 0 1-1.6-1.6z"/>' +
                 '<path d="M16.8 8.6h2.8v8.4a1.6 1.6 0 0 1-3.2 0"/>' +
                 '<path d="M7.2 8.8h6.8"/><path d="M7.2 12h6.8"/><path d="M7.2 15.2h4.4"/>',
    /* Poradce: žárovka. Sekce radí, nepočítá — proto ne graf. */
    't-adv':     '<path d="M9.6 17.4a5.6 5.6 0 1 1 4.8 0"/>' +
                 '<path d="M9.8 17.4h4.4v2.2H9.8z"/><path d="M10.6 21h2.8"/>',
    't-players': '<path d="M12 11.6a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6z"/>' +
                 '<path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0"/>',
    't-plan':    '<path d="M4.2 6.2h15.6v14H4.2z"/><path d="M4.2 10.4h15.6"/>' +
                 '<path d="M8.4 3.6v4"/><path d="M15.6 3.6v4"/>',
    't-prices':  '<path d="M4 16.4 9 11l3.4 3.4L20 6.8"/><path d="M15 6.8h5v5"/>',
    't-planner': '<path d="M4 7h11"/><path d="M4 12h11"/><path d="M4 17h7"/>' +
                 '<path d="M16.8 15.6 18.4 17l3-3"/>',
    'more':      '<circle cx="5.6" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
                 '<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
                 '<circle cx="18.4" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  };

  /* Do lišty se vejde pět sekcí plus Více — šest dlaždic je na 360px
     displeji strop, při sedmi už se popisky ořezávají do nečitelna.
     Popisky jsou proto zkrácené („Hub“ místo „Hub ligy“); plachta
     zobrazuje plné názvy, takže se nikde neztratí.

     Sestava a Miniliga se přesunuly do plachty: obojí se otevírá jednou
     za kolo, kdežto Ceny a Poradce před každým deadlinem. */
  const PRIMARY = ['t-home', 't-hub', 't-h2h', 't-prices', 't-adv'];
  const SHORT   = {'t-home':'Přehled', 't-hub':'Hub', 't-h2h':'H2H',
                   't-prices':'Ceny', 't-adv':'Poradce'};

  const nav    = document.getElementById('mnav');
  const sheet  = document.getElementById('msheet');
  const sbody  = document.getElementById('msheetBody');
  if(!nav || !sheet || !sbody) return;

  const label = tid => (document.getElementById(tid) || {}).textContent || tid;

  /* ---------- spodní lišta ---------- */
  nav.innerHTML = PRIMARY.map(tid =>
    `<button type="button" data-tab="${tid}" aria-selected="false">
       ${svg(ICON[tid] || '')}<span>${SHORT[tid] || label(tid)}</span>
     </button>`).join('') +
    `<button type="button" id="mmore" aria-expanded="false">
       ${svg(ICON.more)}<span>Více</span>
     </button>`;

  /* ---------- plachta ---------- */
  const REST = TABS.map(([t]) => t).filter(t => !PRIMARY.includes(t));

  function actionBtn(srcId, text, icon){
    const src = document.getElementById(srcId);
    if(!src || src.hidden) return '';
    return `<button type="button" data-click="${srcId}">${svg(icon)}<span>${text}</span></button>`;
  }

  function buildSheet(){
    const who = (document.getElementById('whoName') || {}).textContent || '—';
    sbody.innerHTML =
      '<h3>Sekce</h3>' +
      '<div class="mgrid">' + REST.map(tid =>
        `<button type="button" data-tab="${tid}" aria-selected="false">
           ${svg(ICON[tid] || '')}<span>${label(tid)}</span>
         </button>`).join('') + '</div>' +
      '<h3>Jinde</h3>' +
      '<div class="mgrid">' +
        `<a href="https://fantasy.premierleague.com/en/transfers" target="_blank"
            rel="noopener noreferrer" data-out="1">${svg(
          '<path d="M4.6 12v6.4a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6V12"/>' +
          '<path d="M12 14.6V4.2"/><path d="M8.2 7.6 12 4.2l3.8 3.4"/>'
        )}<span>Oficiální FPL</span></a>` +
      '</div>' +
      '<h3>Účet a zobrazení</h3>' +
      `<p class="mwho">Tým <b>${who}</b></p>` +
      '<div class="mgrid">' +
        actionBtn('theme',   'Tmavý režim',   '<path d="M20 14.4A8.4 8.4 0 0 1 9.6 4 8.4 8.4 0 1 0 20 14.4z"/>') +
        actionBtn('reload',  'Načíst znovu',  '<path d="M20 5.6v5h-5"/><path d="M19.3 14a7.6 7.6 0 1 1-1.5-7"/>') +
        actionBtn('gauth',   'Přihlásit',     '<path d="M15.2 20v-1.8a3.6 3.6 0 0 0-3.6-3.6H7.2A3.6 3.6 0 0 0 3.6 18.2V20"/><path d="M9.4 11.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z"/><path d="M17.6 8.4h4"/>') +
        actionBtn('logout',  'Změnit ID',     '<path d="M9.6 20H5.2A1.6 1.6 0 0 1 3.6 18.4V5.6A1.6 1.6 0 0 1 5.2 4h4.4"/><path d="M15.6 16.4 20 12l-4.4-4.4"/><path d="M20 12H9.6"/>') +
      '</div>';
    syncNav();
  }

  function openSheet(){
    buildSheet();
    sheet.hidden = false;
    sheet.classList.add('on');
    document.getElementById('mmore').setAttribute('aria-expanded', 'true');
  }
  function closeSheet(){
    sheet.classList.remove('on');
    sheet.hidden = true;
    const m = document.getElementById('mmore');
    if(m) m.setAttribute('aria-expanded', 'false');
  }

  /* ---------- kliknutí ----------
     Delegace, protože obsah plachty se přestavuje při každém otevření
     (jméno týmu i dostupnost přihlášení se mění za běhu). */
  document.addEventListener('click', ev => {
    const close = ev.target.closest('[data-mclose]');
    if(close){ closeSheet(); return; }

    const more = ev.target.closest('#mmore');
    if(more){
      sheet.classList.contains('on') ? closeSheet() : openSheet();
      return;
    }

    const tab = ev.target.closest('[data-tab]');
    if(tab && (nav.contains(tab) || sheet.contains(tab))){
      closeSheet();
      const real = document.getElementById(tab.dataset.tab);
      if(real && !real.disabled) real.click();
      window.scrollTo({top: 0, behavior: 'smooth'});
      return;
    }

    const act = ev.target.closest('[data-click]');
    if(act && sheet.contains(act)){
      const real = document.getElementById(act.dataset.click);
      // Přepnutí na desktop zobrazení plachtu stejně schová, zavíráme napřed.
      closeSheet();
      if(real) real.click();
    }
  });

  document.addEventListener('keydown', ev => {
    if(ev.key === 'Escape' && sheet.classList.contains('on')) closeSheet();
  });

  /* ---------- zvýraznění aktivní sekce ----------
     Čte se ze skutečných tlačítek, ne z vlastní proměnné. Kdykoli se
     někde zavolá selectTab, tohle jen opíše výsledek. */
  function syncNav(){
    const open = (TABS.find(([t]) =>
      document.getElementById(t).getAttribute('aria-selected') === 'true')
      || ['t-home'])[0];

    nav.querySelectorAll('[data-tab]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.tab === open)));
    sheet.querySelectorAll('[data-tab]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.tab === open)));

    // Když je otevřená sekce schovaná pod Více, svítí Více.
    const more = document.getElementById('mmore');
    if(more) more.setAttribute('aria-selected', String(REST.includes(open)));
  }

  const prevSelect = selectTab;
  selectTab = function(tid){ prevSelect(tid); syncNav(); };
  syncNav();

  /* ---------- vodorovné scrollery kolem tabulek ----------
     Šablon, které vypisují tabulku, jsou desítky. Místo obalu v každé
     z nich se obalí až to, co se objeví v DOM. */
  function wrapTables(){
    document.querySelectorAll('#app table').forEach(t => {
      const par = t.parentElement;
      if(par && par.classList.contains('tscroll')) return;
      const box = document.createElement('div');
      box.className = 'tscroll';
      par.insertBefore(box, t);
      box.appendChild(t);
    });
  }
  const app = document.getElementById('app');
  if(app && 'MutationObserver' in window){
    let queued = false;
    new MutationObserver(() => {
      if(queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; wrapTables(); });
    }).observe(app, {childList: true, subtree: true});
    wrapTables();
  }

  /* ---------- přejetí prstem mezi sekcemi ----------
     Jen mezi sekcemi, které jsou vidět ve spodní liště. Skákat prstem
     přes devět záložek by znamenalo skončit někde, kam člověk nemířil.
     Vodorovné scrollery a formuláře gesto ignorují — tam prst patří
     obsahu, ne navigaci. */
  const SWIPE = PRIMARY;
  let sx = 0, sy = 0, live = false;

  document.addEventListener('touchstart', ev => {
    if(ev.touches.length !== 1 || sheet.classList.contains('on')){ live = false; return; }
    if(ev.target.closest('.tscroll,.subnav,.gwnav,.phasenav,.nav,input,select,textarea,#mnav')){
      live = false; return;
    }
    if(!window.matchMedia('(max-width:720px)').matches &&
       document.documentElement.getAttribute('data-view') !== 'mobile'){
      live = false; return;
    }
    sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; live = true;
  }, {passive: true});

  document.addEventListener('touchend', ev => {
    if(!live) return;
    live = false;
    const t = ev.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if(Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;

    const open = (TABS.find(([id]) =>
      document.getElementById(id).getAttribute('aria-selected') === 'true')
      || ['t-home'])[0];
    const i = SWIPE.indexOf(open);
    if(i < 0) return;
    const next = SWIPE[i + (dx < 0 ? 1 : -1)];
    if(!next) return;
    const btn = document.getElementById(next);
    if(btn && !btn.disabled){ btn.click(); window.scrollTo({top: 0}); }
  }, {passive: true});
})();
