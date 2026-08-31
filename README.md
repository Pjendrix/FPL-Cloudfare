# FPL Squad Check

A helper app for Fantasy Premier League. One HTML page, three serverless
functions, no build step. Push it to Vercel and it runs.

Nothing is downloaded until you enter your team ID and your mini-league ID.
Each tab fetches its own data when its turn comes.

Everything stays in the browser. There is no account, no database and no
server-side storage of anything about you.

## What it does

| Tab | What it is for |
|---|---|
| **Home** | What has a deadline today: who will not play, whose price moves tonight, last gameweek's awards, the countdown |
| **Squad** | Your fifteen **grouped by position** with three gameweeks of fixtures, live points during a gameweek, injuries and doubts, blanks and doubles |
| **Mini-league** | Standings, **live points during a gameweek**, a rank chart, players only you own or only you are missing, who owns whom |
| **League hub** | Awards and stories after each gameweek, season leaderboards, squad health, the captain map and the template effect |
| **Top players** | Top 10 leaderboards by goals, assists, defensive contributions, bonus, xG, xA and xGI; clean sheets and saves for goalkeepers. Below them, **any two players side by side** |
| **Injuries** | Who is injured, suspended or doubtful — your squad first, then the whole league |
| **Newsletter** | A merged stream of FPL articles from several sources |
| **Fixtures** | Six gameweeks ahead with a computed difficulty, blanks and doubles |
| **Prices** | Who rises or falls tonight (the official projections), who moved last gameweek, the biggest risers and fallers of the season, plus a watchlist |

The header carries a countdown to the next deadline, and under it the **season
rail**: 38 ticks, one per gameweek. Played ones are solid, the current one fills
up to the deadline, future ones are hairlines. A gameweek where someone in your
squad has a blank gets a red dot, a double a mint one.

## The entry screen

Both IDs are required:

- **Team ID** — the number in the address of your FPL team page,
  `fantasy.premierleague.com/entry/60480/event/1`
- **Mini-league ID** — `fantasy.premierleague.com/leagues/14044/standings/c`

A team ID on its own would leave half the app dark, because the hub, the awards,
the standings and the stories all need a league.

**Leagues are capped at 15 members.** Every extra member costs one request per
gameweek for picks and one for history, so a larger league means hundreds of
calls to the FPL API — slow for the user and a good way to get rate-limited.
Larger leagues are refused with an explanation. The limit lives in
`CONFIG.maxMembers` in `js/core.js`; raising it also means raising the message
in `js/gate.js`, and expect the app to get slower and to hit the FPL rate limit.

Both IDs are kept in `localStorage`, so a refresh does not sign you out.
**Change IDs** in the header clears them.

## Deployment

1. Push the repository to GitHub and import it into Vercel. No build
   configuration is needed — the functions in `api/` are detected automatically.
2. Open the page and enter the two IDs.

Optionally set `FPL_WORKER_URL` and `FPL_WORKER_TOKEN` to route blocked requests
through the Cloudflare Worker in `worker.js` (see *Operational notes*).

## Files

```
index.html              layout and load order
css/app.css             the main stylesheet
css/narrow.css          up to 720 px  (<link id="mqL">)
css/small.css           up to 640 px  (<link id="mqS">)
css/mobile.css          the mobile shell (<link id="mqM">)
js/core.js              configuration, cache, squad loading, tabs
js/tabs.js              rendering of the individual sections
js/gate.js              the entry screen, validation, the league size cap
js/histcache.js         the local archive of finished gameweeks
js/status.js            data status, deep links, sharing, retry
js/squad.js             a rival's squad in a modal
js/news.js              the newsletter: filter, cards, the Home box
js/ui.js                theme, view switch, tooltips, the season rail
js/topbar.js            the desktop top bar, menu and search
js/mobile.js            bottom navigation, the "More" sheet, gestures
js/boot.js              app start and service worker registration
api/fpl.js              a proxy to the official FPL API (solves CORS)
api/news.js             RSS aggregation
api/badge.js            club badges from the Premier League CDN, converted to WebP
worker.js               an optional Cloudflare Worker bypass to the FPL API
sw.js                   service worker — the shell and badges, never data
club-marks.svg          fallback coloured marks for 20 clubs (a sprite)
manifest.webmanifest    the PWA manifest
icon.svg, favicon.svg   the app icon and favicon
assets/hero.svg         the entry screen artwork
brand/                  logo and brand sources
vercel.json             security headers including the CSP
test.mjs                smoke tests against fake FPL data
```

The scripts in `js/` are **classic `<script>` tags, not ES modules**: they share
one global scope, so nothing is exported or imported. The price is that hoisting
does not cross file boundaries — **the order of the `<script>` tags in
`index.html` is part of the contract**. `core.js` must be first, `boot.js` last,
and `mobile.js` before it (it wraps `selectTab`).

If a file is added to `css/` or `js/`, it belongs in `FILES` in `sw.js` too —
otherwise an offline load gets a shell with nothing to start it. Bump the
`SHELL` cache version on every deploy that changes those files.

### Club badges

The key is `teams[].code` from the bootstrap, **not `id`** — `code` survives
between seasons, while `id` is reshuffled alphabetically every August.

`api/badge.js` fetches the official PNG from the Premier League CDN, converts it
to WebP and lets the edge cache keep it for a year. It goes through our own
domain because the CSP sets `img-src 'self'` and a foreign source would not
render. The conversion needs `sharp` (`npm i sharp`); without it the function
returns the original PNG and the image still shows, just a few kB larger.

When a badge is missing from the CDN — typically a freshly promoted club — it
falls back to a coloured mark from `club-marks.svg`: club colour, kit pattern
and abbreviation. No trademark is stored in the repository.

## Tests

```bash
npm install
npm test
```

The tests build a fake bootstrap and fixture list (including a gameweek with a
blank and a double), load the page in jsdom and walk the critical functions:
the points projection including defensive contributions, the effective lineup
after autosubs, the best XI, price predictions, the season rail, the gameweek
archive, the awards and the entry screen validation. A few tests also watch the
CSS — that the difficulty scale is still one set of variables and that no media
query is defined twice. They never touch the network.

## Operational notes

**API limits.** A fifteen-member league means thirty requests per gameweek.
They go through a queue two at a time, with a retry on 429, and responses are
cached for the lifetime of the page — so the hub downloads almost nothing after
the mini-league tab. Five concurrent requests from one datacentre IP is exactly
the pattern that earns a block at FPL, which is why the concurrency is two.

**The CDN block.** FPL sits behind a CDN that refuses datacentre IP ranges
wholesale. It is not about headers — the refusal comes before they are looked
at. `api/fpl.js` retries with a cookie handshake, and if that fails it can route
the request through the Cloudflare Worker in `worker.js`, which runs on an edge
IP. A block is recognised by the **shape of the response** (a non-JSON
content-type, an HTML page), not by the status code: the CDN also refuses under
404, and telling that from "this endpoint does not exist" is otherwise impossible.

**Stale data as a fallback.** When the API is unavailable, responses that hold
between gameweeks (the league table, squads, the bootstrap) are served from the
last known copy in `localStorage` and the status bar says so. Live gameweek
points are deliberately never stored: old numbers presented as current are worse
than an honest error.

**The gameweek archive.** A finished gameweek never changes, so its picks,
player points and history row are compressed into `localStorage` under
`sc:gwsnap:{leagueId}:{gw}`. A gameweek of a ten-member league is roughly five
kilobytes. A live gameweek, or one still waiting for bonus, is never archived.
`snapHists()` can rebuild the whole league history from the archive, which saves
one request per member.

**Gameweek phase.** `is_current` flips right after the deadline, and
`data_checked` flips with a delay of up to a day. Neither is a reliable answer
to "is this final?", so the phase is derived from the fixture list
(`gwPhaseFromFixtures()`): a match not finished means live, all finished without
bonus in the data means waiting for bonus, bonus written means final.

**Autosubs and the armband.** FPL does not score the team a manager picked, it
scores the team that ended up playing. `resolveLineup()` simulates bench
substitutions in order 12→15 while respecting the formation, and moves the
captain's armband (including the Triple Captain multiplier) to the vice captain
when the captain did not play. Without this, a finished gameweek showed fewer
points than the manager really had.

**The projection.** The headline number is `ep_next` — the official projection
FPL computes itself. The own model (`perMatchXp` → `projectGw` → `projectRange`)
is only used where FPL gives nothing: the five and six gameweek outlook and
double gameweeks, because `ep_next` is always for one match regardless of how
many a team actually plays.

**No captain recommendation by xP.** `ep_next` arrives rounded to one decimal
and for top players comes out practically identical, so no ranking emerges. The
app used to say "there is nothing to pick between them" — honest but useless.
Instead it shows the **two teams with the easiest fixture** next gameweek and
which of their players you own, and leaves the decision to you.

**Awards lapse on a majority.** An award is a distinction, so when half the
league or more lands on the same extreme value it is not given and the card says
why. The threshold is sharp at half: 4 of 10 still get it, 5 of 10 do not. The
rule is applied consistently to every award pair.

**League history has a ceiling that cannot be worked around.** FPL does not send
mini-league standings for past seasons — the standings endpoint always returns
the current one. What is available is `past` from `entry/{id}/history/`: each
manager's totals and overall rank. The history table is therefore derived from
the people who are in the league **today**; anyone who has left is missing and
the ranking is not how the league actually finished. The app says so rather than
presenting a quietly inaccurate archive.

`CONFIG.officialSeasons` and `CONFIG.memberSince` can narrow that down for a
league that grew over time — who officially played in which season, and who
joined later. Both are empty by default, which means every season counts for
every current member.

**Difficulty is not FDR.** FPL sets its FDR in August and never changes it. The
app computes its own from the attacking and defensive strength of both teams
(`ownFdr()`). The colours are **relative**: the thresholds are quintiles across
every fixture in the visible window, so each band gets roughly a fifth of the
cells. Fixed bounds did not work — team strengths differ little for most clubs
and the ticker came out uniformly green.

At the start of a season `strength_attack_*` and `strength_defence_*` are zero
until FPL fills them in, so `teamStrengths()` falls back to
`strength_overall_home/away` (a 1–5 scale), which is filled in from the start.
Only when those are missing too does `ownFdr()` return the official FDR. The
interface does not hide this: `strengthsReady()` and `strengthsUsable()` decide
what the note under the table says about the source.

**Explanations live in tooltips.** The app had over seventy explanatory
paragraphs under its tables. Each made sense alone, but together they were a
wall of text nobody read that pushed the data below the fold. The text stayed,
it just hides behind an "i" next to the heading. It opens **on click, not on
hover**: hover does not exist on a touch screen and the tooltip would be
unreachable. Short messages and empty states are not in tooltips — "nobody is
injured" is information, not an explanation.

**League tabs load themselves** when first opened, not at app start. Whoever
does not look at the league downloads nothing; whoever does need not click. The
second league tab is then nearly free, because the per-member requests go
through `cached()` and are exactly the same URLs. The **Refresh** buttons must
call `dropCached()` first: the cache lives for the lifetime of the page, so
without invalidation the same data would simply be redrawn.

## Licence and trademarks

This is an unofficial tool with no connection to the Premier League or to
Fantasy Premier League. Club badges are fetched from the official CDN at runtime
and none are stored in this repository; the icons and artwork are original work
in aubergine and gold and deliberately do not reproduce any protected mark.
