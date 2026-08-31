/* A proxy to the official FPL API — Cloudflare Pages Function.

   Why it exists: fantasy.premierleague.com sends no CORS headers, so the
   browser cannot reach it directly. This runs on the edge, where CORS does not
   apply, and passes the result on to the page.

   On Cloudflare there is no Worker bypass. The Vercel build needed one because
   it ran from datacentre IP ranges the FPL CDN refuses wholesale; a Pages
   Function already runs on a Cloudflare edge IP, which was the whole point of
   that detour. The cookie handshake stays — it deals with per-request bot
   scoring, which is a different problem from an IP-range block.
   ============================================================ */

const BASE = "https://fantasy.premierleague.com/api";

// A whitelist — the proxy must not be open to arbitrary targets.
const ALLOWED = [
  /^bootstrap-static\/$/,
  /^fixtures\/$/,
  /^fixtures\/\?event=\d+$/,
  /^fixtures\/\?future=1$/,
  /^entry\/\d+\/$/,
  /^entry\/\d+\/history\/$/,
  /^entry\/\d+\/transfers\/$/,
  /^entry\/\d+\/event\/\d+\/picks\/$/,
  /^element-summary\/\d+\/$/,
  /^event\/\d+\/live\/$/,
  // page_standings for large leagues, phase for the monthly tables (bootstrap: phases[])
  /^leagues-classic\/\d+\/standings\/(\?(page_standings|phase)=\d+(&(page_standings|phase)=\d+)?)?$/,
];

/* How long to keep a response in the edge cache. Live data changes by the
   minute, managers' picks by the gameweek, the bootstrap once a day. */
function ttlFor(path) {
  if (/^event\/\d+\/live\/$/.test(path)) return 45;
  if (/^leagues-classic\/\d+\/standings\/\?phase=\d+$/.test(path)) return 300;
  if (path.startsWith("leagues-classic/")) return 120;
  if (/^entry\/\d+\/transfers\/$/.test(path)) return 120;
  if (path.startsWith("entry/")) return 60;
  return 600;
}

/* ------------------------------------------------------------
   The CDN in front of the FPL API blocks requests that do not look like a
   browser. The original header set stopped being enough — 403 came back even
   for bootstrap-static/, the mildest endpoint there is, which means the block
   is not per endpoint: we were being classified as a bot.

   Three things cause that most often, and how each is handled:

   1) MISMATCHED HEADERS. Sending a Chrome User-Agent without sec-ch-ua and
      sec-fetch-* is an instant tell — a real Chrome always sends them. "Chrome
      says it is Chrome but does not behave like Chrome" is exactly what is
      being looked for. The whole set has to agree, version number included.

   2) A STALE VERSION. A UA claiming Chrome/124 in 2026 is over a year old,
      which raises the score on its own. The version lives in one constant so
      the next update touches one place.

   3) A MISSING COOKIE. The second request, carrying a cookie from the first,
      is often let through. So on a block we fetch the homepage, collect the
      cookies and repeat the request with them.

   Origin and X-Requested-With are deliberately no longer sent: a browser does
   not send them on a plain GET to its own API, and their presence was one more
   inconsistency.
   ------------------------------------------------------------ */
const CHROME_MAJOR = "137";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    `(KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
  Referer: "https://fantasy.premierleague.com/",
  "sec-ch-ua": `"Chromium";v="${CHROME_MAJOR}", "Not/A)Brand";v="24", ` +
    `"Google Chrome";v="${CHROME_MAJOR}"`,
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

/* Cookies from the homepage. Held in module scope, which on Workers survives
   between requests for as long as the isolate lives — so the homepage is not
   fetched every time. It is not shared across edge locations, and that is
   fine: each one warms up on its own. */
let COOKIE_JAR = null;
let COOKIE_AT = 0;
const COOKIE_TTL = 5 * 60 * 1000;

async function getCookies(force) {
  const fresh = COOKIE_JAR && Date.now() - COOKIE_AT < COOKIE_TTL;
  if (fresh && !force) return COOKIE_JAR;

  try {
    const r = await fetch("https://fantasy.premierleague.com/", {
      headers: {
        ...BROWSER_HEADERS,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
      redirect: "follow",
    });

    const raw = typeof r.headers.getSetCookie === "function"
      ? r.headers.getSetCookie()
      : [r.headers.get("set-cookie")].filter(Boolean);

    COOKIE_JAR = raw.map((c) => String(c).split(";")[0]).join("; ") || null;
    COOKIE_AT = Date.now();
  } catch (e) {
    COOKIE_JAR = null;
  }
  return COOKIE_JAR;
}

/* Is this response a block from the CDN?

   This used to be recognised by `status === 403`. That stopped holding: the
   CDN also refuses under 404, and telling that apart from "this endpoint does
   not exist" is only possible from the shape of the response. The consequence
   was quiet and unpleasant — the cookie handshake never started, because a
   different number was being waited for.

   So the content decides, not the status: the FPL API returns errors as JSON
   too, whereas the CDN sends an HTML page and announces itself in `server`. */
function isBlock(res) {
  if (res.ok) return false;
  const ctype = res.headers.get("content-type") || "";
  if (ctype.includes("json")) return false;   // an honest error from FPL
  const server = (res.headers.get("server") || "").toLowerCase();
  return res.status === 403 || server.includes("cloudflare");
}

/* Blocks come both at random and systematically, so the approach is staged: a
   plain request, then one with a cookie, then one with a fresh cookie. If the
   third does not get through, the block is real and there is no point
   hammering away — that is how you earn a ban. */
async function fetchUpstream(path) {
  const url = `${BASE}/${path}`;
  const attempt = (cookie) =>
    fetch(url, {
      headers: cookie ? { ...BROWSER_HEADERS, Cookie: cookie } : BROWSER_HEADERS,
      redirect: "follow",
    });

  let upstream = await attempt(COOKIE_JAR);
  if (!isBlock(upstream)) return upstream;

  await new Promise((r) => setTimeout(r, 350));
  upstream = await attempt(await getCookies(false));
  if (!isBlock(upstream)) return upstream;

  await new Promise((r) => setTimeout(r, 700));
  return attempt(await getCookies(true));
}

/* ------------------------------------------------------------
   FPL refuses `fixtures/` without a parameter more often than other endpoints
   — it is the largest response in the whole API (all 380 matches of a season)
   and is frequently answered with a 403 even when `bootstrap-static/` gets
   through.

   The app needs the full fixture list (the ticker, FDR, gwPhaseFromFixtures),
   so it is assembled from per-gameweek requests, which are not blocked. This
   only happens when the full path fails, and the result goes into the edge
   cache, so 38 requests happen at most once every few minutes.
   ------------------------------------------------------------ */
async function fixturesByEvent() {
  const numbers = Array.from({ length: 38 }, (_, i) => i + 1);
  const out = [];

  // Five at a time. More parallel requests is exactly the behaviour that
  // earns a rate limit at FPL.
  for (let i = 0; i < numbers.length; i += 5) {
    const batch = numbers.slice(i, i + 5);
    const parts = await Promise.all(
      batch.map(async (ev) => {
        const r = await fetchUpstream(`fixtures/?event=${ev}`);
        if (!r.ok) return null;
        const ctype = r.headers.get("content-type") || "";
        if (!ctype.includes("json")) return null;
        return r.json().catch(() => null);
      })
    );
    for (const c of parts) if (Array.isArray(c)) out.push(...c);
  }

  // An empty result means even this failed — let the caller notice and return
  // the original error rather than an empty fixture list.
  return out.length ? out : null;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...(headers || {}) },
  });
}

/* ------------------------------------------------------------
   The edge cache.

   On Vercel a `Cache-Control` header was enough — its CDN honoured s-maxage by
   itself. Pages Functions are dynamic by default and nothing is cached unless
   we do it, so the cache is driven explicitly through `caches.default`. Without
   this every visitor would pay for a full round trip to FPL, and a league of
   fifteen would hit the rate limit in minutes.

   `waitUntil` lets the write finish after the response has already gone out,
   so caching costs the user nothing.
   ------------------------------------------------------------ */
async function cachedResponse(ctx, req, build) {
  const cache = caches.default;
  const hit = await cache.match(req);
  if (hit) return hit;

  const res = await build();
  // Only successful responses are stored. An error cached for ten minutes
  // would turn a blip into an outage.
  if (res.status === 200 && res.headers.get("cache-control")) {
    ctx.waitUntil(cache.put(req, res.clone()));
  }
  return res;
}

export async function onRequestGet(context) {
  const { request } = context;
  const path = new URL(request.url).searchParams.get("path") || "";

  if (!ALLOWED.some((re) => re.test(path))) {
    return json({ error: "This path is not allowed." }, 403);
  }

  return cachedResponse(context, request, async () => {
    try {
      const upstream = await fetchUpstream(path);

      if (upstream.status === 429) {
        // The frontend knows how to wait on this status and try again.
        const retry = upstream.headers.get("retry-after") || "3";
        return json(
          { error: "The FPL API is rate limiting. Trying again shortly." },
          429,
          { "Retry-After": retry }
        );
      }

      if (!upstream.ok) {
        /* The full fixture list has a fallback path — see fixturesByEvent().
           The condition is deliberately the same as in fetchUpstream: if a
           block is recognised by shape there, it must not fall back to the
           status code here. */
        if (isBlock(upstream) && path === "fixtures/") {
          const assembled = await fixturesByEvent();
          if (assembled) {
            return json(assembled, 200, {
              "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
            });
          }
        }

        /* On an error it helps to know what the CDN actually said — cf-ray can
           be looked up, and the first lines of the body reveal whether it was
           a challenge page or a hard block. Without this it is guesswork.

           This used to be sent only for 403, because that was the status a
           block was expected under. But the CDN also refuses under 404, which
           is indistinguishable from "this endpoint does not exist" and sends
           the search somewhere else entirely. Diagnostics that only switch on
           for a status you already expect do not help when something else
           happens. */
        const detail = {
          cfRay: upstream.headers.get("cf-ray") || null,
          cfMitigated: upstream.headers.get("cf-mitigated") || null,
          server: upstream.headers.get("server") || null,
          snippet: (await upstream.text().catch(() => "")).slice(0, 300),
        };

        return json(
          { error: `The FPL API returned ${upstream.status} for ${path}.`, detail },
          upstream.status
        );
      }

      // FPL occasionally returns HTML (maintenance, a rate limit page) with a
      // status of 200.
      const ctype = upstream.headers.get("content-type") || "";
      if (!ctype.includes("json")) {
        return json(
          { error: "The FPL API did not return JSON — probably a temporary outage." },
          502
        );
      }

      const data = await upstream.json();
      const ttl = ttlFor(path);
      return json(data, 200, {
        "Cache-Control": `public, s-maxage=${ttl}, max-age=0, ` +
          `stale-while-revalidate=${ttl * 3}`,
      });
    } catch (err) {
      return json({ error: "The FPL API is unreachable." }, 502);
    }
  });
}
