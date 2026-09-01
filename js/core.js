/* FPL Squad Check — core

   Configuration, the FPL API proxy and its cache, squad loading, tab
   switching (TABS, selectTab) and the hard refresh.
   Everything else builds on this file — it must load first.

   The js/ files load as classic <script> tags in a fixed order and share
   one global scope: nothing is exported or imported, but hoisting does
   not cross file boundaries. The order is therefore part of the contract
   and is written down in index.html.
   ============================================================ */
/* ============================================================
   CONFIGURATION

   Nothing here is hard-coded to one league. Both IDs are supplied by the
   user on the entry screen (js/gate.js) and kept in localStorage, so the
   same build works for any team and any classic mini-league.
   ============================================================ */
const CONFIG = {
  // Filled in by the entry screen. Empty until someone signs in.
  leagueId: '',
  entryId: '',

  // Shown in the header; taken from the FPL API once the league loads.
  leagueName: '',

  /* League size cap. Every extra member costs one request per gameweek
     for picks and one for history, so a big league is both slow and a
     good way to get rate-limited by FPL. Larger leagues are refused on
     the entry screen — keep this in sync with the message there. */
  maxMembers: 15,

  /* Seasons that count as "official" for the league history, and who
     played in them. Empty means every season counts for every current
     member, which is the right default for a generic build. Format:
     {'2024/25': ['Manager Name', 12345]}. */
  officialSeasons: {},

  /* Members who joined later. Seasons before the one listed count as
     "played FPL, but outside this league". Key is a name or entry ID. */
  memberSince: {},
};

const S = {a:['OK','ok'],d:['Doubtful','wn'],i:['Injured','al'],
           s:['Suspended','al'],u:['Unavailable','al'],n:['Not registered','al']};
const POS = {1:'GKP',2:'DEF',3:'MID',4:'FWD'};
const $ = id => document.getElementById(id);
// The apostrophe is in the list on purpose: today every attribute uses
// double quotes, but one exception is all it takes for a missing &#39; to be a hole.
const esc = s => String(s).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ------------------------------------------------------------
   Access to the FPL API.

   Three layers on top of plain fetch, each solving one problem:

   1. api()      — a single request, retried on 429. The FPL rate limit
                   is not a permanent error, it just says "wait".
   2. cached()   — memory for the lifetime of the page. The league table
                   and the hub hit the exact same URLs; the second time is free.
   3. pooled()   — a queue with limited concurrency. A fifty-member league
                   means a hundred requests; sent at once they end in 429.
   ------------------------------------------------------------ */

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------
   Last known response.

   The FPL API sometimes tightens its filter for hours and starts
   returning 403. Until now the app showed an empty screen and an error,
   even though data from an hour ago would have done almost as well —
   a league table does not change between gameweeks and neither do squads.

   It lives in localStorage rather than memory: an outage usually hits
   the person opening the app, not the one who already has it running.

   Not everything is stored. Live gameweek points go stale in minutes and
   old numbers presented as current are worse than an honest error, so
   only responses that hold between gameweeks are kept.
   ------------------------------------------------------------ */
const STALE_KEY = 'sc:stale:';
const STALE_TTL = 24 * 60 * 60 * 1000;   // anything older than a day is dropped

// event/N/live/ is missing on purpose — see the comment above.
const STALE_OK = [
  /^bootstrap-static\/$/,
  /^fixtures\//,
  /^leagues-classic\//,
  /^entry\/\d+\/$/,
  /^entry\/\d+\/history\/$/,
  /^entry\/\d+\/event\/\d+\/picks\/$/,
];

function staleSave(p, data){
  if(!STALE_OK.some(re => re.test(p))) return;
  try{
    localStorage.setItem(STALE_KEY + p, JSON.stringify({ t: Date.now(), d: data }));
  }catch(e){
    // A full quota is no reason to fail the request. Clear what we stored
    // earlier and it will work next time.
    staleClear();
  }
}

function staleLoad(p){
  try{
    const raw = localStorage.getItem(STALE_KEY + p);
    if(!raw) return null;
    const { t, d } = JSON.parse(raw);
    if(!t || Date.now() - t > STALE_TTL){
      localStorage.removeItem(STALE_KEY + p);
      return null;
    }
    STALE_USED = Math.max(STALE_USED || 0, t);
    return d;
  }catch(e){ return null; }
}

function staleClear(){
  try{
    for(const k of Object.keys(localStorage))
      if(k.startsWith(STALE_KEY)) localStorage.removeItem(k);
  }catch(e){}
}

/* Age of the oldest data currently on screen. null = everything is fresh.
   The status bar turns this into a warning. */
let STALE_USED = null;

async function api(p, tries = 3){
  for(let attempt = 0; ; attempt++){
    let r, ct, data;
    try{
      r = await fetch('/api/fpl?path=' + encodeURIComponent(p));
      ct = r.headers.get('content-type') || '';
    }catch(e){
      // Network down. A stored response still beats a blank page.
      const backup = staleLoad(p);
      if(backup) return backup;
      throw new Error('The network is not responding — check your connection.');
    }

    if(!ct.includes('application/json')){
      const backup = staleLoad(p);
      if(backup) return backup;
      throw new Error('The edge function /api/fpl is not responding (' + r.status + '). '
        + 'Check that functions/api/fpl.js is deployed.');
    }

    data = await r.json();
    if(r.ok){ API_LAST = Date.now(); staleSave(p, data); return data; }

    /* What is worth retrying.

       Originally only 429, because that is the one status that asks for a
       retry. But the CDN in front of the FPL API also refuses under 403
       and 404, and it does so at random: the same request a second later
       goes through. One such blip in one of eleven requests brings down a
       whole gameweek, because prices and stories need every squad at once.

       So a 404 does not mean "this does not exist" — the paths are
       whitelisted in the proxy, so a nonsensical one never gets here. It
       means "something along the way refused", indistinguishable from 403.

       The only thing not retried is a 403 from our own proxy (a path that
       is not allowed); it is recognised by a body without upstream `detail`. */
    /* A CDN block is deliberately NOT retried here, even though it is
       transient and retrying would help. The proxy already does that, in
       three stages with cookies. If the client added its own three, one
       path would mean up to nine requests to FPL — and with eleven paths
       per gameweek the app becomes a tool for getting yourself banned.
       That is exactly how the first attempt at this ended.

       So only what the proxy does not handle is retried: a request to wait
       (429) and a server error. A block is allowed to fall through to staleLoad. */
    const temporary = r.status === 429 || r.status >= 500;

    if(temporary && attempt < tries - 1){
      const hinted = Number(r.headers.get('retry-after')) || 0;
      await sleep(Math.max(hinted * 1000, 700 * Math.pow(2, attempt)));
      continue;
    }

    // Out of attempts. Before giving up, try the last known response —
    // this is the situation staleLoad exists for.
    const backup = staleLoad(p);
    if(backup) return backup;

    throw new Error((data.error || 'Chyba') + ' — ' + p + ' (' + r.status + ')');
  }
}

/* When something was last really downloaded. The status bar turns this
   into "data from 3 min ago" — without it there is no way to tell
   "nothing changed" from "the app has not asked since this morning". */
let API_LAST = null;

let API_CACHE = new Map();

function cached(p){
  if(!API_CACHE.has(p)) API_CACHE.set(p, api(p).catch(e => { API_CACHE.delete(p); throw e; }));
  return API_CACHE.get(p);
}

/* Drops everything matching a pattern from the cache.

   Without this the "Refresh" button would refresh nothing: the cache lives
   for the lifetime of the page, so the same data would come back and only
   be redrawn. After the deadline or during a gameweek that is exactly what
   nechce. */
function dropCached(re){
  for(const key of [...API_CACHE.keys()]) if(re.test(key)) API_CACHE.delete(key);
}

/* Processes a list `limit` items at a time.
   onDone(done, total) fires after each one — panels use it to show progress. */
/* How many requests run at once. It used to be five. Five concurrent
   requests from one datacentre IP is exactly the pattern that earns a
   block at FPL — and once it triggers, it also hits what used to pass.
   Two are a few hundred milliseconds slower and go through. */
async function pooled(items, fn, limit = 2, onDone = null){
  const out = new Array(items.length);
  let next = 0, done = 0;

  async function worker(){
    while(next < items.length){
      const i = next++;
      try { out[i] = await fn(items[i], i); }
      catch(e){ out[i] = null; }
      done++;
      if(onDone) onDone(done, items.length);
    }
  }

  await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
  return out;
}

/* League standings arrive 50 per page. Without this a 120-member league
   is silently cut to the first 50 and nobody finds out. */
const LEAGUE_CAP = 200;

async function fetchStandings(lid, onPage = null){
  let page = 1, all = [], st = null;

  while(true){
    const suffix = page === 1 ? '' : '?page_standings=' + page;
    const data = await cached('leagues-classic/' + lid + '/standings/' + suffix);
    if(!st) st = data;

    all = all.concat(data.standings.results);
    if(onPage) onPage(all.length);

    if(!data.standings.has_next || all.length >= LEAGUE_CAP) break;
    page++;
  }

  return {league: st.league, members: all.slice(0, LEAGUE_CAP), truncated: all.length >= LEAGUE_CAP};
}

let BOOT = null, FIX = null;
let MY_SQUAD = null;   // Set(playerId) — filled once the own squad loads
/* Points for the gameweek in progress are computed by render() from live
   data. Home needs them too, and recomputing would mean two definitions
   of the same number. */
let LAST_LIVE_TOTAL = null;
let ENTRY_ID = null;   // currently open team; keys localStorage and the cache

async function load(id){
  ENTRY_ID = parseInt(id, 10);
  $('msg').textContent = 'Loading…';
  $('out').innerHTML = '<div class="skel"><i></i><i></i><i></i><i></i><i></i></div>';
  try{
    if(!BOOT){ [BOOT, FIX] = await Promise.all([api('bootstrap-static/'), api('fixtures/')]); }
    startCountdown();
    drawRail();
    drawStatus();
    if(typeof drawChip === 'function') drawChip();

    const cur = BOOT.events.find(e => e.is_current);
    const nxt = BOOT.events.find(e => e.is_next);
    const startGw = nxt ? nxt.id : (cur ? cur.id + 1 : 1);
    const pickGw = cur ? cur.id : 1;

    const entry = await api('entry/' + id + '/');
    setWhoName(entry);

    let picks = null;
    if(cur){
      try { picks = await api('entry/' + id + '/event/' + pickGw + '/picks/'); }
      catch(e){ picks = null; }
    }

    // The points a player actually has in the gameweek in progress. While
    // the round is live this is more interesting than a projection for the
    // next one — the projection is a Sunday-evening thing.
    let live = null;
    if(cur){
      try {
        live = liveStats(await cached('event/' + pickGw + '/live/'));
      } catch(e){ live = null; }
    }

    if(picks){
      render(entry, picks, startGw, {live, gw: pickGw, finished: cur && cur.finished});
      $('msg').textContent = '';
      HOME = {entry, picks, startGw, liveTotal: LAST_LIVE_TOTAL};
      drawHome();
    } else {
      HOME = {entry, picks: null, startGw, liveTotal: null};
      drawHome();
      renderPreseason(entry, startGw);
      $('msg').innerHTML = 'Your squad is not public yet — FPL reveals it after the '
        + 'GW' + startGw + ' deadline. Showing player status across the league instead.';
    }
  }catch(e){
    $('msg').innerHTML = errBox(e.message, null, () => load(ENTRY_ID));
  }
}

/* ============================================================
   EFFECTIVE LINEUP — autosubs and the captain's armband

   FPL does not score the team a manager picked, it scores the team that
   ended up playing. If a starter does not play a single minute, a bench
   player comes in in order 12→15, as long as the formation allows it.
   And if the captain does not play, the multiplier moves to the vice
   captain.

   The app used to do none of this: the shirt view on Home, the live
   league table and gameweek awards all summed players with `multiplier > 0`
   and nothing more. After a finished gameweek that showed fewer points
   than the manager really had.
   jak dopadl.

   Hence one function and several call sites. If FPL changes the rules,
   it changes here, not in four places each rounding slightly differently.


   Vstup:
     pk    — objekt z entry/{id}/event/{gw}/picks/
     stats — Map(playerId → {minutes, total_points}) z event/{gw}/live/
     gw    — gameweek number; used to look up fixtures

   Output: {rows, total, benchTotal, toPlay, capId, subs}
   ============================================================ */

/* Has this player finished everything he had in this gameweek?

   This matters for autosubs: while his team is still playing, zero is not
   zero — it is "not yet". FPL only substitutes after the last match of the
   gameweek, so we must not do it earlier either, or players would swap
   back and forth all Saturday.

   Without fixtures (or for a player with no match) the answer is `false`:
   better not to substitute than to substitute on a guess. */
function playerDone(pid, gw){
  const el = (BOOT && BOOT.elements || []).find(p => p.id === pid);
  if(!el || !Array.isArray(FIX)) return false;
  const fs = FIX.filter(f => f.event === gw &&
    (f.team_h === el.team || f.team_a === el.team));
  if(!fs.length) return false;   // blank: nobody to sub for, but no certainty either
  return fs.every(f => f.finished || f.finished_provisional);
}

/* Is this a legal formation? FPL requires 1 goalkeeper, at least 3
   defenders and at least one forward; no more rules are needed, the rest
   follows (a fifteen-man squad leaves at least two midfielders). */
function validShape(types){
  const c = t => types.filter(x => x === t).length;
  return types.length === 11 && c(1) === 1 && c(2) >= 3 && c(4) >= 1;
}

function resolveLineup(pk, stats, gw){
  const els = Object.fromEntries((BOOT.elements || []).map(p => [p.id, p]));
  const st = id => stats && stats.get(id) || null;
  const mins = id => { const x = st(id); return x ? (x.minutes || 0) : 0; };
  const pts  = id => { const x = st(id); return x ? (x.total_points || 0) : 0; };

  const picks = (pk.picks || []).slice().sort((a, b) => a.position - b.position);
  const bench = picks.filter(x => x.position > 11);

  /* Bench Boost plays the whole squad, so there is nobody to substitute.
     It is detected from the bench multiplier rather than the chip name —
     `active_chip` is sometimes missing for other managers. */
  const bboost = pk.active_chip === 'bboost' || bench.some(x => x.multiplier > 0);

  // Effective multiplier; the pick's own value is the default.
  const mult = new Map(picks.map(x => [x.element, x.multiplier]));
  const subs = [];   // [{out, in}] — display only

  if(!bboost){
    const xi = picks.filter(x => x.position <= 11).map(x => x.element);
    const typ = id => (els[id] ? els[id].element_type : 0);
    const lavice = bench.map(x => x.element);

    for(const out of xi.slice()){
      if(mins(out) > 0 || !playerDone(out, gw)) continue;

      for(const cand of lavice){
        if(mins(cand) <= 0 || subs.some(s => s.in === cand)) continue;

        // A keeper is only replaced by a keeper; for the rest the formation decides.
        const zkus = xi.map(id => (id === out ? cand : id)).map(typ);
        if(!validShape(zkus)) continue;

        const i = xi.indexOf(out);
        xi[i] = cand;
        mult.set(cand, 1);
        mult.set(out, 0);
        subs.push({out, in: cand});
        break;
      }
    }
  }

  /* The armband. If the captain did not play and his matches are over,
     the vice captain takes over — including the triple if Triple Captain
     is active. If neither played, nobody is doubled. */
  const cptn = picks.find(x => x.is_captain);
  const vice = picks.find(x => x.is_vice_captain);
  let capId = cptn ? cptn.element : null;

  if(cptn && mins(cptn.element) === 0 && playerDone(cptn.element, gw) && vice){
    const nasobek = cptn.multiplier > 1 ? cptn.multiplier : 2;
    mult.set(cptn.element, mult.get(cptn.element) > 0 ? 1 : 0);
    if(mult.get(vice.element) > 0 || mins(vice.element) > 0){
      mult.set(vice.element, nasobek);
      capId = vice.element;
    }
  }

  const rows = picks.map(x => ({
    pick: x, element: x.element, mult: mult.get(x.element) || 0,
    raw: pts(x.element), pts: pts(x.element) * (mult.get(x.element) || 0),
    minutes: mins(x.element), played: mins(x.element) > 0,
    subbedIn: subs.some(s => s.in === x.element),
    subbedOut: subs.some(s => s.out === x.element),
    captain: x.element === capId,
  }));

  const cost = (pk.entry_history && pk.entry_history.event_transfers_cost) || 0;
  const total = rows.reduce((a, r) => a + r.pts, 0) - cost;
  const benchTotal = rows.filter(r => !r.mult).reduce((a, r) => a + r.raw, 0);
  const toPlay = rows.filter(r => r.mult > 0 && !r.played).length;

  return {rows, total, benchTotal, toPlay, capId, subs, cost, bboost};
}

/* Player → stats map from event/{gw}/live/. Every caller wants the same
   thing, so let them not each do it their own way. */
function liveStats(data){
  return new Map(((data && data.elements) || []).map(e => [e.id, e.stats || {}]));
}

function fdr(teamId, startGw, n){
  const out = [];
  for(const f of FIX){
    if(f.event === null || f.event < startGw || f.event >= startGw + n) continue;
    if(f.team_h === teamId) out.push([f.event, f.team_a, 'H', f.team_h_difficulty]);
    else if(f.team_a === teamId) out.push([f.event, f.team_h, 'A', f.team_a_difficulty]);
  }
  out.sort((a,b) => a[0]-b[0]);
  const avg = out.length ? out.reduce((s,x) => s+x[3], 0)/out.length : null;
  return {list: out, avg};
}

/* One team's fixtures in one specific gameweek.
   The length of the array is the point: 0 = blank, 2 = double. FPL never
   states this directly, it follows from the fixture list. */
function gwFixtures(teamId, gw){
  const out = [];
  for(const f of FIX){
    if(f.event !== gw) continue;
    if(f.team_h === teamId) out.push({opp: f.team_a, home: true, d: f.team_h_difficulty});
    else if(f.team_a === teamId) out.push({opp: f.team_h, home: false, d: f.team_a_difficulty});
  }
  return out;
}

/* Blanks and doubles across the league for a range of gameweeks. */
function gwShape(startGw, n){
  const out = [];
  for(let gw = startGw; gw < startGw + n; gw++){
    const blanks = [], doubles = [];
    for(const t of BOOT.teams){
      const c = gwFixtures(t.id, gw).length;
      if(c === 0) blanks.push(t);
      else if(c > 1) doubles.push(t);
    }
    out.push({gw, blanks, doubles});
  }
  return out;
}

function renderPreseason(entry, startGw){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  const flagged = BOOT.elements
    .filter(p => p.status !== 'a' || p.chance_of_playing_next_round !== null)
    .map(p => ({p, team: teams[p.team],
                chance: p.chance_of_playing_next_round === null ? 100 : p.chance_of_playing_next_round}))
    .sort((a,b) => (a.chance - b.chance) || (parseFloat(b.p.selected_by_percent) - parseFloat(a.p.selected_by_percent)));

  const fdrRows = BOOT.teams.map(t => {
    const f = fdr(t.id, startGw, 5);
    return {short: t.short_name, name: t.name, avg: f.avg, n: f.list.length,
            prog: f.list.map(x => teams[x[1]].short_name + (x[2] === 'H' ? ' (D)' : ' (V)')).join(' · ')};
  }).filter(r => r.avg !== null).sort((a,b) => a.avg - b.avg);

  $('out').innerHTML = `
    <div class="meta">
      <div><div class="k">Team</div><div class="v">${esc(entry.name)}</div></div>
      <div><div class="k">Manager</div><div class="v">${esc(entry.player_first_name + ' ' + entry.player_last_name)}</div></div>
      <div><div class="k">Next gameweek</div><div class="v">GW${startGw}</div></div>
      <div><div class="k">Flagged</div><div class="v">${flagged.length}</div></div>
    </div>

    <h2>Injuries and suspensions · whole league</h2>
    <table>
      <thead><tr>
        <th>Player</th><th class="hide-s">Team</th><th>Pos</th>
        <th class="n">Price</th><th class="n hide-s">Owned %</th>
        <th>Status</th><th class="hide-s">News</th>
      </tr></thead>
      <tbody>${flagged.map(s => `<tr>
        <td><b>${esc(s.p.web_name)}</b></td>
        <td class="hide-s">${esc(s.team.short_name)}</td>
        <td>${POS[s.p.element_type]}</td>
        <td class="n">${(s.p.now_cost/10).toFixed(1)}</td>
        <td class="n hide-s">${s.p.selected_by_percent}</td>
        <td class="st ${S[s.p.status][1]}">${S[s.p.status][0]}${s.chance < 100 ? ' ' + s.chance + '%' : ''}</td>
        <td class="hide-s" style="color:var(--mute);font-size:12.5px">${esc(s.p.news || '—')}</td>
      </tr>`).join('')}</tbody>
    </table>

    <h2>Next 5 gameweeks · easiest first</h2>
    <table>
      <thead><tr><th>Team</th><th class="n">FDR</th><th class="n">Matches</th><th>Opponents</th></tr></thead>
      <tbody>${fdrRows.map(r => `<tr>
        <td><b>${esc(r.short)}</b></td>
        <td class="n">${r.avg.toFixed(2)}</td>
        <td class="n">${r.n}</td>
        <td style="color:var(--mute);font-size:12.5px">${esc(r.prog)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

function render(entry, picks, startGw, liveCtx){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));

  MY_SQUAD = new Set(picks.picks.map(pk => pk.element));
  // Only now do we know who has a blank — the season rail gets its dots.
  drawRail();

  const live = liveCtx && liveCtx.live;
  const liveGw = liveCtx ? liveCtx.gw : null;

  /* The effective lineup after autosubs and a possible armband move.
     Without it the shirt view would show zero for a player FPL has long
     since replaced — and the gameweek total would be lower than on FPL. */
  const lineup = live ? resolveLineup(picks, live, liveGw) : null;
  const efekt = lineup
    ? new Map(lineup.rows.map(r => [r.element, r])) : null;

  const squad = picks.picks.map(pk => {
    const p = els[pk.element];
    const f = fdr(p.team, startGw, 5);

    // The points a player really has in the gameweek in progress, including
    // the captain multiplier. `played` separates a zero from "has not
    // started yet" — two completely different messages.
    const st = live ? live.get(pk.element) : null;
    const ef = efekt ? efekt.get(pk.element) : null;
    const gwPts = ef ? ef.pts : null;

    return {p, pk, team: teams[p.team], f, ef,
            // A player brought on by an autosub is playing, even if he was benched.
            starting: ef ? ef.mult > 0 : pk.position <= 11,
            st, gwPts,
            played: st ? st.minutes > 0 : false,
            chance: p.chance_of_playing_next_round === null ? 100 : p.chance_of_playing_next_round};
  });

  const rows = {1:[],2:[],3:[],4:[]};
  squad.filter(s => s.starting).forEach(s => rows[s.p.element_type].push(s));

  // The gameweek total — the number people open the app for on a Saturday.
  const liveTotal = lineup ? lineup.total : null;
  LAST_LIVE_TOTAL = liveTotal;
  if(typeof drawChip === 'function') drawChip();

  const benchTotal = lineup ? lineup.benchTotal : null;
  const toPlay = lineup ? lineup.toPlay : null;

    /* During a gameweek the shirt shows what the player actually scored.
       Next-gameweek FDR comes back once the round is over. */
  const shirt = s => {
    /* The armband follows whoever really has it: if the captain did not
       play it moved to the vice captain, and the shirt has to show that,
       or the doubled points would not match the badge. */
    const jeCap = s.ef ? s.ef.captain : s.pk.is_captain;
    const cap = jeCap ? '<span class="cap">C</span>'
              : s.pk.is_vice_captain ? '<span class="cap v">V</span>' : '';

    const foot = live
      ? (s.played
          ? `<div class="pts ${s.gwPts >= 6 ? 'hi' : s.gwPts >= 3 ? 'md' : 'lo'}">${s.gwPts}</div>`
          : '<div class="pts wait">–</div>')
      : `<div class="fd">FDR ${s.f.avg ? s.f.avg.toFixed(1) : '–'}</div><div class="mn"></div>`;

    const foot2 = live
      ? `<div class="mn${s.played ? '' : ' wait'}">${
          s.played ? s.st.minutes + '′' : 'not played yet'}</div>`
      : '';

    return `<div class="shirt ${s.p.status}${live && s.played ? ' done' : ''}${
        live && !s.played ? ' wait' : ''}">
      ${cap}
      <span class="kit">${kit(s.team.short_name)}</span>
      <div class="nm">${esc(s.p.web_name)}</div>
      <div class="tm">${esc(s.team.short_name)}</div>
      ${foot}${foot2}
    </div>`;
  };

  /* --- captain, best XI and fixture shape ---
     This is the only part of the panel that recommends anything. Everything
     else just describes state; here the app says what it would do. */

  /* The headline number is the official FPL projection (`ep_next`). The
     own model is only a second opinion and a fallback when FPL sends no
     projection — and for double gameweeks, which `ep_next` ignores because
     it is always for one match regardless of how many are played. */
  const withXp = squad.map(s => {
    const ep = epNext(s.p);
    const model = projectGw(s.p, startGw);
    const games = gwFixtures(s.p.team, startGw).length;
    return {...s, ep, model, games,
            // in a double FPL's projection covers one match, the model both
            xp: ep === null ? model : (games > 1 ? Math.max(ep, model) : ep)};
  });
  const best = bestEleven(withXp);

  /* Captain recommendations by xP and the optimal XI used to live here.

     Reason: `ep_next` arrives from FPL rounded to one decimal and for top
     players comes out practically identical, so no ranking emerges. The app
     then wrote "there is nothing to pick between them" — honest, but
     useless. Instead we show the fixtures and leave the decision to the
     user. */
  const capHtml = easiestFixtures(squad, startGw) + topPriceBlock(squad, startGw);

  // Blanks and doubles in the coming gameweeks, but only those that affect you.
  const shapeWarn = gwShape(startGw, 6).map(x => {
    const blank = x.blanks.filter(t => squad.some(s => s.p.team === t.id));
    const dbl = x.doubles.filter(t => squad.some(s => s.p.team === t.id));
    if(!blank.length && !dbl.length) return null;
    const cntB = squad.filter(s => blank.some(t => t.id === s.p.team)).length;
    const cntD = squad.filter(s => dbl.some(t => t.id === s.p.team)).length;
    return `<div class="alert ${cntB >= 4 ? 'bad' : ''}">
      <div class="top"><span class="who">GW${x.gw}</span>
        ${cntB ? `<span class="tag">${cntB} players not playing</span>` : ''}
        ${cntD ? `<span class="tag">${cntD} players play twice</span>` : ''}
      </div>
      <div class="txt">${
        cntB ? 'Blank: ' + blank.map(t => esc(t.short_name)).join(', ') + '. ' : ''}${
        cntD ? 'Double: ' + dbl.map(t => esc(t.short_name)).join(', ') + '.' : ''}</div>
    </div>`;
  }).filter(Boolean);

  const shapeHtml = shapeWarn.length
    ? `<h2>What the fixtures hold${info(`A blank means zero points from a whole
       club. If four or more of your players drop out, it is a free hit gameweek — details in the Fixtures tab.`)}</h2><div class="alerts">${shapeWarn.join('')}</div>
       `
    : '';

  const problems = squad.filter(s => s.p.status !== 'a' || s.chance < 100);
  problems.sort((a,b) => (a.starting === b.starting ? a.chance - b.chance : (a.starting ? -1 : 1)));

  const alertHtml = problems.length ? problems.map(s => `
    <div class="alert ${s.chance <= 50 ? 'bad' : ''}">
      <div class="top">
        <span class="who">${esc(s.p.web_name)}</span>
        <span class="tag">${esc(s.team.short_name)} · ${POS[s.p.element_type]}</span>
        <span class="tag">${s.starting ? 'Starting' : 'Bench'}</span>
        <span class="tag">${S[s.p.status][0]} · ${s.chance}%</span>
      </div>
      ${s.p.news ? `<div class="txt">${esc(s.p.news)}</div>` : ''}
    </div>`).join('')
    : '<div class="alert" style="border-left-color:var(--ok)"><div class="top"><span class="who">Nobody is flagged as injured or suspended.</span></div></div>';

  /* --- squad overview by position ---

     One long fifteen-row table has no structure. Splitting by position
     gives per-group totals (where the money is tied up) and, more
     importantly, room for each player's next three fixtures — the thing
     people visit other sites for. */

  computeFdrCuts(startGw, 3);

  const gwCell = f => {
    const opp = teams[f.opp];
    const label = opp ? (f.home ? opp.short_name.toUpperCase() : opp.short_name.toLowerCase()) : '?';
    return `<span class="${fdrClass(f.od)}" title="${esc(opp ? opp.name : '')} ${
      f.home ? 'home' : 'away'}">${esc(label)}<small>${f.od.toFixed(1)}</small></span>`;
  };

  const nextThree = p => {
    const out = [];
    for(let gw = startGw; gw < startGw + 3; gw++){
      const fxs = gwFixtures(p.team, gw);
      if(!fxs.length){
        out.push('<span class="blank" title="Blank — the club does not play this gameweek">–<small>bl</small></span>');
      } else {
        // Double: both abbreviations in one cell, so a gameweek stays a gameweek.
        out.push(fxs.map(f => gwCell({...f, od: ownFdr(p.team, f.opp, f.home, f.d)})).join(''));
      }
    }
    return `<span class="tick3">${out.join('')}</span>`;
  };

  const priceMove = p => {
    const d = p.cost_change_start || 0;
    if(!d) return '';
    return `<i class="mv ${d > 0 ? 'up' : 'down'}" title="Since the start of the season ${
      d > 0 ? 'up' : 'down'} by ${Math.abs(d / 10).toFixed(1)}m">${d > 0 ? '▲' : '▼'}</i>`;
  };

  const pRow = s2 => {
    const owned = parseFloat(s2.p.selected_by_percent) || 0;
    const dot = s2.p.status !== 'a' || s2.chance <= 50 ? 'bad'
              : s2.chance < 100 ? 'warn' : 'ok';

    /* Sort values go into data attributes rather than being parsed from
       the text. The cells hold "5.5▲", "8.7 %" and "–"; pulling numbers
       out of that with a regex would break silently on the first
       non-numeric state. A missing value is -1 so it sorts last. */
    return `<div class="prow${s2.starting ? '' : ' benched'}${owned < 5 ? ' diff' : ''}"
      data-cena="${s2.p.now_cost}"
      data-body="${s2.p.total_points}"
      data-forma="${parseFloat(s2.p.form) || 0}"
      data-fdr="${s2.f.avg != null ? s2.f.avg : -1}"
      data-gw="${live ? (s2.played ? s2.gwPts : -1) : -1}"
      data-own="${owned}"
      data-pos="${s2.p.element_type}"
      data-poradi="${s2.pk.position}">
      <span class="who">
        <i class="dot ${dot}" title="${esc(S[s2.p.status][0])}"></i>
        ${crest(s2.p.team, 'sm')}
        <b>${esc(s2.p.web_name)}</b>
        <em>${esc(s2.team.short_name)}</em>
        ${s2.pk.is_captain ? '<span class="badge cap">C</span>'
          : s2.pk.is_vice_captain ? '<span class="badge">V</span>' : ''}
        ${owned < 5 ? '<span class="badge dif">differential</span>' : ''}
        ${s2.chance < 100 ? `<span class="badge warn">${s2.chance}&nbsp;%</span>` : ''}
      </span>
      <span class="n" data-l="Price">${(s2.p.now_cost / 10).toFixed(1)}${priceMove(s2.p)}</span>
      <span class="n" data-l="Pts"><b>${s2.p.total_points}</b></span>
      <span class="n" data-l="Form">${s2.p.form}</span>
      <span class="n" data-l="FDR">${s2.f.avg ? s2.f.avg.toFixed(1) : '–'}</span>
      ${live ? `<span class="n gwpts" data-l="GW${liveGw}">${s2.played
        ? `<b>${s2.gwPts}</b>` : '<span class="wait">–</span>'}</span>` : ''}
      ${nextThree(s2.p)}
      <span class="n own" data-l="Owned">${owned.toFixed(1)}&nbsp;%</span>
    </div>`;
  };

  const GROUPS = [
    [1, 'Goalkeepers'], [2, 'Defenders'], [3, 'Midfielders'], [4, 'Forwards'],
  ];

  /* The header is a button in both modes. By position it sorts inside the
     groups, in Whole squad mode across all fifteen — in both cases it does
     what it promises, just over a different range.

     Direction: for FDR the smallest first makes sense (easiest fixtures),
     for everything else the largest. */
  const th = (key, label, cls) => `<span class="${cls}"
    data-sort="${key}" role="button" tabindex="0">${label}<i class="sar"></i></span>`;

  const head = `<div class="phead${live ? ' live' : ''}">
    <span>Player</span>
    ${th('cena', 'Price', 'n')}${th('body', 'Pts', 'n')}
    ${th('forma', 'Form', 'n')}${th('fdr', 'FDR', 'n')}
    ${live ? th('gw', 'GW' + liveGw, 'n') : ''}
    <span class="tickhead">GW${startGw}–${startGw + 2}</span>
    ${th('own', 'Owned', 'n')}
  </div>`;

  const groupHtml = GROUPS.map(([type, label]) => {
    const inGroup = squad.filter(x => x.p.element_type === type && x.starting);
    if(!inGroup.length) return '';
    const cost = inGroup.reduce((a2, x) => a2 + x.p.now_cost, 0) / 10;
    return `<div class="pgroup">${esc(label)}
        <span>${inGroup.length} selected · ${cost.toFixed(1)}m</span>
      </div>
      ${inGroup.map(pRow).join('')}`;
  }).join('');

  const benchList = squad.filter(x => !x.starting)
    .sort((x, y) => x.pk.position - y.pk.position);
  const benchXp = benchList.reduce((a2, x) => a2 + (x.xp || 0), 0);

  const benchHtml = benchList.length ? `<div class="pgroup bench-h">Bench
      <span>${benchList.length} players · ${benchXp.toFixed(1)} xP${
        live ? ` · ${benchTotal} pts` : ''}</span>
    </div>${benchList.map(pRow).join('')}` : '';

  /* The rows exist in the DOM once. The view switch and sorting only
     rearrange what is already there — no second render, no second copy of
     the data that could drift apart from the first. */
  const squadTable = `<div class="subnav" role="tablist" aria-label="Squad view">
      <button type="button" class="sub-btn" role="tab" data-squadview="pos"
        aria-selected="${SQUAD_VIEW === 'pos'}">By position</button>
      <button type="button" class="sub-btn" role="tab" data-squadview="all"
        aria-selected="${SQUAD_VIEW === 'all'}">Whole squad</button>
    </div>
    <div class="squadlist${live ? ' live' : ''}${
      SQUAD_VIEW === 'all' ? ' flat' : ''}" id="squadlist">
      ${head}${groupHtml}${benchHtml}
    </div>
    <div class="fdrleg">
      <span><i class="f1"></i>easy</span><span><i class="f2"></i></span>
      <span><i class="f3"></i>average</span><span><i class="f4"></i></span>
      <span><i class="f5"></i>hard</span><span><i class="blank"></i>blank</span>
      <span class="hint">CAPS = home · lower case = away · two clubs in a cell = double</span>
    </div>`;

  $('out').innerHTML = `
    <div class="meta">
      <div><div class="k">Team</div><div class="v">${esc(entry.name)}</div></div>
      <div><div class="k">Manager</div><div class="v">${esc(entry.player_first_name + ' ' + entry.player_last_name)}</div></div>
      <div><div class="k">Points</div><div class="v">${entry.summary_overall_points ?? '–'}</div></div>
      <div><div class="k">Overall rank</div><div class="v">${entry.summary_overall_rank ? entry.summary_overall_rank.toLocaleString('en-GB') : '–'}</div></div>
      <div><div class="k">Next gameweek</div><div class="v">GW${startGw}</div></div>
    </div>

    <div class="pitch">
      ${live ? `<div class="livebar${liveCtx.finished ? ' done' : ''}">
        <div class="big">${liveTotal}<span>pts in GW${liveGw}</span></div>
        <div><b>${benchTotal}</b><span>on the bench</span></div>
        <div><b>${toPlay || '–'}</b><span>yet to play</span></div>
        <div class="txt">${liveCtx.finished
          ? 'The gameweek is closed, the numbers are final.'
          : 'Live — bonus points from BPS can still change after a match.'}</div>
      </div>` : ''}
      ${[4,3,2,1].map(t => `<div class="row">${rows[t].map(shirt).join('')}</div>`).join('')}
    </div>

    ${capHtml}

    <h2>Alerts</h2>
    <div class="alerts">${alertHtml}</div>

    ${shapeHtml}

    <h2>Squad${info(`<b>By position</b> keeps players in groups with the cost of
    each group. <b>Whole squad</b> is a single list of all fifteen that can be
    sorted by clicking a column header — by price, points, form, FDR, last
    gameweek's points and ownership. A second click reverses the order.<br><br>${live
      ? `The GW${liveGw} column is the points the player really has this gameweek (already
         doubled for the captain). `
      : ''}The FDR column is an average over the next five gameweeks; the coloured strip
    beside it shows the actual opponents for three. ${strengthsReady()
      ? 'Difficulty is computed from the attacking and defensive strength of both teams and the colours are relative — '
        + 'the hardest fifth of fixtures in the window is red.'
      : strengthsUsable()
      ? 'Attacking and defensive strength are not in the data yet, so this uses <b>overall team '
        + 'strength</b> (a 1–5 scale). Home and away are still distinguished, but the numbers are '
        + 'rougher than they will be in a few gameweeks.'
      : '<b>Using the official FPL FDR</b>, because team strengths are not filled in at all '
        + 'yet.'}`)}</h2>
    
    ${squadTable}`;

  /* The view and the sort survive a squad redraw (⟳, gameweek change).
     Called after the DOM write — applySquadSort looks the rows up. */
  applySquadSort();
}

/* ------------------------------------------------------------
   A note about where a list is stored.

   Watchlists live in localStorage, which people reasonably assume means
   "saved". It does — but only in this browser. Saying so once under the list
   is cheaper than an explanation after someone loses it.
   ------------------------------------------------------------ */
function storageNote(what){
  const subject = what || 'This list';
  return `<p class="note store">${esc(subject)} is stored in this browser only.
    You will not see it on another device, and clearing your browser data
    removes it.</p>`;
}

/* A manual correction of the free transfer count.

   FPL does not send it, so it can only be derived from transfer history — and
   that is one request per team plus assumptions about chips. A wrong number is
   worse than none, so the app takes what the user tells it and otherwise says
   nothing. */
const FT_KEY = () => 'fpl_ft:' + (ENTRY_ID || '0');

function ftOverride(){
  const v = parseInt(localStorage.getItem(FT_KEY()), 10);
  return Number.isFinite(v) && v >= 0 && v <= 5 ? v : null;
}

/* ============================================================
   HOME

   The squad panel is dense: fifteen rows, fixtures, schedule, prices.
   It answers "how am I doing", but not "do I have to do something
   today?" — and that is the one question people ask every day.

   So Home shows nothing new. It only pulls out what has a deadline:
   who will not play, whose price moves tonight and what is happening
   to the players on the watchlist. Everything else stays where it was.

   The panel redraws from state the app already has (HOME), so it costs
   no extra request. When the squad is not public yet, at least the
   watchlist and the countdown show up.
   ============================================================ */
/* The name in the header.

   Until the squad loads it is the team ID (#60480) — the only thing we
   know at that point. As soon as entry/{id}/ arrives it becomes the team
   name plus the manager's initials: "Prague Patriots (KB)".

   In a narrow header the text is clipped with text-overflow; the initials
   therefore live in their own element that does not shrink — when things
   do not fit, the end of the name goes first, not whose team it is. */
function initials(entry){
  return [entry.player_first_name, entry.player_last_name]
    .map(x => (x || '').trim()[0] || '')
    .join('')
    .toUpperCase();
}

function setWhoName(entry){
  const el = $('whoName');
  if(!el || !entry) return;
  const ini = initials(entry);
  el.innerHTML = `<span class="tn">${esc(entry.name || ('#' + ENTRY_ID))}</span>${
    ini ? `<span class="ini">${esc(ini)}</span>` : ''}`;
  el.title = (entry.name || '') + (ini ? ' · ' + ini : '');
}

let HOME = null;

/* Formats the time left until the deadline. Nobody cares about seconds,
   but the difference between "in 2 days" and "in 4 hours" is the message. */
function untilText(ms){
  if(ms <= 0) return 'deadline passed';
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if(d >= 1) return `za ${d} d ${h % 24} h`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `za ${h} h ${m} min`;
}

function homeMetrics(){
  const {entry, picks, liveTotal} = HOME;
  const cards = [];
  const card = (label, val, sub) => cards.push(
    `<div class="hcard"><span class="lb">${esc(label)}</span>
      <b>${val}</b>${sub ? `<span class="sb">${sub}</span>` : ''}</div>`);

  const cur = BOOT.events.find(e => e.is_current);
  const pts = Number.isFinite(liveTotal) && liveTotal !== null
    ? liveTotal : (entry ? entry.summary_event_points : null);
  card('Points' + (cur ? ' GW' + cur.id : ''), pts === null ? '—' : pts);

  if(entry && entry.summary_overall_rank)
    card('Overall rank', entry.summary_overall_rank.toLocaleString('en-GB'));
  else card('Total points', entry ? entry.summary_overall_points : '—');

  if(entry && Number.isFinite(entry.last_deadline_value))
    card('Team value', (entry.last_deadline_value / 10).toFixed(1),
      'v bance ' + ((entry.last_deadline_bank || 0) / 10).toFixed(1) + 'm');

  /* Free transfers are only known once another tab has worked them out.
     Estimating them again here would mean another request for transfer
     history — and a wrong number is worse than none. */
  const ft = ftOverride();
  if(ft !== null) card('Free transfers', ft, 'set manually');
  else if(picks && picks.entry_history)
    card('Transfers this gameweek', picks.entry_history.event_transfers,
      picks.entry_history.event_transfers_cost
        ? '−' + picks.entry_history.event_transfers_cost + ' b' : 'noAward pokuty');

  return `<div class="hcards">${cards.join('')}</div>`;
}

/* Players who need attention — sorted by urgency.
   A blank is a problem too, even if the player is fit. */
function homeAttention(){
  const {picks, startGw} = HOME;
  if(!picks) return '';

  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const items = [];

  picks.picks.forEach(pk => {
    const p = els[pk.element];
    if(!p) return;
    const chance = p.chance_of_playing_next_round;
    const tm = teams[p.team].short_name;
    const news = p.news ? p.news.replace(/\s*\(.*$/, '') : '';

    if(p.status === 'i' || p.status === 's' || p.status === 'u'
       || p.status === 'n' || chance === 0){
      items.push({rank: 0, cls: 'al', p, tm,
        txt: (p.status === 's' ? 'suspended' : p.status === 'i' ? 'injured'
              : 'unavailable') + (news ? ' · ' + news.toLowerCase() : '')});
    } else if(chance !== null && chance < 100){
      items.push({rank: 1, cls: 'wn', p, tm,
        txt: chance + ' % · doubtful' + (news ? ' · ' + news.toLowerCase() : '')});
    } else if(gwFixtures(p.team, startGw).length === 0){
      items.push({rank: 2, cls: 'mute', p, tm, txt: 'does not play in GW' + startGw + ' (blank)'});
    }
  });

  items.sort((a, b) => a.rank - b.rank);

  if(!items.length) return `<div class="hbox">
    <h3><i class="hi ok">✓</i>Needs attention</h3>
    <p class="note">Nothing. The whole squad is fit and everyone plays in GW${startGw}.</p>
  </div>`;

  return `<div class="hbox">
    <h3><i class="hi al">!</i>Needs attention<span class="cnt">${items.length}</span></h3>
    ${items.map(x => `<div class="hrow">
      <em>${esc(x.tm)}</em>
      <b>${esc(x.p.web_name)}</b>
      <span class="${x.cls}">${esc(x.txt)}</span>
    </div>`).join('')}
  </div>`;
}

/* Price moves limited to players that concern me: my squad on the left,
   the watchlist on the right. The rest of the league belongs in Prices. */
function homePrices(){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const projFor = (p, o) =>
    (p.price_change_projections || []).find(x => x.offset === o) || null;

  const line = r => `<div class="hrow">
    <em>${esc(teams[r.p.team].short_name)}</em>
    <b>${esc(r.p.web_name)}</b>
    <span class="pc ${r.like > 0 ? 'ok' : r.like < 0 ? 'al' : 'mute'}">${
      (r.like > 0 ? '▲ ' : r.like < 0 ? '▼ ' : '')}${r.pct.toFixed(0)} %</span>
  </div>`;

  const mineRows = (MY_SQUAD ? [...MY_SQUAD] : [])
    .map(id => BOOT.elements.find(p => p.id === id))
    .filter(Boolean)
    .map(p => {
      const t = projFor(p, 0);
      const pct = parseFloat(p.price_change_percent);
      return {p, like: t ? (t.likelihood || 0) : 0, pct: Number.isFinite(pct) ? pct : 0};
    })
    .filter(r => Math.abs(r.pct) >= 25 || r.like)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 5);

  const watch = watchRows().slice(0, 5);

  const mineBox = `<div class="hbox">
    <h3><i class="hi">£</i>Prices — my squad</h3>
    ${mineRows.length ? mineRows.map(line).join('')
      : '<p class="note">None of your players has a meaningful move.</p>'}
  </div>`;

  const watchBox = `<div class="hbox">
    <h3><i class="hi">★</i>Watchlist<button type="button" class="lnkbtn"
      data-goto="t-prices">Spravovat</button></h3>
    ${watch.length ? watch.map(line).join('')
      : `<p class="note">You are not watching anyone yet. In the Prices tab click the
         star next to a player you want to follow.</p>`}
    ${watch.length ? '' : storageNote('Watchlist')}
  </div>`;

  return `<div class="hgrid">${mineBox}${watchBox}</div>`;
}

/* The highest FPL projection in the squad. This is not a captain pick —
   the app deliberately does not give one, because `ep_next` arrives
   rounded and cannot separate top players. It is just a pointer. */
function homeOutlook(){
  const {picks, startGw} = HOME;
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));

  let epBox = '';
  if(picks){
    const best = picks.picks
      .map(pk => els[pk.element])
      .filter(Boolean)
      .map(p => ({p, ep: epNext(p)}))
      .filter(x => x.ep !== null)
      .sort((a, b) => b.ep - a.ep)
      .slice(0, 3);

    epBox = `<div class="hbox">
      <h3><i class="hi">↗</i>Highest projection for GW${startGw}${info(`The number is
        FPL's official <code>ep_next</code>, not my estimate. For double gameweeks
        it counts one match only.`)}</h3>
      ${best.length ? best.map(x => {
        const fx = gwFixtures(x.p.team, startGw);
        const opp = fx.map(f => (teams[f.opp] ? teams[f.opp].short_name : '?')
          + (f.home ? ' (D)' : ' (V)')).join(', ') || 'blank';
        return `<div class="hrow">
          <em>${esc(teams[x.p.team].short_name)}</em>
          <b>${esc(x.p.web_name)}</b>
          <span class="mute">${esc(opp)}</span>
          <span class="pc">${x.ep.toFixed(1)}</span>
        </div>`;
      }).join('') : '<p class="note">FPL is not sending projections yet.</p>'}
    </div>`;
  }

  // Squad blanks and doubles in the next four gameweeks.
  const shape = gwShape(startGw, 4).map(x => {
    const b = MY_SQUAD ? x.blanks.filter(t =>
      BOOT.elements.some(p => MY_SQUAD.has(p.id) && p.team === t.id)) : [];
    const d = MY_SQUAD ? x.doubles.filter(t =>
      BOOT.elements.some(p => MY_SQUAD.has(p.id) && p.team === t.id)) : [];
    if(!b.length && !d.length) return null;
    return `<div class="hrow"><em>GW${x.gw}</em>
      <b>${b.length ? b.length + '× blank' : ''}${b.length && d.length ? ' · ' : ''}${
        d.length ? d.length + '× double' : ''}</b>
      <span class="mute">${esc([...b, ...d].map(t => t.short_name).join(', '))}</span>
    </div>`;
  }).filter(Boolean);

  const shapeBox = `<div class="hbox">
    <h3><i class="hi">▦</i>Next four gameweeks</h3>
    ${shape.length ? shape.join('')
      : '<p class="note">No blank or double affects your squad in the next four gameweeks.</p>'}
  </div>`;

  return `<div class="hgrid">${epBox || shapeBox}${epBox ? shapeBox : ''}</div>`;
}

/* ============================================================
   SQUAD: BY POSITION / WHOLE SQUAD

   The squad can be read two ways and each answers a different question.
   By position: "how much is tied up in defence". Whole squad: "which of
   my fifteen has the worst fixtures" — and groups get in the way of that.

   The switch redraws nothing. The fifteen rows are in the DOM once and
   both views just treat them differently: group headers are hidden by a
   CSS rule in Whole squad mode and the rows are reordered by their data
   attributes. Rendering a second list instead would mean the data existed
   twice — and fixing one of the two places would be enough for the table
   to start contradicting itself.

   The choice lives in a variable, not localStorage: it is a way of reading
   one screen, not an app setting. After a reload the default split by
   position is back, which is more useful for most visits.
   ============================================================ */
let SQUAD_VIEW = 'pos';        // 'pos' | 'all'
let SQUAD_SORT = null;         // {key, dir} — null = order as picked

/* Columns where "better" means a smaller number. FDR is the only one:
   the easiest fixture is 1, not 5. Everything else sorts descending. */
const SORT_ASC_FIRST = new Set(['fdr']);

/* Cuts the list into groups: a header and the rows that belong under it.

   Read from the original order rather than the current DOM state —
   otherwise the first reorder would destroy the knowledge of which rows
   belong to which group. The list remembers its original order on first
   touch; a squad redraw creates a new element, so the memory is dropped. */
function squadGroups(list){
  if(!list._order) list._order = [...list.children];

  const out = [];
  let akt = null;
  for(const el of list._order){
    if(el.classList.contains('pgroup')){ akt = {head: el, rows: []}; out.push(akt); }
    else if(el.classList.contains('prow')){
      if(!akt){ akt = {head: null, rows: []}; out.push(akt); }
      akt.rows.push(el);
    }
  }
  return out;
}

function squadSorter(){
  const key = SQUAD_SORT ? SQUAD_SORT.key : null;
  const dir = SQUAD_SORT ? SQUAD_SORT.dir : 1;
  const num = (el, k) => parseFloat(el.dataset[k]);

  return (a, b) => {
    // With no active sort the picked order applies.
    if(!key) return num(a, 'poradi') - num(b, 'poradi');
    const va = num(a, key), vb = num(b, key);
    // -1 means "no value" (blank, did not play). It belongs last either way.
    if(va < 0 !== vb < 0) return va < 0 ? 1 : -1;
    return (va - vb) * dir || (num(a, 'poradi') - num(b, 'poradi'));
  };
}

function applySquadSort(){
  const list = $('squadlist');
  if(!list) return;

  list.classList.toggle('flat', SQUAD_VIEW === 'all');

  list.querySelectorAll('[data-sort]').forEach(h => {
    const on = SQUAD_SORT && SQUAD_SORT.key === h.dataset.sort;
    h.setAttribute('aria-sort', on
      ? (SQUAD_SORT.dir === 1 ? 'ascending' : 'descending') : 'none');
  });

  const skupiny = squadGroups(list);
  if(!skupiny.length) return;
  const cmp = squadSorter();

  if(SQUAD_VIEW === 'all'){
    /* One list: groups fall away and all fifteen sort together.
       Headers go to the end — they are hidden, but must be out of the way,
       or empty gaps would be left between the rows. */
    const rows = skupiny.flatMap(g => g.rows).sort(cmp);
    skupiny.forEach(g => { if(g.head) list.appendChild(g.head); });
    rows.forEach(r => list.appendChild(r));
    return;
  }

  /* By position: each group sorts within itself and returns under its own
     header. This was the bug — rows were appended to the end of the list,
     so they all ended up under the last header (Bench) and the groups
     above stayed empty. */
  skupiny.forEach(g => {
    if(g.head) list.appendChild(g.head);
    g.rows.slice().sort(cmp).forEach(r => list.appendChild(r));
  });
}

document.addEventListener('click', ev => {
  const sw = ev.target.closest('button[data-squadview]');
  if(sw){
    SQUAD_VIEW = sw.dataset.squadview;
    document.querySelectorAll('button[data-squadview]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.squadview === SQUAD_VIEW)));
    applySquadSort();
    return;
  }

  const th = ev.target.closest('.squadlist [data-sort]');
  if(th){
    const key = th.dataset.sort;
    SQUAD_SORT = SQUAD_SORT && SQUAD_SORT.key === key
      ? {key, dir: -SQUAD_SORT.dir}
      : {key, dir: SORT_ASC_FIRST.has(key) ? 1 : -1};
    applySquadSort();
  }
});

// Keyboard: the header is a button, so it has to behave like one.
document.addEventListener('keydown', ev => {
  if(ev.key !== 'Enter' && ev.key !== ' ') return;
  const th = ev.target.closest && ev.target.closest('.squadlist [data-sort]');
  if(th){ ev.preventDefault(); th.click(); }
});

/* ============================================================
   LAST GAMEWEEK AWARDS ON HOME

   Awards are computed by buildAwards() in js/tabs.js and used to live only
   in the League hub. They belong on Home because they are the one set of
   league numbers read in hindsight — people want to be told who won the
   gameweek, not to go looking for it.

   The data behind them costs dozens of requests (standings + history +
   every member's picks), so it is not fetched at startup. The hub loads it
   itself when opened; if it has not been opened, Home starts it in the
   background and redraws when it finishes. Until then there is a skeleton
   in place of the panel, not emptiness — so the panel keeps its height.

   HUB_FOR_HOME makes sure this runs once. Without it every Home redraw
   (and a watchlist change causes one) would fire another batch of requests.
   batch of requests.
   ============================================================ */
let HUB_FOR_HOME = false;

function homeAwardsLoad(){
  if(HUB_FOR_HOME || typeof loadHub !== 'function') return;
  const lid = CONFIG.leagueId || localStorage.getItem(LEAGUE_KEY);
  if(!lid) return;
  HUB_FOR_HOME = true;

  /* The hub has just done its own load too — if it were opened afterwards,
     TAB_INIT would run loadHub a second time. */
  TAB_DONE.add('t-hub');

  Promise.resolve()
    .then(() => loadHub())
    // Captain awards also need live player points. renderHub() fetches
    // them in the background, but we do not know when — so we wait.
    .then(() => HUB && loadGwData(HUB.cur.id))
    .then(() => drawHome())
    .catch(() => { HUB_FOR_HOME = false; });
}

function homeAwards(){
  // Awards rely on code from js/tabs.js, which loads after core.js, so its
  // functions may only be touched at runtime, not at definition time.
  const box = inner => `<div class="hbox hawards">
    <h3><i class="hi">🏆</i>Last gameweek awards${
      typeof HUB !== 'undefined' && HUB ? ` · GW${HUB.cur.id}` : ''
      }<button type="button" class="lnkbtn" data-goto="t-hub">League hub</button></h3>
    ${inner}</div>`;

  const lid = CONFIG.leagueId || localStorage.getItem(LEAGUE_KEY);
  if(!lid){
    return box(`<p class="note">Awards are computed from mini-league results.</p>`);
  }

  if(typeof HUB === 'undefined' || !HUB){
    homeAwardsLoad();
    return box('<div class="skel"><i></i><i></i></div>');
  }

  const awards = buildAwards(HUB.cur.id, NEWS_PICKS.get(HUB.cur.id),
                             NEWS_LIVE.get(HUB.cur.id));
  if(!awards.length){
    return box('<p class="note">There is no data for the last gameweek yet.</p>');
  }

  /* Until the gameweek has been through bonus calculation the awards are
     provisional. Same label as in the hub — otherwise Home would claim
     something different. */
  const liveTag = phase !== 'final'
    ? `<span class="livetag">${phase === 'running' ? 'live' : 'awaiting bonus'}</span>`
    : '';

  return box(`${liveTag}<div class="awards mini">${awards.map(a => {
    const meta = AWARD_META[a.key];
    const noAward = a.val === '—' ? ' bezceny' : '';
    return `<div class="award ${meta.cls}${noAward}">
      <div class="medal" aria-hidden="true">${meta.emoji}</div>
      <div class="txt">
        <div class="title">${meta.title}</div>
        <div class="who">${a.who}</div>
      </div>
      <div class="val">${a.val}</div>
    </div>`;
  }).join('')}</div>`);
}

function drawHome(){
  const out = $('hmout');
  if(!out || !BOOT) return;

  if(!HOME){
    out.innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';
    return;
  }

  /* No panel header. Navigation says I am on Home, and the deadline sits
     in the bar above the content — saying it twice only pushed numbers down. */
  out.innerHTML = `
    ${homeMetrics()}
    ${homeAttention()}
    ${homePrices()}
    ${homeOutlook()}
    <div class="hgrid one">${homeAwards()}</div>
    ${typeof homeNews === 'function' ? `<div class="hgrid one">${homeNews()}</div>` : ''}`;
}

/* "Manage" links and friends switch tabs. Delegated, because Home is
   redrawn on every watchlist change. */
document.addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-goto]');
  if(btn) selectTab(btn.dataset.goto);
});

/* ============ TABS ============ */
const TABS = [['t-home','p-home'], ['t-squad','p-squad'],
              ['t-league','p-league'], ['t-hub','p-hub'], ['t-news','p-news'],
              ['t-inj','p-inj'], ['t-players','p-players'], ['t-plan','p-plan'],
              ['t-prices','p-prices']];





// What runs the first time a tab is opened (lazy loading).
/* What happens the first time a tab is opened.

   League tabs used to load only after a button click, because they cost
   dozens of requests. But that button was the only thing on the panel —
   nobody could miss it and nobody chose it voluntarily.

   So we load on tab open, not at app start: whoever does not look at the
   league downloads nothing, and whoever does need not click. The second
   league tab is then almost free — per-member requests go through cached()
   and are exactly the same URLs.

   The buttons stayed as "Refresh"; after the deadline they come in handy. */
const TAB_INIT = {
  't-league':  () => autoLoadLeague(),
  't-hub':     () => loadHub(),
  't-news':    () => loadNews(),
  't-inj':     () => loadInjuries(),
  't-plan':    () => loadPlan(),
  't-prices':  () => loadPrices(),
};

/* The mini-league needs an ID that TAB_INIT does not know. When it is
   missing there is nothing to run — we just say so. */
function autoLoadLeague(){
  const lid = CONFIG.leagueId || localStorage.getItem(LEAGUE_KEY);
  if(!lid){ $('lmsg').textContent = 'No mini-league ID set.'; return; }
  return loadLeague(lid);
}
const TAB_DONE = new Set();

function selectTab(tid){
  TABS.forEach(([t, p]) => {
    const on = t === tid;
    $(t).setAttribute('aria-selected', on);
    $(t).tabIndex = on ? 0 : -1;
    $(p).hidden = !on;
  });
  $(tid).focus();

  /* Panels have tabindex="-1" so focus can move to the content. Without
     this the keyboard stayed on the button and a screen reader never
     learned that the content had changed. */
  const pid = (TABS.find(([t]) => t === tid) || [])[1];
  if(pid && $(pid)) $(pid).setAttribute('aria-busy', 'false');

  // The address bar keeps up with what is visible, so a link can be shared.

  if(typeof setHash === 'function') setHash(tid, null);

  if(TAB_INIT[tid] && !TAB_DONE.has(tid)){ TAB_DONE.add(tid); TAB_INIT[tid](); }
}

TABS.forEach(([tid]) => {
  $(tid).tabIndex = tid === 't-home' ? 0 : -1;
  $(tid).addEventListener('click', () => selectTab(tid));

  // role="tablist" promises arrow-key control. It used to promise and not deliver.
  $(tid).addEventListener('keydown', ev => {
    const usable = TABS.filter(([t]) => !$(t).disabled).map(([t]) => t);
    const i = usable.indexOf(tid);
    if(i < 0) return;
    let next = null;
    if(ev.key === 'ArrowRight') next = usable[(i + 1) % usable.length];
    if(ev.key === 'ArrowLeft')  next = usable[(i - 1 + usable.length) % usable.length];
    if(ev.key === 'Home')       next = usable[0];
    if(ev.key === 'End')        next = usable[usable.length - 1];
    if(next){ ev.preventDefault(); selectTab(next); }
  });
});

/* ============================================================
   HARD REFRESH

   The app keeps downloaded responses in API_CACHE for the lifetime of the
   page. That is deliberate — switching tabs is then free. The price is
   that when something fails to download (FPL returns 403, wifi drops
   mid-request), the error hangs around until a manual browser reload.

   The button does what people expect from F5, but without losing state:
   it throws the cache away, forgets which tabs have run, and reloads both
   the squad and the currently open tab. Bootstrap and fixtures are dropped
   too, because that is usually where things get stuck.
   ============================================================ */
let RELOADING = false;

async function hardReload(){
  if(RELOADING) return;
  RELOADING = true;

  const btn = $('reload');
  if(btn){ btn.disabled = true; btn.classList.add('spin'); }

  try{
    // A complete flush. BOOT and FIX are downloaded again in load().
    API_CACHE = new Map();
    BOOT = null;
    FIX = null;
    PLAYERS = null;
    HUB = null;
    NEWS_GW = null;
    NEWS_PICKS.clear();
  NEWS_LIVE.clear();
  HALL_ALL = false;
    LEAGUE_OWN = null;
    TR_STATE = null;

    // Remember the open tab so nobody ends up somewhere else. The others
    // load themselves when their turn comes.
    const open = (TABS.find(([t]) => $(t).getAttribute('aria-selected') === 'true')
                  || ['t-home'])[0];
    TAB_DONE.clear();

    if(ENTRY_ID) await load(ENTRY_ID);

    if(TAB_INIT[open]){ TAB_DONE.add(open); await TAB_INIT[open](); }
  }catch(e){
    const m = $('msg');
    if(m) m.textContent = e.message;
  }finally{
    RELOADING = false;
    if(btn){ btn.disabled = false; btn.classList.remove('spin'); }
  }
}

if($('reload')) $('reload').addEventListener('click', hardReload);

/* ============ DEADLINE COUNTDOWN ============
   The cheapest useful thing in the whole app: the most common FPL mistake
   is not a bad transfer, it is a forgotten deadline. */
let CD_TIMER = null;

function stopCountdown(){
  if(CD_TIMER) clearInterval(CD_TIMER);
  CD_TIMER = null;
  const el = $('countdown');
  if(el) el.hidden = true;
}

function startCountdown(){
  if(!BOOT) return;
  const nxt = BOOT.events.find(e => e.is_next);
  const el = $('countdown');
  if(!nxt || !el) return;

  const deadline = new Date(nxt.deadline_time).getTime();

  /* Two lines: what, and how long. One long line in small monospace was
     unreadable in the header.

     The units also shorten with what is left — five days are measured in
     days and hours, the last hour in minutes. Showing "5 d 4 h 54 min" is
     precision nobody uses. */
  const tick = () => {
    const left = deadline - Date.now();
    if(left <= 0){
      el.innerHTML = `<span class="lbl">GW${nxt.id}</span>
        <span class="val">Deadline passed</span>`;
      el.className = 'cd live';
      clearInterval(CD_TIMER);
      return;
    }
    const d = Math.floor(left / 86400000);
    const h = Math.floor(left / 3600000) % 24;
    const m = Math.floor(left / 60000) % 60;

    const val = d >= 1 ? `${d} d ${h} h`
              : h >= 1 ? `${h} h ${String(m).padStart(2, '0')} min`
              : `${m} min`;

    el.innerHTML = `<span class="lbl">Deadline GW${nxt.id}</span>
      <span class="val">za ${val}</span>`;
    // under six hours it is a warning, not information
    el.className = 'cd' + (left < 3600000 ? ' late' : left < 6 * 3600000 ? ' soon' : '');
  };

  el.hidden = false;
  el.title = 'Deadline ' + new Date(deadline).toLocaleString('cs-CZ');
  tick();
  CD_TIMER = setInterval(tick, 30000);
}

/* ============ MINILIGA ============ */
const COLORS = ['#3FBF7F','#F2A93B','#E8453C','#5B8DEF','#C77DFF',
                '#2DD4BF','#F472B6','#A3E635','#FB923C','#94A3B8'];

async function loadLeague(lid){
  $('lmsg').textContent = 'Loading league…';
  $('lout').innerHTML = '';
  try{
    if(!BOOT){ [BOOT, FIX] = await Promise.all([api('bootstrap-static/'), api('fixtures/')]); }

    const cur = BOOT.events.find(e => e.is_current);

    const {league, members, truncated} = await fetchStandings(lid,
      n => { $('lmsg').textContent = 'Loading standings… ' + n + ' teams'; });

    if(!members.length){
      $('lmsg').textContent = 'The league has no members, or the season has not started.';
      return;
    }

    // History and picks go through a queue, not all at once. Fifty teams =
    // a hundred requests; sent together FPL refuses them and the chart
    const prog = label => (done, total) => {
      $('lmsg').textContent = `${label} ${done}/${total}`;
    };

    // The same saving as in the hub: the archive of finished gameweeks
    // replaces a request per member. When it is not enough, we go to the API.
    let hist = null;
    if(cur){ try{ hist = await snapHists(members, cur.id); }catch(e){} }

    if(!hist){
      hist = await pooled(members, m => cached('entry/' + m.entry + '/history/'),
        5, prog('Loading history…'));
    }

    let picks = [];
    if(cur){
      picks = await pooled(members, m => cached('entry/' + m.entry + '/event/' + cur.id + '/picks/'),
        5, prog('Loading squads…'));
    }

    renderLeague({league}, members, hist, picks, cur, truncated);
    $('lmsg').textContent = '';
  }catch(e){
    $('lmsg').innerHTML = errBox(e.message, 't-league');
  }
}

/* League rank over time.

   Two things this chart used to get wrong in bigger leagues:
   – points were read as current[g], i.e. by position in the array. Anyone
     who joined later had the whole curve shifted. Now it indexes by round.
   – fifty lines in ten colours at 300 px tall was unreadable. Above
     CHART_MAX we draw only the top of the table plus your own line; the
     rest is quiet grey context. */
const CHART_MAX = 12;

function rankChart(members, hist){
  const maps = hist.map(pointsByRound);
  const gws = Math.max(0, ...maps.map(m => m.size ? Math.max(...m.keys()) : 0));
  if(gws < 2) return '<p class="note">The chart appears after the second finished gameweek.</p>';

  // cumulative points per gameweek; a missing round holds the last known state
  const series = members.map((m, i) => {
    const pts = [];
    let sum = 0;
    for(let g = 1; g <= gws; g++){
      const ev = maps[i].get(g);
      if(ev) sum = ev.total_points;
      pts.push(sum);
    }
    return {name: m.player_name, team: m.entry_name, entry: m.entry, pts};
  });

  const ranks = series.map(() => []);
  for(let g = 0; g < gws; g++){
    const order = series.map((s, i) => [i, s.pts[g]]).sort((a, b) => b[1] - a[1]);
    order.forEach(([i], pos) => ranks[i].push(pos + 1));
  }

  const myId = ENTRY_ID || parseInt(localStorage.getItem('fpl_entry') || '0', 10);
  const n = members.length;

  // Who gets their own colour and a name in the legend.
  const highlighted = new Set();
  members.forEach((m, i) => { if(i < CHART_MAX) highlighted.add(i); });
  members.forEach((m, i) => { if(m.entry === myId) highlighted.add(i); });

  const rows = Math.min(n, CHART_MAX + 2);
  const W = 700, H = 46 + rows * 22, PL = 34, PR = 14, PT = 12, PB = 26;
  const x = g => PL + (gws === 1 ? 0 : (g * (W - PL - PR)) / (gws - 1));
  const y = r => PT + (n === 1 ? 0 : ((r - 1) * (H - PT - PB)) / (n - 1));

  // Only as many labels on the vertical axis as fit legibly.
  const step = Math.max(1, Math.ceil(n / 12));

  const grid = [];
  for(let g = 0; g < gws; g++){
    grid.push(`<line class="gl" x1="${x(g)}" y1="${PT}" x2="${x(g)}" y2="${H - PB}"/>`);
    if(gws <= 20 || g % 2 === 0)
      grid.push(`<text class="ax" x="${x(g)}" y="${H - PB + 14}" text-anchor="middle">${g + 1}</text>`);
  }
  for(let r = 1; r <= n; r += step)
    grid.push(`<text class="ax" x="${PL - 8}" y="${y(r) + 3}" text-anchor="end">${r}</text>`);

  const color = i => COLORS[[...highlighted].indexOf(i) % COLORS.length];

  // Unhighlighted lines are drawn first, so the top of the table sits above.
  const draw = idx => {
    const s2 = series[idx];
    const d = ranks[idx].map((r, g) => (g ? 'L' : 'M') + x(g).toFixed(1) + ' ' + y(r).toFixed(1)).join(' ');
    const mine = s2.entry === myId;
    if(!highlighted.has(idx))
      return `<path d="${d}" stroke="var(--line)" opacity=".5"/>`;
    return `<path d="${d}" stroke="${color(idx)}" class="${mine ? 'me' : ''}" opacity="${mine ? 1 : .82}"/>`;
  };

  const paths = series.map((_, i) => i).filter(i => !highlighted.has(i)).map(draw).join('')
              + series.map((_, i) => i).filter(i => highlighted.has(i)).map(draw).join('');

  const legend = [...highlighted].map(i =>
    `<span><i style="background:${color(i)}"></i>${
      series[i].entry === myId ? '<b>' + esc(series[i].name) + '</b>' : esc(series[i].name)}</span>`).join('');

  const rest = n - highlighted.size;

  return `<div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="League rank by gameweek">
        ${grid.join('')}${paths}
      </svg>
      <div class="legend">${legend}${
        rest > 0 ? `<span><i style="background:var(--line)"></i>others (${rest})</span>` : ''}</div>
    </div>
    <p class="note">The vertical axis is league rank, the horizontal one the gameweek. Your line is thicker.${
      rest > 0 ? ' Only the top of the table and you are highlighted; the rest of the league is grey background.' : ''}</p>`;
}

function renderLeague(st, members, hist, picks, cur, truncated){
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));

  /* Standings snapshot. Saved once per gameweek and only for finished
     ones — live standings would be stale in minutes and skew the movement. */
  if(cur && cur.finished) saveSnap(cur.id, members);
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const myId = ENTRY_ID || parseInt(localStorage.getItem('fpl_entry') || '0', 10);

  /* --- the standings table --- */
  const table = `<table>
    <thead><tr>
      <th class="n">#</th><th>Manager</th><th class="hide-s">Team</th>
      <th class="n">GW</th><th class="n">Total</th><th class="n hide-s">Move</th>
    </tr></thead>
    <tbody>${members.map(m => {
      const move = m.last_rank ? m.last_rank - m.rank : 0;
      return `<tr${m.entry === myId ? ' class="me"' : ''}>
        <td class="n">${m.rank}${deltaChip(m.rank, rankDelta(m.entry, cur ? cur.id : 0))}</td>
        <td><b>${cur ? squadBtn(m.entry, cur.id, m.player_name, m.entry_name)
          : esc(m.player_name)}</b></td>
        <td class="hide-s" style="color:var(--mute)">${esc(m.entry_name)}</td>
        <td class="n">${m.event_total}</td>
        <td class="n">${m.total}</td>
        <td class="n hide-s ${move > 0 ? 'ok' : move < 0 ? 'al' : ''}">${
          move > 0 ? '▲' + move : move < 0 ? '▼' + (-move) : '–'}</td>
      </tr>`;
    }).join('')}</tbody></table>`;

  if(!cur || !picks.some(Boolean)){
    $('lout').innerHTML = `<h2>${esc(CONFIG.leagueName || st.league.name)} · ${members.length} teams</h2>${table}
      <p class="note">Squads, differences and the chart appear once the first gameweek is played.</p>`;
    return;
  }

  /* --- who_ koho ma --- */
  const owners = {};   // playerId -> [manager names]
  const caps = {};     // playerId -> [manager names]
  const byEntry = {};  // entryId -> Set(playerId)

  members.forEach((m, i) => {
    const pk = picks[i];
    if(!pk) return;
    byEntry[m.entry] = new Set();
    pk.picks.forEach(p => {
      byEntry[m.entry].add(p.element);
      (owners[p.element] = owners[p.element] || []).push(m.player_name);
      if(p.is_captain) (caps[p.element] = caps[p.element] || []).push(m.player_name);
    });
  });

  const n = Object.keys(byEntry).length;

  /* League ownership is stored outside this function as well — other
     panels need it. It holds only what is really required.
     */
  LEAGUE_OWN = {owners, n};

  const ranked = Object.entries(owners)
    .map(([pid, list]) => ({p: els[pid], list, pct: Math.round((list.length / n) * 100)}))
    .filter(o => o.p)
    .sort((a, b) => b.list.length - a.list.length ||
                    parseFloat(b.p.selected_by_percent) - parseFloat(a.p.selected_by_percent));

  const ownTable = `<table>
    <thead><tr><th>Player</th><th class="hide-s">Team</th>
      <th class="n">In league</th><th style="width:90px">Share</th>
      <th class="hide-s">Who</th><th class="n">Captain</th></tr></thead>
    <tbody>${ranked.slice(0, 40).map(o => `<tr>
      <td><span class="who">${crest(o.p.team, 'sm')}<b>${esc(o.p.web_name)}</b></span></td>
      <td class="hide-s">${esc(teams[o.p.team].short_name)}</td>
      <td class="n">${o.list.length}/${n}</td>
      <td><div class="bar-w"><i style="width:${o.pct}%"></i></div></td>
      <td class="hide-s" style="color:var(--mute);font-size:12px">${esc(o.list.join(', '))}</td>
      <td class="n">${caps[o.p.id] ? caps[o.p.id].length : '–'}</td>
    </tr>`).join('')}</tbody></table>`;

  /* --- rozdily proti me --- */
  let diffHtml = '<p class="note">Load your own squad in the Squad tab first, so I know what to compare against.</p>';
  const mine = byEntry[myId];

  if(mine){
    const chip = (pid, cls) => {
      const p = els[pid];
      const list = owners[pid] || [];
      return `<span class="chip ${cls}"><b>${esc(p.web_name)}</b>
        <span class="ct">${esc(teams[p.team].short_name)} · ${list.length}/${n}</span></span>`;
    };

    const uniq = [...mine].filter(pid => owners[pid].length === 1);
    const missing = ranked.filter(o => !mine.has(o.p.id) && o.list.length >= Math.ceil(n / 2));
    const universal = ranked.filter(o => o.list.length === n).map(o => o.p.id);

    diffHtml = `
      <h2>Only you own · ${uniq.length}</h2>
      ${uniq.length ? `<div class="own">${uniq.map(pid => chip(pid, 'unique')).join('')}</div>
        <p class="note">This is where you gain or lose ground. Nobody else in the league has them.</p>`
        : '<p class="note">No player that only you own.</p>'}

      <h2>You are missing, most of the league owns · ${missing.length}</h2>
      ${missing.length ? `<div class="own">${missing.map(o => chip(o.p.id, 'miss')).join('')}</div>
        <p class="note">When these score, you slide down the table without making a mistake.</p>`
        : '<p class="note">You are missing nothing — you own every popular player in the league.</p>'}

      <h2>Everyone owns · ${universal.length}</h2>
      ${universal.length ? `<div class="own">${universal.map(pid => chip(pid, 'mine')).join('')}</div>
        <p class="note">These will not decide the table, everyone gets the same points.</p>`
        : '<p class="note">There is no player owned by everyone.</p>'}`;
  }

  const SECTIONS = [
    ['Standings', table],
    ['Month', `<div id="phasebox"><p class="note">Pick a month…</p></div>`],
    ['Live', `<div id="livebox"><p class="note">Loading live points…</p></div>`],
    ['Trend', rankChart(members, hist)],
    ['Differences', diffHtml],
    ['Who owns whom', ownTable],
    ['Season history', '<div id="histbox"></div>'],
  ];

  const cap = truncated
    ? `<p class="note">The league is bigger than ${LEAGUE_CAP} members — working with the first ${LEAGUE_CAP}
       by rank.</p>`
    : '';

  $('lout').innerHTML = `
    <h2>${esc(CONFIG.leagueName || st.league.name)} · ${members.length} teams · GW${cur.id}</h2>
    ${cap}
    <div class="subnav" role="tablist">
      ${SECTIONS.map((s, i) =>
        `<button class="sub-btn" role="tab" aria-selected="${i === 0}" data-sec="${i}">${esc(s[0])}</button>`
      ).join('')}
    </div>
    ${SECTIONS.map((s, i) =>
      `<div class="sec" id="sec-${i}"${i ? ' hidden' : ''}>${s[1]}</div>`
    ).join('')}`;

  $('lout').querySelectorAll('.sub-btn').forEach(b => {
    b.addEventListener('click', () => {
      $('lout').querySelectorAll('.sub-btn').forEach(x =>
        x.setAttribute('aria-selected', x === b));
      SECTIONS.forEach((_, i) => { $('sec-' + i).hidden = String(i) !== b.dataset.sec; });
    });
  });

  mountPhases(st.league.id, cur, myId);

  // History is dozens of requests, so it only starts when asked for.
  const histBtn = [...$('lout').querySelectorAll('.sub-btn')]
    .find(b => b.textContent.trim() === 'Season history');
  if(histBtn) histBtn.addEventListener('click', () => {
    if(!$('histbox').dataset.loaded){
      $('histbox').dataset.loaded = '1';
      loadLeagueHistory(members, myId);
    }
  }, {once: false});

  // The live table is computed after render — it does not hold up the panel.
  renderLive(members, picks, cur, myId);
}

/* ------------------------------------------------------------
   Live points during a gameweek.

   Official FPL standings are only recalculated after every match ends.
   The event/{gw}/live/ endpoint gives individual player points
   immediately, so the current state of the league can be assembled —
   including bonus, which is computed live from BPS.
   ------------------------------------------------------------ */
async function renderLive(members, picks, cur, myId){
  const box = $('livebox');
  if(!box) return;

  if(cur.finished){
    box.innerHTML = '<p class="note">The gameweek is closed — live standings match '
      + 'the official ones in the Standings view.</p>';
    return;
  }

  let live;
  try { live = await cached('event/' + cur.id + '/live/'); }
  catch(e){ box.innerHTML = '<p class="note">Live points could not be loaded: '
    + esc(e.message) + '</p>'; return; }

  const pts = liveStats(live);
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));

  const rows = members.map((m, i) => {
    const pk = picks[i];
    if(!pk) return null;

    // Autosubs and the armband are handled by resolveLineup — otherwise the
    // table showed lower numbers than managers really have.
    const L = resolveLineup(pk, pts, cur.id);
    const before = m.total - (m.event_total || 0);   // points before this gameweek

    return {
      name: m.player_name, team: m.entry_name, entry: m.entry,
      gw: L.total, total: before + L.total, cost: L.cost, toPlay: L.toPlay,
      subs: L.subs.length,
      cap: L.capId && els[L.capId] ? els[L.capId].web_name : '—',
    };
  }).filter(Boolean);

  if(!rows.length){ box.innerHTML = '<p class="note">No squads for this gameweek yet.</p>'; return; }

  rows.sort((a, b) => b.total - a.total);

  const body = rows.map((r, i) => `<tr${r.entry === myId ? ' class="me"' : ''}>
      <td>${i + 1}</td>
      <td>${squadBtn(r.entry, cur.id, r.team, r.name)}<span class="sub">${esc(r.name)}</span></td>
      <td>${esc(r.cap)}${r.subs ? `<span class="sub">${r.subs}× sub</span>` : ''}</td>
      <td>${r.toPlay ? r.toPlay : '–'}</td>
      <td><b>${r.gw}</b>${r.cost ? `<span class="sub">−${r.cost} for transfers</span>` : ''}</td>
      <td>${r.total}</td>
    </tr>`).join('');

  box.innerHTML = `<table>
      <thead><tr><th>#</th><th>Team</th><th>Captain</th><th>To play</th>
        <th>GW</th><th>Total</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="note">Live standings from the points players have right now. Bonus is
    provisional — FPL computes it from BPS and it can still change after a match ends.
    The "To play" column says how many players in the lineup have not started yet.
    Automatic substitutions and the armband moving to the vice captain are included.</p>`;
}

/* ============ PLAYERS + PROJECTION ============ */

// How many points FPL gives for a goal and a clean sheet, by position.
const GOAL_PTS = {1: 10, 2: 6, 3: 5, 4: 4};
const CS_PTS   = {1: 4,  2: 4, 3: 1, 4: 0};

// Defensive contributions (bootstrap: game_config.scoring.defensive_contribution).
// The threshold is the number of actions per match above which points are awarded.
const DC_PTS       = {1: 0,  2: 2,  3: 2,  4: 2};
const DC_THRESHOLD = {1: 0,  2: 10, 3: 12, 4: 12};

/*
  A points estimate for one gameweek. It is a rough model, not a forecast —
  it assumes long-run xG and xA predict the future better than points
  already scored, which are full of noise.

  The model works match by match, not gameweek by gameweek. That matters:
  in a double the player starts twice and his value roughly doubles, in a
  blank it is zero. An earlier version always counted one match and was
  wrong by a hundred per cent in both cases.

  One match is made of four parts:
    1) the chance he plays at all (from minutes and reported availability)
    2) expected goals and assists per 90, converted to points by position
    3) clean sheet odds derived from opponent difficulty
    4) a bonus estimate from his bonus-per-match rate so far
*/

/* How many gameweeks have been played. Match count used to be estimated
   from minutes (minutes / 75), which lumped a substitute in with a regular
   starter. `starts` and the number of finished gameweeks are more accurate. */
function roundsPlayed(){
  const done = BOOT.events.filter(e => e.finished).length;
  return Math.max(1, done);
}

function appearances(p){
  // Starts are known exactly; appearances off the bench come from the extra minutes.
  const starts = p.starts || 0;
  const subMinutes = Math.max(0, p.minutes - starts * 78);
  return Math.max(starts + Math.round(subMinutes / 25), p.minutes > 0 ? 1 : 0);
}

function perMatchXp(p, difficulty, isHome){
  const chance = p.chance_of_playing_next_round === null ? 100 : p.chance_of_playing_next_round;
  const apps = appearances(p);
  const rounds = roundsPlayed();
  const starts = p.starts || 0;

  // Share of gameweeks started. This decides whether he plays at all.
  const startRate = Math.min(1, starts / rounds);
  const pPlay = (chance / 100) * (p.minutes > 0 ? Math.max(.2, startRate) : 0);
  const expMin = pPlay * (p.minutes / Math.max(apps, 1));

  const xg90 = parseFloat(p.expected_goals_per_90 || 0);
  const xa90 = parseFloat(p.expected_assists_per_90 || 0);
  const share = Math.min(1, expMin / 90);

  const fd = difficulty === null || difficulty === undefined ? 3 : difficulty;

  // clean sheet: FDR 2 is an easy opponent, 5 a hard one; slightly likelier at home
  const pCS = Math.max(.04, Math.min(.6, .46 - .09 * (fd - 2) + (isHome ? .04 : -.04)));

  // chances come easier against a weaker opponent and harder against a stronger one
  const attFactor = Math.max(.65, Math.min(1.35, 1 + (3 - fd) * .13)) * (isHome ? 1.06 : .94);

  const appearance = pPlay * (expMin >= 60 ? 2 : 1);
  let attack = share * attFactor * (xg90 * GOAL_PTS[p.element_type] + xa90 * 3);

  // Set-piece takers systematically return more than their role suggests.
  // Only one player takes penalties and xG picks that up with a delay.
  if(p.penalties_order === 1) attack += .35 * GOAL_PTS[p.element_type] * .18;
  if(p.corners_and_indirect_freekicks_order === 1) attack += .30;

  const defence = CS_PTS[p.element_type] ? share * pCS * CS_PTS[p.element_type] : 0;
  const conceded = p.element_type <= 2 ? -share * (1 - pCS) * 0.7 : 0;

  const bonus = pPlay * ((p.bonus || 0) / rounds);

  // Defensive contributions: 2 points for reaching the threshold (10 actions
  // for defenders, 12 for midfielders and forwards). Goalkeepers get none.
  // Without this the model systematically undervalued defensive midfielders —
  // for them it is easily a third of the real return per gameweek.
  const dcT = DC_THRESHOLD[p.element_type];
  let defcon = 0;
  if(dcT && DC_PTS[p.element_type]){
    const dc90 = parseFloat(p.defensive_contribution_per_90 || 0);
    if(dc90 > 0){
      // A season average alone does not say how often the threshold falls: a
      // player averaging exactly the threshold hits it in about half his
      // matches, not always. A logistic curve around it is rough but fairer
      const pHit = 1 / (1 + Math.exp(-(dc90 - dcT) / (dcT * .22)));
      defcon = share * pHit * DC_PTS[p.element_type];
    }
  }

  return Math.max(0, appearance + attack + defence + conceded + bonus + defcon);
}

/* Points for a whole gameweek = the sum over every match the team plays.
   A blank returns 0, a double roughly twice as much. */
function projectGw(p, gw){
  const fx = gwFixtures(p.team, gw);
  return fx.reduce((sum, f) => sum + perMatchXp(p, f.d, f.home), 0);
}

/* Sum over the next n gameweeks — for transfer and chip planning. */
function projectRange(p, startGw, n){
  let sum = 0;
  for(let g = startGw; g < startGw + n; g++) sum += projectGw(p, g);
  return sum;
}


/* ------------------------------------------------------------
   The best XI out of fifteen.

   FPL requires 1 goalkeeper, 3–5 defenders, 2–5 midfielders and 1–3
   forwards. We walk every legal formation and take the one with the
   highest projected total. There are fifteen, so brute force is fine here.
   ------------------------------------------------------------ */
const FORMATIONS = [];
for(let d = 3; d <= 5; d++)
  for(let m = 2; m <= 5; m++)
    for(let f = 1; f <= 3; f++)
      if(1 + d + m + f === 11) FORMATIONS.push({2: d, 3: m, 4: f});

function bestEleven(squad){
  // squad: [{p, xp}, …] — all 15
  const byPos = {1: [], 2: [], 3: [], 4: []};
  squad.forEach(s => byPos[s.p.element_type].push(s));
  Object.values(byPos).forEach(a => a.sort((x, y) => y.xp - x.xp));

  if(!byPos[1].length) return null;

  let best = null;
  for(const f of FORMATIONS){
    if(byPos[2].length < f[2] || byPos[3].length < f[3] || byPos[4].length < f[4]) continue;

    const xi = [byPos[1][0], ...byPos[2].slice(0, f[2]),
                ...byPos[3].slice(0, f[3]), ...byPos[4].slice(0, f[4])];
    const total = xi.reduce((a, b) => a + b.xp, 0);

    if(!best || total > best.total) best = {xi, total, shape: `${f[2]}-${f[3]}-${f[4]}`};
  }

  if(!best) return null;
  const inXi = new Set(best.xi.map(s => s.p.id));
  best.bench = squad.filter(s => !inXi.has(s.p.id)).sort((a, b) => b.xp - a.xp);
  return best;
}


/* ------------------------------------------------------------
   Official numbers from FPL.

   `ep_next` and `ep_this` are projections FPL computes itself and sends in
   the bootstrap for every player. They are the only projection numbers
   that are not mine — which is why they lead the panels. My own model
   stays where FPL gives nothing (multi-gameweek outlook, doubles).
   ------------------------------------------------------------ */
function epNext(p){
  const v = parseFloat(p.ep_next);
  return Number.isFinite(v) ? v : null;
}
function epThis(p){
  const v = parseFloat(p.ep_this);
  return Number.isFinite(v) ? v : null;
}

/* Safely reads a number from one of several possible field names.

   FPL adds stats between seasons and names occasionally change (defensive
   contributions are recent). This returns null when the field does not
   exist and the caller then simply omits the row instead of printing NaN. */
function stat(p, ...keys){
  for(const k of keys){
    if(p[k] === undefined || p[k] === null || p[k] === '') continue;
    const v = parseFloat(p[k]);
    if(Number.isFinite(v)) return v;
  }
  return null;
}

/* The stats that make sense for a given position.

   You judge a forward by goal involvement, a defender by what his team
   concedes, a keeper by saves. Mixing them into one table means columns
   that say nothing for half the players. */
function positionStats(p){
  const rows = [];
  const add = (label, value, note) => {
    if(value !== null && value !== undefined) rows.push({label, value, note});
  };

  const per90 = (a, b) => {
    const v = stat(p, a);
    return v === null ? null : v.toFixed(2);
  };

  // Common to everyone: how much he has played at all.
  add('Minutes played', p.minutes);
  add('Starty', p.starts);

  if(p.element_type === 1){
    // Goalkeeper: saves are his only scoring contribution of his own.
    add('Saves', stat(p, 'saves'), '1 point per 3');
    add('Saves / 90', per90('saves_per_90'));
    add('Penalties saved', stat(p, 'penalties_saved'), '5 points each');
    add('Clean sheets', stat(p, 'clean_sheets'));
    add('Goals conceded', stat(p, 'goals_conceded'));
    add('xGC / 90', per90('expected_goals_conceded_per_90'), 'expected goals conceded');
  }

  if(p.element_type === 2){
    add('Clean sheets', stat(p, 'clean_sheets'));
    add('Goals conceded', stat(p, 'goals_conceded'));
    add('xGC / 90', per90('expected_goals_conceded_per_90'), 'expected goals conceded');
    add('xGI / 90', per90('expected_goal_involvements_per_90'), 'goals + assists');
    // Defensive contributions are recent; when FPL omits them, the row disappears.
    add('Defensive contributions', stat(p, 'defensive_contribution'), '2 points for 10 actions');
    add('DefCon / 90', per90('defensive_contribution_per_90'));
  }

  if(p.element_type === 3){
    add('xGI', stat(p, 'expected_goal_involvements'));
    add('xGI / 90', per90('expected_goal_involvements_per_90'), 'goals + assists');
    add('xG / 90', per90('expected_goals_per_90'));
    add('xA / 90', per90('expected_assists_per_90'));
    add('xGC / 90', per90('expected_goals_conceded_per_90'), 'clean sheet = 1 point');
    add('Defensive contributions', stat(p, 'defensive_contribution'), '2 points for 12 actions');
  }

  if(p.element_type === 4){
    add('xGI', stat(p, 'expected_goal_involvements'));
    add('xGI / 90', per90('expected_goal_involvements_per_90'), 'goals + assists');
    add('xG / 90', per90('expected_goals_per_90'));
    add('xA / 90', per90('expected_assists_per_90'));
    add('Goals', stat(p, 'goals_scored'));
    add('Asistence', stat(p, 'assists'));
  }

  // Set-piece duties — FPL states these directly, nothing to guess.
  const sp = [];
  if(p.penalties_order === 1) sp.push('penalty');
  if(p.direct_freekicks_order === 1) sp.push('direct free kicks');
  if(p.corners_and_indirect_freekicks_order === 1) sp.push('rohy');
  if(sp.length) rows.push({label: 'Standardky', value: sp.join(', '), text: true});

  add('ICT index', stat(p, 'ict_index'));
  if(p.ict_index_rank_type) rows.push({
    label: 'ICT within position', value: '#' + p.ict_index_rank_type, text: true});

  return rows;
}

function statGrid(p){
  const rows = positionStats(p);
  if(!rows.length) return '';
  return `<div class="pstats">${rows.map(r => `<div>
      <div class="k">${esc(r.label)}</div>
      <div class="v">${esc(String(r.value))}</div>
      ${r.note ? `<div class="nt">${esc(r.note)}</div>` : ''}
    </div>`).join('')}</div>`;
}

/* Normalises a name for comparison: no diacritics, no punctuation, lower
   case, so "Dubravka" spelled either way matches the same query.

   Used by player search as well as several panels, so it lives here in
   core rather than next to any one of them.
   */
function normName(s){
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z ]/g, '').trim();
}

function playerRows(){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const cur = BOOT.events.find(e => e.is_current);
  const nxt = BOOT.events.find(e => e.is_next);
  const startGw = nxt ? nxt.id : (cur ? cur.id + 1 : 1);

  return BOOT.elements.map(p => {
    const f = fdr(p.team, startGw, 5);
    const price = p.now_cost / 10;
    const gwFx = gwFixtures(p.team, startGw);
    return {
      p, team: teams[p.team], price,
      fdr: f.avg,
      gwCount: gwFx.length,          // 0 = blank, 2 = double
      ep: epNext(p),                 // official FPL projection for the next gameweek
      xp: projectGw(p, startGw),     // my model — only for DGW and the outlook
      xp5: projectRange(p, startGw, 5),
      value: p.total_points / price,
      xgi: parseFloat(p.expected_goal_involvements_per_90 || 0),
      chance: p.chance_of_playing_next_round === null ? 100 : p.chance_of_playing_next_round,
    };
  });
}

let PLAYERS = null;
