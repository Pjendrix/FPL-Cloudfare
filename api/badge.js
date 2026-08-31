// Odznaky klubu jako WebP, servirovane z vlastni domeny.
//
// Proc to jde pres proxy a ne primo <img src="https://resources...">:
//   1. CSP v vercel.json ma img-src 'self' — cizi domena by se neprokreslila.
//   2. Chteli jsme WebP; PL CDN dava PNG.
//   3. Odznaky se meni jednou za sezonu (postup/sestup), tak at je edge cache
//      drzi rok a nechodi se pro ne pri kazdem nacteni.
//
// Klic je `code` z bootstrap-static (teams[].code), NE `id`. Kody prezivaji
// mezi sezonami, id se prehazuje podle abecedy — proto code.
//   Arsenal 3, Man Utd 1, Liverpool 14, Man City 43, Spurs 6, …
//
// sharp je nepovinny. Kdyz chybi, funkce vrati original PNG misto WebP;
// obrazek se zobrazi tak jako tak, jen o par kB vetsi.

const CDN = "https://resources.premierleague.com/premierleague/badges";

// Nejvetsi rozumna velikost, ktera na CDN existuje pro vsechny kluby.
const SIZES = new Set(["25", "50", "70"]);

let sharp = null;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  // bez sharpu jedeme dal, jen bez konverze
}

export default async function handler(req, res) {
  const code = String(req.query.code || "");
  const size = SIZES.has(String(req.query.size)) ? String(req.query.size) : "70";

  // Whitelist tvarem, ne seznamem: kody novacku neznam dopredu.
  if (!/^\d{1,4}$/.test(code)) {
    return res.status(400).json({ error: "Invalid club code." });
  }

  try {
    const upstream = await fetch(`${CDN}/${size}/t${code}.png`, {
      headers: { "User-Agent": "minileague-squad-check/1.0" },
    });

    // 404 tu neni chyba, ale informace: novacek, ktery jeste odznak nema.
    // Frontend na to reaguje tim, ze ukaze vlastni barevnou znacku.
    if (!upstream.ok) {
      return res.status(404).json({ error: `The badge for code ${code} is not on the CDN.` });
    }

    const png = Buffer.from(await upstream.arrayBuffer());
    let body = png;
    let type = "image/png";

    if (sharp) {
      body = await sharp(png).webp({ quality: 88, effort: 5 }).toBuffer();
      type = "image/webp";
    }

    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=31536000, immutable");
    return res.status(200).send(body);
  } catch {
    return res.status(502).json({ error: "The badge could not be loaded." });
  }
}
