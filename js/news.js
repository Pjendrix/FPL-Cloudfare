/* FPL Squad Check — FPL newsletter

   A merged stream of articles from several sources. Fetching and parsing
   happen in api/news.js on the server; this file only renders and filters.

   The js/ files load as classic <script> tags in a fixed order and share
   one global scope: nothing is exported or imported, but hoisting does
   not cross file boundaries. The order is therefore part of the contract
   and is written down in index.html.
   ============================================================ */

let NEWS = null;          // {items, failed, fetched}
let NEWS_LOADING = null;  // in-flight promise, so two panels do not fetch twice
let NEWS_FILTER = 'all';  // 'all' | id zdroje

/* The filter is a way of reading one screen, not an app setting — it does
   not belong in localStorage. After a reload the whole stream is back. */

const NEWS_SOURCES = [
  {id: 'ffs',   name: 'FFScout', cls: 'src-ffs'},
  {id: 'ff247', name: 'FF247',   cls: 'src-247'},
];
const NEWS_CLS = Object.fromEntries(NEWS_SOURCES.map(s => [s.id, s.cls]));

async function fetchNews(force){
  if(NEWS && !force) return NEWS;
  if(NEWS_LOADING) return NEWS_LOADING;

  NEWS_LOADING = fetch('/api/news' + (force ? '?t=' + Date.now() : ''))
    .then(async r => {
      const data = await r.json().catch(() => null);
      if(!r.ok) throw new Error((data && data.error) || 'The newsletter is unavailable.');

      /* An item from a source the frontend does not know used to be
         counted silently into "All" but could not be filtered out — it had
         no button. That happens whenever the server runs a different
         version from the page: either an unfinished deploy, or the edge
         cache holding an old response for up to an hour. Dropping it is
         more honest than showing it in a stream where it cannot be turned
         off. */
      const znam = new Set(NEWS_SOURCES.map(x => x.id));
      const allItems = (data && data.items) || [];
      const items = allItems.filter(i => znam.has(i.source));
      if(items.length !== allItems.length){
        console.warn('Newsletter: dropped', allItems.length - items.length,
          'items from unknown sources (server build:', data && data.build, ')');
      }

      NEWS = {...data, items};
      return NEWS;
    })
    .finally(() => { NEWS_LOADING = null; });

  return NEWS_LOADING;
}

/* The article time. An absolute date on something half an hour old makes
   you do arithmetic; a relative time on something three days old says
   nothing. */
function newsTime(iso){
  const d = new Date(iso);
  if(isNaN(d)) return '';
  const min = Math.round((Date.now() - d) / 60000);
  if(min < 1) return 'just now';
  if(min < 60) return min + ' min ago';
  if(min < 60 * 20) return Math.round(min / 60) + ' h ago';
  return d.toLocaleString('cs-CZ',
    {day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'});
}

/* A safe article URL.

   esc() handles quotes but not the scheme: `javascript:…` from a foreign
   RSS feed would pass and clicking the card would run a script. The
   sources are other people's websites, so their content cannot be trusted
   even for a link. Only http and https get through; anything else ends up
   as a dead link rather than executed code. */
function newsHref(url){
  try{
    const u = new URL(String(url), location.origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  }catch(e){ return ''; }
}

function newsCard(it){
  return `<a class="ncard ${NEWS_CLS[it.source] || ''}" href="${esc(newsHref(it.link))}"
     target="_blank" rel="noopener noreferrer">
    <div class="nmeta">
      <span class="nsrc">${esc(it.sourceName)}</span>
      <time datetime="${esc(it.date)}">${newsTime(it.date)}</time>
      <i class="nout" aria-hidden="true">↗</i>
    </div>
    <h4>${esc(it.title)}</h4>
    ${it.excerpt ? `<p>${esc(it.excerpt)}</p>` : ''}
  </a>`;
}

function renderNews(){
  const out = $('newsout');
  if(!out) return;

  if(!NEWS){ out.innerHTML = '<div class="skel"><i></i><i></i><i></i></div>'; return; }

  const allItems = NEWS.items || [];
  const items = NEWS_FILTER === 'all'
    ? allItems : allItems.filter(i => i.source === NEWS_FILTER);

  /* A source that returned nothing is not hidden from the filter —
     otherwise it would look as if it did not exist. It stays and says
     why. */
  const pocty = {};
  allItems.forEach(i => { pocty[i.source] = (pocty[i.source] || 0) + 1; });
  const downSources = new Set((NEWS.failed || []).map(f => f.id));

  const filterHtml = `<div class="subnav nfilter" role="tablist" aria-label="News source">
    <button type="button" role="tab" data-news="all"
      aria-selected="${NEWS_FILTER === 'all'}">All
      <b>${allItems.length}</b></button>
    ${NEWS_SOURCES.map(s => `<button type="button" role="tab" data-news="${s.id}"
      class="${s.cls}" aria-selected="${NEWS_FILTER === s.id}"
      ${downSources.has(s.id) ? 'disabled title="This source is not responding"' : ''}>
      ${s.name}<b>${downSources.has(s.id) ? '—' : (pocty[s.id] || 0)}</b></button>`).join('')}
  </div>`;

  /* A failed source is admitted along with the reason — the link to
     /api/news?debug=1 holds exactly what the server tried and what it
     got. Without it "it did not load" is debugged by guesswork. */
  const potiz = (NEWS.failed || []).length
    ? `<p class="note wn">No response from:
       ${NEWS.failed.map(f => esc(f.name)).join(', ')}. The other sources
       loaded normally.
       <a href="/api/news?debug=1" target="_blank" rel="noopener noreferrer">Why?</a></p>`
    : '';

  out.innerHTML = filterHtml + potiz + (items.length
    ? `<div class="nlist">${items.map(newsCard).join('')}</div>`
    : '<p class="note">Nothing from this source right now.</p>')
    + `<p class="nfoot">Loaded ${newsTime(NEWS.fetched)} ·
       <button type="button" class="lnkbtn" id="newsreload">Reload</button></p>`;
}

async function loadNews(force){
  const msg = $('newsmsg');
  msg.textContent = '';
  renderNews();
  try{
    await fetchNews(force);
    renderNews();
  }catch(e){
    msg.innerHTML = errBox(e.message, 't-news');
    $('newsout').innerHTML = '';
  }
}

document.addEventListener('click', ev => {
  const f = ev.target.closest('button[data-news]');
  if(f && !f.disabled){ NEWS_FILTER = f.dataset.news; renderNews(); return; }

  if(ev.target.closest('#newsreload')){
    NEWS = null;
    loadNews(true);
  }
});

/* ------------------------------------------------------------
   The Home box

   The three newest articles across all sources. It loads itself, because
   one request to our own endpoint behind an edge cache costs practically
   nothing — unlike the league panels, which need every member's picks.
   ------------------------------------------------------------ */
let NEWS_FOR_HOME = false;

function homeNews(){
  const box = inner => `<div class="hbox">
    <h3><i class="hi">📰</i>Newsletter<button type="button" class="lnkbtn"
      data-goto="t-news">All</button></h3>${inner}</div>`;

  if(!NEWS){
    if(!NEWS_FOR_HOME){
      NEWS_FOR_HOME = true;
      fetchNews().then(() => drawHome()).catch(() => { NEWS_FOR_HOME = false; });
    }
    return box('<div class="skel"><i></i></div>');
  }

  const top = (NEWS.items || []).slice(0, 3);
  if(!top.length) return box('<p class="note">The sources are not responding right now.</p>');

  return box(`<div class="nmini">${top.map(it => `
    <a class="${NEWS_CLS[it.source] || ''}" href="${esc(newsHref(it.link))}"
       target="_blank" rel="noopener noreferrer">
      <span class="nsrc">${esc(it.sourceName)} · ${newsTime(it.date)}</span>
      <b>${esc(it.title)}</b>
    </a>`).join('')}</div>`);
}
