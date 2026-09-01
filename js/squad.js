/* FPL Squad Check — a rival's squad in a modal

   One modal for the whole app. Wherever a manager's name appears in a
   list, it can be clicked to show the team they fielded — without leaving
   the tab and without loading the league a second time.

   Why a custom modal and not <dialog>: the app also runs in older WebViews
   in PWA mode, where `showModal()` is missing or behaves differently from
   desktop. An overlay with its own scrim is a few lines and behaves the
   same everywhere; on mobile it also becomes a bottom sheet with a single
   rule in mobile.css, without touching the markup.

   Data is fetched lazily: the picks (`entry/{id}/event/{gw}/picks/`) and
   the gameweek points (`event/{gw}/live/`) are downloaded on open. For
   finished gameweeks they stay cached forever, for a live one they are
   refetched after a minute — otherwise the modal would show points that
   had gone stale.

   The js/ files load as classic <script> tags in a fixed order and share
   one global scope; the order is written down in index.html.
   ============================================================ */

const SQ_POS = {1: 'Goalkeeper', 2: 'Defence', 3: 'Midfield', 4: 'Attack'};
const SQ_POS_SHORT = {1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD'};

/* Chips have technical names in the data; people know different ones. */
const SQ_CHIPS = {
  bboost: 'Bench Boost', '3xc': 'Triple Captain',
  freehit: 'Free Hit', wildcard: 'Wildcard', manager: 'Manager',
};

let SQ_LIVE = null;      // {gw, pts, mins, ts} — gameweek points, see sqLive()
let SQ_FOCUS = null;     // the element focus returns to after closing
let SQ_SEQ = 0;          // open order: an older response must not overwrite a newer one

/* Gameweek points. A finished gameweek stays in the app's normal cache, a
   live one does not: after a minute it is worth asking again, which is
   exactly the point here. */
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

/* One lineup row. The captain multiplier is shown next to the points, not
   the name — "12 (×2)" says straight away where the number came from. */
function sqRow(pick, live, lavicka, ef){
  const p = sqPlayer(pick.element);
  const name_ = p ? p.web_name : 'Unknown player';
  const pos = p ? SQ_POS_SHORT[p.element_type] : '';
  const raw = live.pts.get(pick.element) || 0;
  const mult = ef ? ef.mult : (pick.multiplier > 0 ? pick.multiplier : 0);
  const min = live.mins.get(pick.element) || 0;

  const znak = (ef ? ef.captain : pick.is_captain)
      ? '<i class="cap" title="Captain">C</i>'
    : pick.is_vice_captain ? '<i class="cap vc" title="Vice captain">V</i>'
    : '';
  const sub = ef && ef.subbedIn ? '<i class="sub" title="Came on as an autosub">↑</i>'
            : ef && ef.subbedOut ? '<i class="sub out" title="Substituted out">↓</i>' : '';

  return `<div class="sqp${lavicka ? ' bench' : ''}${min ? '' : ' idle'}">
    <i class="pos">${pos}</i>
    <b>${esc(name_)}${znak}${sub}</b>
    <em>${esc(sqTeam(p))}</em>
    <span class="pts">${lavicka ? raw : raw * (mult || 1)}${
      mult > 1 ? `<u>×${mult}</u>` : ''}</span>
  </div>`;
}

function sqBody(pk, live, gw){
  const picks = (pk.picks || []).slice().sort((a, b) => a.position - b.position);

  /* The effective lineup: anyone brought on by an autosub belongs among
     the players, not on the bench — and the total has to match FPL. */
  const L = resolveLineup(pk, live.stats, gw);
  const ef = new Map(L.rows.map(r => [r.element, r]));
  const playing = x => (ef.get(x.element) || {}).mult > 0;

  const starters = picks.filter(playing);
  const benched = picks.filter(x => !playing(x));

  const cost = L.cost;
  const body = L.total;
  const nehralo = L.toPlay;
  const chip = pk.active_chip ? (SQ_CHIPS[pk.active_chip] || pk.active_chip) : null;

  /* The starting XI is split into lines. Without that it is fifteen rows
     in a row and you cannot even see the formation. */
  const lines = [1, 2, 3, 4].map(t => {
    const v = starters.filter(x => {
      const p = sqPlayer(x.element);
      return p && p.element_type === t;
    });
    return v.length ? `<div class="sqline"><h5>${SQ_POS[t]}</h5>
      ${v.map(x => sqRow(x, live, false, ef.get(x.element))).join('')}</div>` : '';
  }).join('');

  return `<div class="sqsum">
      <div class="big">${body}<span>pts in GW${gw}</span></div>
      <div class="meta">
        ${chip ? `<span class="livetag ok">${esc(chip)}</span>` : ''}
        ${cost ? `<span class="livetag wn">−${cost} for transfers</span>` : ''}
        <span class="livetag">${nehralo ? nehralo + ' of the XI yet to play'
          : 'XI complete'}</span>
      </div>
    </div>
    ${lines}
    <div class="sqline"><h5>Bench</h5>${benched.map(x => sqRow(x, live, true, ef.get(x.element))).join('')}</div>
    ${sqDiff(picks, live, ef)}
    <p class="note">Points are provisional until FPL finalises bonus. The
      total includes automatic substitutions (the arrow next to a name) and
      the armband moving to the vice captain. Bench numbers are not counted
      — unless Bench Boost is active, where the whole squad plays.</p>`;
}

/* Difference against my squad.

   This is the main question when looking at a rival: who do they have
   that I do not. Without it you have to compare two lineups by eye, which
   with fifteen names nobody does. Our own squad comes from `MY_SQUAD`,
   filled when the squad loads; without it the section is simply skipped.

   The whole squad counts, not just the XI: a benched player is still a
   difference between two teams, he just does not score right now. */
function sqDiff(picks, live, ef){
  if(!MY_SQUAD || !MY_SQUAD.size) return '';

  const jeho = picks.map(x => x.element);
  const navic = jeho.filter(id => !MY_SQUAD.has(id));
  const missing = [...MY_SQUAD].filter(id => !jeho.includes(id));
  if(!navic.length && !missing.length){
    return '<div class="sqline"><h5>Difference against your squad</h5>' +
      '<p class="note">You have exactly the same fifteen players.</p></div>';
  }

  const chip = (id, znak) => {
    const p = sqPlayer(id);
    const b = live.pts.get(id);
    const r = ef && ef.get(id);
    return `<span class="sqdiff ${znak}">${znak === 'plus' ? '+' : '−'}
      ${esc(p ? p.web_name : '?')}<u>${b == null ? '–' : (r ? r.pts : b)}</u></span>`;
  };

  return `<div class="sqline"><h5>Difference against your squad</h5>
    <div class="sqdiffs">
      ${navic.map(id => chip(id, 'plus')).join('')}
      ${chibiChips(missing, live)}
    </div>
    <p class="note">On the left the players they have and you do not; on
      the right the other way round. The number is this gameweek's points.</p>
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
    // One history entry per open; switching to the comparison adds none.
    try{ history.pushState({sq: 1}, ''); SQ_HIST = true; }catch(e){}
  }
  const closeList = m.querySelector('.x');
  if(closeList) closeList.focus();
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

async function openSquad(entry, gw, name_, teamName){
  const m = $('sqmodal');
  if(!m) return;
  const mine = ++SQ_SEQ;

  SQ_FOCUS = document.activeElement;
  $('sqmTitle').innerHTML = `${esc(name_ || 'Sestava')}
    <span>${esc(teamName || '')}${teamName ? ' · ' : ''}GW${gw}
      · <a href="https://fantasy.premierleague.com/entry/${entry}/event/${gw}"
           target="_blank" rel="noopener noreferrer">team on FPL ↗</a>
      ${ENTRY_ID && entry !== ENTRY_ID
        ? `· <button type="button" class="linklike" data-compare="${entry}"
             data-cmpgw="${gw}">compare with my squad</button>` : ''}</span>`;
  $('sqmBody').innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';
  sqShow(m);

  try{
    const [pk, live] = await Promise.all([
      cached('entry/' + entry + '/event/' + gw + '/picks/'),
      sqLive(gw),
    ]);
    if(mine !== SQ_SEQ) return;   // another squad was opened in the meantime
    $('sqmBody').innerHTML = sqBody(pk, live, gw);
  }catch(e){
    if(mine !== SQ_SEQ) return;
    /* The commonest case is not an outage but a gameweek before its
       deadline: the picks do not exist yet and FPL returns an error. Say
       so directly. */
    $('sqmBody').innerHTML = `<p class="note">The squad for GW${gw} could not be
      loaded. Before the deadline it is not public — it appears once the
      gameweek starts.</p>`;
  }
}

/* ------------------------------------------------------------
   Two squads side by side

   The difference list says who is different. This says what that
   difference did to the points — two columns, the same order of lines,
   totals at the bottom.
   ------------------------------------------------------------ */
function sqColumn(pk, live, gw, labelOf){
  const L = resolveLineup(pk, live.stats, gw);
  const ef = new Map(L.rows.map(r => [r.element, r]));
  const picks = (pk.picks || []).slice().sort((a, b) => a.position - b.position);
  const playing = x => (ef.get(x.element) || {}).mult > 0;

  const lines = [1, 2, 3, 4].map(t => {
    const v = picks.filter(x => playing(x) && sqPlayer(x.element)
      && sqPlayer(x.element).element_type === t);
    return v.map(x => sqRow(x, live, false, ef.get(x.element))).join('');
  }).join('');

  return `<div class="sqcol">
    <h5>${esc(labelOf)}</h5>
    <div class="big">${L.total}<span>pts</span></div>
    ${lines}
    <div class="sqline"><h5>Bench</h5>
      ${picks.filter(x => !playing(x)).map(x => sqRow(x, live, true, ef.get(x.element))).join('')}
    </div>
  </div>`;
}

async function openCompare(entry, gw, name_){
  const m = $('sqmodal');
  if(!m || !ENTRY_ID) return;
  const mine = ++SQ_SEQ;

  $('sqmTitle').innerHTML = `Squad comparison
    <span>you vs ${esc(name_ || 'rival')} · GW${gw}</span>`;
  $('sqmBody').innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';

  try{
    const [minePicks, rivalPicks, live] = await Promise.all([
      cached('entry/' + ENTRY_ID + '/event/' + gw + '/picks/'),
      cached('entry/' + entry + '/event/' + gw + '/picks/'),
      sqLive(gw),
    ]);
    if(mine !== SQ_SEQ) return;
    $('sqmBody').innerHTML = `<div class="sqcmp">
        ${sqColumn(minePicks, live, gw, 'Your squad')}
        ${sqColumn(rivalPicks, live, gw, name_ || 'Rival')}
      </div>
      <p class="note">You on the left, your rival on the right. The totals
        are after autosubs and any armband move, so they match FPL.</p>`;
  }catch(e){
    if(mine !== SQ_SEQ) return;
    $('sqmBody').innerHTML = '<p class="note">The squads could not be loaded.</p>';
  }
}

/* ------------------------------------------------------------
   Focus and the Back button

   A modal without a focus trap is only visually modal: Tab walks out of
   it under the scrim, where nothing can be clicked. And on Android, Back
   is the first thing anyone reaches for with a bottom sheet — unhandled,
   it closes the whole PWA.
   ------------------------------------------------------------ */
let SQ_HIST = false;   // did we push a history entry for the modal?

function sqTrap(ev){
  const m = $('sqmodal');
  if(!m || m.hidden || ev.key !== 'Tab') return;
  const prvky = [...m.querySelectorAll(
    'button, a[href], input, [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null);
  if(!prvky.length) return;
  const first_ = prvky[0], lastPlace = prvky[prvky.length - 1];

  if(ev.shiftKey && document.activeElement === first_){
    ev.preventDefault(); lastPlace.focus();
  }else if(!ev.shiftKey && document.activeElement === lastPlace){
    ev.preventDefault(); first_.focus();
  }
}
document.addEventListener('keydown', sqTrap);

window.addEventListener('popstate', () => {
  // Back closes the modal, not the app. Closing it ourselves pops the entry.
  const m = $('sqmodal');
  if(m && !m.hidden){ SQ_HIST = false; sqClose(); }
});

/* A single listener for the whole app. A button only needs attributes:
   data-squad = entry ID, data-sqgw = gameweek, data-sqname / data-sqteam
   for the modal header. */
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

/* Markup for a clickable name. In one place, so the same button does not
   have to be written in every table that lists managers. */
function squadBtn(entry, gw, name_, teamName, cls){
  if(!entry || !gw) return esc(name_);
  return `<button type="button" class="sqbtn${cls ? ' ' + cls : ''}"
    data-squad="${entry}" data-sqgw="${gw}" data-sqname="${esc(name_)}"
    data-sqteam="${esc(teamName || '')}">${esc(name_)}</button>`;
}
