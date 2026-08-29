// Proxy k oficialnimu FPL API - verze pro Cloudflare Pages Functions.
//
// Proti verzi pro Vercel je tahle podstatne kratsi, a to je cely duvod
// prestehovani. Na Vercelu bylo potreba obchazet blokaci: FPL odmitalo
// dotazy z jejich IP rozsahu (403 od Varnishe), nejdriv jen `fixtures/`,
// pak i `leagues-classic/.../standings/`. Resilo se to cookies, retry
// logikou a nakonec objizdkou pres Cloudflare Worker.
//
// Odsud se vola primo z Cloudflare, ktery FPL nefiltruje. Zadne cookies,
// zadny retry, zadny token. Kdyby se blokace vratila, patri sem stejny
// postup jako drive - zatim ho ale neni proc psat.
//
// API Pages Functions: onRequest({ request, env }) vraci Response.
// Nema res.status()/res.json() jako Vercel; vse jde pres new Response().

const BASE = "https://fantasy.premierleague.com/api";

// Whitelist - proxy nesmi byt otevrena pro libovolne cile.
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
  // page_standings pro velke ligy, phase pro mesicni tabulky (bootstrap: phases[])
  /^leagues-classic\/\d+\/standings\/(\?(page_standings|phase)=\d+(&(page_standings|phase)=\d+)?)?$/,
];

// Jak dlouho drzet odpoved na edge cache. Live data se meni po minutach,
// sestavy manazeru po kolech, bootstrap jednou denne.
function ttlFor(path) {
  if (/^event\/\d+\/live\/$/.test(path)) return 45;
  if (path.startsWith("entry/")) return 60;
  if (/^leagues-classic\/\d+\/standings\/\?phase=\d+$/.test(path)) return 300;
  if (path.startsWith("leagues-classic/")) return 120;
  if (/^entry\/\d+\/transfers\/$/.test(path)) return 120;
  return 600;
}

const CHROME_MAJOR = "137";

// Hlavicky prohlizece se posilaji dal, i kdyz odsud blokace nehrozi.
// Stoji nic a chrani pred tim, aby nas FPL zaradilo mezi boty pozdeji.
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
};

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export async function onRequest({ request }) {
  const path = new URL(request.url).searchParams.get("path") || "";

  if (!ALLOWED.some((re) => re.test(path))) {
    return json({ error: "Tahle cesta není povolená." }, 403);
  }

  try {
    const upstream = await fetch(`${BASE}/${path}`, {
      headers: BROWSER_HEADERS,
      cf: { cacheTtl: 0, cacheEverything: false },
    });

    if (upstream.status === 429) {
      // Frontend na tenhle status umi cekat a zkusit to znovu.
      const retry = upstream.headers.get("retry-after") || "3";
      return json(
        { error: "FPL API omezuje počet dotazů. Zkusím to za chvíli." },
        429,
        { "Retry-After": retry }
      );
    }

    if (!upstream.ok) {
      // Diagnostika pro pripad, ze by blokace dorazila i sem. Bez ni se
      // hada, jestli slo o challenge stranku nebo tvrdy blok.
      const detail =
        upstream.status === 403
          ? {
              cfRay: upstream.headers.get("cf-ray") || null,
              server: upstream.headers.get("server") || null,
              snippet: (await upstream.text().catch(() => "")).slice(0, 300),
            }
          : undefined;

      return json(
        {
          error: `FPL API vrátilo ${upstream.status} pro ${path}.`,
          ...(detail ? { detail } : {}),
        },
        upstream.status
      );
    }

    // FPL obcas vrati HTML (udrzba, rate limit stranka) se statusem 200.
    const ctype = upstream.headers.get("content-type") || "";
    if (!ctype.includes("json")) {
      return json(
        { error: "FPL API nevrátilo JSON — pravděpodobně dočasná odstávka." },
        502
      );
    }

    const ttl = ttlFor(path);
    return json(await upstream.json(), 200, {
      "Cache-Control": `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 3}`,
    });
  } catch (err) {
    return json({ error: "FPL API je nedostupné." }, 502);
  }
}
