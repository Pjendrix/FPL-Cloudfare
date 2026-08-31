/* FPL Squad Check — tab content

   Rendering of the individual sections: easiest fixtures, top players,
   league history, differentials, prices and the watchlist, monthly
   tables. By far the largest file in the project.

   The js/ files load as classic <script> tags in a fixed order and share
   one global scope: nothing is exported or imported, but hoisting does
   not cross file boundaries. The order is therefore part of the contract
   and is written down in index.html.
   ============================================================ */
/* ============================================================
   EASIEST FIXTURES

   This replaces a captain recommendation by xP. Reason: FPL's `ep_next`
   is rounded to one decimal and for top players comes out almost the same
   (Haaland 4.0, Fernandes 4.0), so no ranking emerges — the app then
   seriously said "they are indistinguishable", which was useless.

   This block recommends nothing. It shows the two teams with the easiest
   fixture next gameweek, who they play, the computed difficulty — and
   which of their players you own. The decision is yours; this is input.
   ============================================================ */

/* A team's difficulty in a given gameweek. A double is taken as the
   average of both matches: two medium fixtures are often better for a
   captain than one easy one, but we do not want that to outrank a genuinely
   easy run of fixtures. */
function teamGwFdr(teamId, gw){
  // gwFixtures already returns unpacked {opp, home, d}, not raw fixtures.
  const fx = gwFixtures(teamId, gw);
  if(!fx.length) return null;
  const vals = fx.map(f => ownFdr(teamId, f.opp, f.home, f.d));
  return {
    fdr: vals.reduce((a, b) => a + b, 0) / vals.length,
    fixtures: fx,
  };
}

/* A "team vs opponent" line with badges and colour-coded difficulty. */
function fixtureLine(teamId, info){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  return info.fixtures.map(f => `<span class="fxpair">
      ${crest(teamId, 'sm')}<b>${esc(teams[teamId].short_name)}</b>
      <span class="vs">${f.home ? 'doma s' : 'venku na'}</span>
      ${crest(f.opp, 'sm')}<b>${esc(teams[f.opp].short_name)}</b>
    </span>`).join('<span class="amp">a</span>');
}

function easiestFixtures(squad, startGw){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  const ranked = BOOT.teams
    .map(t => ({t, ...(teamGwFdr(t.id, startGw) || {})}))
    .filter(x => Number.isFinite(x.fdr))
    .sort((a, b) => a.fdr - b.fdr)
    .slice(0, 2);

  if(!ranked.length)
    return '<p class="note">Fixtures for the next gameweek are not available yet.</p>';

  const cards = ranked.map((x, i) => {
    const mine = squad.filter(s => s.p.team === x.t.id)
      .sort((a, b) => b.p.now_cost - a.p.now_cost);

    return `<div class="easy">
      <div class="easyhead">
        <span class="rk">${i + 1}.</span>
        <span class="fx">${fixtureLine(x.t.id, x)}</span>
        <span class="fdr ${fdrClass(x.fdr)}">${x.fdr.toFixed(1)}</span>
      </div>
      ${mine.length
        ? `<div class="easymine">${mine.map(s => `<span class="pl">
             <b>${esc(s.p.web_name)}</b>
             <em>${(s.p.now_cost / 10).toFixed(1)}m</em>
             ${s.starting ? '' : '<u>bench</u>'}
           </span>`).join('')}</div>`
        : '<p class="easynone">You own nobody from this team.</p>'}
    </div>`;
  }).join('');

  return `<h2>Easiest fixtures for GW${startGw}${info(`The two teams with the easiest match next gameweek.
      Difficulty is computed from the strength of both teams, not from FPL's fixed FDR, and home
      and away are distinguished. For a double gameweek the average of both matches is used.
      <b>This is not a captain recommendation</b> — an easy fixture does not score points by itself.
      It is input: these are the teams where you can expect a one-sided game.
      branku.`)}</h2>
    <div class="easygrid">${cards}</div>
    `;
}

/* The three most expensive players in the squad and what they face.

   The priciest players are the ones the season rests on — and the ones
   where it pays most to know whether an easy or a hard match is coming. */
function topPriceBlock(squad, startGw){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const top = [...squad]
    .sort((a, b) => b.p.now_cost - a.p.now_cost)
    .slice(0, 3);

  if(!top.length) return '';

  return `<h2>Your three most expensive${info(`The priciest players in the squad and what they face in GW${startGw}.
      The number on the right is fixture difficulty on a 1–5 scale.`)}</h2>
    <div class="pricetop">${top.map(s => {
      const info = teamGwFdr(s.p.team, startGw);
      return `<div class="ptrow">
        <span class="who">${crest(s.p.team, 'sm')}
          <b>${esc(s.p.web_name)}</b>
          <em class="sub">${esc(teams[s.p.team].short_name)}</em></span>
        <span class="cost">${(s.p.now_cost / 10).toFixed(1)}m</span>
        <span class="fx">${info
          ? fixtureLine(s.p.team, info)
          : '<span class="blankfx">blank gameweek</span>'}</span>
        <span class="fdr ${info ? fdrClass(info.fdr) : 'blank'}">${
          info ? info.fdr.toFixed(1) : '–'}</span>
      </div>`;
    }).join('')}</div>
    `;
}

/* ============================================================
   TOP PLAYERS

   This used to be a filterable table of all ~700 players. It worked, but
   it answered the question "find me a specific player" — which people
   rarely ask. The commoner one is "who is the best at X this season", and
   answering that from one long table meant sorting and clicking.

   Now they are leaderboards: one box per category, top 10 in each. Below
   them, a side-by-side comparison of any two players.
   ============================================================ */

/* A category: [key, heading, caption, number format, allowed positions].

   The fields are read through stat(), so when FPL does not send them in a
   given season the box says so instead of showing zeroes. */
/* Row 1: points by position. The commonest question early in the season
   is not "who scored the most goals" but "who is the best midfielder this
   year" — and a goals table answers that badly, because a defender with
   five clean sheets is not in it at all. */
const TOP_POINTS = [
  ['total_points', 'Goalkeepers', 'most points this season', v => v, [1]],
  ['total_points', 'Defenders', 'most points this season', v => v, [2]],
  ['total_points', 'Midfielders', 'most points this season', v => v, [3]],
  ['total_points', 'Forwards', 'most points this season', v => v, [4]],
];

/* Rows 2 and 3: eight categories; the grid has four columns, so it wraps
   exactly four and four. The order is not random — what actually happened
   on top, expected values below. */
const TOP_FIELD = [
  ['goals_scored', 'Goals', 'goals this season', v => v, null],
  ['assists', 'Assists', 'assists this season', v => v, null],
  ['defensive_contribution', 'DEFCON',
    'defensive contributions · 2 points at the threshold', v => v, null],
  ['bonus', 'Bonus', 'bonus points from BPS', v => v, null],
  ['expected_goals', 'xG', 'expected goals from chance quality',
    v => v.toFixed(2), null],
  ['expected_assists', 'xA', 'expected assists',
    v => v.toFixed(2), null],
  ['expected_goal_involvements', 'xGI', 'xG a xA dohromady',
    v => v.toFixed(2), null],
  ['expected_goal_involvements_per_90', 'xGI / 90',
    'expected involvement per 90 minutes', v => v.toFixed(2), null],
];

const TOP_GK = [
  ['clean_sheets', 'Clean sheets', 'matches without conceding', v => v, [1]],
  ['saves', 'Saves', 'one point per three', v => v, [1]],
  ['saves_per_90', 'Saves / 90', 'goalkeeper workload', v => v.toFixed(2), [1]],
  ['bonus', 'Goalkeeper bonus', 'bonus points from BPS', v => v, [1]],
];

/* One leaderboard. `types` limits the positions — goalkeeper categories
   make no sense across outfield players, and goals across keepers. */
function topBoard([key, title, cap, fmt, types]){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  const pool = BOOT.elements.filter(p => {
    if(types) return types.includes(p.element_type) && stat(p, key) !== null;
    return p.element_type !== 1 && stat(p, key) !== null;
  });

  const rows = pool
    .map(p => ({p, v: stat(p, key)}))
    .filter(x => x.v > 0)
    .sort((a, b) => b.v - a.v || b.p.total_points - a.p.total_points)
    .slice(0, 10);

  if(!rows.length)
    return `<div class="tbox">
      <h4>${esc(title)}</h4><p class="cap">${esc(cap)}</p>
      <p class="tempty">FPL does not send this stat yet, or nobody has a
        non-zero value.</p></div>`;

  /* A trophy for the first three — the same medals as in the historical
     seasons table, so the app does not have two different ways of saying
     "third place". The medal replaces the position number, it is not added to it. */
  return `<div class="tbox">
    <h4>${esc(title)}${info(`Top 10 across the whole season. Click a name for player
      detail. Highlighted rows are players in your squad.`)}</h4><p class="cap">${esc(cap)}</p>
    <ol class="tlist">${rows.map((x, i) => `<li class="${
        MY_SQUAD && MY_SQUAD.has(x.p.id) ? 'me' : ''}">
      ${i < 3 ? `<i class="tmdl" title="place ${i + 1}">${MEDAL[i + 1]}</i>` : ''}
      <button type="button" class="tname" data-pid="${x.p.id}">
        ${crest(x.p.team, 'sm')}
        <b>${esc(x.p.web_name)}</b>
        <em>${esc(teams[x.p.team].short_name)}</em>
      </button>
      <span class="tval">${esc(String(fmt(x.v)))}</span>
    </li>`).join('')}</ol>
  </div>`;
}

/* ------------------------------------------------------------
   Comparing two players.

   The commonest question in FPL is not "who is best" but "which of these
   two". Players used to be picked with a button in a long table; now
   there are two searchable lists, so anyone can be compared with anyone
   without hunting for a row.
   ------------------------------------------------------------ */
let CMP_A = null, CMP_B = null;

function comparePickers(){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const opts = sel => BOOT.elements
    .slice()
    .sort((a, b) => b.total_points - a.total_points)
    .map(p => `<option value="${p.id}"${String(sel) === String(p.id) ? ' selected' : ''}>${
      POS[p.element_type]} · ${esc(p.web_name)} · ${esc(teams[p.team].short_name)} · ${
      p.total_points} b</option>`).join('');

  return `<div class="cmpbar">
    <label>First player
      <input type="search" id="cmpqa" placeholder="Search by name…" autocomplete="off">
      <select id="cmpa"><option value="">Pick a player…</option>${opts(CMP_A)}</select>
    </label>
    <span class="cmpvs">vs</span>
    <label>Second player
      <input type="search" id="cmpqb" placeholder="Search by name…" autocomplete="off">
      <select id="cmpb"><option value="">Pick a player…</option>${opts(CMP_B)}</select>
    </label>
  </div>`;
}

/* A comparison row: [label, text A, text B, number A, number B, is higher better?].
   For price and goals conceded lower is better — hence the last flag. */
function compareRows(a, b){
  const num = (p, k) => stat(p, k) || 0;
  const both = (label, fn, fmt, higher = true) =>
    [label, fmt(fn(a)), fmt(fn(b)), fn(a), fn(b), higher];

  const rows = [
    both('Body celkem', p => p.total_points, v => v),
    both('Points per match', p => parseFloat(p.points_per_game) || 0, v => v.toFixed(1)),
    both('Forma', p => parseFloat(p.form) || 0, v => v.toFixed(1)),
    both('FPL projection · next gameweek', p => epNext(p) || 0, v => v.toFixed(1)),
    both('Cena', p => p.now_cost / 10, v => v.toFixed(1) + 'm', false),
    both('Body za milion', p => p.total_points / (p.now_cost / 10), v => v.toFixed(1)),
    both('Minuty', p => p.minutes, v => v),
    both('Starty', p => p.starts || 0, v => v),
    both('Owned %', p => parseFloat(p.selected_by_percent) || 0, v => v.toFixed(1) + ' %'),
    both('Bonus points', p => p.bonus || 0, v => v),
  ];

  // Goalkeepers and outfield players are judged on different things.
  if(a.element_type === 1 && b.element_type === 1){
    rows.push(both('Clean sheets', p => num(p, 'clean_sheets'), v => v));
    rows.push(both('Saves', p => num(p, 'saves'), v => v));
    rows.push(both('Saves / 90', p => num(p, 'saves_per_90'), v => v.toFixed(2)));
    rows.push(both('Goals conceded', p => num(p, 'goals_conceded'), v => v, false));
  }else{
    rows.push(both('Goals', p => p.goals_scored || 0, v => v));
    rows.push(both('Asistence', p => p.assists || 0, v => v));
    rows.push(both('xG', p => num(p, 'expected_goals'), v => v.toFixed(2)));
    rows.push(both('xA', p => num(p, 'expected_assists'), v => v.toFixed(2)));
    rows.push(both('xGI / 90', p => num(p, 'expected_goal_involvements_per_90'),
      v => v.toFixed(2)));
    rows.push(both('DEFCON', p => num(p, 'defensive_contribution'), v => v));
  }

  rows.push(both('ICT index', p => num(p, 'ict_index'), v => v.toFixed(1)));
  return rows;
}

function drawCompare(){
  const box = $('pcompare');
  if(!box) return;

  const a = CMP_A ? BOOT.elements.find(p => p.id === CMP_A) : null;
  const b = CMP_B ? BOOT.elements.find(p => p.id === CMP_B) : null;
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  let body;
  if(!a || !b){
    body = ``;
  }else if(a.id === b.id){
    body = '<p class="note">That is the same player twice — pick two different ones.</p>';
  }else{
    const rows = compareRows(a, b).map(([label, va, vb, na, nb, higher]) => {
      const aw = higher ? na > nb : na < nb;
      const bw = higher ? nb > na : nb < na;
      return `<tr>
        <td class="${aw ? 'win' : ''}">${esc(String(va))}</td>
        <td class="lbl">${esc(label)}</td>
        <td class="${bw ? 'win' : ''}">${esc(String(vb))}</td>
      </tr>`;
    }).join('');

    /* The verdict comes from a projection five gameweeks ahead, not from
       season totals. Those say who has been better — not who will be, and
       that is the question people ask when comparing. */
    const start = planStartGw();
    const xa = projectRange(a, start, 5), xb = projectRange(b, start, 5);
    const diff = Math.abs(xa - xb);
    const lead = xa > xb ? a : b, other = xa > xb ? b : a;
    const dPrice = (lead.now_cost - other.now_cost) / 10;

    body = `<div class="chead">
        <div><b>${esc(a.web_name)}</b><span>${esc(teams[a.team].short_name)} ·
          ${POS[a.element_type]} · ${(a.now_cost / 10).toFixed(1)}m</span></div>
        <div class="vs">vs</div>
        <div><b>${esc(b.web_name)}</b><span>${esc(teams[b.team].short_name)} ·
          ${POS[b.element_type]} · ${(b.now_cost / 10).toFixed(1)}m</span></div>
      </div>
      <table class="ctab"><tbody>${rows}</tbody></table>
      <p class="note">${diff < 1.5
        ? `Over the next five gameweeks they are practically indistinguishable (a difference of
           ${diff.toFixed(1)} bodu). Rozhodni podle awards_ nebo podle toho,
           who your mini-league owns.`
        : `Over the next five gameweeks <b>${esc(lead.web_name)}</b> leads by
           ${diff.toFixed(1)} bodu. ${dPrice > 0
             ? `But he costs ${dPrice.toFixed(1)}m more — ask whether that
                difference would work harder elsewhere in the squad.`
             : dPrice < 0 ? 'And he is cheaper too.' : 'For the same money.'}`}
        ${a.element_type !== b.element_type
          ? '<br><b>Careful:</b> you are comparing different positions, so the scoring differs too — '
            + 'a clean sheet is worth 4 points to a defender, 1 to a midfielder and none to a forward.'
          : ''}</p>`;
  }

  box.innerHTML = `<h2>Compare two players${info(`Pick two players and I will put them
      side by side. A green cell shows who leads on that measure. The set of rows
      changes with position: two goalkeepers get saves and goals conceded, outfield
      players get xG, xA and defensive contributions. For price and goals conceded the
      lower number wins. The verdict at the bottom comes from a projection five gameweeks
      ahead, not from season totals — those say who has been better, not who will be.`)}</h2>${comparePickers()}
    <div class="cmpout">${body}</div>`;

  /* The search does not filter the list, it selects the best match.
     Filtering a <select> means deleting and rebuilding hundreds of
     <option> elements on every keystroke — this is faster and, more
     importantly, the player you just picked does not vanish. */
  const wire = (qid, sid, set) => {
    const sel = $(sid), q = $(qid);
    sel.addEventListener('change', () => {
      set(sel.value ? Number(sel.value) : null);
      drawCompare();
    });
    q.addEventListener('input', () => {
      const needle = normName(q.value);
      if(!needle) return;
      const hit = BOOT.elements
        .filter(p => normName(p.web_name + ' ' + p.second_name).includes(needle))
        .sort((x, y) => y.total_points - x.total_points)[0];
      if(hit){ set(hit.id); drawCompare(); }
    });
  };
  wire('cmpqa', 'cmpa', v => { CMP_A = v; });
  wire('cmpqb', 'cmpb', v => { CMP_B = v; });
}

function drawTopPlayers(){
  $('pout').innerHTML = [
    `<h2>Most points by position${info(`Top 10 in each line across the whole season.
      Highlighted rows are players in your squad — load it in the Squad tab.
      Click a name for player detail.`)}</h2>`,
    `<div class="tgrid">${TOP_POINTS.map(topBoard).join('')}</div>`,
    '<h2>Outfield players</h2>',
    `<div class="tgrid">${TOP_FIELD.map(topBoard).join('')}</div>`,
    '<h2>Goalkeepers</h2>',
    `<div class="tgrid">${TOP_GK.map(topBoard).join('')}</div>`,
  ].join('');

  $('pout').querySelectorAll('button.tname').forEach(btn =>
    btn.addEventListener('click', () => showPlayer(Number(btn.dataset.pid))));

  drawCompare();
}

async function loadPlayers(){
  $('pmsg').textContent = '';
  try{
    /* The fixture list is needed for the projection in the comparison
       verdict. This used to be reached with BOOT loaded and FIX null, the
       function threw and the tab stayed blank without a word. A silent
       failure is worse than a loud one. */
    if(!BOOT) BOOT = await api('bootstrap-static/');
    if(!FIX) FIX = await api('fixtures/');
    if(!PLAYERS){
      $('pout').innerHTML = '<div class="skel"><i></i><i></i><i></i><i></i><i></i></div>';
      PLAYERS = playerRows();
    }
    drawTopPlayers();
  }catch(e){
    $('pmsg').innerHTML = errBox(e.message, 't-players');
    $('pout').innerHTML = '';
  }
}

async function showPlayer(pid){
  const row = PLAYERS.find(r => r.p.id === pid);
  $('pdetail').innerHTML = '<div class="detail"><p class="note">Loading history…</p></div>';
  $('pdetail').scrollIntoView({behavior: 'smooth', block: 'nearest'});

  let sum;
  try { sum = await api('element-summary/' + pid + '/'); }
  catch(e){ $('pdetail').innerHTML = `<div class="detail"><p class="note">${esc(e.message)}</p></div>`; return; }

  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const hist = sum.history || [];
  const last5 = hist.slice(-5);

  const agg = last5.reduce((a, h) => ({
    pts: a.pts + h.total_points, min: a.min + h.minutes,
    g: a.g + h.goals_scored, as: a.as + h.assists,
    xg: a.xg + parseFloat(h.expected_goals || 0),
    xa: a.xa + parseFloat(h.expected_assists || 0),
    bps: a.bps + h.bonus,
  }), {pts: 0, min: 0, g: 0, as: 0, xg: 0, xa: 0, bps: 0});

  const pillCls = v => v >= 7 ? 'p-hi' : v >= 3 ? 'p-md' : 'p-lo';

  const pills = last5.length
    ? `<div class="pills">${last5.map(h => `<span class="pill ${pillCls(h.total_points)}">
        ${h.total_points}<small>GW${h.round}</small></span>`).join('')}</div>`
    : '<p class="note">No matches played this season yet.</p>';

  const season = hist.reduce((a, h) => ({
    pts: a.pts + h.total_points, min: a.min + h.minutes,
    g: a.g + h.goals_scored, as: a.as + h.assists,
  }), {pts: 0, min: 0, g: 0, as: 0});

  const upcoming = (sum.fixtures || []).slice(0, 5).map(f => {
    const opp = teams[f.is_home ? f.team_a : f.team_h];
    return `${opp ? opp.short_name : '?'}${f.is_home ? ' (D)' : ' (V)'} · ${f.difficulty}`;
  }).join(' | ');

  const table = hist.length ? `<table style="margin-top:14px">
    <thead><tr><th>GW</th><th class="hide-s">Opponent</th><th class="n">Min</th>
      <th class="n">G</th><th class="n">A</th><th class="n hide-s">xG</th>
      <th class="n hide-s">xA</th><th class="n">Bon</th><th class="n">Body</th></tr></thead>
    <tbody>${hist.slice().reverse().slice(0, 12).map(h => {
      const opp = teams[h.opponent_team];
      return `<tr>
        <td>${h.round}</td>
        <td class="hide-s">${opp ? esc(opp.short_name) : '–'}${h.was_home ? ' (D)' : ' (V)'}</td>
        <td class="n">${h.minutes}</td>
        <td class="n">${h.goals_scored}</td>
        <td class="n">${h.assists}</td>
        <td class="n hide-s">${parseFloat(h.expected_goals || 0).toFixed(2)}</td>
        <td class="n hide-s">${parseFloat(h.expected_assists || 0).toFixed(2)}</td>
        <td class="n">${h.bonus}</td>
        <td class="n"><b>${h.total_points}</b></td>
      </tr>`;
    }).join('')}</tbody></table>` : '';

  // Previous seasons — the only defence against a small sample for a
  // player who has played a few hundred minutes this year.
  const past = (sum.history_past || []).slice(-4).reverse();
  const pastHtml = past.length ? `
    <h2>Previous seasons</h2>
    <table>
      <thead><tr><th>Season</th><th class="n">Points</th><th class="n">Minutes</th>
        <th class="n hide-s">Cena start</th><th class="n hide-s">Cena konec</th></tr></thead>
      <tbody>${past.map(x => `<tr>
        <td>${esc(x.season_name)}</td>
        <td class="n"><b>${x.total_points}</b></td>
        <td class="n">${x.minutes}</td>
        <td class="n hide-s">${(x.start_cost / 10).toFixed(1)}</td>
        <td class="n hide-s">${(x.end_cost / 10).toFixed(1)}</td>
      </tr>`).join('')}</tbody>
    </table>`
    : '<p class="note">He has not played a previous Premier League season.</p>';

  $('pdetail').innerHTML = `<div class="detail">
    <button class="close" id="pclose" aria-label="Close">×</button>
    <h3>${esc(row.p.first_name)} ${esc(row.p.second_name)}</h3>
    <div class="who">${esc(row.team.name)} · ${POS[row.p.element_type]} · ${row.price.toFixed(1)}m</div>

    <div class="kpis eprow">
      <div><div class="k">FPL projection · next gameweek</div>
        <div class="v big">${row.ep === null ? '–' : row.ep.toFixed(1)}</div></div>
      <div><div class="k">FPL projection · this gameweek</div>
        <div class="v">${epThis(row.p) === null ? '–' : epThis(row.p).toFixed(1)}</div></div>
      <div><div class="k">Points per match</div><div class="v">${row.p.points_per_game}</div></div>
      <div><div class="k">Forma</div><div class="v">${row.p.form}</div></div>
    </div>

    <h2>Stats by position${info(`All measured numbers from FPL, nothing derived.
    ${row.p.element_type === 1 ? 'For a goalkeeper, saves and clean sheets decide.'
      : row.p.element_type === 2 ? 'For a defender watch xGC — how much his team is expected to concede.'
      : row.p.element_type === 3 ? 'A midfielder scores from both ends: goal involvement and clean sheets.'
      : 'For a forward xGI matters — how often he gets into goalscoring situations.'}`)}</h2>
    ${statGrid(row.p)}
    

    <h2 style="margin-top:16px">Last 5 gameweeks</h2>
    ${pills}
    <div class="kpis">
      <div><div class="k">Body</div><div class="v">${agg.pts}</div></div>
      <div><div class="k">Minuty</div><div class="v">${agg.min}</div></div>
      <div><div class="k">G + A</div><div class="v">${agg.g}+${agg.as}</div></div>
      <div><div class="k">xG + xA</div><div class="v">${(agg.xg + agg.xa).toFixed(2)}</div></div>
      <div><div class="k">Bonus</div><div class="v">${agg.bps}</div></div>
    </div>
    ${last5.length ? `<p class="note">${
      (agg.g + agg.as) > (agg.xg + agg.xa) + 1
        ? 'Scoring above expectation — some of the points are luck and may not last.'
        : (agg.xg + agg.xa) > (agg.g + agg.as) + 1
          ? 'He is creating chances that have not turned into points — that can flip.'
          : 'Points roughly match the chances created.'}</p>` : ''}

    <h2>Whole season</h2>
    <div class="kpis">
      <div><div class="k">Body</div><div class="v">${season.pts}</div></div>
      <div><div class="k">Matches</div><div class="v">${hist.length}</div></div>
      <div><div class="k">Minuty</div><div class="v">${season.min}</div></div>
      <div><div class="k">G + A</div><div class="v">${season.g}+${season.as}</div></div>
      <div><div class="k">Owned %</div><div class="v">${row.p.selected_by_percent}</div></div>
      <div><div class="k">Model · 5 gwCount</div><div class="v">${row.xp5.toFixed(1)}</div></div>
    </div>
    ${upcoming ? `<p class="note">Program: ${esc(upcoming)}</p>` : ''}
    ${pastHtml}
    ${table}
  </div>`;

  $('pclose').addEventListener('click', () => { $('pdetail').innerHTML = ''; });
}


$('t-players').addEventListener('click', () => { loadPlayers(); });

/* Next `n` fixtures for a team from a given gameweek. Used by the price
   watchlist and the injuries table. */
function nextFixtures(teamId, startGw, n){
  const out = [];
  for(const f of FIX){
    if(f.event === null || f.event < startGw) continue;
    if(f.team_h === teamId) out.push({gw: f.event, opp: f.team_a, home: true, d: f.team_h_difficulty});
    else if(f.team_a === teamId) out.push({gw: f.event, opp: f.team_h, home: false, d: f.team_a_difficulty});
  }
  return out.sort((a, b) => a.gw - b.gw).slice(0, n);
}


/* ============ HUB LIGY ============ */
let HUB = null;
let LEAGUE_OWN = null;   // {owners: {playerId: [namesOf]}, n} — plni renderLeague

async function loadHub(){
  $('hubmsg').textContent = 'Loading league…';
  $('hubout').innerHTML = '';
  try{
    if(!BOOT){ [BOOT, FIX] = await Promise.all([api('bootstrap-static/'), api('fixtures/')]); }
    if(!PLAYERS) PLAYERS = playerRows();

    const lid = CONFIG.leagueId || localStorage.getItem('fpl_league');
    if(!lid){ $('hubmsg').textContent = 'Load the league in the Mini-league tab first.'; return; }

    const cur = BOOT.events.find(e => e.is_current);
    if(!cur){ $('hubmsg').textContent = 'The season has not started yet.'; return; }

    const {league, members} = await fetchStandings(lid,
      n => { $('hubmsg').textContent = 'Loading standings… ' + n + ' teams'; });
    if(!members.length){ $('hubmsg').textContent = 'The league has no members.'; return; }

    /* History is one request per member, so it is the most expensive part
       of loading the hub. The archive can assemble it from finished
       gameweeks — when it has them all, that saves one request per member. */
    let hists = null;
    try{ hists = await snapHists(members, cur.id); }catch(e){}

    if(!hists){
      // cached() means that after the Mini-league tab this is nearly free —
      // they are exactly the same URLs.
      hists = await pooled(members, m => cached('entry/' + m.entry + '/history/'),
        5, (d, t) => { $('hubmsg').textContent = `Loading history… ${d}/${t}`; });
    }

    const picks = await pooled(members, m => cached('entry/' + m.entry + '/event/' + cur.id + '/picks/'),
      5, (d, t) => { $('hubmsg').textContent = `Loading squads… ${d}/${t}`; });

    HUB = {st: {league}, members, hists, picks, cur};
    renderHub();
    $('hubmsg').textContent = '';
  }catch(e){
    $('hubmsg').innerHTML = errBox(e.message, 't-hub');
  }
}

// poradi v lize po jednotlivych kolech, z kumulativnich bodu
/* Points per gameweek, indexed by gameweek number — not by position in

   the array. A manager who joined FPL in GW5 has current[0].round === 5,
   so reading current[g] shifted his whole curve four gameweeks left. */
function pointsByRound(h){
  const map = new Map();
  if(h && h.current) for(const ev of h.current) map.set(ev.round, ev);
  return map;
}

function leagueRanks(members, hists){
  const maps = hists.map(pointsByRound);
  const gws = Math.max(0, ...maps.map(m => m.size ? Math.max(...m.keys()) : 0));
  const ranks = members.map(() => []);

  for(let g = 1; g <= gws; g++){
    const pts = members.map((m, i) => {
      const ev = maps[i].get(g);
      return [i, ev ? ev.total_points : -1];
    }).sort((a, b) => b[1] - a[1]);
    pts.forEach(([i], pos) => ranks[i].push(pos + 1));
  }
  return {ranks, gws};
}

/* Gameweek phase. FPL flips `is_current` right after the deadline, so
   "current gameweek" does not mean "played gameweek" — a whole weekend
   sits in between, during which the numbers change after every match.

   Three phases, because each means a different level of trust:
     · running   — the gameweek is live, points are still accumulating
     · unchecked — matches are over, but bonus is still being computed
     · final     — data_checked, the numbers will not change

   `data_checked` is the only field FPL sets after bonus has been added.
   `finished` arrives earlier, so it is not enough for finality.

   But both are at whole-gameweek level and FPL flips them with a delay —
   easily half a day after the last match, sometimes not until Tuesday
   morning. Until then the app claimed "gameweek live" long after it had
   finished and bonus had been added. So we ask the fixtures instead,

     · some match has not finished           → running
     · all finished, bonus not in the data   → unchecked
     · all finished and bonus written        → final

   Bonus is an item called `bonus` in each fixture's `stats`; FPL fills it
   in the moment the points are final. That is exactly the moment stories
   should be released — regardless of when FPL gets round to flipping
   `data_checked`. */
function fixtureBonusDone(f){
  const s = (f.stats || []).find(x => x.identifier === 'bonus');
  if(!s) return false;
  return (s.h && s.h.length > 0) || (s.a && s.a.length > 0);
}

function gwPhaseFromFixtures(gwId){
  if(!Array.isArray(FIX)) return null;
  const fs = FIX.filter(f => f.event === gwId);
  if(!fs.length) return null;
  // Fixtures may only move the phase forward, never back: when the matches
  // are not finished there, the gameweek flags decide.
  if(!fs.every(f => f.finished || f.finished_provisional)) return null;
  return fs.every(f => f.finished && fixtureBonusDone(f)) ? 'final' : 'unchecked';
}

function gwPhase(gwId){
  const ev = BOOT.events.find(e => e.id === gwId);
  if(!ev) return 'running';
  if(ev.data_checked) return 'final';
  const zRozpisu = gwPhaseFromFixtures(gwId);
  if(zRozpisu) return zRozpisu;
  if(ev.finished) return 'unchecked';
  return 'running';
}

/* The gameweeks worth offering for browsing: every one that has started,
   from the first to the current. History comes from `hists`, so older
   gameweeks cost no extra request — except captains, see below. */
function newsGws(){
  const cur = HUB.cur;
  const out = [];
  for(let g = 1; g <= cur.id; g++){
    const ev = BOOT.events.find(e => e.id === g);
    if(ev && (ev.finished || ev.is_current || ev.data_checked)) out.push(g);
  }
  return out;
}

/* Stories for a specific gameweek.

   `picksFor` are that gameweek's picks. For the current gameweek HUB has
   them loaded; for older ones they are fetched on click (see loadNewsGw),
   so opening the hub does not cost a request for every gameweek of the
   season. When they are missing, the captain story is simply skipped — it
   is the only one that needs them. */
/* Gameweek rows for every league member.

   The primary source is the team history (`entry/{id}/history/`). But that
   fills in with a delay — after the first gameweek of the season the row
   is missing for a while, so the hub reported "no data for this gameweek
   yet" even long after it had been played.

   The league standings carry `event_total` and are live: they update
   during the gameweek. We use them as a fallback source for the current
   gameweek. A live row is flagged (`fromStandings`), because it carries
   only points and a total — not transfers or bench — so stories that need
   those are skipped for it instead of reporting zeroes. */
function gwRows(gwId){
  const {members, hists} = HUB;

  /* A third source: that gameweek's picks and player points.

     History is missing not only for a live gameweek — at the start of the
     season FPL has no row even for a finished GW1, and the standings only
     know the current gameweek. The archive of older gameweeks then said
     "no data for this gameweek yet" even though the app downloads picks
     and points for prices anyway. When they are there, the gameweek is
     computed from them; otherwise nothing is done. */
  const picks = NEWS_PICKS.get(gwId);
  const live = NEWS_LIVE.get(gwId);
  const fromPicks = (i) => {
    const pk = picks && picks[i];
    if(!pk || !pk.picks || !live) return null;
    const L = resolveLineup(pk, liveStats(live), gwId);
    return {round: gwId, points: L.total, total_points: null, fromPicks: true};
  };

  return members.map((m, i) => {
    const h = hists[i];
    let ev = h && h.current.find(x => x.round === gwId);
    if(!ev && gwId === HUB.cur.id && Number.isFinite(m.event_total)){
      ev = {round: gwId, points: m.event_total, total_points: m.total,
            fromStandings: true};
    }
    if(!ev) ev = fromPicks(i);
    return {m, i, ev};
  }).filter(x => x.ev);
}

function buildNews(gwId, picksFor){
  const {members, hists} = HUB;
  const cur = {id: gwId != null ? gwId : HUB.cur.id};
  const picks = picksFor || [];
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const news = [];
  const phase = gwPhase(cur.id);

  const gw = gwRows(cur.id);

  if(!gw.length) return news;

  const sorted = gw.slice().sort((a, b) => b.ev.points - a.ev.points);
  const top = sorted[0], second = sorted[1], bottom = sorted[sorted.length - 1];
  const gap = second ? top.ev.points - second.ev.points : 0;

  news.push({
    cls: 'good', kicker: 'Gameweek ' + cur.id,
    head: esc(top.m.player_name) + ' won the gameweek with ' + top.ev.points + ' points',
    body: second
      ? (gap >= 15
          ? `A <b>${gap} point</b> lead over second — that is not luck, that is another league.`
          : gap === 0
            ? `He shares first place with <b>${esc(second.m.player_name)}</b>.`
            : `Second-placed <b>${esc(second.m.player_name)}</b> was ${gap} points behind.`)
      : '',
  });

  if(bottom !== top){
    news.push({
      cls: 'bad', kicker: 'Gameweek disaster',
      head: esc(bottom.m.player_name) + ' managed only ' + bottom.ev.points + ' points',
      body: `<b>${top.ev.points - bottom.ev.points}</b> fewer than the gameweek winner.`,
    });
  }

  // kapitani
  const caps = members.map((m, i) => {
    const pk = picks[i];
    if(!pk) return null;
    const c = pk.picks.find(x => x.is_captain);
    return c ? {m, pid: c.element} : null;
  }).filter(Boolean);

  if(caps.length){
    const count = {};
    caps.forEach(c => count[c.pid] = (count[c.pid] || 0) + 1);
    const popular = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    const popId = parseInt(popular[0], 10);

    const rebels = caps.filter(c => c.pid !== popId);
    if(rebels.length && rebels.length <= Math.ceil(caps.length / 2)){
      /* The maverick's points come from the same map as the rest of the
         stories — including live standings. This used to read history
         directly, so during a live gameweek the story quietly disappeared. */
      const evPodleTymu = new Map(gw.map(x => [x.m.entry, x.ev]));
      const best = rebels
        .map(r => ({...r, ev: evPodleTymu.get(r.m.entry)}))
        .filter(r => r.ev)
        .sort((a, b) => b.ev.points - a.ev.points)[0];
      if(best){
        news.push({
          cls: 'warn', kicker: 'Captain choice',
          head: `${popular[1]} of ${caps.length} managers backed ${esc(els[popId] ? els[popId].web_name : '?')}`,
          body: `Going against the grain, <b>${esc(best.m.player_name)}</b> captained
            <b>${esc(els[best.pid] ? els[best.pid].web_name : '?')}</b> and scored ${best.ev.points} points.`,
        });
      }
    }
  }

  // dan za transfery
  const taxed = gw.filter(x => !x.ev.fromStandings && x.ev.event_transfers_cost > 0)
    .sort((a, b) => b.ev.event_transfers_cost - a.ev.event_transfers_cost);
  if(taxed.length){
    const t = taxed[0];
    news.push({
      cls: 'warn', kicker: 'Impatience',
      head: `${esc(t.m.player_name)} paid ${t.ev.event_transfers_cost} points for transfers`,
      body: `He made <b>${t.ev.event_transfers}</b> moves and finished on ${t.ev.points} points.
        Without the hit it would have been ${t.ev.points + t.ev.event_transfers_cost}.`,
    });
  }

  // lavicka
  const bench = gw.filter(x => !x.ev.fromStandings)
    .sort((a, b) => b.ev.points_on_bench - a.ev.points_on_bench)[0];
  if(bench && bench.ev.points_on_bench >= 8){
    news.push({
      cls: 'bad', kicker: 'Bench of shame',
      head: `${esc(bench.m.player_name)} left ${bench.ev.points_on_bench} points on the bench`,
      body: 'Points he owned and did not get.',
    });
  }

  /* The gameweek average. It only needs points, so it works from live
     standings too — and in the first gameweek of the season, when there is
     no previous rank to compare with, it is the one story giving context. */
  if(gw.length >= 3){
    const soucet = gw.reduce((a, x) => a + x.ev.points, 0);
    const avg = Math.round(soucet / gw.length);
    const above = gw.filter(x => x.ev.points > avg).length;
    news.push({
      cls: 'warn', kicker: 'Gameweek average',
      head: `The league averaged ${avg} points`,
      body: `<b>${above}</b> of ${gw.length} managers finished above average. `
        + `The range was ${bottom.ev.points} to ${top.ev.points} points.`,
    });
  }

  /* The tightest duel. The interesting pair is the one separated by a
     couple of points — in a small league that is usually the story people
     put in the group chat. */
  if(gw.length >= 3){
    let best = null;
    for(let i = 1; i < sorted.length; i++){
      const d = sorted[i - 1].ev.points - sorted[i].ev.points;
      if(best === null || d < best.d) best = {d, a: sorted[i - 1], b: sorted[i], poz: i};
    }
    if(best && best.d <= 3 && best.poz > 1){
      news.push({
        cls: 'warn', kicker: 'O fous',
        head: best.d === 0
          ? `${esc(best.a.m.player_name)} and ${esc(best.b.m.player_name)} finished on the same points`
          : `${esc(best.a.m.player_name)} edged ${esc(best.b.m.player_name)} by ${best.d}`,
        body: `Both around <b>${best.a.ev.points}</b> points — the tightest duel of the gameweek.`,
      });
    }
  }

  /* Leading overall. Gameweek points and the overall table are two
     different stories; the gameweek winner need not lead the league. */
  const celkem = gw.filter(x => Number.isFinite(x.ev.total_points))
    .sort((a, b) => b.ev.total_points - a.ev.total_points);
  if(celkem.length >= 2){
    const leader = celkem[0], druhy = celkem[1];
    const lead_ = leader.ev.total_points - druhy.ev.total_points;
    news.push({
      cls: 'good', kicker: 'Leading the league',
      head: `${esc(leader.m.player_name)} vede s ${leader.ev.total_points} body`,
      body: leader.m.entry === top.m.entry
        ? `He won the gameweek and leads the table — <b>${lead_}</b> points clear of `
          + `${esc(druhy.m.player_name)}.`
        : `${esc(top.m.player_name)} won the gameweek, but the table belongs to `
          + `<b>${esc(leader.m.player_name)}</b>, ${lead_} points clear.`,
    });
  }

  /* Pohyb v tabulce.

     This is the one story that cannot be shown during a live gameweek
     even with a caveat: it would compare a half-played state with the last
     finished one, so it would report jumps that flip several times before
     Sunday. Better to omit it than to correct it every hour. */
  const {ranks, gws} = leagueRanks(members, hists);
  const idx = cur.id;   // the rank after this gameweek sits at index id-1
  if(gws >= 2 && idx >= 2 && phase !== 'running'){
    const moves = members.map((m, i) => ({
      m, delta: ranks[i][idx - 2] - ranks[i][idx - 1],
      from: ranks[i][idx - 2], to: ranks[i][idx - 1],
    })).filter(x => Number.isFinite(x.delta));
    const up = moves.slice().sort((a, b) => b.delta - a.delta)[0];
    const down = moves.slice().sort((a, b) => a.delta - b.delta)[0];
    if(up && up.delta >= 2){
      news.push({
        cls: 'good', kicker: 'Skok gws',
        head: `${esc(up.m.player_name)} climbed ${up.delta} places`,
        body: `From <b>${up.from}</b> to <b>${up.to}</b>.`,
      });
    }
    if(down && down.delta <= -2){
      news.push({
        cls: 'bad', kicker: 'Fall of the gameweek',
        head: `${esc(down.m.player_name)} dropped ${-down.delta} places`,
        body: `From <b>${down.from}</b> to <b>${down.to}</b>.`,
      });
    }
  }

  return news;
}

function buildBoards(){
  const {members, hists} = HUB;
  const myId = parseInt(CONFIG.entryId || localStorage.getItem('fpl_entry') || '0', 10);

  const stats = members.map((m, i) => {
    const h = hists[i];
    const cs = h ? h.current : [];
    const pts = cs.map(x => x.points);
    const mean = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 0;
    const sd = pts.length > 1
      ? Math.sqrt(pts.reduce((a, b) => a + (b - mean) ** 2, 0) / pts.length) : 0;
    const last = cs[cs.length - 1];
    return {
      m,
      tax: cs.reduce((a, x) => a + x.event_transfers_cost, 0),
      moves: cs.reduce((a, x) => a + x.event_transfers, 0),
      bench: cs.reduce((a, x) => a + x.points_on_bench, 0),
      sd, mean,
      value: last ? last.value / 10 : 0,
      total: last ? last.total_points : 0,
      chips: (h && h.chips) ? h.chips : [],
    };
  });

  const board = (title, cap, arr, fmt, asc) => {
    const rows = arr.slice().sort((a, b) => asc ? a.v - b.v : b.v - a.v).slice(0, 5);
    return `<div class="board">
      <h4>${esc(title)}</h4>
      <p class="cap">${esc(cap)}</p>
      <ol>${rows.map(r => `<li class="${r.id === myId ? 'me' : ''}">${esc(r.n)}
        <span>${fmt(r.v)}</span></li>`).join('')}</ol>
    </div>`;
  };

  const pick = f => stats.map(s => ({n: s.m.player_name, id: s.m.entry, v: f(s)}));

  const chipNames = {wildcard: 'Wildcard', '3xc': 'Triple captain',
                     bboost: 'Bench boost', freehit: 'Free hit', manager: 'Manager'};
  const chipRows = stats.filter(s => s.chips.length).map(s =>
    `<li>${esc(s.m.player_name)} <span>${s.chips.map(c =>
      (chipNames[c.name] || c.name) + ' GW' + c.event).join(', ')}</span></li>`).join('');

  return `<div class="boards">
    ${board('Transfer tax', 'Points handed over for moves', pick(s => s.tax), v => '−' + v)}
    ${board('Frozen bench', 'Points that leaked away on the bench', pick(s => s.bench), v => v)}
    ${board('Busiest', 'Transfers made this season', pick(s => s.moves), v => v)}
    ${board('Most consistent', 'Smallest spread of points per gameweek', pick(s => s.sd),
            v => v.toFixed(1), true)}
    ${board('Squad efficiency', 'Points per million of team value',
            pick(s => s.value ? s.total / s.value : 0), v => v.toFixed(1))}
    <div class="board">
      <h4>Chips used</h4>
      <p class="cap">Who has burned what</p>
      <ol>${chipRows || '<li style="list-style:none;margin-left:-19px;color:var(--mute)">Nobody yet.</li>'}</ol>
    </div>
  </div>`;
}

function buildHealth(){
  const {members, picks, cur} = HUB;
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const nxt = BOOT.events.find(e => e.is_next);
  const startGw = nxt ? nxt.id : cur.id + 1;

  const rows = members.map((m, i) => {
    const pk = picks[i];
    if(!pk) return null;
    const squad = pk.picks.map(x => els[x.element]).filter(Boolean);

    /* Two different messages, not two readings of the same one.

       Originally the "Out" column counted unavailable players and
       "Doubtful" counted everyone flagged — including the unavailable ones.
       A player with status `i` therefore appeared in both columns and it
       looked like two separate problems. The categories must be disjoint:
       whoever is in `out` no longer belongs among the doubts. */
    const isOut = p => p.status === 'i' || p.status === 's' || p.status === 'u'
      || p.status === 'n' || p.chance_of_playing_next_round === 0;

    const out = squad.filter(isOut);
    const doubt = squad.filter(p => !isOut(p) &&
      (p.status !== 'a' ||
       (p.chance_of_playing_next_round !== null &&
        p.chance_of_playing_next_round < 100)));
    const flagged = out.concat(doubt);
    const fdrs = squad.map(p => {
      const f = nextFixtures(p.team, startGw, 3);
      return f.length ? f.reduce((a, x) => a + x.d, 0) / f.length : 3;
    });
    const avgFdr = fdrs.reduce((a, b) => a + b, 0) / (fdrs.length || 1);
    return {m, flagged, out, doubt, avgFdr,
            names: flagged.map(p => p.web_name + ' (' + teams[p.team].short_name + ')'
              + (isOut(p) ? '' : ' ?'))};
  }).filter(Boolean);

  rows.sort((a, b) => b.out.length - a.out.length || b.doubt.length - a.doubt.length);

  return `<table>
    <thead><tr><th>Manager</th><th class="n">Out</th><th class="n">Doubtful</th>
      <th class="n">Squad FDR</th><th class="hide-s">Who</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td><b>${HUB && HUB.cur
        ? squadBtn(r.m.entry, HUB.cur.id, r.m.player_name, r.m.entry_name)
        : esc(r.m.player_name)}</b></td>
      <td class="n ${r.out.length >= 3 ? 'al' : r.out.length ? 'wn' : ''}">${r.out.length}</td>
      <td class="n ${r.doubt.length ? 'wn' : ''}">${r.doubt.length}</td>
      <td class="n ${r.avgFdr >= 3.6 ? 'al' : r.avgFdr <= 2.6 ? 'ok' : ''}">${r.avgFdr.toFixed(2)}</td>
      <td class="hide-s" style="color:var(--mute);font-size:12px">${esc(r.names.join(', ')) || '—'}</td>
    </tr>`).join('')}</tbody></table>
  <p class="note">The columns do not overlap: a player who is out is not
  counted among the doubts. A doubt is a player with a 25–75 % chance of
  playing; in the "Who" column he is marked with a question mark. Squad FDR is the
  average difficulty of the next three fixtures across all 15 players — lower is better.</p>`;
}

function buildCollective(){
  const {members, picks, cur} = HUB;
  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  const valid = picks.filter(Boolean);
  const n = valid.length;
  if(!n) return '<p class="note">Squads are not available yet.</p>';

  // kapitanska mapa
  const capCount = {};
  members.forEach((m, i) => {
    const pk = picks[i];
    if(!pk) return;
    const c = pk.picks.find(x => x.is_captain);
    if(c) (capCount[c.element] = capCount[c.element] || []).push(m.player_name);
  });
  const capRows = Object.entries(capCount)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([pid, list]) => {
      const p = els[pid];
      return `<div class="row2">
        <span class="nm2">${esc(p ? p.web_name : '?')}</span>
        <span class="bar2"><i style="width:${Math.round(list.length / n * 100)}%"></i></span>
        <span class="ct2">${list.length}/${n}</span>
      </div>`;
    }).join('');

  // sablona: jak moc jsou si sestavy podobne
  const own = {};
  members.forEach((m, i) => {
    const pk = picks[i];
    if(!pk) return;
    pk.picks.forEach(x => own[x.element] = (own[x.element] || 0) + 1);
  });
  const core = Object.entries(own).filter(([, c]) => c >= Math.ceil(n * 0.5));
  const universal = Object.entries(own).filter(([, c]) => c === n);
  const templatePct = Math.round(core.length / 15 * 100);

  // liga proti proudu: kde se vlastnictvi lisi od globalu
  const contrarian = Object.entries(own)
    .map(([pid, c]) => {
      const p = els[pid];
      if(!p) return null;
      return {p, local: c / n * 100, global: parseFloat(p.selected_by_percent)};
    })
    .filter(Boolean)
    .map(x => ({...x, diff: x.local - x.global}))
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 6);

  return `
    <h2>Captain map · GW${cur.id}</h2>
    <div class="capmap">${capRows}</div>

    <h2>Template effect${info(`${
      templatePct >= 60
        ? 'The league is playing almost the same team — it will be decided by a few differentials and the captain.'
        : templatePct >= 35
          ? 'The squads overlap by about a third. There is still room to differentiate.'
          : 'Everyone goes their own way — the table can swing from gameweek to gameweek.'}`)}</h2>
    <div class="kpis">
      <div><div class="k">League core</div><div class="v">${core.length}</div></div>
      <div><div class="k">Owned by all</div><div class="v">${universal.length}</div></div>
      <div><div class="k">Shoda</div><div class="v">${templatePct} %</div></div>
    </div>
    

    <h2>League against the grain${info(`Where your league differs from the rest of the world. A positive
    difference means you back a player more than everyone else does.`)}</h2>
    <table>
      <thead><tr><th>Player</th><th class="hide-s">Team</th>
        <th class="n">In league</th><th class="n">Global</th><th class="n">Difference</th></tr></thead>
      <tbody>${contrarian.map(x => `<tr>
        <td><b>${esc(x.p.web_name)}</b></td>
        <td class="hide-s">${esc(teams[x.p.team].short_name)}</td>
        <td class="n">${x.local.toFixed(0)} %</td>
        <td class="n">${x.global.toFixed(1)} %</td>
        <td class="n ${x.diff > 0 ? 'ok' : 'al'}">${x.diff > 0 ? '+' : ''}${x.diff.toFixed(0)}</td>
      </tr>`).join('')}</tbody>
    </table>
    `;
}

/* ============ CENY KOLA ============

   The four main awards sit above the stories. Two of them (winner, unlucky
   manager) need only the history the hub loads anyway. The captain awards
   also need the gameweek's picks and individual player points — both are
   fetched lazily, see loadNewsGw. When they are missing the card is simply
   skipped; the grid narrows, but no hole with a dash is left in it. */

/* That gameweek's player points as an id → points map. Without
   `event/{gw}/live/` we would know the captain's name but not his return. */
function liveMap(live){
  const m = new Map();
  if(live && Array.isArray(live.elements)){
    for(const e of live.elements){
      m.set(e.id, e.stats ? (e.stats.total_points || 0) : 0);
    }
  }
  return m;
}

/* The gameweek's captains together with their doubled points. A triple
   captain has multiplier 3, so it is read from the pick, not hard-coded. */
function capRows(picksFor, live, gw){
  const picks = picksFor || [];
  const body = liveMap(live);
  const stats = liveStats(live);
  if(!picks.length || !body.size) return [];
  return HUB.members.map((m, i) => {
    const pk = picks[i];
    if(!pk || !pk.picks) return null;

    /* The captain who actually counted. When the picked one did not play,
       the vice captain took the armband — before this the app doubled a
       zero and the award went to the wrong player. */
    const L = resolveLineup(pk, stats, gw != null ? gw : HUB.cur.id);
    const c = L.rows.find(r => r.captain);
    if(!c || !body.has(c.element)) return null;
    const mult = c.mult > 1 ? c.mult : 2;
    return {m, i, pid: c.element, mult, pts: body.get(c.element) * mult,
            raw: body.get(c.element)};
  }).filter(Boolean);
}

/* The players a manager left on the bench, together with their points. */
function benchRows(pk, live, gw){
  const body = liveMap(live);
  if(!pk || !pk.picks || !body.size) return [];

  /* Anyone brought on by an autosub was not sitting on the bench —
     blaming the manager for points he did get is worse than no award. */
  const L = resolveLineup(pk, liveStats(live), gw != null ? gw : HUB.cur.id);
  const hral = new Set(L.rows.filter(r => r.mult > 0).map(r => r.element));

  return pk.picks
    .filter(p => p.position >= 12 && p.position <= 15 && !hral.has(p.element))
    .map(p => ({pid: p.element, pts: body.get(p.element) || 0}));
}

/* The best player on the bench. It adds a name to the unlucky-manager
   award — the number alone does not say who it hurts. */
function benchBest(pk, live, gwId){
  const best = benchRows(pk, live, gwId).sort((a, b) => b.pts - a.pts)[0];
  return best && best.pts > 0 ? best : null;
}

/* Bench points for one gameweek row.

   The team history (`entry/{id}/history/`) carries them ready-made, but it
   fills in with a delay — after the first gameweek of the season the row
   is missing for a while and points come from live league standings, which
   do not know the bench. That used to mean no unlucky-manager award in GW1
   at all. We do have the picks and player points, so the total is computed
   here; history is used only when it is there. Returns null when it cannot
   be determined at all — still better than claiming zero. */
function benchPoints(row, pk, live, gwId){
  if(row.ev && !row.ev.fromStandings && Number.isFinite(row.ev.points_on_bench)){
    return row.ev.points_on_bench;
  }
  const benched = benchRows(pk, live, gwId);
  return benched.length ? benched.reduce((a, x) => a + x.pts, 0) : null;
}

/* Unlucky manager of the gameweek: most points left on the bench. */
/* Unlucky managers of the gameweek: everyone who left the most points on

   the bench. Returns the whole group at the maximum, not just the first —
   a tie splits the award, and above half the league it lapses, exactly as
   with captains. Only managers whose bench can be computed are counted;
   anyone with `null` (no history and no picks) is left out. */
function unluckiest(gw, picksFor, live, gwId){
  const picks = picksFor || [];
  const s = gw.map(x => ({...x, benched: benchPoints(x, picks[x.i], live, gwId)}))
    .filter(x => Number.isFinite(x.lav));
  if(!s.length) return {all_: [], best: []};
  const max = Math.max(...s.map(x => x.lav));
  return {all_: s, best: max > 0 ? s.filter(x => x.lav === max) : []};
}

/* A backwards-compatible single value — used by the hall of fame, which
   jen to, who_ cenu dostal. */
function unluckiest1(gw, picksFor, live, gwId){
  const {best} = unluckiest(gw, picksFor, live, gwId);
  return best.length ? best[0] : null;
}

/* Diagnostics for the captain awards.

   The awards are computed from two sources (picks + gameweek player
   points) and when one of them arrives in an unexpected shape the card
   simply is not there. This prints where the chain breaks, so it does not
   have to be guessed from what is missing. Call it manually: debugAwards(1). */
window.debugCeny = function(gw){
  const g = gw || NEWS_GW || (HUB && HUB.cur.id);
  if(!HUB){ console.log('HUB is not loaded — open the League hub first.'); return; }
  const picks = NEWS_PICKS.get(g), live = NEWS_LIVE.get(g);
  const body = liveMap(live);
  console.log('gameweek', g, '· phase', gwPhase(g));
  console.log('league members:', HUB.members.length);
  console.log('picks:', picks ? picks.length : '(not loaded)',
    '· of which empty:', picks ? picks.filter(p => !p || !p.picks).length : '-');
  console.log('players in the points map:', body.size,
    '· live:', live ? 'objekt' : String(live));
  const caps = capRows(picks, live, g);
  console.log('captains matched:', caps.length);
  console.table(caps.map(c => ({
    manazer: c.m.player_name, kapitan: c.pid, raw: c.raw,
    mult: c.mult, body: c.pts,
  })));
  const unmatched = (picks || []).map((pk, i) => {
    if(!pk || !pk.picks) return null;
    const c = pk.picks.find(x => x.is_captain);
    if(!c) return HUB.members[i].player_name + ': no is_captain';
    if(!body.has(c.element)) return HUB.members[i].player_name
      + ': captain ' + c.element + ' is not in the points map';
    return null;
  }).filter(Boolean);
  if(unmatched.length) console.log('unmatched:', unmatched);
  console.log('awards:', buildAwards(g, picks, live).map(a => a.key).join(', ') || '(none)');
};

const AWARD_META = {
  win:   {cls: 'a-win',   emoji: '🏆', title: 'Gameweek winner'},
  bench: {cls: 'a-bench', emoji: '🪑', title: 'Unlucky manager'},
  cap:   {cls: 'a-cap',   emoji: '👑', title: 'Captain of the week'},
  flop:  {cls: 'a-flop',  emoji: '🤡', title: 'Captain flop'},
};

/* Returns an array of awards shaped {key, who, val, sub}. An empty array
   means there is no data for the gameweek yet — the panel says so. */
function buildAwards(gwId, picksFor, liveFor){
  const id = gwId != null ? gwId : HUB.cur.id;
  const gw = gwRows(id);
  const out = [];
  if(!gw.length) return out;

  const els = Object.fromEntries(BOOT.elements.map(p => [p.id, p]));
  const name_ = pid => esc(els[pid] ? els[pid].web_name : '?');

  // vyherce
  const sorted = gw.slice().sort((a, b) => b.ev.points - a.ev.points);
  const top = sorted[0], second = sorted[1];
  const delici = sorted.filter(x => x.ev.points === top.ev.points);
  out.push({
    key: 'win',
    who: delici.length > 1
      ? delici.map(x => esc(x.m.player_name)).join(' & ')
      : esc(top.m.player_name),
    whoHtml: (delici.length > 1 ? delici : [top])
      .map(x => squadBtn(x.m.entry, id, x.m.player_name, x.m.entry_name)).join(' & '),
    val: top.ev.points + ' pts',
    sub: delici.length > 1
      ? 'First place is shared on equal points.'
      : second
        ? (top.ev.points - second.ev.points >= 15
            ? `A <b>${top.ev.points - second.ev.points} point</b> lead — that is not luck.`
            : `<b>${top.ev.points - second.ev.points}</b> ahead of ${esc(second.m.player_name)}.`)
        : '',
  });

  /* Unlucky manager — most points on the bench. The same rule as for
     captains applies: an award is a distinction, so it is not given when
     half the league or more shares it. Ten people with the same bench is
     not an unlucky manager, that is just the gameweek. */
  const {all_: benchAll, best: benchTop} = unluckiest(gw, picksFor, liveFor, id);
  if(benchTop.length){
    const allEqual = benchTop.length === benchAll.length;
    const benchMajority = benchTop.length * 2 >= benchAll.length;
    /* `who` stays plain text — the hall of fame and the tests read it. The
       clickable variant sits beside it as `whoHtml`, so a card can link to
       a squad without the award text becoming HTML. */
    const jmenaLav = list => list.length <= 3
      ? list.map(c => esc(c.m.player_name)).join(', ')
      : esc(list[0].m.player_name) + ' and ' + (list.length - 1) + ' more';

    if(allEqual && benchAll.length > 1){
      out.push({
        key: 'bench', who: 'Nobody stood out', val: benchTop[0].lav + ' pts',
        sub: `All ${benchAll.length} managers left the same on the bench.`,
      });
    }else if(benchMajority){
      out.push({
        key: 'bench', who: 'Bez awards_', val: '—',
        sub: `Most of the league left the same points on the bench `
          + `(${benchTop.length} of ${benchAll.length}) — no award this gameweek.`,
      });
    }else{
      const who_ = benchTop[0];
      const best = benchTop.length === 1 ? benchBest((picksFor || [])[who_.i], liveFor, id) : null;
      out.push({
        key: 'bench',
        who: jmenaLav(benchTop),
        whoHtml: benchTop.length <= 3
          ? benchTop.map(c => squadBtn(c.m.entry, id, c.m.player_name, c.m.entry_name)).join(', ')
          : null,
        val: who_.benchPts + ' pts',
        sub: benchTop.length > 1
          ? 'They left the same on the bench — the award is shared.'
          : best
            ? `Left on the bench — <b>${name_(best.pid)}</b> for ${best.pts} points.`
            : 'Points he owned and did not get.',
      });
    }
  }

  // kapitanske awards_
  /* Captain awards.

     An award only means something as a distinction. When half the league
     or more lands on the extreme value, that is not a performance but the
     gameweek average — the award then lapses and the card says so. The
     threshold is sharp at half: 4 of 10 still get it, 5 of 10 do not.

     Both ends are judged separately. When nine people back the same
     captain and one does not, the captain award lapses but that one
     manager can still take the flop — and vice versa. */
  const caps = capRows(picksFor, liveFor, id);
  if(caps.length >= 2){
    const dle = caps.slice().sort((a, b) => b.pts - a.pts);
    const best = dle[0], worst = dle[dle.length - 1];
    const winners = dle.filter(c => c.pts === best.pts);
    const lastPlace = dle.filter(c => c.pts === worst.pts);
    const vetsina = list => list.length * 2 >= caps.length;

    const namesOf = list => list.length <= 3
      ? list.map(c => esc(c.m.player_name)).join(', ')
      : esc(list[0].m.player_name) + ' and ' + (list.length - 1) + ' more';

    /* When the group holds one player, name him — that is more concrete
       than "they finished level". */
    const reason = list => list.every(c => c.pid === list[0].pid)
      ? `Most of the league had the same captain (${name_(list[0].pid)})`
      : 'Most of the league finished on the same points';

    if(best.pts === worst.pts){
      /* The whole league on one number — nothing to split and nothing to
         announce. Both cards stay, though: if one disappeared it would
         look as if the flop had not been computed for some reason. */
      out.push({
        key: 'cap',
        who: 'Nobody stood out',
        val: best.pts + ' pts',
        sub: `All ${caps.length} captains returned the same. `
          + 'The gameweek was decided somewhere other than the armband.',
      });
      out.push({
        key: 'flop',
        who: 'Nobody stood out',
        val: worst.pts + ' pts',
        sub: 'Nobody flopped harder than the rest — everyone on the same points.',
      });
    }else{
      out.push(vetsina(winners)
        ? {key: 'cap', who: 'Bez awards_', val: '—',
           sub: `${reason(winners)} — no award this gameweek.`}
        : {key: 'cap', who: namesOf(winners), val: best.pts + ' pts',
           whoHtml: winners.length <= 3 ? winners.map(c =>
             squadBtn(c.m.entry, id, c.m.player_name, c.m.entry_name)).join(', ') : null,
           sub: `${name_(best.pid)} (${best.raw} × ${best.mult})`
             + (winners.length > 1 ? ' — the award is shared.'
               : caps.filter(c => c.pid === best.pid).length === 1
                 ? ' — the only one in the league.' : '.')});

      out.push(vetsina(lastPlace)
        ? {key: 'flop', who: 'Bez awards_', val: '—',
           sub: `${reason(lastPlace)} — no award this gameweek.`}
        : {key: 'flop', who: namesOf(lastPlace), val: worst.pts + ' pts',
           whoHtml: lastPlace.length <= 3 ? lastPlace.map(c =>
             squadBtn(c.m.entry, id, c.m.player_name, c.m.entry_name)).join(', ') : null,
           sub: `${name_(worst.pid)} (${worst.raw} × ${worst.mult})`
             + (lastPlace.length > 1 ? ' — and he was not alone.' : '.')});
    }
  }

  return out;
}

/* ------------------------------------------------------------
   Hall of fame: how many of each award everyone has won this season.

   Wins and bench points are derived from the history the hub already
   holds — zero extra requests. The captain columns need picks and player
   points; those exist only for gameweeks somebody has opened, or for all
   of them after pressing "Load the whole season". `covered` therefore
   returns how many gameweeks the captain columns were built from, so it
   is visible that they are incomplete instead of the table lying quietly.
   ------------------------------------------------------------ */
function hallOfFame(){
  const rows = HUB.members.map(m => ({
    m, win: 0, bench: 0, cap: 0, flop: 0,
  }));
  const podleEntry = new Map(rows.map(r => [r.m.entry, r]));
  let gwCount = 0, covered = 0;

  for(const g of newsGws()){
    /* Only a finalised gameweek counts towards the season tally. A live
       one changes after every match, and while bonus is pending a
       three-point bonus can flip both winner and flop — the table would
       then be rewriting history. */
    if(gwPhase(g) !== 'final') continue;
    const gw = gwRows(g);
    if(!gw.length) continue;
    gwCount++;

    const sorted = gw.slice().sort((a, b) => b.ev.points - a.ev.points);
    const max = sorted[0].ev.points;
    sorted.filter(x => x.ev.points === max).forEach(x => {
      const r = podleEntry.get(x.m.entry); if(r) r.win++;
    });

    const benched = unluckiest1(gw, NEWS_PICKS.get(g), NEWS_LIVE.get(g), g);
    if(benched){
      const r = podleEntry.get(benched.m.entry); if(r) r.bench++;
    }

    const caps = capRows(NEWS_PICKS.get(g), NEWS_LIVE.get(g), g);
    if(caps.length >= 2){
      const dle = caps.slice().sort((a, b) => b.pts - a.pts);
      if(dle[0].pts !== dle[dle.length - 1].pts){
        covered++;
        const a = podleEntry.get(dle[0].m.entry); if(a) a.cap++;
        const b = podleEntry.get(dle[dle.length - 1].m.entry); if(b) b.flop++;
      }
    }
  }

  rows.sort((a, b) => b.win - a.win || a.flop - b.flop || b.cap - a.cap
    || a.m.player_name.localeCompare(b.m.player_name, 'cs'));
  return {rows, gwCount, covered};
}

/* ------------------------------------------------------------
   The stories panel: gameweek switcher + status + the stories themselves.

   The picks of older gameweeks are kept in NEWS_PICKS so that clicking
   the same gameweek twice downloads nothing. cached() would handle that
   too, but this way it is visible what the panel holds.
   ------------------------------------------------------------ */
let NEWS_GW = null;
const NEWS_PICKS = new Map();
const NEWS_LIVE = new Map();
let HALL_ALL = false;   // has anyone pressed "Load the whole season"?

const PHASE_NOTE = {
  running: ['wn', 'Gameweek live',
    'Points are still accumulating and the order changes after every match. '
    + 'Final numbers arrive once bonus is computed.'],
  unchecked: ['wn', 'Waiting for bonus',
    'The matches are over, but FPL is still confirming bonus points. The numbers '
    + 'can still shift a little.'],
  final: ['ok', 'Final results',
    'Bonus has been added, the numbers will not change.'],
};

function newsPanel(){
  const gws = newsGws();
  const sel = NEWS_GW || HUB.cur.id;
  const phase = gwPhase(sel);
  const [cls, title_, labelOf] = PHASE_NOTE[phase];

  const prepinac = gws.length > 1
    ? `<div class="gwnav" role="tablist" aria-label="Story gameweek">
        ${gws.map(g => {
          const p = gwPhase(g);
          return `<button type="button" role="tab" data-newsgw="${g}"
            aria-selected="${g === sel}"
            title="${p === 'final' ? 'Final results'
              : p === 'unchecked' ? 'Waiting for bonus' : 'Gameweek live'}"
            >GW${g}${p === 'running' ? '<i class="dot live"></i>'
              : p === 'unchecked' ? '<i class="dot wait"></i>' : ''}</button>`;
        }).join('')}
      </div>`
    : '';

  const stav = `<p class="note store ${cls === 'ok' ? 'ok' : ''} phase">
    <b>${title_}</b> — ${labelOf}</p>`;

  /* The gameweek winner and the bench have their own award above — in the
     list of stories it would be the same sentence twice. */
  const news = buildNews(sel, NEWS_PICKS.get(sel))
    .filter(x => !/^Gameweek \d+$|^Bench of shame$/.test(x.kicker));
  const stories = news.map(x => `<div class="news ${x.cls}">
      <div class="kicker">${esc(x.kicker)}</div>
      <div class="head">${x.head}</div>
      ${x.body ? `<div class="body">${x.body}</div>` : ''}
    </div>`).join('');

  const awards = buildAwards(sel, NEWS_PICKS.get(sel), NEWS_LIVE.get(sel));
  if(!awards.length && !news.length){
    /* An empty gameweek does not mean an empty panel: the hall of fame is
       a season total and has nothing to do with the selected gameweek. It
       used to disappear along with the awards and looked lost. */
    const cekame = !NEWS_PICKS.has(sel) || !NEWS_LIVE.has(sel);
    return prepinac + stav
      + `<p class="note">${cekame
          ? 'Loading this gameweek\'s picks and points…'
          : 'Neither awards nor stories could be computed for this gameweek.'}</p>`
      + hallPanel();
  }

  /* Until a gameweek is finalised the awards are provisional. Show that on
     the card, not just in the message above the panel — the hall of fame
     only counts them after bonus is in. */
  const liveTag = phase !== 'final'
    ? `<span class="livetag">${phase === 'running' ? 'live' : 'awaiting bonus'}</span>`
    : '';

  const awards_ = awards.length
    ? `<div class="secline"><h4>Ceny gws</h4>${liveTag}</div>
       <div class="awards">${awards.map(a => {
         const meta = AWARD_META[a.key];
         const noAward = a.val === '—' ? ' bezceny' : '';
         return `<div class="award ${meta.cls}${noAward}">
           <div class="medal" aria-hidden="true">${meta.emoji}</div>
           <div class="txt">
             <div class="title">${meta.title}</div>
             <div class="who">${a.whoHtml || a.who}</div>
             ${a.sub ? `<div class="sub">${a.sub}</div>` : ''}
           </div>
           <div class="val">${a.val}</div>
         </div>`;
       }).join('')}</div>`
    : '';

  /* Captain awards need the gameweek's picks and points. When they are
     missing, say so instead of quietly showing two awards fewer — and
     distinguish still loading from the request having failed. */
  const hasPicks = NEWS_PICKS.has(sel) && (NEWS_PICKS.get(sel) || []).length;
  const hasLive = NEWS_LIVE.has(sel) && NEWS_LIVE.get(sel);
  const chybiPicks = awards.some(a => a.key === 'cap') ? ''
    : (!NEWS_PICKS.has(sel) || !NEWS_LIVE.has(sel))
      ? '<p class="note">Captain awards will follow once the picks load…</p>'
      : (!hasPicks || !hasLive)
        ? `<p class="note">Captain awards cannot be computed right now — the
            ${!hasPicks ? 'picks' : 'player points'} for this gameweek could not be loaded.
            Try <b>⟳</b> in the header.</p>`
        : '';

  const zbytek = stories
    ? `<div class="secline"><h4>What else happened</h4></div>` + stories
    : '';

  return prepinac + stav + awards_ + chybiPicks + zbytek + hallPanel();
}

/* The season-long awards table. The captain columns are computed only
   from gameweeks we have picks for — the button fetches them all. */
function hallPanel(){
  const {rows, gwCount, covered} = hallOfFame();
  if(gwCount < 1 || rows.length < 2) return '';

  const SLOUPCE = [
    ['win', '🏆', 'Wins'], ['bench', '🪑', 'Bad luck'],
    ['cap', '👑', 'Captain'], ['flop', '🤡', 'Flop'],
  ];
  const max = {};
  SLOUPCE.forEach(([k]) => max[k] = Math.max(...rows.map(r => r[k])));

  const header = SLOUPCE.map(([, e, t]) =>
    `<th class="c"><span aria-hidden="true">${e}</span>${t}</th>`).join('');

  const telo = rows.map(r => `<tr>
      <td class="name">${HUB && HUB.cur
        ? squadBtn(r.m.entry, HUB.cur.id, r.m.player_name, r.m.entry_name)
        : esc(r.m.player_name)}</td>
      ${SLOUPCE.map(([k]) => {
        const v = r[k];
        const tridy = ['c', v > 0 ? 'has' : '', v > 0 && v === max[k] ? 'lead' : ''];
        return `<td class="${tridy.filter(Boolean).join(' ')}"><i>${v}</i></td>`;
      }).join('')}
    </tr>`).join('');

  const missing = gwCount - covered;
  const pozn = missing > 0
    ? `<p class="note">The captain columns cover ${covered} of ${gwCount} gameweeks —
        the rest needs picks. ${HALL_ALL ? ''
          : `<button type="button" class="hallmore" data-hallall="1">Load the whole season</button>`}</p>`
    : `<p class="note">From all ${gwCount} finalised gameweeks of the season.
        Gold marks the maximum in a column.</p>`;

  return `<div class="secline"><h4>Hall of fame</h4></div>
    <div class="hall"><table>
      <thead><tr><th>Manager</th>${header}</tr></thead>
      <tbody>${telo}</tbody>
    </table></div>${pozn}`;
}

/* Switching gameweeks. The picks of older gameweeks are only downloaded
   now — otherwise opening the hub would cost a request per gameweek. */
async function loadNewsGw(g){
  NEWS_GW = g;
  const host = $('hs-0');
  if(host) host.innerHTML = newsPanel();

  await loadGwData(g);
  if(NEWS_GW === g && $('hs-0')) $('hs-0').innerHTML = newsPanel();
}

/* One gameweek's picks and points. `live` is one request per gameweek, picks
   one per member — which is why this is not done when the hub opens. */
async function loadGwData(g){
  /* A finished gameweek does not change, so it needs loading once in the
     life of the league — the archive returns it without a single request
     to the FPL API. A live gameweek is never served from the archive. */
  const isFinal = gwPhase(g) === 'final';
  if(isFinal && !(NEWS_PICKS.has(g) && NEWS_LIVE.get(g))){
    try{ if(await snapLoad(g, HUB.members)) return; }
    catch(e){ /* the archive is a convenience, not a condition — go to the API */ }
  }

  if(!NEWS_PICKS.has(g)){
    try{
      NEWS_PICKS.set(g, await pooled(HUB.members,
        m => cached('entry/' + m.entry + '/event/' + g + '/picks/'), 5));
    }catch(e){
      // Without picks there simply are no captain awards. The rest of the
      // panel does not depend on them, so this is nothing to report.
      NEWS_PICKS.set(g, []);
    }
  }
  if(!NEWS_LIVE.has(g)){
    /* Distinguish "not loaded yet" (no key in the map) from "it failed"
       (key present, value null). This used to store null in both cases, so
       `has()` returned true and the panel also hid the message that was
       supposed to say why the captain awards were missing. */
    try{ NEWS_LIVE.set(g, await cached('event/' + g + '/live/')); }
    catch(e){ NEWS_LIVE.set(g, null); }
  }

  /* The gameweek is finished and loaded in full — so it is not downloaded
     again next time. Saved only here, because earlier it is not certain
     that we have both halves. */
  if(isFinal) snapSave(g, HUB.members, NEWS_PICKS.get(g), NEWS_LIVE.get(g));
}

/* Fetches the picks of every finished gameweek, so the hall of fame gets
   captains too. That is gameweeks × members requests, so it is click-only. */
async function loadWholeSeason(btn){
  HALL_ALL = true;
  if(btn){ btn.disabled = true; btn.textContent = 'Loading…'; }
  const gws = newsGws().filter(g => gwPhase(g) === 'final');
  for(const g of gws){
    await loadGwData(g);
    if(btn) btn.textContent = `Loading… ${gws.indexOf(g) + 1}/${gws.length}`;
  }
  if($('hs-0')) $('hs-0').innerHTML = newsPanel();
}

document.addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-newsgw]');
  if(btn) loadNewsGw(Number(btn.dataset.newsgw));
  const allBtn = ev.target.closest('button[data-hallall]');
  if(allBtn) loadWholeSeason(allBtn);
});

function renderHub(){
  // HUB has already loaded the current gameweek's picks — do not refetch.
  if(!NEWS_PICKS.has(HUB.cur.id)) NEWS_PICKS.set(HUB.cur.id, HUB.picks);
  if(NEWS_GW === null) NEWS_GW = HUB.cur.id;

  /* The hub does not need the current gameweek's player points itself —
     they are fetched in the background and the panel redraws once the captain awards can be computed. */
  if(!NEWS_LIVE.has(HUB.cur.id)){
    loadGwData(HUB.cur.id).then(() => {
      if(NEWS_GW === HUB.cur.id && $('hs-0')) $('hs-0').innerHTML = newsPanel();
    });
  }

  const SECS = [
    ['Novinky', newsPanel()],
    ['Leaderboards', buildBoards()],
    ['Squad health', buildHealth()],
    ['Whole league', buildCollective()],
  ];

  $('hubout').innerHTML = `
    <h2>${esc(CONFIG.leagueName || HUB.st.league.name)} · po ${HUB.cur.id}. kole${info(`${strengthsReady()
      ? 'Difficulty is computed from the attacking and defensive strength of both teams, not from the fixed FDR '
        + 'FPL sets in August and never changes. The colours are <b>relative</b> — each band gets '
        + 'roughly a fifth of the fixtures.'
      : strengthsUsable()
      ? 'Attacking and defensive strength are not in the data yet, so this uses <b>overall team strength</b> '
        + '(a 1–5 scale) — it still tells home from away, just more coarsely. '
        + 'The colours are relative, each band gets roughly a fifth of the fixtures.'
      : '<b>Difficulty source: the official FPL FDR.</b> The team strengths my own rating is '
        + 'computed from are not filled in yet — FPL adds them after a few gameweeks and the '
        + 'numbers get finer then.'}
    <b>CAPITALS</b> mean a home fixture,
    <b>lower case</b> away. Two clubs in one cell is a double, a dash is a blank.
    The table is sorted from the kindest run of fixtures.`)}</h2>
    <div class="subnav" role="tablist">
      ${SECS.map((s, i) => `<button class="sub-btn" role="tab"
        aria-selected="${i === 0}" data-hs="${i}">${esc(s[0])}</button>`).join('')}
    </div>
    ${SECS.map((s, i) => `<div class="sec" id="hs-${i}"${i ? ' hidden' : ''}>${s[1]}</div>`).join('')}`;

  $('hubout').querySelectorAll('.sub-btn').forEach(b => {
    b.addEventListener('click', () => {
      $('hubout').querySelectorAll('.sub-btn').forEach(x =>
        x.setAttribute('aria-selected', x === b));
      SECS.forEach((_, i) => { $('hs-' + i).hidden = String(i) !== b.dataset.hs; });
    });
  });
}

$('hubgo').addEventListener('click', async () => {
  $('hubgo').disabled = true;
  dropCached(/^(leagues-classic|entry)\//);
  await loadHub();
  $('hubgo').disabled = false;
});


/* ============ FIXTURES: schedule, prices, chips ============

   Four views of what is still to come. All of them rest on `fixtures/`
   and `bootstrap-static/`, so they are free — we already have the data.
*/

const PLAN_GWS = 6;

function planStartGw(){
  const nxt = BOOT.events.find(e => e.is_next);
  const cur = BOOT.events.find(e => e.is_current);
  return nxt ? nxt.id : (cur ? cur.id + 1 : 1);
}

/* --- 1. Ticker: a grid of clubs × gameweeks, coloured by difficulty ---

   FPL's FDR is static — set before the season and never changed, even if
   a team has since collapsed. So we compute our own from the attacking
   and defensive strength of both teams, which the bootstrap provides and nobody uses. */
/* Returns null until FPL has filled in team strengths.

   At the start of a season `strength_attack_*` and `strength_defence_*` are
   zero. The strength ratio then came out as 0, the formula fell far below
   the scale and `Math.max(1, …)` levelled everything to 1.0 — the whole
   league looked like nothing but easy fixtures. Silent nonsense that looked like a valid number. */
function teamStrengths(t, home){
  const att = home ? t.strength_attack_home : t.strength_attack_away;
  const def = home ? t.strength_defence_home : t.strength_defence_away;
  const a = parseFloat(att), d = parseFloat(def);
  if(Number.isFinite(a) && Number.isFinite(d) && a > 0 && d > 0) return {att: a, def: d};

  // Fallback: strength_overall_* on a 1–5 scale. FPL fills these in even when
  // strength_attack_* and strength_defence_* are still zero — which is the
  // case for the whole start of a season. These numbers used to be thrown
  // away too, and the app fell back to the static FDR, which cannot tell home from away.
  const o = parseFloat(home ? t.strength_overall_home : t.strength_overall_away);
  if(!Number.isFinite(o) || o <= 0) return null;

  // Converted to the same scale as strength_attack_* (around 1000–1400), so
  // that the strength ratio in ownFdr() lands in the same range as with real data.
  const scaled = 1000 + (o - 3) * 110;
  return {att: scaled, def: scaled, approx: true};
}

/* Do we have real attack and defence numbers, or are we on the coarse
   fallback? We distinguish so the note under the table can tell the truth. */
function strengthsReady(){
  return BOOT.teams.every(t => {
    const h = teamStrengths(t, true), a = teamStrengths(t, false);
    return h && a && !h.approx && !a.approx;
  });
}

/* Can our own FDR be computed at all? Even the coarse fallback will do. */
function strengthsUsable(){
  return BOOT.teams.every(t => teamStrengths(t, true) && teamStrengths(t, false));
}

/* `fallback` is the official FDR from the fixture list. It is used until
   team strengths exist — a static 3 from FPL still beats an invented 1. */
function ownFdr(teamId, oppId, home, fallback){
  const t = BOOT.teams.find(x => x.id === teamId);
  const o = BOOT.teams.find(x => x.id === oppId);
  const fb = Number.isFinite(fallback) ? fallback : 3;
  if(!t || !o) return fb;

  // How strong the opponent is against us: their defence slows our attack and vice versa.
  const me = teamStrengths(t, home);
  const opp = teamStrengths(o, !home);
  if(!me || !opp) return fb;

  // A strength ratio around 1.0 = an even match. Scaled to the familiar 1–5.
  const ratio = ((opp.def / me.att) + (opp.att / me.def)) / 2;
  const raw = 3 + (ratio - 1) * 7 + (home ? -0.35 : 0.35);
  if(!Number.isFinite(raw)) return fb;
  return Math.max(1, Math.min(5, raw));
}

/* The colour thresholds are computed from the distribution, not fixed.

   Fixed bounds (green under 2.2, red over 4.1) only worked by accident.
   Team strengths in the bootstrap differ little for most clubs, so almost
   every fixture fell into one band and the ticker was uniformly green.
   Colour coding that does not distinguish is worse than none.

   Quintiles across every fixture in the visible window guarantee each band
   gets roughly a fifth of the cells — difficulty is therefore always
   relative to what is actually being played in those gameweeks. */
let FDR_CUTS = null;

function computeFdrCuts(startGw, n){
  const all = [];
  for(const t of BOOT.teams)
    for(let gw = startGw; gw < startGw + n; gw++)
      for(const f of gwFixtures(t.id, gw))
        all.push(ownFdr(t.id, f.opp, f.home, f.d));

  const DEFAULT_CUTS = [1.5, 2.5, 3.5, 4.5];
  if(all.length < 10){ FDR_CUTS = DEFAULT_CUTS; return FDR_CUTS; }

  all.sort((a, b) => a - b);

  // When every value is equal the quintiles have nothing to split and the
  // whole grid would come out one colour. Better a fixed scale than fake shades.
  if(all[all.length - 1] - all[0] < 0.4){ FDR_CUTS = DEFAULT_CUTS; return FDR_CUTS; }

  const q = p => all[Math.min(all.length - 1, Math.floor(all.length * p))];
  FDR_CUTS = [q(0.2), q(0.4), q(0.6), q(0.8)];
  return FDR_CUTS;
}

function fdrClass(d){
  const c = FDR_CUTS || [2.2, 2.8, 3.4, 4.1];
  if(d <= c[0]) return 'f1';
  if(d <= c[1]) return 'f2';
  if(d <= c[2]) return 'f3';
  if(d <= c[3]) return 'f4';
  return 'f5';
}

function buildTicker(){
  const start = planStartGw();
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  computeFdrCuts(start, PLAN_GWS);

  const rows = BOOT.teams.map(t => {
    const cells = [];
    let sum = 0, count = 0;

    for(let gw = start; gw < start + PLAN_GWS; gw++){
      const fx = gwFixtures(t.id, gw);

      if(!fx.length){
        cells.push('<td class="fx blank"><span>–</span></td>');
        sum += 5; count++;     // a blank is the worst case for planning
        continue;
      }

      const inner = fx.map(f => {
        const d = ownFdr(t.id, f.opp, f.home, f.d);
        sum += d; count++;
        const opp = teams[f.opp].short_name;
        return `<span class="${fdrClass(d)}">${esc(f.home ? opp.toUpperCase() : opp.toLowerCase())}</span>`;
      }).join('');

      cells.push(`<td class="fx${fx.length > 1 ? ' dbl' : ''}">${inner}</td>`);
    }

    return {t, cells, avg: count ? sum / count : 5};
  });

  rows.sort((a, b) => a.avg - b.avg);

  const head = Array.from({length: PLAN_GWS}, (_, i) => `<th>${start + i}</th>`).join('');
  const body = rows.map(r =>
    `<tr><td class="tn">${esc(r.t.name)}</td>${r.cells.join('')}<td class="num">${r.avg.toFixed(2)}</td></tr>`
  ).join('');

  return `<table class="ticker">
      <thead><tr><th>Klub</th>${head}<th>Ø</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    `;
}

/* --- 2. Blanky a doubly --- */
function buildShape(){
  const start = planStartGw();
  const shape = gwShape(start, PLAN_GWS).filter(x => x.blanks.length || x.doubles.length);

  if(!shape.length)
    return `<p class="note">The next ${PLAN_GWS} gameweeks have no blanks or doubles —
      every club plays exactly once.</p>`;

  const mine = MY_SQUAD;

  const cards = shape.map(x => {
    const affected = list => {
      const names = list.map(t => esc(t.short_name)).join(', ');
      if(!mine) return names;
      const hit = list.filter(t => BOOT.elements.some(p => p.team === t.id && mine.has(p.id)));
      return names + (hit.length
        ? ` <b>· affects yours: ${hit.map(t => esc(t.short_name)).join(', ')}</b>`
        : '');
    };

    return `<div class="shape">
      <h3>GW${x.gw}</h3>
      ${x.blanks.length ? `<p class="bl"><b>Blank</b> ${affected(x.blanks)}</p>` : ''}
      ${x.doubles.length ? `<p class="db"><b>Double</b> ${affected(x.doubles)}</p>` : ''}
    </div>`;
  }).join('');

  return cards + ``;
}

/* --- 3. Price change predictions ---

   FPL does not publish the algorithm, but the direction is reliable: what
   decides is net transfer flow weighted by how many people own the player.
   We do not know the exact threshold, so we show pressure ranking, not certainty. */
/* The official rise and fall predictions.

   The direction used to be estimated from net transfers divided by
   ownership. It was a reasonable approximation, but FPL now computes this
   v bootstrapu:

     price_change_percent        how full the meter is, in per cent
     price_change_hourly_rate    how fast it is filling right now
     price_change_projections    [{offset, projected_percent, likelihood}]
                                 offset 0/1/2 = today / tomorrow / the day after,
                                 likelihood −5…+5 = jistota pohybu
     price_change_locked_until   the player cannot move before this time

   We take the official number when it exists — as with ep_next. */
function priceMoves(){
  const projFor = (p, offset) =>
    (p.price_change_projections || []).find(x => x.offset === offset) || null;

  const scored = BOOT.elements.map(p => {
    const now = parseFloat(p.price_change_percent);
    const today = projFor(p, 0);
    const in3 = projFor(p, 2);
    if(!Number.isFinite(now) || !today) return null;

    return {
      p,
      pct: now,
      rate: p.price_change_hourly_rate || 0,
      likeToday: today.likelihood || 0,
      like3: in3 ? (in3.likelihood || 0) : (today.likelihood || 0),
      pct3: in3 ? parseFloat(in3.projected_percent) : now,
      locked: p.price_change_locked_until || null,
    };
  }).filter(Boolean);

  const up = scored.filter(x => x.likeToday > 0 || x.like3 > 0)
    .sort((a, b) => (b.likeToday - a.likeToday) || (b.pct - a.pct)).slice(0, 10);
  const down = scored.filter(x => x.likeToday < 0 || x.like3 < 0)
    .sort((a, b) => (a.likeToday - b.likeToday) || (a.pct - b.pct)).slice(0, 10);

  return {up, down, ok: scored.length > 0};
}

/* Jistota pohybu awards_.

   FPL sends a likelihood in the range −5…+5. It used to be drawn as a row
   of dots, which was a problem twice over: nobody tells five dots from
   four at a glance, and nowhere was it said what the numbers mean. A word
   can be read out of the corner of your eye.

   Percentages would lie here — likelihood is not a probability, it is a
   pressure ranking on a scale FPL does not publish. So it is turned into
   words, not into "80 %". The fill percentage next to it is already in the
   table and those percentages are real. */
const LIKE_WORDS = {5: 'certain', 4: 'near certain', 3: 'likely',
                    2: 'possible', 1: 'uncertain'};

function likeChip(v, kind){
  const n = Math.min(5, Math.abs(v || 0));
  if(!n) return '<span class="lk none">–</span>';
  const dir = v > 0 ? 'up' : 'down';
  const sipka = v > 0 ? '▲' : '▼';
  const slovo = LIKE_WORDS[n];
  return `<span class="lk ${dir} l${n}" title="${
    (v > 0 ? 'Rise' : 'Fall')} ${kind || ''} — confidence ${n} of 5 according to FPL"
    ><i aria-hidden="true">${sipka}</i>${esc(slovo)}</span>`;
}

/* The fill meter. 100 % = a move tonight. */
function priceMeter(pct, dir){
  const w = Math.max(3, Math.min(100, Math.abs(pct)));
  return `<span class="meter ${dir}" role="img"
    aria-label="${Math.round(Math.abs(pct))} per cent full"><i style="width:${w}%"></i></span>`;
}

function buildPrices(){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const mv = priceMoves();

  // An empty state is not an explanation — it belongs on the page, not under an "i".
  if(!mv.ok) return `<h3>Pohyby cen</h3>
    <p class="note">FPL is not sending price predictions yet — the
    <code>price_change_projections</code> field is empty in the data. It usually
    appears after the first gameweek.</p>`;

  const dl = (BOOT.game_config && BOOT.game_config.settings
              && BOOT.game_config.settings.price_change_deadlines) || [];
  const nextDl = dl.map(d => new Date(d)).filter(d => d > new Date()).sort((a, b) => a - b)[0];

  const row = (x, dir) => {
    const mine = MY_SQUAD && MY_SQUAD.has(x.p.id);
    const lock = x.locked && new Date(x.locked) > new Date();
    return `<tr${mine ? ' class="me"' : ''}>
      <td>${watchStar(x.p.id)}</td>
      <td>${esc(x.p.web_name)}<span class="sub">${esc(teams[x.p.team].short_name)}</span></td>
      <td class="n">${(x.p.now_cost / 10).toFixed(1)}m</td>
      <td>${priceMeter(x.pct, dir)}<span class="sub">${x.pct.toFixed(0)} %${
        lock ? ' · locked' : ''}</span></td>
      <td>${likeChip(x.likeToday, 'dnes v noci')}</td>
      <td class="hide-s">${likeChip(x.like3, 'within three days')}</td>
    </tr>`;
  };

  const tbl = (rows, dir, title, note) => `
    <h3>${title}</h3>
    ${rows.length
      ? `<table><thead><tr><th></th><th>Player</th><th class="n">Price</th><th>Meter</th>
         <th>Tonight</th><th class="hide-s">Within 3 days</th></tr></thead>
         <tbody>${rows.map(x => row(x, dir)).join('')}</tbody></table>`
      : '<p class="note">Nothing significant.</p>'}
    <p class="note">${note}</p>`;

  return tbl(mv.up, 'up', 'Closest to a rise',
      'If you want him, buy early — after a rise you pay 0.1m more and on selling '
      + 'you only get half the profit back.')
    + tbl(mv.down, 'down', 'Closest to a fall',
      'A fall takes value out of your team. If you plan to let him go anyway, do it now.')
    + `<p class="note">Sloupec <b>Dnes v noci</b> je jistota pohybu podle FPL
       (a five-step scale, "certain" being the highest); the meter beside it is the real
       fill of the price gauge in per cent. Highlighted rows are players in your squad.${
       nextDl ? ' Next price change: <b>' + nextDl.toLocaleString('en-GB',
         {weekday: 'short', hour: '2-digit', minute: '2-digit'}) + '</b>.' : ''}</p>`;
}


async function loadPlan(){
  $('plmsg').textContent = 'Loading fixtures…';
  try{
    if(!BOOT){ [BOOT, FIX] = await Promise.all([api('bootstrap-static/'), api('fixtures/')]); }
    startCountdown();

    const start = planStartGw();
    // Prices have had their own tab since this version — inside Fixtures
    // they were impossible to navigate. Chip advice went entirely: it needed
    // a squad loaded from another tab and without one it only showed a prompt.
    const SECTIONS = [
      ['Rozpis', buildTicker()],
      ['Blanky a doubly', buildShape()],
    ];

    $('plout').innerHTML = `
      <h2>GW${start}–${start + PLAN_GWS - 1}</h2>
      <div class="subnav" role="tablist">
        ${SECTIONS.map((x, i) =>
          `<button class="sub-btn" role="tab" aria-selected="${i === 0}" data-sec="${i}">${esc(x[0])}</button>`
        ).join('')}
      </div>
      ${SECTIONS.map((x, i) =>
        `<div class="sec" id="pl-${i}"${i ? ' hidden' : ''}>${x[1]}</div>`
      ).join('')}`;

    $('plout').querySelectorAll('.sub-btn').forEach(b => {
      b.addEventListener('click', () => {
        $('plout').querySelectorAll('.sub-btn').forEach(x =>
          x.setAttribute('aria-selected', x === b));
        SECTIONS.forEach((_, i) => { $('pl-' + i).hidden = String(i) !== b.dataset.sec; });
      });
    });

    $('plmsg').textContent = '';
  }catch(e){
    $('plmsg').innerHTML = errBox(e.message, 't-plan');
  }
}



/* ============================================================
   LEAGUE HISTORY

   One important limitation worth knowing up front: FPL **does not send
   mini-league standings for past seasons**. The standings endpoint always
   returns the current season. What it does send is `past` from
   entry/{id}/history/ — each manager's total points and overall rank for
   previous seasons.

   The table below is therefore assembled from the totals of the members
   who are in the league **today**. It is not an archive of how the league
   actually finished:
     · anyone who has since left is missing,
     · anyone who joined last year has older seasons empty,
     · the ranking is recomputed among today's members, not historical.
   The app says so to the user as well — a quietly inaccurate archive would
   be worse than none.
   ============================================================ */

const HIST_SEASONS = 6;

/* Builds a season × manager matrix from each member's `past`. */
/* Who officially played for the league in a given season.

   FPL only knows each manager's total points — it has no idea the league
   grew over time. Without this, medals for the years when three people
   played would also go to those who were playing elsewhere at the time.

   A season missing from CONFIG.officialSeasons counts for everyone. */
function matchesMember(key, m){
  return String(key) === String(m.entry) || normName(key) === normName(m.player_name);
}

function officialIn(season, m){
  // Joined the league later? Older seasons do not count.
  // Strings like "2023/24" compare directly — alphabetical order is chronological here.
  const since = Object.entries(CONFIG.memberSince || {})
    .find(([k]) => matchesMember(k, m));
  if(since && season < since[1]) return false;

  // A season with a fixed roster.
  const list = (CONFIG.officialSeasons || {})[season];
  if(!list) return true;
  return list.some(x => matchesMember(x, m));
}

/* The season × manager matrix plus medals.

   Medals are handed out only among those who really played that season —
   anyone not in the league then neither enters the ranking nor takes last
   place. */
function buildLeagueHistory(members, pasts){
  const seasons = new Set();
  const rows = [];

  members.forEach((m, i) => {
    const past = (pasts[i] && pasts[i].past) || [];
    const by = {};
    past.forEach(x => {
      if(!x || !x.season_name) return;
      seasons.add(x.season_name);
      by[x.season_name] = {pts: x.total_points, rank: x.rank};
    });
    rows.push({m, by, medals: {1: 0, 2: 0, 3: 0}, played: 0});
  });

  const cols = [...seasons].sort().slice(-HIST_SEASONS);

  const order = {};
  cols.forEach(c => {
    const hrali = rows
      .filter(r => r.by[c] && officialIn(c, r.m))
      .sort((a, b) => b.by[c].pts - a.by[c].pts);

    order[c] = new Map(hrali.map((r, i) => [r.m.entry, i + 1]));
    hrali.forEach((r, i) => { if(i < 3) r.medals[i + 1]++; });
  });

  rows.forEach(r => { r.played = cols.filter(c => r.by[c]).length; });
  return {cols, rows, order};
}

const MEDAL = {1: '🥇', 2: '🥈', 3: '🥉'};

/* The trophy ranking. Sorted by gold, then silver, then bronze — one
   first place is worth more than three seconds. */
function trophyTable(rows){
  const score = r => r.medals[1] * 10000 + r.medals[2] * 100 + r.medals[3];
  const winners = rows.filter(r => score(r) > 0).sort((a, b) => score(b) - score(a));
  if(!winners.length) return '';

  return `<ol class="trophies">${winners.map((r, i) => `
    <li${r.m.entry === HIST_ME ? ' class="me"' : ''}>
      <span class="pos">${i + 1}</span>
      <span class="nm"><b>${esc(r.m.player_name)}</b></span>
      <span class="mdl">${[1, 2, 3].map(k => r.medals[k]
        ? `<span title="place ${k}">${MEDAL[k]}<u>${r.medals[k]}</u></span>` : ''
      ).join('')}</span>
    </li>`).join('')}</ol>`;
}

let HIST_ME = null;

function renderLeagueHistory(members, pasts, myId){
  HIST_ME = myId;
  const {cols, rows, order} = buildLeagueHistory(members, pasts);

  if(!cols.length)
    return `<p class="note">No league member has a previous season recorded
      in FPL.</p>`;

  const sorted = rows.slice().sort((a, b) =>
    (b.medals[1] - a.medals[1]) || (b.played - a.played) ||
    cols.reduce((x, c) => x + (b.by[c] ? b.by[c].pts : 0), 0) -
    cols.reduce((x, c) => x + (a.by[c] ? a.by[c].pts : 0), 0));

  /* A cell carries only points and a medal. Rank and overall rank went into
     the title — there used to be two lines of small print under every
     number and the table could not be read across. */
  const cell = (r, c) => {
    const v = r.by[c];
    if(!v) return '<td class="n empty">·</td>';
    const pos = order[c].get(r.m.entry);
    const host = !pos;   // played FPL, but not in this league
    const tip = `${v.pts} points · ${host ? 'outside the league'
      : 'ranked ' + pos + ' in the league'}${v.rank ? ' · ' + v.rank.toLocaleString('en-GB') + ' overall' : ''}`;
    return `<td class="n${host ? ' guest' : ''}" title="${esc(tip)}">
      ${pos && pos <= 3 ? `<i class="m">${MEDAL[pos]}</i>` : ''}${v.pts}</td>`;
  };

  const off = Object.keys(CONFIG.officialSeasons || {});
  const late = Object.entries(CONFIG.memberSince || {});

  return `${trophyTable(rows)}
    <table class="hist">
      <thead><tr><th>Manager</th>${cols.map(c =>
        `<th class="n">${esc(c.replace('20', ''))}</th>`).join('')}</tr></thead>
      <tbody>${sorted.map(r => `<tr${r.m.entry === myId ? ' class="me"' : ''}>
        <td><b>${esc(r.m.player_name)}</b></td>
        ${cols.map(c => cell(r, c)).join('')}
      </tr>`).join('')}</tbody>
    </table>
    <p class="note">The numbers are season totals; hover to see the rank.
      Medals are counted only among those who played for the league that
      nastoupili${off.length
        ? ` — in ${esc(off.join(', '))} that was only ${
            esc((CONFIG.officialSeasons[off[0]] || []).join(', '))}`
        : ''}${late.length
        ? `. Later arrivals: ${esc(late.map(([k, v]) => k + ' (' + v + ')').join(', '))}`
        : ''}. A grey number means the person played FPL that season but
      outside this league. A dot means they did not play at all.</p>
    <p class="note">FPL does not send mini-league standings for past seasons,
      only each manager's totals — so the table is derived from the people who are
      v lize dneska.</p>`;
}

async function loadLeagueHistory(members, myId){
  const box = $('histbox');
  if(!box) return;
  box.innerHTML = '<div class="skel"><i></i><i></i><i></i><i></i></div>';

  try{
    // One request per member. For big leagues that would be too much, so we
    // take the first fifty — more does not fit sensibly in the table anyway.
    const subset = members.slice(0, 50);
    const pasts = await pooled(subset,
      m => cached('entry/' + m.entry + '/history/'), 5,
      (done, total) => {
        box.innerHTML = `<p class="note">Loading history… ${done}/${total}</p>`;
      });

    const ok = pasts.filter(Boolean).length;
    if(!ok){ box.innerHTML = '<p class="note">The history could not be loaded.</p>'; return; }

    box.innerHTML = (ok < subset.length
        ? `<p class="note">History failed to load for ${subset.length - ok} members,
           so they are missing from the table.</p>`
        : '')
      + renderLeagueHistory(subset, pasts, myId);
  }catch(e){
    box.innerHTML = `<p class="note">The history could not be loaded: ${esc(e.message)}</p>`;
  }
}

/* ============================================================
   DIFFERENTIALS

   A differential is a player almost nobody owns who scores anyway. Both
   halves must hold at once — low ownership on its own is no virtue, most
   unowned players are unowned for good reason.

   The score therefore has two parts:

     return   = my model's projection over the next 5 gameweeks (it accounts
                for fixtures, minutes certainty, defensive contributions and doubles)
     leverage = how much it moves you in the table

   Leverage is not linear. The difference between 2 % and 12 % ownership
   matters far more to your position than between 40 % and 50 %, because in
   the second case almost the whole field moves with you. So we use
   1 / sqrt(ownership), clipped from below, so that extremely obscure
   players with one good stat do not run away with it.

   This is not "buy him". It is a list of where to look.
   ============================================================ */

const DIFF_GWS = 5;

/* Progressively looser ownership ceilings.

   Originally there was one fixed 12 % ceiling and a hard filter on minutes.
   When nobody fitted, the app wrote "nobody passed the filter" and stopped —
   the least useful answer it could give. Early in the season, when most
   players have a handful of minutes, that happened almost every time.

   Now the ceiling loosens until at least five names are found, and the app
   says how far it had to go. An empty list is worse than a list with a caveat. */
const DIFF_TIERS = [
  {max: 6,   label: 'under 6 % ownership'},
  {max: 12,  label: 'under 12 % ownership'},
  {max: 20,  label: 'under 20 % ownership'},
  {max: 35,  label: 'under 35 % ownership'},
  {max: 101, label: 'no ownership limit'},
];

/* Minutes certainty as a number from 0 to 1, not yes/no.

   A hard condition on minutes played does not work in the first month:
   someone who has played two gameweeks has few minutes by definition, not
   because he is out of favour. So we take starts against gameweeks played,
   and when there are none yet we lean on price — an expensive player does not sit. */
function minuteConfidence(p, gwPlayed){
  if(p.status === 'u' || p.status === 'n') return 0;      // gone, not playing
  if(p.status === 'i' || p.status === 's') return 0;      // injured, suspended

  const chance = p.chance_of_playing_next_round;
  const chanceMul = chance === null || chance === undefined ? 1 : chance / 100;
  if(chanceMul < 0.5) return 0;

  if(gwPlayed < 1){
    // The season has not started: minutes and starts say nothing. Price is a
    // crude signal, but the only one that exists at that point.
    return chanceMul * Math.max(0, Math.min(1, (p.now_cost / 10 - 3.8) / 2.5));
  }

  const startRate = (p.starts || 0) / gwPlayed;
  const minRate = p.minutes / (gwPlayed * 90);

  // Starts weigh more than minutes: a player who starts and is subbed off is still a certainty.
  const base = Math.min(1, startRate * 0.65 + minRate * 0.55);
  return chanceMul * base;
}

/* The backwards-compatible hard variant. */
function minutesSecure(p, gwPlayed){
  return minuteConfidence(p, gwPlayed) >= 0.6;
}

function diffScore(p, startGw, ownPct, conf){
  const xp = projectRange(p, startGw, DIFF_GWS);
  const own = Math.max(1.5, ownPct);        // leverage clipped from below
  const c = conf === undefined ? 1 : conf;
  return {xp, conf: c, leverage: 1 / Math.sqrt(own), score: (xp / Math.sqrt(own)) * c};
}

/* Picks five names and says how loose a ceiling it needed.
   `ownOf` returns ownership in per cent — global, or within the league. */
function diffRows(pool, startGw, ownOf, gwPlayed, tiers){
  const scored = pool
    .map(p => {
      const conf = minuteConfidence(p, gwPlayed === undefined ? 0 : gwPlayed);
      return {p, own: ownOf(p), ...diffScore(p, startGw, ownOf(p), conf)};
    })
    .filter(x => x.conf > 0 && x.xp > 0);

  const list = tiers || DIFF_TIERS;
  const last = list[list.length - 1];
  let rows = [];
  let used = last;

  for(const tier of list){
    const fit = scored.filter(x => x.own <= tier.max)
      .sort((a, b) => b.score - a.score);

    if(fit.length >= 5 || tier === last){
      rows = fit.slice(0, 5);
      used = tier;
      break;
    }
    // Keep an incomplete result in case no ceiling is enough.
    if(fit.length > rows.length){ rows = fit.slice(0, 5); used = tier; }
  }

  return {rows, tier: used};
}

function confLabel(c){
  return c >= 0.85 ? '<span class="ok-t">certain</span>'
       : c >= 0.6  ? 'decent'
       : c >= 0.35 ? '<span class="warn-t">varies</span>'
       : '<span class="bad-t">riziko</span>';
}

function diffTable(res, ownLabel){
  const rows = res.rows || res;
  if(!rows.length)
    return `<p class="note">Nobody in the data has a non-zero projection yet —
      that only happens before the first gameweek of the season.</p>`;

  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  return `<table><thead><tr>
      <th>Player</th><th class="n">Price</th><th class="n">${esc(ownLabel)}</th>
      <th class="n">Projekce ${DIFF_GWS} gwCount</th><th class="n">xGI/90</th>
      <th class="n">Minuty</th></tr></thead>
    <tbody>${rows.map(r => {
      const mine = MY_SQUAD && MY_SQUAD.has(r.p.id);
      const xgi = stat(r.p, 'expected_goal_involvements_per_90');
      return `<tr${mine ? ' class="me"' : ''}>
        <td><span class="who">${crest(r.p.team, 'sm')}<b>${esc(r.p.web_name)}</b>
          <em class="sub">${esc(teams[r.p.team].short_name)}</em>
          ${mine ? '<span class="badge dif">owned</span>' : ''}</span></td>
        <td class="n">${(r.p.now_cost / 10).toFixed(1)}m</td>
        <td class="n">${r.own.toFixed(1)} %</td>
        <td class="n"><b>${r.xp.toFixed(1)}</b></td>
        <td class="n">${xgi === null ? '–' : xgi.toFixed(2)}</td>
        <td class="n">${confLabel(r.conf)}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function buildDifferentials(){
  const startGw = planStartGw();
  const gwPlayed = BOOT.events.filter(e => e.finished).length;

  // --- global ---
  const g = diffRows(BOOT.elements, startGw,
    p => parseFloat(p.selected_by_percent) || 0, gwPlayed);

  let out = `<h3>Top 5 differentials · all of FPL${info(`Players ${esc(g.tier.label)} with the highest projection for the next
      ${DIFF_GWS} gwCount.${g.tier.max > 12
        ? ' <b>The ceiling had to be loosened</b> — under twelve per cent there were not five names'
          + ' with a sensible projection.'
        : ''}`)}</h3>
    
    ${diffTable(g, 'Owned')}`;

  // --- within the mini-league ---
  out += '<h3>Top 5 differentials · your mini-league</h3>';

  if(!LEAGUE_OWN){
    out += `<p class="note">The rivals' squads have not loaded, so I do not know
      who owns whom in the league. Try <b>Reload data</b> in the header.</p>`;
  }else{
    const {owners, n} = LEAGUE_OWN;
    const ownPct = p => ((owners[p.id] || []).length / n) * 100;

    /* Inside a league the ceiling is measured in people, not per cent:
       first who nobody owns, then who one person owns, then two. With a
       ten-member league percentages would jump by ten and the ceilings
    const tiers = [0, 1, 2, 3].map(k => ({
      max: (k / n) * 100 + 0.01,
      label: k === 0 ? 'owned by nobody in the league'
           : k === 1 ? 'owned by at most one rival'
           : `owned by at most ${k} people in the league`,
    }));
    tiers.push({max: 101, label: 'regardless of ownership in the league'});

    const l = diffRows(BOOT.elements, startGw, ownPct, gwPlayed, tiers);

    /* A second five: under half the league.

       Sharp differentials (nobody / one rival) are often players nobody
       owns for good reason. Under half the league is a milder category:
       you still gain on half your rivals, but the choice is wider and the
       names better known. One without the other gives a skewed picture. */
    const half = [{max: 50 - 0.01, label: 'owned by less than half the league'}];
    const h = diffRows(BOOT.elements, startGw, ownPct, gwPlayed, half);

    out += `<div class="subnav" role="tablist">
        <button class="sub-btn" role="tab" aria-selected="true" data-diff="0">Sharp</button>
        <button class="sub-btn" role="tab" aria-selected="false" data-diff="1">Pod polovinou ligy</button>
      </div>
      <div class="sec" id="diff-0">
        <p class="note">Players ${esc(l.tier.label)} (${n} managers).
          This is where the table swings most — a player the whole league owns
          gains you nothing against them, even with a hat-trick.</p>
        ${diffTable(l, 'V lize')}
      </div>
      <div class="sec" id="diff-1" hidden>
        <p class="note">Players owned by less than half the league. A milder
          category — you still gain on half your rivals, but the choice is wider
          and the risk lower than with players nobody owns.</p>
        ${diffTable(h, 'V lize')}
      </div>`;
  }

  out += `<p class="note">Sorted by projection divided by the square root of
    ownership and multiplied by minutes certainty. The square root because the
    difference between 2 % and 12 % matters far more to your position than
    between 40 % and 50 % — there almost the whole field moves with you. The
    "Minutes" column says how certain a start is: a player with a high projection
    who varies is a bet, not a plan. It is not an instruction to buy, it is a list of where to look.</p>`;

  return out;
}

/* Switching between sharp and milder league differentials.
   Delegated, because the block is redrawn with the whole tab. */
document.addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-diff]');
  if(!btn) return;
  const host = btn.closest('.diffs') || document;
  host.querySelectorAll('button[data-diff]').forEach(b =>
    b.setAttribute('aria-selected', String(b === btn)));
  host.querySelectorAll('[id^="diff-"]').forEach(sec => {
    sec.hidden = sec.id !== 'diff-' + btn.dataset.diff;
  });
});

/* ============================================================
   PRICES TAB

   This used to be one of four sections inside Fixtures and got lost there.
   Yet price is the one thing in FPL that changes every night and can only
   be reacted to in advance — it deserves its own place.

   Three views:
     · who rises or falls tonight (official projections),
     · whose price moved over the last gameweek (cost_change_event),
     · the biggest move since the start of the season (cost_change_start).
   ============================================================ */

/* ------------------------------------------------------------
   WATCHLIST

   Watched players are the ones I do not own yet but want to know about
   when their price moves. Without this you have to check them by hand
   every day — and a rise is noticed only once it is too late.

   Only an array of IDs is kept in localStorage under a key with the entry
   ID, so each team has its own list. No server, no account.
   ------------------------------------------------------------ */
const WATCH_KEY = () => 'fpl_watch:' + (ENTRY_ID || '0');
let WATCH = null;

function loadWatch(){
  if(WATCH) return WATCH;
  try{
    const raw = JSON.parse(localStorage.getItem(WATCH_KEY()) || '[]');
    WATCH = new Set(Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : []);
  }catch(e){ WATCH = new Set(); }
  return WATCH;
}

function saveWatch(){
  lsSet(WATCH_KEY(), JSON.stringify([...loadWatch()]));
}

function isWatched(id){ return loadWatch().has(Number(id)); }

function toggleWatch(id){
  const w = loadWatch();
  id = Number(id);
  if(w.has(id)) w.delete(id); else w.add(id);
  saveWatch();
  return w.has(id);
}

/* A star for any player. The handler is delegated, so it survives a table
   redraw. */
function watchStar(id){
  const theirs_ = isWatched(id);
  return `<button type="button" class="star${theirs_ ? ' theirs_' : ''}" data-watch="${id}"
    aria-pressed="${theirs_}" title="${theirs_ ? 'Remove from watchlist' : 'Watch this player'}"
    aria-label="${theirs_ ? 'Remove from watchlist' : 'Watch this player'}">${theirs_ ? '★' : '☆'}</button>`;
}

/* A watched player's state in one sentence — the same thing Home needs. */
function watchRows(){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  const projFor = (p, offset) =>
    (p.price_change_projections || []).find(x => x.offset === offset) || null;

  return [...loadWatch()]
    .map(id => BOOT.elements.find(p => p.id === id))
    .filter(Boolean)
    .map(p => {
      const today = projFor(p, 0);
      const pct = parseFloat(p.price_change_percent);
      const like = today ? (today.likelihood || 0) : 0;
      return {p, team: teams[p.team], like,
              pct: Number.isFinite(pct) ? pct : 0,
              chance: p.chance_of_playing_next_round};
    })
    .sort((a, b) => Math.abs(b.like) - Math.abs(a.like)
                 || Math.abs(b.pct) - Math.abs(a.pct));
}

function buildWatch(){
  const rows = watchRows();

  /* Players are added from the list of everyone sorted by points — the same
     pattern as the player comparison, just without the second select. */
  const opts = BOOT.elements
    .slice()
    .sort((a, b) => b.total_points - a.total_points)
    .map(p => `<option value="${p.id}">${POS[p.element_type]} · ${esc(p.web_name)} · ${
      esc(BOOT.teams.find(t => t.id === p.team).short_name)} · ${
      (p.now_cost / 10).toFixed(1)}m</option>`).join('');

  const adder = `<div class="watchadd">
    <label>Add a player
      <input type="search" id="wq" placeholder="Search by name…" autocomplete="off"
             role="combobox" aria-expanded="false" aria-controls="wsug"
             aria-autocomplete="list">
      <div class="wsug" id="wsug" role="listbox" hidden></div>
    </label>
    <label>Nebo highlighted ze seznamu
      <select id="wsel"><option value="">Pick a player…</option>${opts}</select>
    </label>
  </div>`;

  if(!rows.length) return `<h3>Watchlist</h3>${adder}
    <p class="note">You are not watching anyone yet. Add a player above, or click
    the star next to anyone in the price movement tables — they will then show up
    here and on Home with how close their price is to changing.</p>
    ${storageNote('Watchlist')}`;

  const dirClass = l => l > 0 ? 'up' : l < 0 ? 'down' : '';
  const stateText = r => {
    if(r.p.status === 'i') return ['al', 'injured'];
    if(r.p.status === 's') return ['al', 'suspended'];
    if(r.p.status === 'u' || r.p.status === 'n') return ['al', 'unavailable'];
    if(r.chance !== null && r.chance < 100) return ['wn', r.chance + ' %'];
    return ['ok', 'fine'];
  };

  return `<h3>Watchlist${info(`The players you follow. The meter is how full the
    FPL price gauge is; the "Tonight" column says how certain a price move is at
    the next change.`)}</h3>
    ${adder}
    <table><thead><tr><th></th><th>Player</th><th class="n">Price</th>
      <th>Ukazatel</th><th>Dnes v noci</th><th class="hide-s">Stav</th></tr></thead>
    <tbody>${rows.map(r => {
      const [cls, txt] = stateText(r);
      return `<tr${MY_SQUAD && MY_SQUAD.has(r.p.id) ? ' class="me"' : ''}>
        <td>${watchStar(r.p.id)}</td>
        <td>${esc(r.p.web_name)}<span class="sub">${esc(r.team.short_name)}</span></td>
        <td class="n">${(r.p.now_cost / 10).toFixed(1)}m</td>
        <td>${priceMeter(r.pct, dirClass(r.like) || 'up')}<span class="sub">${
          r.pct.toFixed(0)} %</span></td>
        <td>${likeChip(r.like, 'dnes v noci')}</td>
        <td class="hide-s ${cls}">${txt}</td>
      </tr>`;
    }).join('')}</tbody></table>
    <p class="note">Highlighted rows are players already in your squad.</p>
    ${storageNote('Watchlist')}`;
}

/* One delegated handler for every star in the app. */
document.addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-watch]');
  if(!btn) return;
  const theirs_ = toggleWatch(btn.dataset.watch);

  // Redraw every star for the same player, not just the one clicked —
  // the same player is often in both a movement table and the watchlist.
  document.querySelectorAll(`button[data-watch="${btn.dataset.watch}"]`)
    .forEach(b => {
      b.textContent = theirs_ ? '★' : '☆';
      b.classList.toggle('theirs_', theirs_);
      b.setAttribute('aria-pressed', String(theirs_));
    });

  const sec = $('pr-3');
  if(sec && !sec.hidden) sec.innerHTML = buildWatch(), wireWatch();

  /* In Injuries a star can drop the row from the list outright (the
     Watched view), so the whole table is redrawn. */
  if($('p-inj') && !$('p-inj').hidden && $('injtbl')) drawInj();

  drawHome();
});

/* Search and select for adding to the watchlist. */
/* The list of names under the search field.

   Players used to be added while typing: after the third character the
   best match was taken and pushed into the watchlist. Anyone looking for
   Fernandes got Wieffer after typing "fer", and was never asked.

   Now the matches are only offered. The one that gets added is the one you
   click or confirm with Enter — and until you confirm, nothing happens. */
function watchMatches(text){
  const needle = normName(text || '');
  if(needle.length < 2) return [];

  return BOOT.elements
    .map(p => {
      const name_ = normName(p.web_name);
      const cele = normName(p.first_name + ' ' + p.second_name);
      // A match at the start of a name is almost always the one wanted; a
      // match in the middle ("fer" in "Wieffer") is the last resort.
      const rank = name_.startsWith(needle) ? 0
        : cele.split(' ').some(w => w.startsWith(needle)) ? 1
        : (name_ + ' ' + cele).includes(needle) ? 2 : null;
      return rank === null ? null : {p, rank};
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || b.p.total_points - a.p.total_points)
    .slice(0, 8);
}

function watchRedraw(){
  const sec = $('pr-3');
  if(sec) sec.innerHTML = buildWatch();
  else if($('watchbox')) $('watchbox').innerHTML = buildWatch();
  wireWatch();
  drawHome();
}

function wireWatch(){
  const q = $('wq'), sel = $('wsel'), sug = $('wsug');

  if(sel) sel.addEventListener('change', () => {
    if(!sel.value) return;
    toggleWatch(sel.value);
    watchRedraw();
  });

  if(!q || !sug) return;

  let highlighted = -1;   // index of the highlighted suggestion for keyboard control

  const zavri = () => {
    sug.hidden = true;
    sug.innerHTML = '';
    q.setAttribute('aria-expanded', 'false');
    highlighted = -1;
  };

  const kresli = () => {
    const hits = watchMatches(q.value).filter(h => !isWatched(h.p.id));
    if(!hits.length){ zavri(); return; }

    const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
    sug.innerHTML = hits.map((h, i) => `<button type="button" role="option"
      aria-selected="${i === highlighted}" data-add="${h.p.id}">
      <b>${esc(h.p.web_name)}</b>
      <span>${esc((teams[h.p.team] || {}).short_name || '')} ·
        ${POS[h.p.element_type]} · ${(h.p.now_cost / 10).toFixed(1)}m</span>
    </button>`).join('');
    sug.hidden = false;
    q.setAttribute('aria-expanded', 'true');
  };

  q.addEventListener('input', () => { highlighted = -1; kresli(); });

  q.addEventListener('keydown', ev => {
    const opts = [...sug.querySelectorAll('button[data-add]')];
    if(ev.key === 'Escape'){ zavri(); return; }
    if(!opts.length) return;

    if(ev.key === 'ArrowDown' || ev.key === 'ArrowUp'){
      ev.preventDefault();
      highlighted = ev.key === 'ArrowDown'
        ? (highlighted + 1) % opts.length
        : (highlighted - 1 + opts.length) % opts.length;
      opts.forEach((b, i) => b.setAttribute('aria-selected', String(i === highlighted)));
      return;
    }

    /* Enter with no suggestion selected takes the first — but only when
       Enter was really pressed. Nothing is ever added on its own. */
    if(ev.key === 'Enter'){
      ev.preventDefault();
      const b = opts[highlighted >= 0 ? highlighted : 0];
      if(b){ toggleWatch(b.dataset.add); watchRedraw(); }
    }
  });

  sug.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-add]');
    if(!b) return;
    toggleWatch(b.dataset.add);
    watchRedraw();
  });

  q.addEventListener('blur', () => setTimeout(zavri, 150));
}

/* Players whose price moved during the last gameweek.
   cost_change_event is in tenths of a million and resets with the gameweek. */
function recentMovers(){
  const moved = BOOT.elements
    .filter(p => (p.cost_change_event || 0) !== 0)
    .sort((a, b) => Math.abs(b.cost_change_event) - Math.abs(a.cost_change_event)
                 || parseFloat(b.selected_by_percent) - parseFloat(a.selected_by_percent));
  return {
    up: moved.filter(p => p.cost_change_event > 0),
    down: moved.filter(p => p.cost_change_event < 0),
  };
}

function movedTable(list, dir, empty){
  if(!list.length) return `<p class="note">${empty}</p>`;
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));
  return `<table><thead><tr><th>Player</th><th class="n">Price now</th>
      <th class="n">Change</th><th class="n">Owned</th></tr></thead>
    <tbody>${list.slice(0, 25).map(p => {
      const d = p.cost_change_event / 10;
      return `<tr${MY_SQUAD && MY_SQUAD.has(p.id) ? ' class="me"' : ''}>
        <td><span class="who">${crest(p.team, 'sm')}<b>${esc(p.web_name)}</b>
          <em class="sub">${esc(teams[p.team].short_name)}</em></span></td>
        <td class="n">${(p.now_cost / 10).toFixed(1)}m</td>
        <td class="n ${dir}">${d > 0 ? '+' : ''}${d.toFixed(1)}m</td>
        <td class="n">${parseFloat(p.selected_by_percent).toFixed(1)} %</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function buildMoved(){
  const mv = recentMovers();
  return `<h3>Risers</h3>
    ${movedTable(mv.up, 'up', 'Nobody rose during the last gameweek.')}
    <h3>Fallers${info(`The change is for the <b>last gameweek</b> (<code>cost_change_event</code>),
      not the whole season. Highlighted rows are players in your squad — the ones
      who fell are taking value out of your team.`)}</h3>
    ${movedTable(mv.down, 'down', 'Nobody fell during the last gameweek.')}
    `;
}

function buildSeason(){
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  /* This used to take the first and last fifteen from one sorted list. As
     long as fewer than thirty prices had moved, both tables reached into
     the same pile and the "risers" contained players who had fallen — just
     because they had fallen least.

     So each table filters for itself. When there are not ten players, the
     rest stays empty: an empty row is more honest than a foreign one. */
  const TOP = 10;
  const risers = BOOT.elements
    .filter(p => (p.cost_change_start || 0) > 0)
    .sort((a, b) => b.cost_change_start - a.cost_change_start)
    .slice(0, TOP);
  const fallers = BOOT.elements
    .filter(p => (p.cost_change_start || 0) < 0)
    .sort((a, b) => a.cost_change_start - b.cost_change_start)
    .slice(0, TOP);

  const prazdny = `<tr class="empty"><td colspan="4">—</td></tr>`;

  const tbl = list => `<table><thead><tr><th>Player</th><th class="n">Start</th>
      <th class="n">Now</th><th class="n">Change</th></tr></thead>
    <tbody>${list.map(p => {
      const d = p.cost_change_start / 10;
      return `<tr${MY_SQUAD && MY_SQUAD.has(p.id) ? ' class="me"' : ''}>
        <td><span class="who">${crest(p.team, 'sm')}<b>${esc(p.web_name)}</b>
          <em class="sub">${esc(teams[p.team].short_name)}</em></span></td>
        <td class="n">${((p.now_cost - p.cost_change_start) / 10).toFixed(1)}m</td>
        <td class="n">${(p.now_cost / 10).toFixed(1)}m</td>
        <td class="n ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d.toFixed(1)}m</td>
      </tr>`;
    }).join('') + prazdny.repeat(Math.max(0, TOP - list.length))}</tbody></table>`;

  if(!risers.length && !fallers.length)
    return '<p class="note">No price has moved since the start of the season.</p>';

  return `<h3>Biggest risers</h3>${tbl(risers)}
    <h3>Biggest fallers${info(`Growing team value is a long game: every rise of a player
      you own adds 0.1m to your budget — but on selling you only get half the
      profit back.`)}</h3>${tbl(fallers)}
    `;
}

async function loadPrices(){
  $('prmsg').textContent = 'Loading…';
  $('prout').innerHTML = '<div class="skel"><i></i><i></i><i></i><i></i></div>';
  try{
    if(!BOOT) BOOT = await api('bootstrap-static/');

    const SECTIONS = [
      ['Dnes v noci', buildPrices()],
      ['Moved this gameweek', buildMoved()],
      ['This season', buildSeason()],
      ['Watchlist', buildWatch()],
    ];

    $('prout').innerHTML = `
      <div class="subnav" role="tablist">
        ${SECTIONS.map((x, i) =>
          `<button class="sub-btn" role="tab" aria-selected="${i === 0}" data-sec="${i}">${esc(x[0])}</button>`
        ).join('')}
      </div>
      ${SECTIONS.map((x, i) =>
        `<div class="sec" id="pr-${i}"${i ? ' hidden' : ''}>${x[1]}</div>`
      ).join('')}`;

    $('prout').querySelectorAll('.sub-btn').forEach(b => {
      b.addEventListener('click', () => {
        $('prout').querySelectorAll('.sub-btn').forEach(x =>
          x.setAttribute('aria-selected', x === b));
        SECTIONS.forEach((_, i) => { $('pr-' + i).hidden = String(i) !== b.dataset.sec; });
      });
    });
    wireWatch();
    $('prmsg').textContent = '';
  }catch(e){
    $('prmsg').innerHTML = errBox(e.message, 't-prices');
    $('prout').innerHTML = '';
  }
}

/* ============================================================
   MONTHLY LEAGUE TABLES

   The bootstrap sends `phases[]` — Overall and then individual months
   with a gameweek range. The standings endpoint can filter on them via
   ?phase=N.

   Why it is worth it: in a league someone leads by two hundred points, a
   monthly table gives everyone else a reason to keep playing. In terms of
   implementation it is one extra request.
   ============================================================ */
function mountPhases(leagueId, cur, myId){
  const box = $('phasebox');
  if(!box || !BOOT.phases) return;

  // Overall (id 1) is skipped — that is the table in the Standings view.
  // So are months that have not started: an empty table helps nobody.
  const done = (BOOT.phases || []).filter(ph =>
    ph.id !== 1 && cur && ph.start_event <= cur.id);

  if(!done.length){
    box.innerHTML = '<p class="note">Monthly tables appear after the first completed month.</p>';
    return;
  }

  const cache = {};
  const draw = async (ph) => {
    box.innerHTML = nav(ph.id)
      + '<div class="skel"><i></i><i></i><i></i><i></i></div>';

    try{
      if(!cache[ph.id])
        cache[ph.id] = await cached(
          'leagues-classic/' + leagueId + '/standings/?phase=' + ph.id);

      const rows = ((cache[ph.id].standings || {}).results || []);
      box.innerHTML = nav(ph.id) + (rows.length
        ? `<table><thead><tr><th class="n">#</th><th>Manager</th>
             <th class="hide-s">Team</th><th class="n">Points this month</th></tr></thead>
           <tbody>${rows.map(m => `<tr${m.entry === myId ? ' class="me"' : ''}>
             <td class="n">${m.rank}</td>
             <td><b>${esc(m.player_name)}</b></td>
             <td class="hide-s" style="color:var(--mute)">${esc(m.entry_name)}</td>
             <td class="n">${m.total}</td></tr>`).join('')}</tbody></table>
           <p class="note">${esc(ph.name)} = gws ${ph.start_event}–${ph.stop_event}.
             The points are for this stretch only, not from the start of the season.</p>`
        : '<p class="note">There is no data for this month yet.</p>');
    }catch(e){
      box.innerHTML = nav(ph.id)
        + `<p class="note">The monthly table could not be loaded: ${esc(e.message)}</p>`;
    }
    bind();
  };

  const nav = sel => `<div class="phasenav" role="tablist">${done.map(ph =>
    `<button class="sub-btn" role="tab" aria-selected="${ph.id === sel}"
      data-ph="${ph.id}">${esc(ph.name)}</button>`).join('')}</div>`;

  const bind = () => box.querySelectorAll('button[data-ph]').forEach(b =>
    b.addEventListener('click', () =>
      draw(done.find(x => x.id === Number(b.dataset.ph)))));

  draw(done[done.length - 1]);   // the default is the last month in progress
}

/* ============================================================
   INJURIES

   Its own tab for the single question people ask most often before a
   deadline: which of my players are doubtful and who else has been ruled
   out.

   The data is all in the bootstrap (status, chance_of_playing_next_round,
   news) — no extra request, so the tab is not in TAB_INIT and draws from
   what the app already has.

   The state (which view, the search text, the sort) lives in INJ. The
   input is only redrawn once when the tab opens; while typing only the
   table changes, or the cursor would jump after every letter.
   ============================================================ */
const INJ_VIEWS = [['all', 'Whole league'], ['squad', 'My squad'],
                   ['watch', 'Watched']];

let INJ = {view: 'all', q: '', key: 'chance', dir: 1};

/* Rows for the table. Only players there is something to say about: a
   non-playing status or a chance below 100 %. A player with a hundred per
   cent chance and a note saying "returned from injury" does not belong on
   an injury list — he is fit. */
function injAll(){
  if(!BOOT) return [];
  const teams = Object.fromEntries(BOOT.teams.map(t => [t.id, t]));

  return BOOT.elements
    .filter(p => p.status !== 'a'
      || (p.chance_of_playing_next_round !== null
          && p.chance_of_playing_next_round < 100))
    .map(p => {
      const chance = p.chance_of_playing_next_round === null
        ? (p.status === 'a' ? 100 : 0) : p.chance_of_playing_next_round;
      // „Ankle injury - Expected back 14 Sep“ → 14 Sep
      const m = /expected back\s*[:\-]?\s*([^.(]+)/i.exec(p.news || '');
      return {p, team: teams[p.team] || {short_name: '?', name: '?'},
              chance,
              own: parseFloat(p.selected_by_percent) || 0,
              back: m ? m[1].trim() : '',
              mine: !!(MY_SQUAD && MY_SQUAD.has(p.id))};
    });
}

function injFiltered(){
  const rows = injAll().filter(r =>
    INJ.view === 'all' ? true
    : INJ.view === 'watch' ? isWatched(r.p.id)
    : r.mine);

  const needle = normName(INJ.q || '');
  const hit = needle
    ? rows.filter(r => normName(r.p.web_name + ' ' + r.p.second_name
        + ' ' + r.team.short_name + ' ' + r.team.name).includes(needle))
    : rows;

  const dir = INJ.dir;
  const cmp = {
    name:   (a, b) => a.p.web_name.localeCompare(b.p.web_name, 'cs'),
    team:   (a, b) => a.team.short_name.localeCompare(b.team.short_name),
    own:    (a, b) => a.own - b.own,
    chance: (a, b) => a.chance - b.chance,
  }[INJ.key] || ((a, b) => a.chance - b.chance);

  // The secondary key is always ownership: on an equal chance, the
  // interesting one is the player half the league owns.
  return hit.sort((a, b) => (cmp(a, b) * dir) || (b.own - a.own));
}

function injTable(){
  const rows = injFiltered();

  if(!rows.length){
    const reasonText = INJ.q ? 'The search found nothing.'
      : INJ.view === 'squad' ? 'Nobody in your squad is flagged. For now.'
      : INJ.view === 'watch' ? 'None of your watched players has a problem.'
      : 'Nobody in the whole league is flagged — that only happens in summer.';
    return `<p class="note">${esc(reasonText)}</p>`;
  }

  const th = (key, text, cls) =>
    `<th class="${cls || ''} sortable" data-sort="${key}"
      aria-sort="${INJ.key === key ? (INJ.dir === 1 ? 'ascending' : 'descending') : 'none'}"
      >${esc(text)}${INJ.key === key ? (INJ.dir === 1 ? ' ▲' : ' ▼') : ''}</th>`;

  return `<table>
    <thead><tr>
      <th></th>
      ${th('name', 'Player')}
      ${th('team', 'Team', 'hide-s')}
      <th>Poz</th>
      ${th('own', 'Owned %', 'n hide-s')}
      ${th('chance', 'Chance', 'n')}
      <th>Stav</th>
      <th class="hide-s">News</th>
    </tr></thead>
    <tbody>${rows.map(r => `<tr${r.mine ? ' class="me"' : ''}>
      <td>${watchStar(r.p.id)}</td>
      <td><b>${esc(r.p.web_name)}</b>${r.back
        ? `<span class="injback">back ${esc(r.back)}</span>` : ''}</td>
      <td class="hide-s">${esc(r.team.short_name)}</td>
      <td>${POS[r.p.element_type]}</td>
      <td class="n hide-s">${r.own.toFixed(1)}</td>
      <td class="n ${r.chance === 0 ? 'al' : r.chance < 100 ? 'wn' : 'ok'}">${r.chance} %</td>
      <td class="st ${(S[r.p.status] || S.u)[1]}">${(S[r.p.status] || S.u)[0]}</td>
      <td class="hide-s" style="color:var(--mute);font-size:12.5px">${esc(r.p.news || '—')}</td>
    </tr>`).join('')}</tbody></table>
    <p class="note">Highlighted rows are players in your squad. The star adds
      anyone to your watchlist — they then show up on Home and in Prices
      as well.</p>`;
}

/* The summary above the table: how many of the squad are out and how many
   are doubtful. This is the sentence people come here for. */
function injSummary(){
  const mine = injAll().filter(r => r.mine);
  const out = mine.filter(r => r.chance === 0).length;
  const dbt = mine.filter(r => r.chance > 0 && r.chance < 100).length;

  if(!MY_SQUAD) return '<p class="note">Enter a team ID to see your own squad too.</p>';
  if(!mine.length) return `<p class="note ok">Your squad is clean — nobody flagged.</p>`;

  return `<p class="note ${out ? 'wn' : ''}">In your squad ${
    out ? `<b>${out}</b> ${out === 1 ? 'player is out' : 'players are out'}` : 'nobody is missing'
  }${dbt ? ` and <b>${dbt}</b> doubtful` : ''}.</p>`;
}

function drawInj(){
  const box = $('injtbl');
  if(box) box.innerHTML = injTable();
  const sum = $('injsum');
  if(sum) sum.innerHTML = injSummary();
}

function loadInjuries(){
  const out = $('injout');
  if(!out) return;

  if(!BOOT){
    $('injmsg').textContent = 'The data is still loading. Try again in a moment.';
    return;
  }
  $('injmsg').textContent = '';

  out.innerHTML = `
    <div class="subnav" role="tablist">
      ${INJ_VIEWS.map(([k, t]) =>
        `<button class="sub-btn" role="tab" aria-selected="${k === INJ.view}"
          data-inj="${k}">${esc(t)}</button>`).join('')}
    </div>
    <div id="injsum"></div>
    <input type="search" id="injq" class="injq" placeholder="Search for a player or team…"
      aria-label="Search for a player or team" value="${esc(INJ.q)}">
    <div id="injtbl"></div>`;

  out.querySelectorAll('button[data-inj]').forEach(b =>
    b.addEventListener('click', () => {
      INJ.view = b.dataset.inj;
      out.querySelectorAll('button[data-inj]').forEach(x =>
        x.setAttribute('aria-selected', String(x === b)));
      drawInj();
    }));

  $('injq').addEventListener('input', ev => {
    INJ.q = ev.target.value;
    drawInj();
  });

  /* Sorting is delegated — the headers are redrawn with the table. */
  $('injtbl').addEventListener('click', ev => {
    const th = ev.target.closest('th[data-sort]');
    if(!th) return;
    const key = th.dataset.sort;
    // A second click on the same column reverses the direction.
    if(INJ.key === key) INJ.dir = -INJ.dir;
    else { INJ.key = key; INJ.dir = key === 'own' ? -1 : 1; }
    drawInj();
  });

  drawInj();
}
