# Minileague Squad Check

Pomocná appka k Fantasy Premier League. Jedna HTML stránka, dvě serverless
funkce, žádný build. Nasadíš na Vercel a běží.

Nic se nestahuje, dokud nezadáš ID svého týmu. Každá záložka si data tahá
sama, až když na ni přijde řada.

## Co umí

| Záložka | K čemu je |
|---|---|
| **Sestava** | Kádr **seskupený podle pozic** s rozpisem na tři kola, živé body během kola, zranění a otazníky, doporučení kapitána, optimální jedenáctka z tvých patnácti, upozornění na blanky a doubly |
| **Miniliga** | Pořadí, **průběžné body během kola**, vývoj pozic v grafu, hráči, které máš jen ty nebo naopak nemáš, kdo koho vlastní |
| **Hub ligy** | Novinky po kole, sezónní žebříčky (daň za transfery, zmrzlá lavička), zdraví kádrů, kapitánská mapa a efekt šablony |
| **Top hráči** | Žebříčky top 10 podle gólů, asistencí, DEFCON, bonusů, xG, xA a xGI; u brankářů čistá konta a zákroky. Pod nimi **porovnání dvou libovolných hráčů** vedle sebe |
| **Transfery** | Najde problémové hráče a navrhne náhrady do rozpočtu, seřazené podle vlastnictví; statistiky pod tlačítkem **i** |
| **Program** | Rozpis na šest kol s vlastní obtížností, blanky a doubly |
| **Ceny** | Kdo dnes v noci zdraží nebo zlevní (oficiální predikce), kdo se pohnul za poslední kolo, největší růst a propad za sezónu |
| **Plánovač** | Přestupy na čtyři kola dopředu — banka, volné přestupy a hity spočítané kolo po kole |

V hlavičce běží odpočet do nejbližšího deadlinu a pod ní **kolejnice sezóny**:
38 čárek, jedna na kolo. Odehraná plná, aktuální se plní do deadlinu, budoucí
vlásek. Kolo, ve kterém má někdo z tvého kádru volno, dostane červenou tečku,
dvojité kolo mátovou. Je to jediné místo, kde je celá sezóna vidět naráz.

Appka umí připomenout deadline dvě hodiny předem přes notifikaci prohlížeče.

## Nasazení

1. Nahraj repozitář na GitHub a naimportuj ho ve Vercelu. Žádná konfigurace
   buildu není potřeba — funkce v `api/` se detekují samy.
2. Otevři stránku a zadej ID svého týmu (najdeš ho v URL na `fantasy.premierleague.com`,
   `/entry/60480/…`). ID miniligy je volitelné.

Nechceš-li zadávat ID pokaždé, vyplň `CONFIG` na začátku `js/core.js`
a vstupní obrazovka se přeskočí.

## Soubory

```
index.html              rozvržení a pořadí načítání
css/app.css             hlavní stylopis
css/narrow.css          do 720 px  (<link id="mqL">)
css/small.css           do 640 px  (<link id="mqS">)
css/mobile.css          mobilní skořápka (<link id="mqM">)
js/core.js              konfigurace, cache, načtení kádru, záložky
js/tabs.js              vykreslování obsahu jednotlivých sekcí
js/h2h.js               H2H miniliga: losování, tabulka, box na Přehledu
js/news.js              FPL Zpravodaj: filtr, karty, box na Přehledu
js/advisor.js           Přestupový poradce: diagnostika kádru, tipy z Opta metrik
js/ui.js                téma, přepínač zobrazení, tooltip, kolejnice
js/planner.js           plánovač přestupů (záložka vypnutá, kód ponechán)
js/sync.js              přihlášení a zrcadlení nastavení do Firestore
js/mobile.js            spodní navigace, plachta „Více“, gesta
js/boot.js              start aplikace a registrace service workeru
js/firebase.js          jediný ES modul — inicializace Firebase
api/news.js             agregace RSS zdrojů (FFScout, FF247, The Scout)
api/fpl.js              proxy na oficiální FPL API (řeší CORS)
api/badge.js            odznaky klubů z CDN Premier League, převedené na WebP
sw.js                   service worker — skořápka a odznaky, data nikdy
club-marks.svg          záložní barevné značky 20 klubů (sprite)
manifest.webmanifest    PWA manifest
icon.svg, favicon.svg   ikona aplikace a favicon
brand/                  logo, zdroje značky, mockup redesignu
vercel.json             bezpečnostní hlavičky včetně CSP
test.mjs                338 smoke testů nad falešnými daty FPL
```

Skripty v `js/` jsou **klasické `<script>`, ne ES moduly**: sdílejí jeden
globální scope, takže se nic neexportuje ani neimportuje. Cenou za to je,
že hoisting nepřekračuje hranici souboru — **pořadí `<script>` tagů
v `index.html` je součást kontraktu**. `core.js` musí být první, `boot.js`
poslední a `mobile.js` před ním (přepisuje `selectTab`).

Přibude-li soubor do `css/` nebo `js/`, patří i do `FILES` v `sw.js` —
jinak se offline načte skořápka, která nemá čím naběhnout.

### Odznaky klubů

Klíčem je `teams[].code` z bootstrapu, **ne `id`** — `code` přežívá mezi
sezónami, zatímco `id` se každý srpen přehazuje podle abecedy.

`api/badge.js` stáhne oficiální PNG z CDN Premier League, převede ho na WebP
a nechá na edge cache rok. Jde to přes vlastní doménu proto, že CSP má
`img-src 'self'` a cizí zdroj by se neprokreslil. Konverze potřebuje `sharp`
(`npm i sharp`); bez něj funkce vrátí původní PNG a obrázek se zobrazí taky,
jen o pár kB větší.

Když odznak na CDN není — typicky u čerstvého nováčka — spadne se na barevnou
značku z `club-marks.svg`: klubová barva, vzor dresu a zkratka. Žádná ochranná
známka se v repozitáři neukládá.

## Testy

```bash
npm install
npm test
```

Testy postaví falešný bootstrap i rozpis (včetně kola s blankem a doublem),
načtou stránku v jsdom a projdou kritické funkce: projekci bodů včetně
defenzivních příspěvků, optimální jedenáctku, prodejní ceny, predikce cen,
kolejnici sezóny, plánovač přestupů, snapshoty miniligy a vykreslení panelu
Sestava. Několik testů hlídá i CSS — že stupnice obtížnosti zůstala jednou
sadou proměnných a že žádná media query není definovaná dvakrát. Nesahají
na síť.

## Poznámky k provozu

**Limity API.** Miniliga o padesáti členech znamená sto dotazů na FPL. Chodí
frontou po pěti, s opakováním při 429, a odpovědi se v rámci stránky cachují —
Hub po načtení Miniligy proto nic nového nestahuje. Ligy nad 50 členů se
stránkují, strop je 200.

**Projekce bodů.** Hlavní číslo v přehledech je `ep_next` — oficiální projekce,
kterou počítá samo FPL a posílá ji v bootstrapu. V rozhraní je označená jako
**xP FPL**.

Vlastní model (`perMatchXp` → `projectGw` → `projectRange`) zůstal jen tam, kde
FPL nic nedává: výhled na pět a šest kol dopředu a double kola. `ep_next` je
totiž vždy za jedno kolo bez ohledu na to, kolik zápasů tým reálně hraje —
v doublu proto beru vyšší z obou čísel a v rozhraní to označím.

**Živé body.** Dokud kolo běží, na hřišti i v tabulce kádru jsou body, které
hráči skutečně mají (`event/{gw}/live/`), ne projekce na příští kolo — kapitánovy
už zdvojené. Pomlčka znamená „ještě nenastoupil“, což je jiná zpráva než nula.
Po uzavření kola se zobrazení vrátí k FDR a projekcím.

**Kdy appka navrhne transfer.** Priorita 1: hráč je zraněný, suspendovaný nebo
nedostupný; šance nastoupit je 50 % a méně; nebo ho čeká blok tří zápasů
s průměrnou obtížností 4.3+. Priorita 2: šance nastoupit 51–99 %; průměrná
obtížnost bloku 3.9+; nebo tři a víc zápasů po sobě pod 3 body (počítáno jen
ze zápasů s 60+ minutami).

Dvě pojistky proti planým poplachům: obtížnost se počítá přes `ownFdr()`, která
zohledňuje sílu vlastního týmu — hráč Arsenalu už není trestaný za to, že hraje
proti jiným silným klubům. A hráč s formou 4+ nebo 4.5+ body na zápas se
neflaguje kvůli programu ani suchu vůbec: kdo boduje, ten se neprodává.

**Doporučení náhrad** se řadí **výhradně podle `selected_by_percent`** — kolik
procent hráčů FPL daného hráče vlastní. Do pořadí nevstupuje projekce, forma
ani rozpis. Je to vědomá volba: vysoké vlastnictví drží tvůj tým s polem, takže
když hráč zaboduje, neztrácíš. Náskok se tímhle způsobem ale nezískává —
kdo chce jít proti proudu, najde nízké vlastnictví v záložce Hub ligy.

Řádek náhrady ukazuje jméno, tým, cenu, vlastnictví, body za minulé kolo
a odehrané minuty. Všechno ostatní je pod tlačítkem **i** (ne hover — na
dotykovém displeji by tooltip byl nedostupný).

**Vysvětlivky jsou v tooltipech.** Appka měla přes sedmdesát vysvětlujících
odstavců pod tabulkami. Každý sám o sobě dával smysl, dohromady z toho byla zeď
textu, kterou nikdo nečetl a která odsouvala vlastní data pod ohyb. Text zůstal,
jen se schoval za „i“ vedle nadpisu — helper `info()` vrací tlačítko i obsah,
obsluha je jedna delegovaná na dokumentu (tooltipy vznikají při každém
překreslení, takže věšet posluchače na každý zvlášť by je po překreslení
ztrácelo). Otevírá se **kliknutím, ne hoverem**: na dotykovém displeji hover
neexistuje a tooltip by byl nedostupný.

Krátké hlášky a prázdné stavy v tooltipech nejsou — „nikdo není zraněný“ nebo
„FPL zatím predikce neposílá“ je informace, ne vysvětlivka.

**Ligové záložky se načítají samy** — při prvním otevření záložky, ne při startu
appky. Kdo se na ligu nepodívá, nestáhne nic; kdo ano, nemusí klikat. Druhá
ligová záložka je pak skoro zadarmo, protože dotazy na jednotlivé členy jdou
přes `cached()` a jsou to přesně tytéž adresy.

Tlačítka zůstala jako **Aktualizovat**. Musí ale nejdřív zavolat `dropCached()`:
cache žije po celou dobu života stránky, takže bez zneplatnění by se jen
překreslila tatáž data. Zahazuje se jen `leagues-classic/` a `entry/` —
`bootstrap-static/` se během kola nemění a stahovat ho znovu by bylo zbytečné.

**Režim jedné miniligy.** Vyplněné `CONFIG.leagueId` změní appku z obecného
nástroje na web jedné ligy: vstupní obrazovka si stáhne soupisku a nabídne
rozbalovací seznam jmen místo pole na entry ID. Nikdo nemusí lovit svoje číslo
v adrese FPL. Ruční zadání zůstává schované pod odkazem — do ligy může někdo
přibýt dřív, než se soupiska přenačte, a když se standings nenačte vůbec,
appka na ruční režim spadne sama a řekne proč. Prázdné `leagueId` vrátí původní
chování se dvěma poli.

**Oficiální sezóny.** `CONFIG.officialSeasons` říká, kdo v daném ročníku za ligu
opravdu nastoupil. FPL to neví — zná jen celkové body každého manažera — takže
bez toho by medaile za roky, kdy hráli tři lidi, dostávali i ti, kdo tehdy hráli
sami za sebe jinde. Jména se párují přes `normName`, takže na diakritice
nezáleží; místo jména jde uvést i entry ID, což je odolnější. Sezóna, která
v konfiguraci není, se počítá pro všechny členy.

Soupiska se řídí dvěma nezávislými pravidly, která se skládají:
`officialSeasons` pro roky s pevně danou soupiskou a `memberSince` pro lidi,
kteří přišli později. Druhé existuje proto, že vypisovat u každé sezóny všechny
členy by bylo dlouhé a rozbilo by se to při každém dalším příchodu. Sezóny před
uvedeným datem se počítají jako „hrál FPL, ale mimo tuhle ligu“ — body v tabulce
zůstanou šedě, medaili člověk nedostane.

**Historie miniligy má strop, který nejde obejít.** FPL neposílá pořadí
miniligy za minulé sezóny — endpoint standings vrací vždy jen tu rozehranou.
Dostat jde `past` z `entry/{id}/history/`: celkové body a celkové pořadí
každého manažera. Tabulka v sekci Historie je proto dopočítaná z lidí, kteří
jsou v lize **dneska** — kdo mezitím odešel, chybí, a pořadí není to, jak
liga tehdy skutečně dopadla. Appka to říká i uživateli; tichý nepřesný archiv
by byl horší než žádný.

**Doporučení kapitána podle xP appka nedělá.** `ep_next` chodí od FPL
zaokrouhlené na desetinu a u špičkových hráčů vychází prakticky stejně
(Haaland 4.0, Fernandes 4.0), takže z něj pořadí nevznikne — appka pak sama
psala „doporučit jednoho z nich nemá čím“, což je poctivé, ale k ničemu.
Místo toho ukazuje **dva týmy s nejlehčím losem** v příštím kole: proti komu
hrají, spočtenou obtížnost a koho z těch týmů máš v kádru. Pod tím tvoje tři
nejdražší hráče se stejnou informací. Rozhodnutí zůstává na uživateli — lehký
los sám o sobě body nedělá.

**Diferenciály nikdy nevrátí prázdno.** Dřív to byl pevný strop 12 %
vlastnictví a tvrdý filtr na minuty; když se do něj nikdo nevešel, appka
napsala „nikdo neprošel filtrem“ a skončila. Na začátku sezóny se to stávalo
skoro vždycky. Strop se teď uvolňuje po krocích, dokud se nenajde pět jmen,
a appka řekne, o kolik musela slevit. Jistota minut přestala být podmínkou
a stala se z ní **škála 0–1**, která skóre násobí: kdo odehrál dvě kola, má
málo minut ze své podstaty, ne proto, že by nehrál. Před prvním kolem, kdy
minuty neříkají nic, se jistota odhaduje z ceny.

**Diferenciály** řadíme podle projekce dělené **odmocninou** vlastnictví.
Odmocnina proto, že rozdíl mezi 2 % a 12 % znamená pro posun v pořadí mnohem
víc než mezi 40 % a 50 % — tam se s tebou hýbe skoro celé pole. Páka je
useknutá zdola na 1,5 %, ať neznámý hráč s jednou dobrou statistikou neuteče
nahoru. Jistota minut je tvrdá podmínka: hráč, který nenastupuje, není
diferenciál, ale prázdné místo v sestavě.

**Žebříčky místo filtrů.** Záložka Top hráči byla dřív filtrovatelná tabulka
všech zhruba sedmi set hráčů. Fungovala, ale odpovídala na otázku „najdi mi
konkrétního hráče“ — a tu si člověk položí zřídka. Častější je „kdo je letos
nejlepší v X“, na což se z jedné dlouhé tabulky odpovídalo řazením a klikáním.
Teď je každá kategorie vlastní box s top desítkou. Kategorie, kterou FPL v dané
sezóně neposílá, box přizná místo aby ukazoval samé nuly.

**Statistiky u hráče** se řídí jeho pozicí: brankář dostane zákroky, chycené
penalty a xGC; obránce čistá konta, xGC a defenzivní příspěvky; záložník
xGI i xGC, protože bere body z obou stran; útočník xGI, xG a xA. Pole, která
FPL v dané sezóně neposílá, se prostě nezobrazí — funkce `stat()` vrací `null`
místo `NaN`.

**Obtížnost soupeře** se nepočítá z FDR, které FPL nastaví v srpnu a pak už
nemění, ale z útočné a obranné síly obou týmů z bootstrapu (`ownFdr()`).

Barvy jsou **relativní**: prahy se počítají jako kvintily napříč všemi zápasy
v zobrazeném okně, takže každé pásmo dostane zhruba pětinu buněk. Pevné hranice
tohle nezvládly — síly týmů se u většiny klubů liší málo a ticker vycházel celý
stejně zelený. Když je rozptyl hodnot menší než 0,4, kvintily se nepoužijí
a nastoupí pevná stupnice: jednobarevná mřížka nenese žádnou informaci.

**Záloha na začátku sezóny — tři úrovně.** `strength_attack_*`
a `strength_defence_*` jsou v bootstrapu nuly, dokud je FPL po několika kolech
nedopočítá. `strength_overall_home/away` (stupnice 1–5) ale vyplněné **jsou**
od začátku, takže `teamStrengths()` sáhne po nich: pořád to rozliší domácí
zápas od venkovního, jen hruběji. Teprve když chybí i ty, vrací `ownFdr()`
oficiální FDR z rozpisu.

Rozhraní o tom nemlčí: `strengthsReady()` říká „máme ostrá data“,
`strengthsUsable()` „aspoň něco spočítat jde“, a text pod tabulkou podle toho
pojmenuje zdroj. Bez téhle pojistky vycházela obtížnost všech zápasů 1.0
(poměr sil 0 → vzorec pod stupnicí → `Math.max(1, …)`) a celá liga vypadala
jako samé lehké zápasy.

**Defenzivní příspěvky.** Za dosažení prahu (10 akcí u obránců, 12 u záložníků
a útočníků) dávají 2 body; brankáři je nedostávají. Model je nepočítá skokem —
sezónní průměr přesně na prahu neznamená „vždycky“, takže pravděpodobnost
zásahu jde přes logistickou křivku kolem prahu. Bez tohohle model systematicky
podhodnocoval defenzivní záložníky.

**Prodejní ceny.** Nákupní cenu bere appka z `entry/{id}/transfers/` — u každého
přestupu je `element_in_cost`. Hráč, kterého jsi nikdy nekupoval, je z původního
kádru, takže jeho nákupní cena je `now_cost − cost_change_start`. Prodejní cena
se pak dopočítá podle pravidla FPL: ze zisku dostaneš zpátky polovinu
zaokrouhlenou dolů na desetinu. Ruční přepis zůstal, ale už jen jako výjimka —
UI u každého čísla říká, odkud je.

**Změny cen.** Appka si směr nedomýšlí z čistého přílivu transferů. FPL dnes
posílá `price_change_projections` s pravděpodobností na tři dny dopředu,
`price_change_percent` jako naplněnost ukazatele a
`game_config.settings.price_change_deadlines` jako přesné časy změn. Bereme
oficiální číslo, když existuje — stejně jako u `ep_next`. Když projekce
v datech nejsou (bývá to před prvním kolem), appka to řekne místo aby hádala.

**Vstupní obrazovka je tmavá.** Zbytek appky světlý — je to záměr, ne
nedůslednost. Vstup funguje jako dveře: auberginové pozadí, za nimi se appka
rozsvítí. Praktický důvod je ale prostší: nadpis byl bílý a na světlém plátně
zmizel. Formulář navíc sedí **vedle** nadpisu, ne pod ním; dřív byl přes dvě
stě pixelů pod ohybem a po otevření nebylo vidět, co má člověk udělat.

**Světlo a tma.** Appka je navržená jako světlá — barevná stupnice obtížnosti
i odznaky klubů čtou na papíře líp než na černé. Tma je proto **přepínač
v hlavičce**, ne `prefers-color-scheme`: automatika by lidem s tmavým systémem
podstrčila horší variantu, aniž by si o ni řekli. Volba se pamatuje pod klíčem
`fpl_theme`. Jediné místo, kde tma zůstává i ve světlém režimu, je hřiště —
bílé dresy na ní vyniknou tak, jak na světlém podkladu nemůžou.

**Cloudflare a 403.** FPL sedí za Cloudflare, který začal odmítat requesty
s botím `User-Agent`. Projevovalo se to jako 403 na `/fixtures/`, zatímco
`/bootstrap-static/` ještě procházel. Proxy proto posílá hlavičky prohlížeče
včetně `Referer` a při 403 nebo 503 zkusí request ještě jednou. Pokud se to
vrátí, prvním místem k šahnutí je `BROWSER_HEADERS` v `api/fpl.js`.

**Google Fonts** se načítají z CDN. Pro provoz v EU je čistší si ty tři
rodiny (Archivo, Inter, Space Mono) stáhnout do repozitáře,
nahradit `<link>` vlastním `@font-face` a z CSP v `vercel.json` odstranit
`fonts.googleapis.com` a `fonts.gstatic.com`.

## Co appka nedělá

Nepřihlašuje se za tebe do FPL, takže nemůže provádět transfery ani měnit
sestavu — pracuje jen s veřejnými daty. Plánovač je počítadlo, ne ovladač:
samotné přestupy pořád uděláš na webu FPL.

Snapshoty miniligy a plán přestupů se ukládají do `localStorage`, tedy jen
v tom prohlížeči, kde je vytvoříš. Na jiném zařízení začínáš s prázdnou
historií. Sdílené úložiště (Vercel KV) je logický další krok, ale tohle
funguje hned a bez dalšího účtu.

Vyhledávání v porovnání hráčů seznam nefiltruje, jen vybere nejlepší shodu.
Filtrovat `<select>` znamená mazat a znovu stavět stovky `<option>` při každém
stisku klávesy — a hlavně by ti pod rukama zmizel hráč, kterého jsi právě
vybral.

Doporučení čipů appka nedělá. Dřív to byla čtvrtá sekce v Programu, ale
potřebovala načtený kádr z jiné záložky a bez něj ukazovala jen výzvu, ať
si ho člověk načte — což z ní dělalo spíš překážku než radu.
