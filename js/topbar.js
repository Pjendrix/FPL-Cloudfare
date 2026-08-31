/* FPL Squad Check — top bar (desktop)

   A row of nine tabs under the header was not navigation, it was a list.
   This turns it into five daily sections, a "More" button right behind
   them and a search that jumps anywhere. Together it saves three strips
   of chrome: tabs, data status and the season rail fit into one.

   Same principle as the mobile shell: THIS FILE HOLDS NO STATE. The
   segment and the menu only click the real buttons in `.nav` and copy
   their `aria-selected`. If they kept their own idea of "which tab is
   open", they would drift from the rest of the navigation as soon as
   someone switched views or opened a link like `#prices`.

   Must load after core.js (it reads TABS and wraps selectTab) and before
   boot.js.
   ============================================================ */
(function topBar(){
  /* The five sections opened daily. The rest goes into the menu — not
     because they matter less, but because they are opened once a
     gameweek, which does not pay for a permanent place in the bar. */
  const PRIMARY = ['t-home', 't-squad', 't-hub', 't-prices', 't-plan'];
  const LABELS = {'t-home': 'Home', 't-squad': 'Squad', 't-hub': 'League hub',
                 't-prices': 'Prices', 't-plan': 'Fixtures'};

  const host = document.getElementById('topnav');
  if(!host) return;

  const REST = TABS.map(([t]) => t).filter(t => !PRIMARY.includes(t));
  const labelOf = tid => (document.getElementById(tid) || {}).textContent || tid;

  /* ---------- segment ---------- */
  host.innerHTML = `
    <div class="seg" role="tablist" aria-label="Main sections">
      ${PRIMARY.map(tid => `<button type="button" role="tab" data-top="${tid}"
        aria-selected="false">${esc(LABELS[tid] || labelOf(tid))}</button>`).join('')}
      <span class="div" aria-hidden="true"></span>
      <span class="morewrap">
        <button type="button" class="more" id="topmore" aria-expanded="false"
          aria-haspopup="menu">More <i class="chev" aria-hidden="true">▾</i></button>
        <div class="sheet" id="topsheet" role="menu" hidden></div>
      </span>
    </div>`;

  const seg = host.querySelector('.seg');
  const more = document.getElementById('topmore');
  const sheet = document.getElementById('topsheet');

  /* ---------- menu ----------
     Rebuilt theirs_ every open: the team name and which buttons are available
     change at runtime, and a frozen copy would lie. */
  function action(id, text){
    /* `hidden` is a property, not CSS: the buttons in the bar are hidden
       by style, but the app still toggles them. So read the real state,
       not whether they happen to be visible. */
    const src = document.getElementById(id);
    if(!src || src.hidden || src.disabled) return '';
    return `<button type="button" role="menuitem" data-topclick="${id}">${esc(text)}</button>`;
  }

  /* How many players in my squad are flagged. A hidden section needs a
     reason to be remembered before something sends you there. */
  function flaggedCount(){
    if(!MY_SQUAD || !BOOT) return 0;
    return (BOOT.elements || []).filter(p => MY_SQUAD.has(p.id) &&
      (p.status !== 'a' || (p.chance_of_playing_next_round !== null &&
                            p.chance_of_playing_next_round < 100))).length;
  }

  function buildSheet(){
    const n = flaggedCount();
    sheet.innerHTML =
      '<div class="lbl">More sections</div>' +
      REST.map(tid => {
        const dis = (document.getElementById(tid) || {}).disabled;
        const badge_ = tid === 't-inj' && n
          ? `<span class="badge">${n}</span>` : '';
        return `<button type="button" role="menuitem" data-top="${tid}"
          ${dis ? 'disabled' : ''}>${esc(labelOf(tid))}${badge_}</button>`;
      }).join('') +
      '<hr>' +
      action('reload', 'Refresh data') +
      action('theme', document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'Light mode' : 'Dark mode') +
      action('viewmode', 'Switch view') +
      action('logout', 'Change IDs');
  }

  function openSheet(){
    buildSheet();
    sheet.hidden = false;
    more.setAttribute('aria-expanded', 'true');
    const first_ = sheet.querySelector('button:not([disabled])');
    if(first_) first_.focus();
  }
  function closeSheet(returnFocus){
    if(sheet.hidden) return;
    sheet.hidden = true;
    more.setAttribute('aria-expanded', 'false');
    if(returnFocus) more.focus();
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

    // Arrow keys inside the open menu; otherwise the first Tab leaves it.
    if(!sheet.hidden && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')){
      const polozky = [...sheet.querySelectorAll('button:not([disabled])')];
      const i = polozky.indexOf(document.activeElement);
      const dalsi = polozky[(i + (ev.key === 'ArrowDown' ? 1 : -1) + polozky.length)
        % polozky.length];
      if(dalsi){ ev.preventDefault(); dalsi.focus(); }
    }
  });

  /* ---------- status chip ----------
     Live points during a gameweek, otherwise the deadline countdown. It
     is the same information the status bar carries — theirs_ a wide display
     once is enough, and here it is closer to what people came for. */
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
      chip.title = 'The gameweek is live; bonus is added after the last match';
    }else if(cur && faze === 'unchecked'){
      chip.className = 'state wait';
      chip.innerHTML = `<i class="dot" aria-hidden="true"></i>GW${cur.id}
        <span class="sep" aria-hidden="true">·</span><b>bonusy</b>`;
      chip.title = 'Matches are over, FPL has not confirmed bonus points yet';
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
      chip.textContent = 'off season';
    }
    chip.hidden = false;
  }
  window.drawChip = drawChip;
  setInterval(drawChip, 30000);

  /* ---------- search ----------
     Sections and league managers. Players are deliberately absent: the
     app has nowhere to open them, so the entry would promise something
     it cannot deliver. */
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
      const t = (LABELS[tid] || labelOf(tid)).trim();
      if(!q || t.toLowerCase().includes(q)) out.push({typ: 'Sekce', text: t, tid});
    }

    if(q && typeof HUB !== 'undefined' && HUB && HUB.members){
      for(const m of HUB.members){
        if(!(m.player_name + ' ' + m.entry_name).toLowerCase().includes(q)) continue;
        out.push({typ: 'Manager', text: m.player_name, sub: m.entry_name,
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
          class="${i === PAL_I ? 'theirs_' : ''}"><span class="t">${esc(it.text)}</span>
          ${it.sub ? `<span class="s">${esc(it.sub)}</span>` : ''}
          <span class="k">${it.typ}</span></button>`).join('')
      : '<p class="empty">Nothing like that here. Try a manager name or a section name.</p>';
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

  /* ---------- highlighting the active section ----------
     When the open section lives in the menu, the "More" button takes its
     name and lights up like a tab. Without that there would be no way to
     tell where you are among the hidden sections. */
  function syncTop(){
    const open = (TABS.find(([t]) =>
      (document.getElementById(t) || {}).getAttribute &&
      document.getElementById(t).getAttribute('aria-selected') === 'true')
      || ['t-home'])[0];

    seg.querySelectorAll('[data-top]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.top === open)));

    const hidden_ = REST.includes(open);
    more.classList.toggle('active', hidden_);
    more.setAttribute('aria-selected', String(hidden_));
    more.innerHTML = (hidden_ ? esc(labelOf(open)) : 'More')
      + ' <i class="chev" aria-hidden="true">▾</i>';
  }

  const prevSelect = selectTab;
  selectTab = function(tid){ prevSelect(tid); syncTop(); };
  syncTop();
})();
