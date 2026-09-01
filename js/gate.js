/* FPL Squad Check — entry screen and app state

   Both IDs are entered by the user, validated, and kept in localStorage.
   Nothing is hard-coded to one league, and nothing leaves the browser:
   there is no account, no server-side storage and no sync.

   The js/ files load as classic <script> tags in a fixed order and share
   one global scope: nothing is exported or imported, but hoisting does
   not cross file boundaries. The order is therefore part of the contract
   and is written down in index.html.
   ============================================================ */

const ENTRY_KEY = 'fpl_entry';
const LEAGUE_KEY = 'fpl_league';

/* Every write to localStorage goes through these two helpers. They used to
   notify a cloud sync layer; that layer is gone, but the indirection stays
   so a full storage quota cannot throw in the middle of a render. */
function lsSet(key, value){
  try{ localStorage.setItem(key, value); }catch(e){}
}

function lsDel(key){
  try{ localStorage.removeItem(key); }catch(e){}
}

/* ------------------------------------------------------------
   Full cleanup when switching teams.

   Without this the squad, league ownership and cached analysis from the
   previous ID stayed in memory — the new team then saw someone else's
   numbers.
   ------------------------------------------------------------ */
function resetState(){
  API_CACHE = new Map();
  // Otherwise the new team would think the league tabs are already loaded
  // and would sit looking at an empty panel.
  TAB_DONE.clear();
  if(RAIL_TIMER){ clearInterval(RAIL_TIMER); RAIL_TIMER = null; }
  const rail = $('rail'); if(rail) rail.hidden = true;
  const rk = $('railKey'); if(rk) rk.hidden = true;
  MY_SQUAD = null;
  HOME = null;
  WATCH = null;          // the watchlist is per entry ID
  HUB = null;
  NEWS_GW = null;        // or the new team would start on someone else's gameweek
  NEWS_PICKS.clear();
  NEWS_LIVE.clear();
  HALL_ALL = false;
  LEAGUE_OWN = null;
  PLAYERS = null;
  CMP_A = CMP_B = null;

  ['hmout','out','msg','lout','lmsg','hubout','hubmsg','pout','pmsg','pdetail',
   'plout','plmsg','prout','prmsg','injout','injmsg','newsout','newsmsg',
   'pcompare'].forEach(id => {
    const el = $(id);
    if(el) el.innerHTML = '';
  });
}

/* Sprite of coloured club marks. Used as a fallback when a badge is
   missing from the CDN (typically a freshly promoted club). Loaded only
   after entering the app — on the entry screen it would be useless. */
let MARKS_LOADED = false;
async function loadClubMarks(){
  if(MARKS_LOADED) return;
  MARKS_LOADED = true;
  try{
    const r = await fetch('/club-marks.svg');
    if(!r.ok) return;
    const host = document.createElement('div');
    host.hidden = true;
    host.innerHTML = await r.text();
    document.body.appendChild(host);
  }catch(e){
    // Without the sprite a missing badge simply shows nothing. Not worth
    // telling the user about.
  }
}

function enterApp(entryId, leagueId){
  resetState();
  ENTRY_ID = parseInt(entryId, 10);
  CONFIG.entryId = String(entryId);
  CONFIG.leagueId = String(leagueId);
  lsSet(ENTRY_KEY, String(entryId));
  lsSet(LEAGUE_KEY, String(leagueId));

  $('landing').hidden = true;
  $('app').hidden = false;
  // Until entry/{id}/ arrives, the ID is all we know about the team.
  // load() replaces it with the team name and initials via setWhoName().
  $('whoName').textContent = '#' + entryId;

  setBrandName(CONFIG.leagueName);

  loadClubMarks();
  /* A link like `#prices` opens what it points at — but only after the
     squad has loaded, because before that the tab has nothing to show. */
  load(entryId).then(() => { if(typeof applyHash === 'function') applyHash(); });
  window.scrollTo(0, 0);
}

/* The header always carries the name of the app, never the name of the
   league. The league name used to be there, which read as branding for one
   particular mini-league — the opposite of what a generic tool should say.
   The league is named where it belongs: in the heading of the league panels.
   It stays in the title attribute, so hovering still tells you which league
   is loaded. */
function setBrandName(name){
  const bt = $('brandTop');
  if(!bt) return;
  bt.textContent = 'FPL SQUAD CHECK';
  bt.classList.remove('long');
  bt.title = name ? 'FPL Squad Check · ' + name : 'FPL Squad Check';
}

/* ------------------------------------------------------------
   Validation

   Both IDs are required. A team ID alone would leave half the app dark
   (the league hub, awards, standings and the newsletter all need a
   league), and silently disabling those tabs turned out to be worse than
   asking for the second number up front.
   ------------------------------------------------------------ */
function gateError(msg, focusId){
  const box = $('gatemsg');
  if(box) box.textContent = msg;
  if(focusId && $(focusId)) $(focusId).focus();
}

function gateBusy(on){
  const btn = $('enter');
  if(!btn) return;
  btn.disabled = on;
  btn.textContent = on ? 'Checking…' : 'Open';
}

/* Reads the standings for the entered league, checks its size and that
   the team is a real one. Returns the league object or throws a message
   meant to be shown to the user as-is. */
async function checkLeague(leagueId){
  let st;
  try{
    st = await api('leagues-classic/' + leagueId + '/standings/');
  }catch(e){
    throw new Error('Could not load league ' + leagueId
      + '. Check the ID, or try again in a minute — the FPL API is not always available.');
  }

  if(!st || !st.league) throw new Error('League ' + leagueId + ' does not exist.');

  const results = (st.standings && st.standings.results) || [];

  /* Size cap. Every member costs one request per gameweek for picks and
     one for history, so a large league means hundreds of calls to the FPL
     API — slow for the user and a good way to get the proxy rate-limited.
     `has_next` means there is a second page, i.e. more than 50 members. */
  const more = Boolean(st.standings && st.standings.has_next);
  if(more || results.length > CONFIG.maxMembers){
    const size = more ? 'more than 50' : String(results.length);
    throw new Error('This league has ' + size + ' members. Because of how much '
      + 'the FPL API has to be queried, Squad Check can only analyse leagues of '
      + CONFIG.maxMembers + ' members or fewer.');
  }

  if(!results.length){
    throw new Error('League ' + leagueId + ' has no members yet.');
  }

  return {league: st.league, members: results};
}

/* The team need not be in the league — someone may want to watch a league
   they are not in — but it does have to exist. */
async function checkEntry(entryId, members){
  if(members.some(m => String(m.entry) === String(entryId))) return true;
  try{
    await api('entry/' + entryId + '/');
    return true;
  }catch(e){
    throw new Error('Team ' + entryId + ' does not exist. The ID is the number '
      + 'in the address of your FPL team page.');
  }
}

async function submitGate(){
  const e = $('eid').value.trim();
  const l = $('lid').value.trim();

  if(!e && !l) return gateError('Enter both your team ID and your league ID.', 'eid');
  if(!e) return gateError('Enter your team ID.', 'eid');
  if(!l) return gateError('Enter your mini-league ID.', 'lid');
  if(!/^\d+$/.test(e)) return gateError('The team ID must be a number.', 'eid');
  if(!/^\d+$/.test(l)) return gateError('The league ID must be a number.', 'lid');

  gateError('');
  gateBusy(true);
  try{
    const {league, members} = await checkLeague(l);
    await checkEntry(e, members);
    CONFIG.leagueName = league.name || '';
    enterApp(e, l);
  }catch(err){
    // A failed check must not be remembered: the next attempt has to hit
    // the API again, or the same wrong answer comes back instantly.
    dropCached(/^(leagues-classic|entry)\//);
    gateError(err.message);
  }finally{
    gateBusy(false);
  }
}

/* Restores the last used IDs, or shows the entry screen. Called from
   boot.js once every other file has defined what it needs. */
function bootstrapGate(){
  const savedEntry = localStorage.getItem(ENTRY_KEY) || '';
  const savedLeague = localStorage.getItem(LEAGUE_KEY) || '';

  $('eid').value = savedEntry;
  $('lid').value = savedLeague;

  /* Both are needed. An older build allowed a team without a league, so a
     half-filled pair can still be in storage — that goes back to the
     entry screen rather than into a half-working app. */
  if(savedEntry && savedLeague){
    CONFIG.leagueName = localStorage.getItem('fpl_league_name') || '';
    enterApp(savedEntry, savedLeague);
    // The name is refreshed from the API in the background; a league can
    // be renamed and the header should not lie about it forever.
    checkLeague(savedLeague)
      .then(({league}) => {
        CONFIG.leagueName = league.name || '';
        lsSet('fpl_league_name', CONFIG.leagueName);
        setBrandName(CONFIG.leagueName);
      })
      .catch(() => {});
    return;
  }

  $('landing').hidden = false;
  $('app').hidden = true;
}

if($('enter')) $('enter').addEventListener('click', submitGate);

['eid','lid'].forEach(id => {
  const el = $(id);
  if(!el) return;
  el.addEventListener('input', () => gateError(''));
  el.addEventListener('keydown', ev => { if(ev.key === 'Enter') submitGate(); });
});

if($('logout')) $('logout').addEventListener('click', () => {
  resetState();
  ENTRY_ID = null;
  CONFIG.entryId = '';
  CONFIG.leagueId = '';
  CONFIG.leagueName = '';

  /* The stored IDs have to go too. Otherwise a refresh would put back the
     person who has just left and the entry screen would be a dead end. */
  lsDel(ENTRY_KEY);
  lsDel(LEAGUE_KEY);
  lsDel('fpl_league_name');
  // The gameweek archive belongs to the league that was just left.
  snapClear();

  stopCountdown();
  setBrandName('');

  $('app').hidden = true;
  $('landing').hidden = false;
  gateError('');
  window.scrollTo(0, 0);
});

if($('lgo')) $('lgo').addEventListener('click', async () => {
  const lid = CONFIG.leagueId || localStorage.getItem(LEAGUE_KEY);
  if(!lid){ $('lmsg').textContent = 'No mini-league ID set.'; return; }
  $('lgo').disabled = true;
  // Standings, history and member squads — otherwise old data is redrawn.
  dropCached(/^(leagues-classic|entry)\//);
  const box = $('histbox');
  if(box) delete box.dataset.loaded;
  await loadLeague(lid);
  $('lgo').disabled = false;
});
