/* FPL Squad Check — smoke tests

   The tests build a fake bootstrap and fixture list in the shape the FPL API
   sends (including a gameweek with a blank and a double), load the page in
   jsdom and walk the critical functions. They never touch the network.

   Run with: npm test
   ============================================================ */

import { JSDOM } from 'jsdom';
import fs from 'fs';

/* ---------- fake data in the shape FPL sends ---------- */

const teams = [];
const shorts = ['ARS','AVL','BOU','BRE','BHA','BUR','CHE','CRY','EVE','FUL',
                'LEE','LIV','MCI','MUN','NEW','NFO','SUN','TOT','WHU','WOL'];
const fullNames = {MCI:'Man City', MUN:'Man Utd', TOT:'Spurs', NFO:"Nott'm Forest",
                   WOL:'Wolves', NEW:'Newcastle', BHA:'Brighton', BOU:'Bournemouth'};
shorts.forEach((sn, i) => teams.push({
  id: i + 1, name: fullNames[sn] || sn, short_name: sn, code: (i + 1) * 3,
  strength_overall_home: 2 + (i % 4), strength_overall_away: 1 + (i % 4),
  strength_attack_home: 1100 + i * 10, strength_attack_away: 1050 + i * 10,
  strength_defence_home: 1100 + i * 8, strength_defence_away: 1060 + i * 8,
}));

const events = Array.from({length: 38}, (_, i) => ({
  id: i + 1, finished: i < 9, data_checked: i < 9,
  is_current: i === 9, is_next: i === 10,
  deadline_time: new Date(Date.now() + 3 * 3600e3).toISOString(),
}));

let pid = 0;
const elements = [];
for(const t of teams){
  for(const [type, count] of [[1, 2], [2, 5], [3, 5], [4, 3]]){
    for(let k = 0; k < count; k++){
      pid++;
      elements.push({
        id: pid, team: t.id, element_type: type,
        web_name: 'P' + pid, first_name: 'Jan', second_name: 'Novak' + pid,
        now_cost: 45 + ((pid * 7) % 80), total_points: (pid * 3) % 90,
        form: String((pid % 9) / 2),
        minutes: 200 + ((pid * 37) % 700), starts: 2 + (pid % 8), bonus: pid % 12,
        status: 'a', chance_of_playing_next_round: null,
        selected_by_percent: String(((pid * 13) % 400) / 10),
        expected_goals_per_90: String(((pid * 3) % 40) / 100),
        expected_assists_per_90: String(((pid * 5) % 30) / 100),
        expected_goal_involvements_per_90: String(((pid * 7) % 60) / 100),
        transfers_in_event: (pid * 911) % 90000,
        transfers_out_event: (pid * 577) % 70000,
        penalties_order: k === 0 && type === 4 ? 1 : null,
        corners_and_indirect_freekicks_order: k === 1 && type === 3 ? 1 : null,
        code: 100000 + pid,
        cost_change_start: (pid % 7) - 3,
        cost_change_event: (pid % 5) - 2,
        defensive_contribution_per_90: type === 1 ? 0 : ((pid * 3) % 22),
        price_change_percent: String(((pid % 40) - 20) * 4),
        price_change_hourly_rate: ((pid % 9) - 4) * 120,
        price_change_projections: [
          {offset: 0, projected_percent: String((pid % 40) - 20), likelihood: ((pid % 9) - 4)},
          {offset: 1, projected_percent: String((pid % 40) - 15), likelihood: ((pid % 9) - 4)},
          {offset: 2, projected_percent: String((pid % 40) - 10), likelihood: ((pid % 9) - 4)},
        ],
        price_change_locked_until: null,
        ep_next: String(((pid * 11) % 70) / 10),
      });
    }
  }
}

// The fixture list: GW11 deliberately has a blank for team 1 and a double for team 2.
const fixtures = [];
let fid = 0;
for(let gw = 1; gw <= 20; gw++){
  const pool = teams.map(t => t.id);
  if(gw === 11){ pool.splice(pool.indexOf(1), 1); pool.push(2); }
  for(let i = 0; i + 1 < pool.length; i += 2){
    fixtures.push({id: ++fid, event: gw, team_h: pool[i], team_a: pool[i + 1],
      finished: gw < 10,
      stats: gw < 10 ? [{identifier: 'bonus', h: [], a: []}] : [],
      team_h_difficulty: 2 + (i % 4), team_a_difficulty: 2 + ((i + 1) % 4)});
  }
}

const phases = [{id: 1, name: 'Overall', start_event: 1, stop_event: 38},
                {id: 2, name: 'August', start_event: 1, stop_event: 3},
                {id: 3, name: 'September', start_event: 4, stop_event: 7},
                {id: 4, name: 'October', start_event: 8, stop_event: 11},
                {id: 5, name: 'May', start_event: 34, stop_event: 38}];

const bootstrap = {teams, events, elements, phases,
  game_settings: {max_extra_free_transfers: 4},
  game_config: {settings: {price_change_deadlines: [
    new Date(Date.now() + 8 * 3600e3).toISOString()]}}};

/* ---------- loading the page ----------

   The scripts and styles are no longer inside index.html, and jsdom does not
   load them without resources:'usable' — an external <script src> would simply
   never run and everything would fall over. So they are inlined before being
   handed to JSDOM. That keeps it to one process with no network, and tests
   exactly the file order index.html declares. */

function inlineScripts(html){
  return html.replace(
    /<script([^>]*?)\ssrc="(\/[^"]+)"([^>]*)><\/script>/g,
    (all, a, src, b) => {
      const code = fs.readFileSync('.' + src, 'utf8');
      // A </script> inside a string in the code would end the tag early.
      return '<script' + a + b + '>' +
             code.replace(/<\/script>/g, '<\\/script>') + '</script>';
    });
}

const html = inlineScripts(fs.readFileSync('index.html', 'utf8'));

/* The app's source as one string. Tests that check CSS rules or the shape of
   the code used to read index.html, which had everything in it. Since the split
   into css/ and js/, the "source" is the sum of those files. */
const JS_FILES = ['js/core.js', 'js/tabs.js', 'js/status.js', 'js/squad.js',
                  'js/news.js', 'js/ui.js', 'js/histcache.js', 'js/gate.js',
                  'js/topbar.js', 'js/mobile.js', 'js/boot.js'];
const CSS_TAGS = [
  ['css/app.css',    '<style>'],
  ['css/narrow.css', '<style id="mqL" media="(max-width:720px)">'],
  ['css/small.css',  '<style id="mqS" media="(max-width:640px)">'],
  ['css/mobile.css', '<style id="mqM" media="(max-width:720px)">'],
];
const SRC = [fs.readFileSync('index.html', 'utf8')]
  .concat(CSS_TAGS.map(([f, tag]) => tag + fs.readFileSync(f, 'utf8') + '</style>'))
  .concat(JS_FILES.map(f => fs.readFileSync(f, 'utf8')))
  .join('\n');

const dom = new JSDOM(html, {runScripts: 'dangerously', url: 'https://x.test/',
  pretendToBeVisual: true});
const w = dom.window;

// A stub fetch. The tests must never reach the network.
let LEAGUE_SIZE = 8;
let LEAGUE_HAS_NEXT = false;
w.fetch = async (url) => {
  const u = String(url);
  let json = {};
  if(u.includes('bootstrap-static')) json = bootstrap;
  else if(u.includes('fixtures')) json = fixtures;
  else if(u.includes('leagues-classic')){
    json = {league: {id: 14044, name: 'Test League'},
            standings: {has_next: LEAGUE_HAS_NEXT,
              results: Array.from({length: LEAGUE_SIZE}, (_, i) => ({
                entry: 100 + i, player_name: 'Manager ' + (i + 1),
                entry_name: 'Team ' + (i + 1), rank: i + 1,
                total: 500 - i * 10, event_total: 60 - i}))}};
  }
  else if(/entry\/\d+\/$/.test(u)) json = {id: 60480, name: 'Test Team'};
  return {ok: true, status: 200, headers: {get: () => 'application/json'},
          json: async () => json};
};

await new Promise(r => setTimeout(r, 300));

// A top-level `let` in a script does not hang off window — set it inside.
w.__boot = bootstrap; w.__fix = fixtures;
w.eval('BOOT = window.__boot; FIX = window.__fix;');

// A bridge to the script's lexical bindings.
const g = new Proxy({}, {get: (_, k) => w.eval(String(k))});

let passed = 0;
const check = (name, fn) => {
  try{
    const v = fn();
    console.log('\u2713', name, '\u2192', v);
    passed++;
  }catch(e){
    console.log('\u2717', name, '\u2192', e.message);
    process.exitCode = 1;
  }
};

/* ============================================================
   Fixtures, blanks and doubles
   ============================================================ */

check('gwFixtures finds a blank (team 1, GW11)', () => {
  const n = g.gwFixtures(1, 11).length;
  if(n !== 0) throw new Error('expected 0 fixtures, got ' + n);
  return n;
});

check('gwFixtures finds a double (team 2, GW11)', () => {
  const n = g.gwFixtures(2, 11).length;
  if(n !== 2) throw new Error('expected 2 fixtures, got ' + n);
  return n;
});

check('gwShape reports both', () => {
  const sh = g.gwShape(11, 1)[0];
  if(!sh.blanks.length || !sh.doubles.length) throw new Error('shape incomplete');
  return `blanks ${sh.blanks.length}, doubles ${sh.doubles.length}`;
});

check('projectGw of a blank is 0', () => {
  const v = g.projectGw(bootstrap.elements.find(p => p.team === 1), 11);
  if(v !== 0) throw new Error('expected 0, got ' + v);
  return v.toFixed(2);
});

check('projectGw of a double beats a single', () => {
  const p = bootstrap.elements.find(x => x.team === 2);
  const ratio = g.projectGw(p, 11) / Math.max(g.projectGw(p, 12), 0.01);
  if(ratio < 1.5) throw new Error('ratio only ' + ratio.toFixed(2));
  return ratio.toFixed(2) + '\u00d7';
});

check('projectRange over 5 gameweeks', () => {
  const v = g.projectRange(bootstrap.elements[40], 11, 5);
  if(!(v > 0)) throw new Error('non-positive projection');
  return v.toFixed(1);
});

check('ownFdr stays within 1\u20135', () => {
  const vals = [];
  for(const t of teams) for(const o of teams) if(t !== o){
    vals.push(g.ownFdr(t.id, o.id, true), g.ownFdr(t.id, o.id, false));
  }
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if(lo < 1 || hi > 5) throw new Error(`out of range: ${lo}\u2013${hi}`);
  return `min ${lo.toFixed(2)}, max ${hi.toFixed(2)}`;
});

/* ============================================================
   The best XI
   ============================================================ */

const usedForXi = new Set();
check('bestEleven returns a legal formation', () => {
  const squad = Array.from({length: 15}, (_, i) => {
    const types = [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4];
    const p = bootstrap.elements.find(e => e.element_type === types[i] && !usedForXi.has(e.id));
    usedForXi.add(p.id);
    return {p, xp: (i * 37 % 11) / 1.3};
  });
  const b = w.eval('bestEleven')(squad);
  if(b.xi.length !== 11) throw new Error('XI has ' + b.xi.length);
  if(b.bench.length !== 4) throw new Error('bench has ' + b.bench.length);
  const gk = b.xi.filter(s => s.p.element_type === 1).length;
  if(gk !== 1) throw new Error('goalkeepers: ' + gk);
  const def = b.xi.filter(s => s.p.element_type === 2).length;
  if(def < 3) throw new Error('defenders: ' + def);
  const fwd = b.xi.filter(s => s.p.element_type === 4).length;
  if(fwd < 1) throw new Error('forwards: ' + fwd);
  return b.shape;
});

/* ============================================================
   The effective lineup: autosubs and the armband
   ============================================================ */

function lineupFixture(){
  // 1-4-4-2 in the XI, four on the bench — like a real FPL squad.
  const need = [1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 1, 2, 3, 4];
  const used = new Set();
  const picks = [];
  need.forEach((type, i) => {
    const p = bootstrap.elements.find(e => e.element_type === type && !used.has(e.id));
    used.add(p.id);
    picks.push({element: p.id, position: i + 1,
      multiplier: i < 11 ? 1 : 0,
      is_captain: i === 3, is_vice_captain: i === 4});
  });
  return picks;
}

const lp = lineupFixture();

check('resolveLineup substitutes a starter who did not play', () => {
  // Everyone played except the fourth defender; the bench defender comes in.
  const stats = new Map();
  lp.forEach((pk, i) => stats.set(pk.element,
    {minutes: i === 4 ? 0 : 90, total_points: i === 4 ? 0 : 5}));
  w.__pk = {picks: lp, entry_history: {event_transfers_cost: 0}};
  w.__st = stats;
  const L = w.eval('resolveLineup(window.__pk, window.__st, 5)');
  if(!L.subs.length) throw new Error('no substitution was made');
  const inId = L.subs[0].in;
  const row = L.rows.find(r => r.element === inId);
  if(!row || !row.mult) throw new Error('the substitute is not counted');
  return L.subs.length + ' substitution(s)';
});

check('resolveLineup moves the armband to the vice captain', () => {
  const stats = new Map();
  lp.forEach((pk, i) => stats.set(pk.element,
    {minutes: i === 3 ? 0 : 90, total_points: i === 3 ? 0 : 6}));
  w.__pk = {picks: lp, entry_history: {event_transfers_cost: 0}};
  w.__st = stats;
  const L = w.eval('resolveLineup(window.__pk, window.__st, 5)');
  const vice = lp[4].element;
  if(L.capId !== vice) throw new Error('the armband did not move');
  const row = L.rows.find(r => r.element === vice);
  if(row.mult !== 2) throw new Error('the vice captain is not doubled: ' + row.mult);
  return 'captain \u2192 vice, \u00d7' + row.mult;
});

check('resolveLineup keeps eleven players on the pitch', () => {
  const stats = new Map();
  lp.forEach(pk => stats.set(pk.element, {minutes: 90, total_points: 4}));
  w.__pk = {picks: lp, entry_history: {event_transfers_cost: 0}};
  w.__st = stats;
  const L = w.eval('resolveLineup(window.__pk, window.__st, 5)');
  const playing = L.rows.filter(r => r.mult > 0);
  if(playing.length !== 11) throw new Error('the XI has ' + playing.length);
  return 'XI intact, total ' + L.total;
});

/* ============================================================
   The gameweek phase
   ============================================================ */

check('gwPhase reads a finished gameweek as final', () => {
  const p = g.gwPhase(3);
  if(p !== 'final') throw new Error('got ' + p);
  return p;
});

check('gwPhase does not call an unplayed gameweek final', () => {
  const p = g.gwPhase(15);
  if(p === 'final') throw new Error('an unplayed gameweek reported as final');
  return p;
});

/* ============================================================
   League history and standings
   ============================================================ */

check('pointsByRound indexes by round, not by array position', () => {
  const m = g.pointsByRound({current: [{round: 5, total_points: 50},
                                       {round: 6, total_points: 70}]});
  if(m.get(5).total_points !== 50) throw new Error('wrong round mapping');
  return m.get(5).total_points + ' / ' + m.get(6).total_points;
});

check('leagueRanks copes with a manager who joined in GW2', () => {
  const members = [{entry: 1}, {entry: 2}];
  const hists = [{current: [{round: 1, total_points: 10}, {round: 2, total_points: 20}]},
                 {current: [{round: 2, total_points: 30}]}];
  const r = g.leagueRanks(members, hists);
  if(r.ranks[1][1] !== 1) throw new Error('the later joiner is ranked wrong');
  return 'gws=' + r.gws + ', GW2 ranks ' + r.ranks[0][1] + '/' + r.ranks[1][1];
});

/* ============================================================
   The gameweek archive (localStorage only)
   ============================================================ */

check('the archive packs and unpacks picks', () => {
  const members = [{entry: 100}, {entry: 101}];
  const picks = members.map(() => ({
    active_chip: null,
    entry_history: {points: 55, total_points: 300, rank: 1, overall_rank: 9000,
      event_transfers: 1, event_transfers_cost: 0, points_on_bench: 4,
      value: 1005, bank: 5},
    picks: lp,
  }));
  const live = {elements: lp.map((pk, i) => ({id: pk.element,
    stats: {total_points: i, minutes: 90}}))};
  w.__m = members; w.__p = picks; w.__l = live;
  const snap = w.eval('packSnap(7, window.__m, window.__p, window.__l)');
  w.__snap = snap;
  const back = w.eval('unpackSnap(window.__snap, window.__m)');
  if(back.missing.length) throw new Error('members went missing');
  if(back.picks[0].picks.length !== 15) throw new Error('picks are incomplete');
  if(!back.live.elements.length) throw new Error('live points were lost');
  return back.picks.length + ' squads, ' + back.live.elements.length + ' players';
});

check('the archive marks an unknown member as missing', () => {
  w.__m2 = [{entry: 100}, {entry: 999}];
  w.__snap2 = {v: 2, gw: 7,
    picks: {100: {c: '', k: 0, b: 0, h: '', p: '1:1:1:1'}}, live: '1:5:90'};
  const back = w.eval('unpackSnap(window.__snap2, window.__m2)');
  if(back.missing.length !== 1) throw new Error('missing: ' + back.missing.length);
  return back.missing[0].entry + ' is fetched from the API';
});

check('the history row survives a round trip', () => {
  const eh = {points: 55, total_points: 300, rank: 2, overall_rank: 9000,
    event_transfers: 1, event_transfers_cost: 4, points_on_bench: 7,
    value: 1005, bank: 5};
  w.__eh = eh;
  const packed = w.eval('packHist(window.__eh)');
  w.__packed = packed;
  const row = w.eval('unpackHist(window.__packed, 7)');
  if(row.points !== 55 || row.points_on_bench !== 7 || row.event_transfers_cost !== 4)
    throw new Error('the row came back changed');
  if(row.event !== 7) throw new Error('the FPL history key is `event`, got ' + row.event);
  return 'ok';
});

/* ============================================================
   Rendering
   ============================================================ */

check('buildTicker renders rows and marks the blank', () => {
  const out = g.buildTicker();
  const rows = (out.match(/<tr>/g) || []).length;
  if(!/class="fx blank"/.test(out)) throw new Error('the blank is not marked');
  return rows + ' rows';
});

check('buildShape names GW11', () => {
  if(!g.buildShape().includes('GW11')) throw new Error('GW11 is missing');
  return 'ok';
});

check('buildPrices renders something', () => {
  const out = g.buildPrices();
  if(out.length < 500) throw new Error('suspiciously short output');
  return out.length + ' characters';
});

check('playerRows counts blanks', () => {
  const rows = g.playerRows();
  return rows.length + ' players, ' + rows.filter(r => r.gwCount === 0).length + ' blanks';
});

check('esc escapes quotes and apostrophes', () => {
  const out = g.esc('<a href="x" a=\'b\'>&');
  if(out.includes('<') || out.includes('"') || out.includes("'"))
    throw new Error('something got through: ' + out);
  return out;
});

check('render() draws the squad panel', () => {
  const entry = {name: 'Test Team', player_first_name: 'Jan', player_last_name: 'Novak',
    summary_overall_points: 512, summary_overall_rank: 123456};
  w.eval('render')(entry, {picks: lp}, 11);
  const out = w.document.getElementById('out').innerHTML;
  if(!out.includes('Easiest fixtures')) throw new Error('the easiest fixtures block is missing');
  if(!out.includes('Your three most expensive')) throw new Error('the expensive players block is missing');
  return out.length + ' characters';
});

/* ============================================================
   The entry screen
   ============================================================ */

const gateMsg = () => w.document.getElementById('gatemsg').textContent;

check('the gate refuses an empty form', () => {
  w.document.getElementById('eid').value = '';
  w.document.getElementById('lid').value = '';
  w.eval('submitGate()');
  if(!gateMsg()) throw new Error('no message shown');
  return gateMsg();
});

check('the gate refuses a team ID without a league', () => {
  w.document.getElementById('eid').value = '60480';
  w.document.getElementById('lid').value = '';
  w.eval('submitGate()');
  if(!/league/i.test(gateMsg())) throw new Error('unexpected message: ' + gateMsg());
  return gateMsg();
});

check('the gate refuses a non-numeric ID', () => {
  w.document.getElementById('eid').value = 'abc';
  w.document.getElementById('lid').value = '14044';
  w.eval('submitGate()');
  if(!/number/i.test(gateMsg())) throw new Error('unexpected message: ' + gateMsg());
  return gateMsg();
});

check('the league size cap is set to 15', () => {
  const n = g.CONFIG.maxMembers;
  if(n !== 15) throw new Error('maxMembers is ' + n);
  return n;
});

check('CONFIG carries no hard-coded league', () => {
  const c = g.CONFIG;
  if(c.leagueId || c.entryId) throw new Error('an ID is baked into CONFIG');
  if(Object.keys(c.officialSeasons).length) throw new Error('officialSeasons is not empty');
  return 'generic';
});

let capMsg = '', pageMsg = '', okLeague = null;

/* The league checks are asynchronous, so they run before the summary rather
   than inside check() — an assertion that resolves later would report success
   before it knew anything. */
LEAGUE_SIZE = 16;
w.eval('dropCached(/leagues-classic/)');
try{ await w.eval('checkLeague(14044)'); }catch(e){ capMsg = e.message; }

LEAGUE_SIZE = 8;
LEAGUE_HAS_NEXT = true;
w.eval('dropCached(/leagues-classic/)');
try{ await w.eval('checkLeague(14044)'); }catch(e){ pageMsg = e.message; }

LEAGUE_HAS_NEXT = false;
w.eval('dropCached(/leagues-classic/)');
try{ okLeague = await w.eval('checkLeague(14044)'); }catch(e){}

check('checkLeague refuses a league over the cap', () => {
  if(!capMsg) throw new Error('a 16-member league was accepted');
  if(!/15/.test(capMsg)) throw new Error('the message does not state the limit: ' + capMsg);
  return capMsg;
});

check('checkLeague refuses a league with a second page', () => {
  if(!pageMsg) throw new Error('a paginated league was accepted');
  return pageMsg;
});

check('checkLeague accepts a league within the cap', () => {
  if(!okLeague) throw new Error('a valid league was refused');
  if(okLeague.members.length !== 8) throw new Error('members: ' + okLeague.members.length);
  return okLeague.league.name + ', ' + okLeague.members.length + ' members';
});

/* ============================================================
   The build itself
   ============================================================ */

check('nothing in the source is left in Czech', () => {
  const hits = SRC.split('\n').filter(l => /[ěščřžýáíéúůťďňó]/i.test(l));
  if(hits.length) throw new Error(hits.length + ' lines, first: ' + hits[0].trim().slice(0, 60));
  return 'clean';
});

check('the removed modules are gone', () => {
  for(const f of ['js/h2h.js', 'js/advisor.js', 'js/planner.js', 'js/sync.js',
                  'js/firebase.js']){
    if(fs.existsSync(f)) throw new Error(f + ' still exists');
  }
  if(/firebase|firestore/i.test(SRC)) throw new Error('a Firebase reference is left in the source');
  return 'clean';
});

check('index.html and sw.js list the same scripts', () => {
  const inHtml = [...fs.readFileSync('index.html', 'utf8')
    .matchAll(/<script src="\/(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
  const sw = fs.readFileSync('sw.js', 'utf8');
  for(const f of inHtml){
    if(!sw.includes("'/" + f + "'")) throw new Error(f + ' is missing from sw.js');
  }
  if(inHtml.length !== JS_FILES.length)
    throw new Error('index.html loads ' + inHtml.length + ', the tests know ' + JS_FILES.length);
  return inHtml.length + ' scripts';
});

check('every tab button has a panel and is in TABS', () => {
  const doc = w.document;
  const tabs = [...doc.querySelectorAll('.nav [role="tab"]')];
  for(const t of tabs){
    if(!doc.getElementById(t.getAttribute('aria-controls')))
      throw new Error(t.id + ' points at a panel that does not exist');
  }
  const inTabs = new Set(g.TABS.map(p => p[0]));
  for(const t of tabs){
    if(!inTabs.has(t.id)) throw new Error(t.id + ' is missing from TABS');
  }
  if(inTabs.size !== tabs.length)
    throw new Error('TABS has ' + inTabs.size + ', the markup has ' + tabs.length);
  return tabs.length + ' tabs';
});

check('the difficulty scale is one set of variables', () => {
  const css = fs.readFileSync('css/app.css', 'utf8');
  // Only the light theme block counts; the dark theme deliberately overrides
  // the same tokens once more.
  const light = css.slice(0, css.indexOf('[data-theme="dark"]'));
  for(const n of [1, 2, 3, 4, 5]){
    const hits = (light.match(new RegExp('--f' + n + '\\s*:', 'g')) || []).length;
    if(hits !== 1) throw new Error('--f' + n + ' is defined ' + hits + '\u00d7');
  }
  return '5 tokens, one definition each';
});

check('no media query is defined twice in app.css', () => {
  const css = fs.readFileSync('css/app.css', 'utf8');
  const seen = new Map();
  for(const m of css.matchAll(/@media([^{]+)\{/g)){
    const key = m[1].replace(/\s+/g, '');
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const dupes = [...seen].filter(([, n]) => n > 1);
  if(dupes.length) throw new Error('duplicated: ' + dupes.map(d => d[0]).join(', '));
  return seen.size + ' unique queries';
});

check('the service worker never caches API data', () => {
  const sw = fs.readFileSync('sw.js', 'utf8');
  if(!/pathname\.startsWith\('\/api\/'\)\)\s*return/.test(sw))
    throw new Error('the /api/ bypass is missing');
  return 'ok';
});

await new Promise(r => setTimeout(r, 200));
console.log('\n' + passed + ' checks passed' +
  (process.exitCode ? ', some failed' : ''));
