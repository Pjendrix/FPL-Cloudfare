/* The newsletter aggregator — Cloudflare Pages Function.

   It exists for the same reason as functions/api/fpl.js: other people's sites
   send no CORS headers, so the browser cannot fetch their RSS. This runs on the
   edge, where CORS does not apply.

   The key decision: sources are fetched in parallel and EACH has its own
   timeout. When one site is down the others still come back and the failed one
   is reported as failed. One slow server must not mean an empty page.
   ============================================================ */

/* A build marker. Without it there is no telling "the new version does not
   work" from "the old one is still running" — two completely different bugs. */
const BUILD = "news-cf-2026-08-31";

const TIMEOUT_MS = 6000;
const PER_SOURCE = 12;   // how many articles to take from one source
const EXCERPT = 200;     // characters of excerpt; we do not reproduce whole articles

const SOURCES = [
  { id: "ffs", name: "FFScout", type: "rss", url: "https://fantasyfootballscout.co.uk/feed/" },
  { id: "ff247", name: "FF247", type: "rss", url: "https://fantasyfootball247.co.uk/feed/" },
];

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
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

/* --- parsing ---------------------------------------------------------

   No XML parser: we need five fields from a well-known shape, not general
   correctness. An extra dependency would cost more here than it is worth. */

/* The named entities that actually appear in these feeds. British sites write
   about players like Kovacic and Doku, so diacritics are not exotic. */
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
      /* One pass over every entity at once. Chained .replace() calls would
         decode twice: &amp;lt; would become &lt; and then <, so text meant to
         display a tag would turn into a tag. */
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

/* WordPress feeds append "The post X appeared first on Y" to the end of an
   excerpt. That is the generator's signature, not the content of the article —
   and left in, it eats half the card. */
function stripBoilerplate(s) {
  return String(s || "")
    .replace(/\s*The post\b[\s\S]*$/i, "")
    .replace(/\s*(Continue reading|Read more)\b[\s\S]*$/i, "")
    .replace(/\s*Appeared first on\b[\s\S]*$/i, "")
    .trim();
}

function clip(s) {
  if (s.length <= EXCERPT) return s;
  // Cutting mid-word looks like a bug, not like an excerpt.
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
  const urls = src.urls || [src.url];
  const attempts = [];
  let items = null;

  for (const url of urls) {
    try {
      const upstream = await fetchWithTimeout(url, BROWSER_HEADERS);
      if (!upstream.ok) {
        attempts.push(`${upstream.status} ${url.slice(0, 90)}`);
        continue;
      }
      const parsed = parseRss(await upstream.text());

      /* A 200 with an empty array means the address is alive but returns
         something other than what we expect. Keep trying. */
      if (parsed.length) { items = parsed; break; }
      attempts.push(`200 but 0 items ${url.slice(0, 90)}`);
    } catch (e) {
      attempts.push(`${e.name === "AbortError" ? "timeout" : e.message} ${url.slice(0, 90)}`);
    }
  }

  if (!items) throw new Error(attempts.join(" | "));

  // An item with no link or title is useless — there is nowhere to click.
  return items
    .filter((i) => i.title && i.link)
    .map((i) => ({ ...i, source: src.id, sourceName: src.name }));
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...(headers || {}) },
  });
}

export async function onRequestGet(context) {
  const { request } = context;

  /* /api/news?debug=1 also returns the failure reasons in full. Without it,
     "it did not load" is debugged by guesswork. */
  const debug = new URL(request.url).searchParams.has("debug");

  /* The edge cache. Two RSS fetches per visitor would be wasteful and would
     eventually get us rate limited by the sources themselves. Debug requests
     skip the cache — a cached diagnostic is worse than none. */
  const cache = caches.default;
  if (!debug) {
    const hit = await cache.match(request);
    if (hit) return hit;
  }

  const results = await Promise.allSettled(SOURCES.map(loadSource));

  const items = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else {
      const msg = String((r.reason && r.reason.message) || r.reason);
      failed.push({
        id: SOURCES[i].id,
        name: SOURCES[i].name,
        error: debug ? msg : msg.slice(0, 160),
      });
    }
  });

  // Every source down = nothing to show; let the page tell from the status.
  if (!items.length) {
    return json({ build: BUILD, error: "No source responded.", failed }, 502,
      { "Cache-Control": "no-store" });
  }

  items.sort((a, b) => new Date(b.date) - new Date(a.date));

  /* No cron job: freshness is handled by the edge cache.
     stale-while-revalidate means that when a source goes down, the last known
     version is shown instead of an error. */
  const res = json({
    build: BUILD,
    items,
    failed,
    sources: SOURCES.map((s) => ({ id: s.id, name: s.name })),
    fetched: new Date().toISOString(),
  }, 200, debug
    ? { "Cache-Control": "no-store" }
    : { "Cache-Control": "public, s-maxage=900, max-age=0, stale-while-revalidate=3600" });

  if (!debug) context.waitUntil(cache.put(request, res.clone()));
  return res;
}

/* The internals, for test.mjs. Parsing is the only non-trivial part of this
   function and the only one testable without the network. */
export const __test = { parseRss, decode, clip, stripBoilerplate };
