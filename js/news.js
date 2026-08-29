/* Minileague Squad Check — FPL Zpravodaj

   Sloučený proud článků ze tří zdrojů. Stahování a parsování dělá
   api/news.js na serveru; tady se jen vykresluje a filtruje.

   Soubory js/ se načítají jako klasické <script> v pevném pořadí a
   sdílejí jeden globální scope: nic se neexportuje ani neimportuje,
   ale hoisting přes hranici souboru neplatí. Pořadí je proto součást
   kontraktu a je vypsané v index.html.
   ============================================================ */

let NEWS = null;          // {items, failed, fetched}
let NEWS_LOADING = null;  // rozdělaný slib, ať dva panely nestahují dvakrát
let NEWS_FILTER = 'all';  // 'all' | id zdroje

/* Filtr je způsob čtení jedné obrazovky, ne nastavení appky — do
   localStorage nepatří. Po reloadu je zpátky celý proud. */

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
      if(!r.ok) throw new Error((data && data.error) || 'Zpravodaj je nedostupný.');

      /* Položka ze zdroje, který frontend nezná, se dřív tiše počítala
         do „Vše“, ale nešla vyfiltrovat — neměla tlačítko. Stane se to
         pokaždé, když server běží na jiné verzi než stránka: buď kvůli
         nedokončenému deploy, nebo protože edge cache drží starou
         odpověď až hodinu. Zahodit ji je poctivější než ji ukázat
         v proudu, ve kterém nejde vypnout. */
      const znam = new Set(NEWS_SOURCES.map(x => x.id));
      const vsechny = (data && data.items) || [];
      const items = vsechny.filter(i => znam.has(i.source));
      if(items.length !== vsechny.length){
        console.warn('Zpravodaj: zahozeno', vsechny.length - items.length,
          'položek z neznámých zdrojů (server build:', data && data.build, ')');
      }

      NEWS = {...data, items};
      return NEWS;
    })
    .finally(() => { NEWS_LOADING = null; });

  return NEWS_LOADING;
}

/* Čas článku. Absolutní datum u něčeho starého půl hodiny nutí člověka
   počítat; relativní čas u něčeho tři dny starého zase nic neřekne. */
function newsTime(iso){
  const d = new Date(iso);
  if(isNaN(d)) return '';
  const min = Math.round((Date.now() - d) / 60000);
  if(min < 1) return 'právě teď';
  if(min < 60) return 'před ' + min + ' min';
  if(min < 60 * 20) return 'před ' + Math.round(min / 60) + ' h';
  return d.toLocaleString('cs-CZ',
    {day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'});
}

/* Bezpečná adresa článku.

   esc() ošetří uvozovky, ale ne schéma: `javascript:…` z cizího RSS by
   prošlo a klik na kartu by spustil skript. Zdroje jsou cizí weby, takže
   se na jejich obsah nedá spoléhat ani u odkazu. Propouštíme jen http
   a https; cokoli jiného skončí jako mrtvý odkaz, ne jako spuštěný kód. */
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

  const vsechny = NEWS.items || [];
  const items = NEWS_FILTER === 'all'
    ? vsechny : vsechny.filter(i => i.source === NEWS_FILTER);

  /* Zdroj, ze kterého nic nepřišlo, se ve filtru neschovává — jinak by
     to vypadalo, že takový zdroj neexistuje. Zůstane a řekne proč. */
  const pocty = {};
  vsechny.forEach(i => { pocty[i.source] = (pocty[i.source] || 0) + 1; });
  const spadle = new Set((NEWS.failed || []).map(f => f.id));

  const filtr = `<div class="subnav nfilter" role="tablist" aria-label="Zdroj zpráv">
    <button type="button" role="tab" data-news="all"
      aria-selected="${NEWS_FILTER === 'all'}">Vše
      <b>${vsechny.length}</b></button>
    ${NEWS_SOURCES.map(s => `<button type="button" role="tab" data-news="${s.id}"
      class="${s.cls}" aria-selected="${NEWS_FILTER === s.id}"
      ${spadle.has(s.id) ? 'disabled title="Zdroj teď neodpovídá"' : ''}>
      ${s.name}<b>${spadle.has(s.id) ? '—' : (pocty[s.id] || 0)}</b></button>`).join('')}
  </div>`;

  /* Spadlý zdroj se přiznává i s důvodem — v odkazu na /api/news?debug=1
     je přesně to, co server zkoušel a co dostal. Bez toho se „nenačetlo
     se“ ladí hádáním. */
  const potiz = (NEWS.failed || []).length
    ? `<p class="note wn">Neodpověděl${NEWS.failed.length > 1 ? 'y' : ''}:
       ${NEWS.failed.map(f => esc(f.name)).join(', ')}. Ostatní zdroje
       se načetly normálně.
       <a href="/api/news?debug=1" target="_blank" rel="noopener noreferrer">Proč?</a></p>`
    : '';

  out.innerHTML = filtr + potiz + (items.length
    ? `<div class="nlist">${items.map(newsCard).join('')}</div>`
    : '<p class="note">Z tohohle zdroje teď nic není.</p>')
    + `<p class="nfoot">Načteno ${newsTime(NEWS.fetched)} ·
       <button type="button" class="lnkbtn" id="newsreload">Načíst znovu</button></p>`;
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
   Box na Přehledu

   Tři nejnovější články napříč zdroji. Načítá se sám, protože jeden
   dotaz na vlastní endpoint s edge cache stojí prakticky nic — na
   rozdíl od H2H, které potřebuje sestavy všech členů ligy.
   ------------------------------------------------------------ */
let NEWS_FOR_HOME = false;

function homeNews(){
  const box = inner => `<div class="hbox">
    <h3><i class="hi">📰</i>Zpravodaj<button type="button" class="lnkbtn"
      data-goto="t-news">Vše</button></h3>${inner}</div>`;

  if(!NEWS){
    if(!NEWS_FOR_HOME){
      NEWS_FOR_HOME = true;
      fetchNews().then(() => drawHome()).catch(() => { NEWS_FOR_HOME = false; });
    }
    return box('<div class="skel"><i></i></div>');
  }

  const top = (NEWS.items || []).slice(0, 3);
  if(!top.length) return box('<p class="note">Zdroje teď neodpovídají.</p>');

  return box(`<div class="nmini">${top.map(it => `
    <a class="${NEWS_CLS[it.source] || ''}" href="${esc(newsHref(it.link))}"
       target="_blank" rel="noopener noreferrer">
      <span class="nsrc">${esc(it.sourceName)} · ${newsTime(it.date)}</span>
      <b>${esc(it.title)}</b>
    </a>`).join('')}</div>`);
}
