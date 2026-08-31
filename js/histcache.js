/* FPL Squad Check — archive of finished gameweeks

   The picks and points of a finished gameweek never change again. They
   were still downloaded theirs_ every visit: one request per gameweek for
   player points plus one per league member for picks. For a ten-member
   league that is eleven requests per gameweek, and over ten gameweeks
   more than a hundred — every time someone opens an older gameweek.

   That is also where "prices and stories could not be computed for this
   gameweek" came from: one of those requests failing is enough for a long
   finished gameweek to disappear.

   The answer is an archive. Once a finished gameweek loads successfully,
   its substance is written to localStorage, keyed by league.

   Only what prices and stories actually need is stored, in compressed
   form: picks as `element:position:multiplier:flags` and player points as
   `id:points:minutes`. A gameweek of a ten-member league comes to roughly
   five kilobytes.

   A gameweek in progress, or one still waiting for bonus, is never
   stored. Those numbers still move and the archive would turn them into
   an untruth.
   ============================================================ */

/* Version 2 added the history row (`h`) to a snapshot. Older snapshots are
   still used for picks, they just cannot rebuild the history table. */
const ARCH_V = 2;
const ARCH_KEY = 'sc:gwsnap:';

/* The league ID the archive lives under. Picks are per manager, but a
   snapshot is always a snapshot of a whole league — a different league
   has different members. */
function snapLid(){
  try{ return String(CONFIG.leagueId || localStorage.getItem('fpl_league') || ''); }
  catch(e){ return String(CONFIG.leagueId || ''); }
}

function snapKey(g){ return ARCH_KEY + snapLid() + ':' + g; }

/* ---------- compression ---------- */

/* The gameweek history row. It comes from `entry_history` inside the
   picks we download anyway, so archiving history costs no extra request,
   just a few hundred bytes per gameweek.

   The field order is fixed and must not change; new fields may only be
   appended, or older snapshots would read numbers shifted by one. */
function packHist(eh){
  return [
    eh.points || 0,
    eh.total_points || 0,
    eh.rank || 0,
    eh.overall_rank || 0,
    eh.event_transfers || 0,
    eh.event_transfers_cost || 0,
    eh.points_on_bench || 0,
    eh.value || 0,
    eh.bank || 0,
  ].join(':');
}

function unpackHist(str, gw){
  const n = String(str || '').split(':').map(Number);
  if(n.length < 9) return null;
  return {
    round: gw, event: gw,
    points: n[0], total_points: n[1], rank: n[2], overall_rank: n[3],
    event_transfers: n[4], event_transfers_cost: n[5],
    points_on_bench: n[6], value: n[7], bank: n[8],
  };
}

function packPicks(pk){
  const eh = pk.entry_history || {};
  return {
    c: pk.active_chip || '',
    k: eh.event_transfers_cost || 0,
    b: eh.points || 0,
    h: packHist(eh),
    p: (pk.picks || []).map(x => [
      x.element, x.position, x.multiplier,
      (x.is_captain ? 1 : 0) | (x.is_vice_captain ? 2 : 0),
    ].join(':')).join(','),
  };
}

function unpackPicks(v){
  return {
    active_chip: v.c || null,
    entry_history: {event_transfers_cost: v.k || 0, points: v.b || 0},
    picks: String(v.p || '').split(',').filter(Boolean).map(s => {
      const [el, pos, mult, fl] = s.split(':').map(Number);
      return {
        element: el, position: pos, multiplier: mult,
        is_captain: Boolean(fl & 1), is_vice_captain: Boolean(fl & 2),
      };
    }),
  };
}

/* Points and minutes are all that is needed from a gameweek's live data —
   nothing else reads `event/{gw}/live/` (resolveLineup needs minutes for
   substitutions, the rest needs points). Players with zero in both are
   skipped: the map returns zero for them anyway and they are most of the
   player pool. */
function packLive(live){
  const out = [];
  for(const e of (live && live.elements) || []){
    const s = e.stats || {};
    const tp = s.total_points || 0, mn = s.minutes || 0;
    if(tp || mn) out.push(e.id + ':' + tp + ':' + mn);
  }
  return out.join(',');
}

function unpackLive(str){
  return {elements: String(str || '').split(',').filter(Boolean).map(s => {
    const [id, tp, mn] = s.split(':').map(Number);
    return {id, stats: {total_points: tp || 0, minutes: mn || 0}};
  })};
}

/* A snapshot is keyed by entry ID, not by position in the league. The
   order changes between gameweeks and someone may join — an index would
   then point at somebody else's picks. */
function packSnap(g, members, picks, live){
  const P = {};
  members.forEach((m, i) => {
    const pk = picks && picks[i];
    if(!pk || !Array.isArray(pk.picks) || !pk.picks.length) return;
    P[String(m.entry)] = packPicks(pk);
  });
  return {v: ARCH_V, gw: g, picks: P, live: packLive(live)};
}

/* Returns picks aligned to the current league members plus a list of the
   ones the snapshot does not know — those are fetched from the API.
   Anyone who joined after the snapshot was written cannot be in it, and
   that is no reason to throw the rest away. */
function unpackSnap(snap, members){
  if(!snap || !(snap.v <= ARCH_V) || !snap.picks) return null;
  const byEntry = new Map(Object.entries(snap.picks)
    .map(([e, v]) => [Number(e), unpackPicks(v)]));
  const picks = members.map(m => byEntry.get(m.entry) || null);
  const missing = members.filter((m, i) => !picks[i]);
  return {picks, live: unpackLive(snap.live), missing};
}

/* ---------- localStorage ---------- */

function snapLocalRead(g){
  try{
    const raw = localStorage.getItem(snapKey(g));
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

function snapLocalWrite(g, snap){
  try{
    localStorage.setItem(snapKey(g), JSON.stringify(snap));
  }catch(e){
    /* Quota full. The archive is a convenience, not a necessity — throw
       all of it away and it will work next time. Deleting one at a time
       is pointless: the snapshots are the same size, so it would happen
       again two gameweeks later. */
    try{
      for(const k of Object.keys(localStorage))
        if(k.startsWith(ARCH_KEY)) localStorage.removeItem(k);
      localStorage.setItem(snapKey(g), JSON.stringify(snap));
    }catch(e2){}
  }
}

/* The archive belongs to the league, not the user — switching to another
   entry ID in the same league must not clear it. Called theirs_ sign-out. */
function snapClear(){
  try{
    for(const k of Object.keys(localStorage))
      if(k.startsWith(ARCH_KEY)) localStorage.removeItem(k);
  }catch(e){}
}

/* What the archive currently holds, readable from the console. */
function debugArchive(){
  return {
    league: snapLid() || '(empty!)',
    stored: Object.keys(localStorage).filter(k => k.startsWith(ARCH_KEY)),
  };
}

/* ---------- public interface ---------- */

/* Tries to assemble a gameweek from the archive. Returns true when it
   succeeded well enough that the API need not be touched at all. */
async function snapLoad(g, members){
  const snap = snapLocalRead(g);
  const u = snap && unpackSnap(snap, members);
  if(!u || !u.live.elements.length) return false;

  /* An old snapshot is upgraded to the current version. The data for it
     is at hand — picks carry `entry_history`, which the history row is
     built from — so the upgrade costs no extra request. Without it a
     gameweek archived by an older build would stay without history. */
  if(snap.v < ARCH_V && u.picks.every(Boolean)){
    snapLocalWrite(g, packSnap(g, members, u.picks, u.live));
  }

  NEWS_LIVE.set(g, u.live);

  /* Missing members are fetched one by one and the local copy is
     rewritten, so it does not happen a second time. */
  if(u.missing.length){
    const extra = await pooled(u.missing,
      m => cached('entry/' + m.entry + '/event/' + g + '/picks/'), 5);
    u.missing.forEach((m, j) => {
      const i = members.indexOf(m);
      if(i >= 0 && extra[j] && extra[j].picks) u.picks[i] = extra[j];
    });
    if(u.picks.every(Boolean))
      snapLocalWrite(g, packSnap(g, members, u.picks, u.live));
  }

  NEWS_PICKS.set(g, u.picks);
  return true;
}

/* League history assembled from the archive.

   This is where the archive pays off most. `entry/{id}/history/` is one
   request PER MEMBER — ten members means ten requests every time the hub
   or the league table opens. Yet every finished gameweek is in the
   archive, and the one in progress can supply its points from the league
   standings, which are downloaded anyway.

   Returns null when the archive is not enough. Better to be honest and go
   to the API than to draw a table with holes — a missing gameweek does
   not look like an error, it just looks like different numbers.

   It does not supply `past` (previous seasons). The archive does not know
   those and cannot, so the season history table has to ask for its own
   data. */
async function snapHists(members, curId){
  if(!members || !members.length || !curId) return null;

  const snaps = new Map();

  for(let g = 1; g < curId; g++){
    if(gwPhase(g) !== 'final') continue;      // a live gameweek is not archived
    const snap = snapLocalRead(g);
    // One missing or outdated gameweek wipes out the whole saving. That is
    // harsh, but mixing archive and API per gameweek would cost the same
    // number of requests anyway.
    if(!snap || snap.v !== ARCH_V || !snap.picks) return null;
    snaps.set(g, snap);
  }
  if(!snaps.size) return null;

  return members.map(m => {
    const current = [], chips = [];

    for(const [g, snap] of snaps){
      const v = snap.picks[String(m.entry)];
      if(!v) continue;                        // joined the league later
      const row = unpackHist(v.h, g);
      if(!row) return null;                   // snapshot without history
      current.push(row);
      if(v.c) chips.push({name: v.c, event: g});
    }

    /* The gameweek in progress is not in the archive and must not be. But
       the league standings know its points — the same figure gwRows uses
       when history from FPL has not caught up yet. */
    if(Number.isFinite(m.event_total))
      current.push({round: curId, event: curId, points: m.event_total,
                    total_points: m.total, rank: 0, overall_rank: 0,
                    event_transfers: 0, event_transfers_cost: 0,
                    points_on_bench: 0, value: 0, bank: 0,
                    fromStandings: true});

    current.sort((a, b) => a.round - b.round);
    return {current, chips, past: []};
  });
}

/* Writes a gameweek to the archive. Called only after a successful load
   from the API and only for a gameweek that is fully computed — otherwise
   numbers that can still move would be frozen. */
function snapSave(g, members, picks, live){
  if(!live || !(live.elements || []).length) return;
  if(!picks || !picks.length || !picks.every(p => p && p.picks && p.picks.length)) return;

  snapLocalWrite(g, packSnap(g, members, picks, live));
}
