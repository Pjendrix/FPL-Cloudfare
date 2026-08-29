// Odznaky klubu servirovane z vlastni domeny.
//
// Proc to jde pres proxy a ne primo <img src="https://resources...">:
//   1. CSP ma img-src 'self' — cizi domena by se neprokreslila.
//   2. Odznaky se meni jednou za sezonu (postup/sestup), tak at je edge
//      cache drzi rok a nechodi se pro ne pri kazdem nacteni.
//
// Klic je `code` z bootstrap-static (teams[].code), NE `id`. Kody prezivaji
// mezi sezonami, id se prehazuje podle abecedy — proto code.
//   Arsenal 3, Man Utd 1, Liverpool 14, Man City 43, Spurs 6, …
//
// ZMENA PROTI VERZI PRO VERCEL: odpadla konverze do WebP pres sharp.
// sharp je nativni modul a v runtime Cloudflare nebezi. Servirujeme tedy
// primo PNG z CDN. Rozdil je par kB na obrazek, ktery si prohlizec stejne
// nacte jednou za sezonu a pak drzi v cache — nestoji to za nahradni
// resizovaci sluzbu.

const CDN = "https://resources.premierleague.com/premierleague/badges";

// Nejvetsi rozumna velikost, ktera na CDN existuje pro vsechny kluby.
const SIZES = new Set(["25", "50", "70"]);

const json = (data, status) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export async function onRequest({ request }) {
  const q = new URL(request.url).searchParams;
  const code = String(q.get("code") || "");
  const size = SIZES.has(String(q.get("size"))) ? String(q.get("size")) : "70";

  // Whitelist tvarem, ne seznamem: kody novacku neznam dopredu.
  if (!/^\d{1,4}$/.test(code)) {
    return json({ error: "Neplatný kód klubu." }, 400);
  }

  try {
    const upstream = await fetch(`${CDN}/${size}/t${code}.png`, {
      headers: { "User-Agent": "minileague-squad-check/1.0" },
    });

    // 404 tu neni chyba, ale informace: novacek, ktery jeste odznak nema.
    // Frontend na to reaguje tim, ze ukaze vlastni barevnou znacku.
    if (!upstream.ok) {
      return json({ error: `Odznak pro kód ${code} na CDN není.` }, 404);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
      },
    });
  } catch {
    return json({ error: "Odznak se nepodařilo načíst." }, 502);
  }
}
