/* FPL Squad Check — mobile shell

   The floating bottom navigation, the "More" sheet, wrapping tables in
   horizontal scrollers and swiping between sections. It holds no state of
   its own — it only clicks the real buttons and copies their
   aria-selected. Must come before boot.js: it wraps selectTab and reads
   TABS.

   The js/ files load as classic <script> tags in a fixed order and share
   one global scope: nothing is exported or imported, but hoisting does
   not cross file boundaries. The order is therefore part of the contract
   and is written down in index.html.
   ============================================================ */
/* ============================================================
   MOBILE SHELL

   On a phone the app looked like a shrunken website: every tab in one
   horizontal scroller, a header the name did not fit into, and panels
   with 28px margins. This turns it into an app:

     · a floating bottom bar with the daily sections and a More button
     · a "More" sheet with the remaining sections and the account
     · horizontal scrollers around wide tables
     · swiping between sections

   The key decision: none of it holds state. The bottom bar and the sheet
   only click the existing buttons in .nav and in the top bar. If they
   kept their own idea of "which tab is active", they would drift from
   the desktop navigation as soon as someone switched views.
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
    /* Injuries: a medical cross in a circle. The cross theirs_ its own was
       indistinguishable from "add". */
    't-inj':     '<circle cx="12" cy="12" r="8.2"/>' +
                 '<path d="M12 8.4v7.2"/><path d="M8.4 12h7.2"/>',
    't-news':    '<path d="M4.4 5.4h12.4v13.2H6a1.6 1.6 0 0 1-1.6-1.6z"/>' +
                 '<path d="M16.8 8.6h2.8v8.4a1.6 1.6 0 0 1-3.2 0"/>' +
                 '<path d="M7.2 8.8h6.8"/><path d="M7.2 12h6.8"/><path d="M7.2 15.2h4.4"/>',
    't-players': '<path d="M12 11.6a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6z"/>' +
                 '<path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0"/>',
    't-plan':    '<path d="M4.2 6.2h15.6v14H4.2z"/><path d="M4.2 10.4h15.6"/>' +
                 '<path d="M8.4 3.6v4"/><path d="M15.6 3.6v4"/>',
    't-prices':  '<path d="M4 16.4 9 11l3.4 3.4L20 6.8"/><path d="M15 6.8h5v5"/>',
    'more':      '<circle cx="5.6" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
                 '<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
                 '<circle cx="18.4" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  };

  /* Five sections plus More is what fits: six tiles is the ceiling theirs_ a
     360px display, and at seven the labels are clipped into nonsense.
     The labels are therefore shortened ("Hub" instead of "League hub");
     the sheet shows the full names, so nothing is lost.

     The squad and the league table live in the sheet: both are opened
     once a gameweek, whereas prices and fixtures matter before every
     deadline. */
  const PRIMARY = ['t-home', 't-squad', 't-hub', 't-prices', 't-plan'];
  const SHORT   = {'t-home':'Home', 't-squad':'Squad', 't-hub':'Hub',
                   't-prices':'Prices', 't-plan':'Fixtures'};

  const nav    = document.getElementById('mnav');
  const sheet  = document.getElementById('msheet');
  const sbody  = document.getElementById('msheetBody');
  if(!nav || !sheet || !sbody) return;

  const label = tid => (document.getElementById(tid) || {}).textContent || tid;

  /* ---------- bottom bar ---------- */
  nav.innerHTML = PRIMARY.map(tid =>
    `<button type="button" data-tab="${tid}" aria-selected="false">
       ${svg(ICON[tid] || '')}<span>${SHORT[tid] || label(tid)}</span>
     </button>`).join('') +
    `<button type="button" id="mmore" aria-expanded="false">
       ${svg(ICON.more)}<span>More</span>
     </button>`;

  /* ---------- sheet ---------- */
  const REST = TABS.map(([t]) => t).filter(t => !PRIMARY.includes(t));

  function actionBtn(srcId, text, icon){
    const src = document.getElementById(srcId);
    if(!src || src.hidden) return '';
    return `<button type="button" data-click="${srcId}">${svg(icon)}<span>${text}</span></button>`;
  }

  function buildSheet(){
    const who = (document.getElementById('whoName') || {}).textContent || '—';
    sbody.innerHTML =
      '<h3>Sections</h3>' +
      '<div class="mgrid">' + REST.map(tid =>
        `<button type="button" data-tab="${tid}" aria-selected="false">
           ${svg(ICON[tid] || '')}<span>${label(tid)}</span>
         </button>`).join('') + '</div>' +
      '<h3>Elsewhere</h3>' +
      '<div class="mgrid">' +
        `<a href="https://fantasy.premierleague.com/en/transfers" target="_blank"
            rel="noopener noreferrer" data-out="1">${svg(
          '<path d="M4.6 12v6.4a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6V12"/>' +
          '<path d="M12 14.6V4.2"/><path d="M8.2 7.6 12 4.2l3.8 3.4"/>'
        )}<span>Official FPL</span></a>` +
      '</div>' +
      '<h3>Account and view</h3>' +
      `<p class="mwho">Team <b>${who}</b></p>` +
      '<div class="mgrid">' +
        actionBtn('theme',   'Dark mode',   '<path d="M20 14.4A8.4 8.4 0 0 1 9.6 4 8.4 8.4 0 1 0 20 14.4z"/>') +
        actionBtn('reload',  'Reload data',  '<path d="M20 5.6v5h-5"/><path d="M19.3 14a7.6 7.6 0 1 1-1.5-7"/>') +
        /* The only way back from the mobile view to the desktop one. It
           used to be in the bar, but it does not fit in a header carrying
           a league name — and a hidden button that exists nowhere else is
           a trap. */
        actionBtn('viewmode', 'Switch view', '<path d="M4 8.4h16"/><path d="M7.6 4.8 4 8.4l3.6 3.6"/><path d="M20 15.6H4"/><path d="M16.4 12 20 15.6 16.4 19.2"/>') +
        actionBtn('logout',  'Change IDs',     '<path d="M9.6 20H5.2A1.6 1.6 0 0 1 3.6 18.4V5.6A1.6 1.6 0 0 1 5.2 4h4.4"/><path d="M15.6 16.4 20 12l-4.4-4.4"/><path d="M20 12H9.6"/>') +
      '</div>';
    syncNav();
  }

  function openSheet(){
    buildSheet();
    sheet.hidden = false;
    sheet.classList.add('theirs_');
    document.getElementById('mmore').setAttribute('aria-expanded', 'true');
  }
  function closeSheet(){
    sheet.classList.remove('theirs_');
    sheet.hidden = true;
    const m = document.getElementById('mmore');
    if(m) m.setAttribute('aria-expanded', 'false');
  }

  /* ---------- clicks ----------
     Delegated, because the sheet is rebuilt every time it opens (the team
     name changes at runtime). */
  document.addEventListener('click', ev => {
    const close = ev.target.closest('[data-mclose]');
    if(close){ closeSheet(); return; }

    const more = ev.target.closest('#mmore');
    if(more){
      sheet.classList.contains('theirs_') ? closeSheet() : openSheet();
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
      // Switching to the desktop view hides the sheet anyway; close it first.
      closeSheet();
      if(real) real.click();
    }
  });

  document.addEventListener('keydown', ev => {
    if(ev.key === 'Escape' && sheet.classList.contains('theirs_')) closeSheet();
  });

  /* ---------- highlighting the active section ----------
     Read from the real buttons, not from a variable of our own. Whenever
     selectTab is called anywhere, this simply copies the result. */
  function syncNav(){
    const open = (TABS.find(([t]) =>
      document.getElementById(t).getAttribute('aria-selected') === 'true')
      || ['t-home'])[0];

    nav.querySelectorAll('[data-tab]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.tab === open)));
    sheet.querySelectorAll('[data-tab]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.tab === open)));

    // When the open section is hidden under More, More lights up.
    const more = document.getElementById('mmore');
    if(more) more.setAttribute('aria-selected', String(REST.includes(open)));
  }

  const prevSelect = selectTab;
  selectTab = function(tid){ prevSelect(tid); syncNav(); };
  syncNav();

  /* ---------- horizontal scrollers around tables ----------
     There are dozens of templates that print a table. Instead of a
     wrapper in each of them, whatever appears in the DOM gets wrapped. */
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

  /* ---------- swiping between sections ----------
     Only between the sections visible in the bottom bar. Swiping across
     nine tabs would mean landing somewhere nobody aimed for. Horizontal
     scrollers and form fields ignore the gesture — there the finger
     obsahu, ne navigaci. */
  const SWIPE = PRIMARY;
  let sx = 0, sy = 0, live = false;

  document.addEventListener('touchstart', ev => {
    if(ev.touches.length !== 1 || sheet.classList.contains('theirs_')){ live = false; return; }
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
