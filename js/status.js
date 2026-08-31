/* FPL Squad Check — data status, links and shared odds and ends

   Four things that used to be scattered across tabs, each done slightly
   differently:

     1. DATA STATUS. The app can tell a live gameweek from one waiting for
        bonus and from a finished one, but only some panels said so. The
        question "is this final yet?" does not go away during a gameweek,
        wherever you happen to be looking. Hence one bar under the header.

     2. AGE OF THE DATA. Without it there is no telling "nothing changed"
        from "the app has not asked since this morning".

     3. LINK TO A SPECIFIC SECTION. `#prices` can be sent to a group chat.
        Until now you could only link to the app as a whole.

     4. TRY AGAIN. An error message without a button forces a full page
        reload, which throws away everything that did load correctly.

   The js/ files load as classic <script> tags in a fixed order and share
   one global scope; the order is written down in index.html.
   ============================================================ */

/* ------------------------------------------------------------
   Stav dat
   ------------------------------------------------------------ */

const STAV_TXT = {
  running: ['wn', 'gameweek live', 'Bonus is only computed after the last match.'],
  unchecked: ['wn', 'awaiting bonus',
    'Matches are over, FPL has not confirmed bonus points yet.'],
  final: ['ok', 'final', 'The points are final.'],
};

function statusTime(ts){
  if(!ts) return 'nothing yet';
  const d = new Date(ts);
  const min = Math.round((Date.now() - ts) / 60000);
  if(min < 1) return 'just now';
  if(min < 60) return min + ' min ago';
  return d.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute: '2-digit'});
}

/* Double deadline: two gameweeks within three days of each other.

   It happens when a gameweek is moved, and it is exactly the situation in
   which the countdown in the header misleads — it shows the nearest
   deadline and does not say another one follows right behind. */
function dvojityDeadline(){
  if(!BOOT) return null;
  const dalsi = (BOOT.events || [])
    .filter(e => new Date(e.deadline_time).getTime() > Date.now())
    .sort((a, b) => new Date(a.deadline_time) - new Date(b.deadline_time))
    .slice(0, 2);
  if(dalsi.length < 2) return null;
  const rozdil = new Date(dalsi[1].deadline_time) - new Date(dalsi[0].deadline_time);
  return rozdil < 3 * 86400000 ? dalsi : null;
}

function drawStatus(){
  const el = $('statusbar');
  if(!el || !BOOT) return;

  const cur = BOOT.events.find(e => e.is_current);
  const nxt = BOOT.events.find(e => e.is_next);
  if(!cur && !nxt){ el.hidden = true; return; }

  const faze = cur && typeof gwPhase === 'function' ? gwPhase(cur.id) : null;
  const [cls, txt, vysvetleni] = STAV_TXT[faze] || STAV_TXT.running;
  const dvoj = dvojityDeadline();

  /* The deadline belongs here, not in the bar: up there it covered the
     status chip and had to be shortened; here it fits with the gameweek
     number. */
  const deadline = nxt
    ? `<span class="sbdl"><b>GW${nxt.id}</b> ${esc(untilText(
        new Date(nxt.deadline_time).getTime() - Date.now()))}</span>`
    : '';

  el.hidden = false;
  el.innerHTML = `<div class="wrap">
    ${cur ? `<span class="livetag ${cls}">GW${cur.id} · ${txt}</span>
      <span class="sbnote">${esc(vysvetleni)}</span>` : ''}
    ${dvoj ? `<span class="livetag wn">Pozor: GW${dvoj[0].id} i GW${dvoj[1].id}
      within three days</span>` : ''}
    <span class="sbspace"></span>
    ${deadline}
    ${STALE_USED ? `<span class="livetag wn" title="The FPL API did not respond,
      showing the last known data">fallback data ${esc(statusTime(STALE_USED))}</span>`
      : ''}
    <span class="sbtime" id="sbtime">data ${esc(statusTime(API_LAST))}</span>
  </div>`;

  /* The same content shortened to one line for the header. On a phone
     the status bar is hidden (it took two rows above the content), so
     this is the only place the gameweek state and the countdown can be
     read. */
  const sub = $('brandSub');
  if(sub){
    const casti = [];
    if(cur) casti.push(`GW${cur.id} ${txt}`);
    if(nxt) casti.push(`GW${nxt.id} ${untilText(
      new Date(nxt.deadline_time).getTime() - Date.now())}`);
    sub.textContent = casti.join(' · ');
    sub.hidden = !casti.length;
  }
}

/* The clock and the countdown move theirs_ their own even when nothing is
   loading — that is what they are for. The whole bar is redrawn, because
   the countdown is part of it. */
setInterval(() => { try{ drawStatus(); }catch(e){} }, 30000);

/* ------------------------------------------------------------
   Highlighting a change

   When numbers rewrite themselves it has to be visible — otherwise you
   cannot tell whether something happened or the refresh is broken.
   ------------------------------------------------------------ */
function flash(el){
  if(!el || !el.classList) return;
  el.classList.remove('flash');
  void el.offsetWidth;          // forces the animation to restart
  el.classList.add('flash');
}

/* ------------------------------------------------------------
   Zkusit znovu

   Returns a message together with a button. `tab` is the id of the tab
   to reload; without it the given function is simply repeated.
   ------------------------------------------------------------ */
const RETRY_FN = new Map();
let RETRY_SEQ = 0;

function errBox(zprava, tab, fn){
  const id = 'r' + (++RETRY_SEQ);
  if(fn) RETRY_FN.set(id, fn);
  return `<p class="errbox" role="alert"><span>${esc(zprava)}</span>
    <button type="button" class="small" data-retry="${id}"
      data-retrytab="${esc(tab || '')}">Zkusit znovu</button></p>`;
}

document.addEventListener('click', async ev => {
  const btn = ev.target.closest('[data-retry]');
  if(!btn) return;
  const {retry, retrytab} = btn.dataset;
  btn.disabled = true;
  btn.textContent = 'Loading…';

  try{
    const fn = RETRY_FN.get(retry);
    if(fn){ await fn(); RETRY_FN.delete(retry); return; }

    /* With no function of its own the tab reloads from scratch: its data
       is dropped from the cache so the same error is not served from
       memory. */
    if(retrytab && TAB_INIT[retrytab]){
      dropCached(/^(leagues-classic|entry|event)\//);
      TAB_DONE.delete(retrytab);
      TAB_DONE.add(retrytab);
      await TAB_INIT[retrytab]();
    }
  }catch(e){
    btn.disabled = false;
    btn.textContent = 'Zkusit znovu';
  }
});

/* ------------------------------------------------------------
   Sharing

   navigator.share exists theirs_ a phone; theirs_ desktop it ends up in the
   clipboard. Both are "I got it out of the app", which is the point.
   ------------------------------------------------------------ */
async function shareText(title_, text){
  try{
    if(navigator.share){ await navigator.share({title: title_, text}); return 'shared'; }
  }catch(e){
    if(e && e.name === 'AbortError') return null;   // the user cancelled
  }
  try{
    await navigator.clipboard.writeText(text);
    return 'copied';
  }catch(e){ return null; }
}

document.addEventListener('click', async ev => {
  const btn = ev.target.closest('[data-share]');
  if(!btn) return;
  const puvodni = btn.textContent;
  const res = await shareText(btn.dataset.sharetitle || 'Squad Check',
                              btn.dataset.share);
  if(res){
    btn.textContent = res === 'shared' ? 'Done' : 'Copied';
    setTimeout(() => { btn.textContent = puvodni; }, 2000);
  }
});

/* ------------------------------------------------------------
   Odkaz na kolo

   Shape `#prices` or `#hub/gw7`. The section is required, the gameweek
   optional. Read at startup and written when tabs change — so the address
   bar always matches what is theirs_ screen.
   ------------------------------------------------------------ */
const HASH_TAB = {
  home: 't-home', squad: 't-squad', league: 't-league', hub: 't-hub',
  news: 't-news', inj: 't-inj', players: 't-players',
  prices: 't-prices', plan: 't-plan',
};

let HASH_QUIET = false;   // our own write must not trigger our own read

function setHash(tab, gw){
  const klic = Object.keys(HASH_TAB).find(k => HASH_TAB[k] === tab);
  if(!klic) return;
  const nova = '#' + klic + (gw ? '/gw' + gw : '');
  if(location.hash === nova) return;
  HASH_QUIET = true;
  history.replaceState(null, '', nova);
  setTimeout(() => { HASH_QUIET = false; }, 0);
}

function readHash(){
  const m = /^#([a-z0-9]+)(?:\/gw(\d+))?$/i.exec(location.hash || '');
  if(!m) return null;
  const tab = HASH_TAB[m[1].toLowerCase()];
  return tab ? {tab, gw: m[2] ? Number(m[2]) : null} : null;
}

/* Opens whatever the link points at. Called after the squad has loaded,
   because before that a tab has nothing to show. */
async function applyHash(){
  const h = readHash();
  if(!h) return;
  selectTab(h.tab);
}

window.addEventListener('hashchange', () => {
  if(HASH_QUIET) return;
  applyHash();
});
