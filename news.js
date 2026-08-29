// Agregator zpravodajstvi pro Squad Check.
//
// Duvod existence je stejny jako u api/fpl.js: cizi weby neposilaji CORS
// hlavicky, takze prohlizec si jejich RSS nestahne. Tohle bezi na serveru,
// kde CORS neplati.
//
// Klicove rozhodnuti: zdroje se stahuji paralelne a KAZDY ma vlastni
// timeout. Kdyz jeden web lezi, vrati se ostatni a u nespravneho se rekne,
// ze se nepovedl. Jeden pomaly server nesmi znamenat prazdnou stranku.

// Znacka verze. Bez ni se neda poznat rozdil mezi "nova verze nefunguje"
// a "bezi porad ta stara" — a to jsou dve uplne jine chyby.
const BUILD = "news-2026-08-26c";

const TIMEOUT_MS = 6000;
const PER_SOURCE = 12; // kolik clanku brat z jednoho zdroje
const EXCERPT = 200; // znaku uryvku; cely clanek nechceme reprodukovat

const SOURCES = [
  { id: "ffs", name: "FFScout", type: "rss", url: "https://fantasyfootballscout.co.uk/feed/" },
  { id: "ff247", name: "FF247", type: "rss", url: "https://fantasyfootball247.co.uk/feed/" },
];

// Oficialni "The Scout" tady byl a je pryc. Premier League pro nej nema
// RSS, takze se cetl pres nezdokumentovane obsahove API Pulselive —
// rada adres, kterou bylo potreba hadat, s vlastnim parserem a s tim,
// ze se muze kdykoli zmenit bez ohlaseni. Kdyz se rozjel, ukazalo se,
// ze obsah stejne za tu udrzbu nestoji: FFScout a FF247 pisou o tomtez
// driv a podrobneji.
//
// Zustava po nem tenhle komentar misto stovky radku, ktere by nikdo
// nepouzival, ale kazdy by se je bal smazat.

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-GB,en;q=0.9",
};

async function fetchWithTimeout(url, headers) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

// --- parsovani ---------------------------------------------------------
//
// Zadny XML parser: potrebujeme peti polozky z dobre znameho tvaru, ne
// obecnou korektnost. Zavislost navic by tady byla drazsi nez uzitek.

// Pojmenovane entity, ktere se ve feedech opravdu objevuji. Britske weby
// pisou o hracich jako Kovacic nebo Doku, takze diakritika neni exotika.
const NAMED = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  hellip: "…", ndash: "–", mdash: "—", lsquo: "'", rsquo: "'",
  ldquo: '"', rdquo: '"', eacute: "é", egrave: "è", ecirc: "ê",
  aacute: "á", agrave: "à", acirc: "â", auml: "ä", aring: "å",
  iacute: "í", oacute: "ó", ouml: "ö", oslash: "ø", uacute: "ú",
  uuml: "ü", ccedil: "ç", ntilde: "ñ", szlig: "ß", scaron: "š",
  ccaron: "č", zcaron: "ž", deg: "°", pound: "£", euro: "€",
};

function decode(s) {
  return (
    String(s || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]*>/g, " ")
      // Jeden pruchod pres vsechny entity naraz. Retezene .replace() by
      // dekodovalo dvakrat: z &amp;lt; by udelalo &lt; a pak <, takze by
      // se text, ktery ma zobrazit znacku, promenil ve znacku.
      .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (all, ent) => {
        if (ent[0] === "#") {
          const code =
            ent[1] === "x" || ent[1] === "X"
              ? parseInt(ent.slice(2), 16)
              : Number(ent.slice(1));
          return Number.isFinite(code) ? String.fromCodePoint(code) : all;
        }
        const v = NAMED[ent.toLowerCase()];
        return v === undefined ? all : v;
      })
      .replace(/\s+/g, " ")
      .trim()
  );
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}

// WordPress feedy lepi na konec vyňatku vetu "The post X appeared first
// on Y". Je to podpis generatoru, ne obsah clanku — a kdyz se necha,
// sezere pulku mista v karte.
function stripBoilerplate(s) {
  return String(s || "")
    .replace(/\s*The post\b[\s\S]*$/i, "")
    .replace(/\s*(Continue reading|Read more)\b[\s\S]*$/i, "")
    .replace(/\s*Appeared first on\b[\s\S]*$/i, "")
    .trim();
}

function clip(s) {
  if (s.length <= EXCERPT) return s;
  // Rezat uprostred slova vypada jako chyba, ne jako zkraceni.
  const cut = s.slice(0, EXCERPT);
  const space = cut.lastIndexOf(" ");
  return (space > EXCERPT * 0.6 ? cut.slice(0, space) : cut) + "…";
}

function parseRss(xml) {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, PER_SOURCE).map((it) => ({
    title: decode(tag(it, "title")),
    link: decode(tag(it, "link")),
    date: new Date(decode(tag(it, "pubDate")) || Date.now()).toISOString(),
    excerpt: clip(
      stripBoilerplate(decode(tag(it, "description") || tag(it, "content:encoded")))
    ),
  }));
}

async function loadSource(src) {
  // Rada adres misto jedne: kdyz zdroj presune feed, zkusi se dalsi
  // kandidat driv, nez sekce zmizi. RSS adresy se stehuji zridka, ale
  // stehuji.
  const urls = src.urls || [src.url];
  const pokusy = [];
  let items = null;

  for (const url of urls) {
    try {
      const upstream = await fetchWithTimeout(url, BROWSER_HEADERS);
      if (!upstream.ok) {
        pokusy.push(`${upstream.status} ${url.slice(0, 90)}`);
        continue;
      }
      const parsed = parseRss(await upstream.text());

      // Status 200 s prazdnym polem znamena, ze adresa sice zije, ale
      // vraci neco jineho, nez cekame. Zkousime dal.
      if (parsed.length) { items = parsed; break; }
      pokusy.push(`200 ale 0 polozek ${url.slice(0, 90)}`);
    } catch (e) {
      pokusy.push(`${e.name === "AbortError" ? "timeout" : e.message} ${url.slice(0, 90)}`);
    }
  }

  if (!items) throw new Error(pokusy.join(" | "));

  // Polozka bez odkazu nebo titulku je k nicemu — nedava se kam kliknout.
  return items
    .filter((i) => i.title && i.link)
    .map((i) => ({ ...i, source: src.id, sourceName: src.name }));
}

export default async function handler(req, res) {
  const results = await Promise.allSettled(SOURCES.map(loadSource));

  // /api/news?debug=1 vrati i duvody selhani v plne delce. Bez tohohle
  // se "nenacetlo se" ladi hadanim.
  const debug = "debug" in (req.query || {});

  const items = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else
      failed.push({
        id: SOURCES[i].id,
        name: SOURCES[i].name,
        error: debug ? String(r.reason && r.reason.message || r.reason)
                     : String(r.reason && r.reason.message || r.reason).slice(0, 160),
      });
  });

  // Vsechny zdroje dole = neni co ukazat; at to strana pozna podle statusu.
  if (!items.length) {
    return res
      .status(502)
      .json({ build: BUILD, error: "Žádný ze zdrojů neodpověděl.", failed });
  }

  if (debug) res.setHeader("Cache-Control", "no-store");

  items.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Zadny cron: cerstvost resi edge cache. stale-while-revalidate znamena,
  // ze pri vypadku zdroje se ukaze posledni znama verze misto chyby.
  if (!debug)
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=3600"
    );
  return res.status(200).json({
    build: BUILD,
    items,
    failed,
    sources: SOURCES.map((s) => ({ id: s.id, name: s.name })),
    fetched: new Date().toISOString(),
  });
}

// Vnitrnosti pro test.mjs. Parsovani je jediny netrivialni kus tehle
// funkce a jediny, ktery se da testovat bez site.
export const __test = { parseRss, decode, clip, stripBoilerplate };
