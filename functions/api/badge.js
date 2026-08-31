/* Club badges served from our own domain — Cloudflare Pages Function.

   Why a proxy and not <img src="https://resources..."> directly:
     1. The CSP sets img-src 'self' — a foreign domain would not render.
     2. Badges change once a season (promotion and relegation), so the edge
        cache can hold them for a year instead of fetching on every load.

   The key is `code` from bootstrap-static (teams[].code), NOT `id`. Codes
   survive between seasons, ids are reshuffled alphabetically every August.
     Arsenal 3, Man Utd 1, Liverpool 14, Man City 43, Spurs 6, …

   No WebP conversion here. The Vercel version used `sharp`, a native Node
   binary that the Workers runtime cannot load — and it was optional there
   anyway. The original PNG is passed through instead: the image shows either
   way, a few kB larger, and it is cached for a year so the difference is paid
   once.
   ============================================================ */

const CDN = "https://resources.premierleague.com/premierleague/badges";

// The largest sensible size that exists on the CDN for every club.
const SIZES = new Set(["25", "50", "70"]);

const YEAR = "public, max-age=86400, s-maxage=31536000, immutable";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet(context) {
  const { request } = context;
  const params = new URL(request.url).searchParams;
  const code = String(params.get("code") || "");
  const size = SIZES.has(String(params.get("size"))) ? String(params.get("size")) : "70";

  // A whitelist by shape, not by list: the codes of promoted clubs are not
  // known in advance.
  if (!/^\d{1,4}$/.test(code)) {
    return json({ error: "Invalid club code." }, 400);
  }

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  try {
    const upstream = await fetch(`${CDN}/${size}/t${code}.png`, {
      headers: { "User-Agent": "fpl-squad-check/1.0" },
      // Cloudflare's own cache in front of the origin. A badge is the most
      // cacheable thing in the whole app.
      cf: { cacheTtl: 31536000, cacheEverything: true },
    });

    /* A 404 here is not an error but information: a promoted club that does
       not have a badge yet. The frontend responds by drawing its own coloured
       mark from club-marks.svg. */
    if (!upstream.ok) {
      return json({ error: `The badge for code ${code} is not on the CDN.` }, 404);
    }

    const res = new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/png",
        "Cache-Control": YEAR,
      },
    });

    context.waitUntil(cache.put(request, res.clone()));
    return res;
  } catch {
    return json({ error: "The badge could not be loaded." }, 502);
  }
}
