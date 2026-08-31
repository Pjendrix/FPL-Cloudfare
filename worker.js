/* Cloudflare Worker — a bypass to the FPL API.
 *
 * What it is for: Vercel runs from datacentre IP addresses, and the CDN in
 * front of the FPL API refuses them wholesale. It is not about behaviour or
 * headers — we are refused before they are even looked at — so no set of
 * headers or cookies will help. The only way out leads from somewhere else.
 *
 * The Worker runs on Cloudflare's edge, i.e. on an IP Cloudflare has no
 * reason to treat as a bot. It is only called when all three attempts in
 * `api/fpl.js` have failed — normal traffic never comes here.
 *
 * Security: without a token this would be an open proxy anyone could use to
 * hammer FPL in your name. The token is therefore mandatory, and the path
 * whitelist is deliberately repeated here — the Worker must not trust that
 * only our own function calls it.
 */

const BASE = "https://fantasy.premierleague.com/api";

// Must stay in sync with ALLOWED in api/fpl.js. Deliberate duplication: the
// Worker has its own public address, so it has to defend itself.
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
  /^leagues-classic\/\d+\/standings\/(\?(page_standings|phase)=\d+(&(page_standings|phase)=\d+)?)?$/,
];

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
};

export default {
  async fetch(request, env) {
    // The token is always compared in full, even if the first character
    // differs. A comparison that stops at the first mismatch leaks, through
    // how long it takes, how many characters matched.
    const dany = request.headers.get("x-proxy-token") || "";
    const cekany = env.PROXY_TOKEN || "";
    if (!cekany || !bezpecneRovno(dany, cekany)) {
      return json({ error: "Invalid token." }, 401);
    }

    const path = new URL(request.url).searchParams.get("path") || "";
    if (!ALLOWED.some((re) => re.test(path))) {
      return json({ error: "This path is not allowed." }, 403);
    }

    try {
      const upstream = await fetch(`${BASE}/${path}`, {
        headers: BROWSER_HEADERS,
        cf: { cacheTtl: 30, cacheEverything: false },
      });

      // The CDN can refuse with an HTML page under almost any status.
      // Passing it through would look like an FPL response and would be
      // debugged in the wrong place — see `isBlock` in api/fpl.js.
      const ctype = upstream.headers.get("content-type") || "";
      if (!upstream.ok && !ctype.includes("json")) {
        return new Response(
          JSON.stringify({
            error: `Upstream returned ${upstream.status} without JSON.`,
            via: "worker",
            server: upstream.headers.get("server") || null,
            snippet: (await upstream.text().catch(() => "")).slice(0, 300),
          }),
          {
            status: upstream.status,
            headers: { "content-type": "application/json", "x-via": "worker" },
          }
        );
      }

      /* A marker of which way the response came. Without it a refusal from
         the Worker looks exactly like a refusal from Vercel in the log, and
         there is no telling whether the bypass runs at all, or runs and is
         blocked too. */
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type": ctype || "application/json",
          "cache-control": "no-store",
          "x-via": "worker",
          "x-upstream-server": upstream.headers.get("server") || "",
        },
      });
    } catch (e) {
      return json({ error: "The FPL API is unreachable from the Worker." }, 502);
    }
  },
};

function bezpecneRovno(a, b) {
  if (a.length !== b.length) return false;
  let rozdil = 0;
  for (let i = 0; i < a.length; i++) rozdil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return rozdil === 0;
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
