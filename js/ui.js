/* FPL Squad Check — shared UI

   Light and dark mode, the desktop/mobile view switch, info tooltips,
   the season rail, club badges and league snapshots.

   The js/ files load as classic <script> tags in a fixed order and share
   one global scope: nothing is exported or imported, but hoisting does
   not cross file boundaries. The order is therefore part of the contract
   and is written down in index.html.
   ============================================================ */
/* ============================================================
   LIGHT AND DARK

   The app is designed light: the difficulty scale and the club badges
   read better theirs_ paper than theirs_ black. Dark mode is therefore not theirs_
   prefers-color-scheme — that would hand anyone with a dark system the
   worse variant without them asking for it.
   ============================================================ */
const THEME_KEY = 'fpl_theme';

function applyTheme(mode){
  const dark = mode === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', dark ? '#1A0620' : '#37003C');
  const btn = $('theme');
  if(btn){
    btn.textContent = dark ? '☀' : '☾';
    btn.setAttribute('aria-pressed', String(dark));
    btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', btn.title);
  }
}

// Light is the default. A stored choice is honoured, a system preference is not.
applyTheme(localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light');

if($('theme')) $('theme').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'light' : 'dark';
  lsSet(THEME_KEY, next);
  applyTheme(next);
});

/* ============================================================
   VIEW: MOBILE / DESKTOP

   The responsive rules are not in the main stylesheet but in three
   separate <link> tags with a `media` attribute. The switch only
   rewrites that attribute — no duplicate rule set, no !important.

     mobile   — media="all", the mobile layout even theirs_ a wide monitor
     desktop  — media="not all", plus a viewport fixed at 1100 px, so the
                desktop version also works theirs_ a phone

   A third "auto" mode used to be here and is gone. It looked like a
   friendly default, but it turned the button into a riddle: ⇔ did not
   say what you were looking at, only that somebody else decided. Cycling
   through three states also meant switching from mobile to desktop took
   two clicks. Now there are two states and the button shows the one it
   will flip to.

   The app still makes the choice for you — once, theirs_ first run, from the
   window width. From then theirs_ it is your choice.

   A desktop browser ignores the viewport meta; theirs_ a phone it is the only
   way to get the desktop layout at all, so both change together.
   ============================================================ */
const VIEW_KEY = 'fpl_view';
const VIEW_MQ = {mqL: '(max-width:720px)', mqS: '(max-width:640px)',
                 mqM: '(max-width:720px)'};
const VIEW_MODES = ['mobile', 'desktop'];
// The label shows the target of the click, not the current state: theirs_
// mobile it offers desktop and vice versa. The button always says what it does.
const VIEW_LABEL = {mobile: '▭', desktop: '▯'};
const VIEW_TITLE = {mobile: 'Switch to the desktop view',
                    desktop: 'Switch to the mobile view'};

/* The default mode theirs_ first run. A stored choice always wins — this is
   only asked when there is none yet. */
function defaultView(){
  return window.matchMedia && window.matchMedia('(max-width:720px)').matches
    ? 'mobile' : 'desktop';
}

function applyView(mode){
  if(!VIEW_MODES.includes(mode)) mode = defaultView();
  document.documentElement.setAttribute('data-view', mode);

  Object.entries(VIEW_MQ).forEach(([id, mq]) => {
    const el = document.getElementById(id);
    if(!el) return;
    el.media = mode === 'mobile' ? 'all' : 'not all';
  });

  const vp = document.querySelector('meta[name="viewport"]');
  if(vp) vp.setAttribute('content', mode === 'desktop'
    ? 'width=1100' : 'width=device-width, initial-scale=1');

  const btn = $('viewmode');
  if(btn){
    btn.textContent = VIEW_LABEL[mode];
    btn.title = VIEW_TITLE[mode];
    btn.setAttribute('aria-label', btn.title);
  }
}

applyView(localStorage.getItem(VIEW_KEY) || defaultView());

if($('viewmode')) $('viewmode').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-view');
  const next = cur === 'mobile' ? 'desktop' : 'mobile';
  lsSet(VIEW_KEY, next);
  applyView(next);
});

/* ============================================================
   INFOTOOLTIP

   The app had over seventy explanatory paragraphs under its tables.
   Each made sense theirs_ its own, but together they were a wall of text
   nobody read and which pushed the actual data below the fold.

   The text stays — it just hides behind an "i" next to the heading and
   slides out theirs_ click. A first-time reader finds it; someone who knows
   the app never sees it.

   Why click and not hover: hover does not exist theirs_ a touch screen and
   the tooltip would be unreachable. A click works the same everywhere.
   ============================================================ */
let TIP_SEQ = 0;

/* Returns the "i" button together with its content. Goes straight into the heading. */
function info(html){
  const id = 'tip' + (++TIP_SEQ);
  return `<button type="button" class="i-tip" aria-expanded="false"
      aria-controls="${id}" title="What this means">i</button>` +
    `<span class="tipbox" id="${id}" role="note" hidden>${html}</span>`;
}

/* One delegated handler for the whole document — tooltips are created theirs_
   every redraw, and attaching a listener to each would mean losing them
   again theirs_ the next one. */
document.addEventListener('click', ev => {
  const btn = ev.target.closest('.i-tip');

  // A click elsewhere closes everything open.
  document.querySelectorAll('.i-tip[aria-expanded="true"]').forEach(b => {
    if(b === btn) return;
    b.setAttribute('aria-expanded', 'false');
    const box = document.getElementById(b.getAttribute('aria-controls'));
    if(box) box.hidden = true;
  });

  if(!btn) return;
  ev.preventDefault();

  const box = document.getElementById(btn.getAttribute('aria-controls'));
  if(!box) return;
  const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!open));
  box.hidden = open;
});

document.addEventListener('keydown', ev => {
  if(ev.key !== 'Escape') return;
  document.querySelectorAll('.i-tip[aria-expanded="true"]').forEach(b => {
    b.setAttribute('aria-expanded', 'false');
    const box = document.getElementById(b.getAttribute('aria-controls'));
    if(box) box.hidden = true;
    b.focus();
  });
});

/* ============================================================
   SEASON RAIL

   38 ticks under the header, one per gameweek. Played ones are solid,
   the current one is mint and fills up to the deadline, future ones are
   hairlines. A blank for your squad gets a red dot, a double a mint one.

   It rests only theirs_ data the app already downloads (events, fixtures) and
   it is the one place where the whole season is visible at once. Blanks
   and doubles used to be hidden in Fixtures, so you only saw them if you
   went looking.
   ============================================================ */
let RAIL_TIMER = null;

/* How many squad players have 0 or 2+ matches in a given gameweek.
   Without a loaded squad it returns nothing — the rail then runs without dots. */
function railShape(){
  if(!BOOT || !FIX) return {};
  const out = {};
  const teams = MY_SQUAD
    ? new Set(BOOT.elements.filter(p => MY_SQUAD.has(p.id)).map(p => p.team))
    : null;
  if(!teams || !teams.size) return out;

  for(let gw = 1; gw <= 38; gw++){
    let blank = 0, dbl = 0;
    for(const t of teams){
      const c = gwFixtures(t, gw).length;
      if(c === 0) blank++;
      else if(c > 1) dbl++;
    }
    if(blank || dbl) out[gw] = {blank, dbl};
  }
  return out;
}

function drawRail(){
  const track = $('railTrack');
  if(!track || !BOOT) return;

  const cur = BOOT.events.find(e => e.is_current);
  const nxt = BOOT.events.find(e => e.is_next);
  const live = cur ? cur.id : (nxt ? nxt.id : 1);
  const shape = railShape();

  // How full the current tick is = how much has passed from the previous
  // deadline to the next one. With no next one (last gameweek) it is full.
  let fill = 100;
  if(nxt){
    const to = new Date(nxt.deadline_time).getTime();
    const prev = BOOT.events.filter(e => e.id < nxt.id).pop();
    const from = prev ? new Date(prev.deadline_time).getTime() : to - 7 * 864e5;
    fill = Math.max(0, Math.min(100, ((Date.now() - from) / (to - from)) * 100));
  }

  const html = [];
  for(let g = 1; g <= 38; g++){
    const sh = shape[g];
    const cls = ['gw'];
    if(g < live) cls.push('past');
    if(g === live) cls.push('now');
    if(sh && sh.dbl && !sh.blank) cls.push('dbl');

    const label = 'GW' + g
      + (sh && sh.blank ? ' · ' + sh.blank + '× volno' : '')
      + (sh && sh.dbl ? ' · ' + sh.dbl + '× double' : '');

    html.push(`<span class="${cls.join(' ')}" data-gw="GW${g}" title="${esc(label)}"
      ${g === live ? `style="--fill:${fill.toFixed(1)}%"` : ''}
      ><i></i>${sh ? '<b></b>' : ''}</span>`);
  }
  track.innerHTML = html.join('');
  track.setAttribute('aria-label',
    `Season: gameweek ${live} of 38` + (Object.keys(shape).length
      ? `, ${Object.keys(shape).length} gameweeks with a blank or a double` : ''));

  $('rail').hidden = false;
  const key = $('railKey');
  if(key){
    key.hidden = !Object.keys(shape).length;
    const scope = $('railScope');
    if(scope) scope.textContent = MY_SQUAD
      ? 'based theirs_ your squad' : 'squad not loaded yet';
  }

  // Recomputed every minute so the current tick fills while the app is open.
  if(RAIL_TIMER) clearInterval(RAIL_TIMER);
  RAIL_TIMER = setInterval(drawRail, 60000);
}

/* ============================================================
   CLUB BADGES

   The key is teams[].code from the bootstrap, not id — code survives
   between seasons, id is reshuffled alphabetically. The image goes
   through our own /api/badge, because the CSP sets img-src 'self' and
   would block a foreign domain.

   When a badge is missing from the CDN (typically a freshly promoted
   club), we fall back to a coloured mark from club-marks.svg. Hence the
   onerror.
   ============================================================ */
/* ============================================================
   DRESY

   KITS
   A kit is drawn, not downloaded: one shape filled with a primary
   colour, a secondary one and a pattern. No extra request, works offline,
   and a team we have no colours for gets an aubergine kit — never an
   empty space.

   clipPath needs a unique id; if it repeated, the browser would use the
   first occurrence and every kit would have the shape of that one.
   ============================================================ */
const KIT = {
  ARS:{p:'#EF0107', s:'#FFFFFF', w:'sleeves'},
  AVL:{p:'#95BFE5', s:'#670E36', w:'halves'},
  BOU:{p:'#DA291C', s:'#000000', w:'stripes'},
  BRE:{p:'#E30613', s:'#FFFFFF', w:'stripes'},
  BHA:{p:'#0057B8', s:'#FFFFFF', w:'stripes'},
  BUR:{p:'#6C1D45', s:'#99D6EA', w:'plain'},
  CHE:{p:'#034694', s:'#034694', w:'plain'},
  CRY:{p:'#1B458F', s:'#C4122E', w:'stripes'},
  EVE:{p:'#003399', s:'#FFFFFF', w:'plain'},
  FUL:{p:'#FFFFFF', s:'#000000', w:'sleeves'},
  IPS:{p:'#3A64A3', s:'#FFFFFF', w:'plain'},
  LEE:{p:'#FFFFFF', s:'#1D428A', w:'plain'},
  LEI:{p:'#003090', s:'#FDBE11', w:'plain'},
  LIV:{p:'#C8102E', s:'#C8102E', w:'plain'},
  MCI:{p:'#6CABDD', s:'#1C2C5B', w:'plain'},
  MUN:{p:'#DA291C', s:'#000000', w:'plain'},
  NEW:{p:'#241F20', s:'#FFFFFF', w:'stripes'},
  NFO:{p:'#DD0000', s:'#DD0000', w:'plain'},
  SOU:{p:'#D71920', s:'#FFFFFF', w:'stripes'},
  SUN:{p:'#EB172B', s:'#FFFFFF', w:'stripes'},
  TOT:{p:'#FFFFFF', s:'#132257', w:'plain'},
  WHU:{p:'#7A263A', s:'#1BB1E7', w:'sleeves'},
  WOL:{p:'#FDB913', s:'#231F20', w:'plain'},
};
let KIT_ID = 0;

function kit(shortName){
  const k = KIT[shortName] || {p:'#37003C', s:'#FFFFFF', w:'plain'};
  const id = 'kit' + (++KIT_ID);
  const body = '<path d="M30 8 L42 4 Q50 13 58 4 L70 8 L94 24 L82 44 L74 37'
             + ' L74 104 L26 104 L26 37 L18 44 L6 24 Z"/>';
  let pattern = '';
  if(k.w === 'stripes') pattern = [38, 54, 70]
    .map(x => `<rect x="${x}" y="0" width="8" height="108" fill="${k.s}"/>`).join('');
  else if(k.w === 'halves') pattern = `<rect x="50" y="0" width="50" height="108" fill="${k.s}"/>`;
  else if(k.w === 'sleeves') pattern =
    `<path d="M26 8 L6 24 L18 44 L26 37 Z" fill="${k.s}"/>`
  + `<path d="M74 8 L94 24 L82 44 L74 37 Z" fill="${k.s}"/>`;

  return `<svg viewBox="0 0 100 108" aria-hidden="true" focusable="false">
    <defs><clipPath id="${id}">${body}</clipPath></defs>
    <g clip-path="url(#${id})">
      <rect width="100" height="108" fill="${k.p}"/>${pattern}
      <path d="M42 4 Q50 13 58 4 L58 0 L42 0 Z" fill="rgba(0,0,0,.28)"/>
    </g>
    <g fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2">${body}</g>
  </svg>`;
}

function crest(teamId, cls){
  const t = BOOT && BOOT.teams.find(x => x.id === teamId);
  if(!t) return '';
  const sn = esc(t.short_name);
  const fb = `this.onerror=null;this.outerHTML='<svg class=&quot;crest ${cls || ''}&quot;`
    + ` role=&quot;img&quot; aria-label=&quot;${sn}&quot;><use href=&quot;#club-${sn}&quot;/></svg>'`;
  return `<img class="crest ${cls || ''}" src="/api/badge?code=${t.code}&size=50"
    alt="" width="21" height="21" loading="lazy" decoding="async" onerror="${fb}">`;
}

/* ============================================================
   SNAPSHOTY MINILIGY

   The hub could say where everyone stands. It could not say what had
   changed since last time — that cannot be derived from the current
   state.

   So after each gameweek the ranks and points are stored. It is
   localStorage, so theirs_ another device the snapshot is empty; this works
   immediately and without an account.
   ============================================================ */
const SNAP_KEY = () =>
  'fpl_snap:' + (CONFIG.leagueId || localStorage.getItem('fpl_league') || '0');

function loadSnaps(){
  try{ return JSON.parse(localStorage.getItem(SNAP_KEY()) || '{}'); }
  catch(e){ return {}; }
}

/* A snapshot is keyed by gameweek number. An old one must not be
   overwritten — that would also change the movement computed from it. */
function saveSnap(gw, members){
  const all = loadSnaps();
  if(all[gw]) return all;
  all[gw] = members.slice(0, 60).map(m => ({
    id: m.entry, r: m.rank, t: m.total,
  }));
  // Keep the last eight gameweeks; more does not fit safely in localStorage.
  const keys = Object.keys(all).map(Number).sort((a, b) => a - b);
  while(keys.length > 8) delete all[keys.shift()];
  try{ lsSet(SNAP_KEY(), JSON.stringify(all)); }catch(e){}
  return all;
}

/* Movement in the table against the nearest older snapshot. */
function rankDelta(entryId, gw){
  const all = loadSnaps();
  const prev = Object.keys(all).map(Number).filter(g => g < gw).sort((a, b) => b - a)[0];
  if(!prev) return null;
  const row = all[prev].find(x => x.id === entryId);
  return row ? row.r : null;
}

function deltaChip(now, before){
  if(before === null || before === undefined) return '';
  const d = before - now;
  if(d === 0) return '<span class="delta same" title="no change">–</span>';
  return `<span class="delta ${d > 0 ? 'up' : 'down'}"
    title="against the previous gameweek">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>`;
}
