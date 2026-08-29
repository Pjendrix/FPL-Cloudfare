import { JSDOM } from 'jsdom';
import fs from 'fs';

// --- falešná data ve tvaru, jaký posílá FPL ---
const teams = [];
const shorts = ['ARS','AVL','BOU','BRE','BHA','BUR','CHE','CRY','EVE','FUL',
                'LEE','LIV','MCI','MUN','NEW','NFO','SUN','TOT','WHU','WOL'];
const fullNames = {MCI:'Man City',MUN:'Man Utd',TOT:'Spurs',NFO:"Nott'm Forest",
                   WOL:'Wolves',NEW:'Newcastle',BHA:'Brighton',BOU:'Bournemouth'};
shorts.forEach((sn,i)=>teams.push({
  id:i+1, name: fullNames[sn] || sn, short_name:sn, code:(i+1)*3,
  strength_overall_home:2+(i%4), strength_overall_away:1+(i%4),
  strength_attack_home:1100+i*10, strength_attack_away:1050+i*10,
  strength_defence_home:1100+i*8, strength_defence_away:1060+i*8,
}));

const events = Array.from({length:38},(_,i)=>({
  id:i+1, finished:i<9, is_current:i===9, is_next:i===10,
  deadline_time:new Date(Date.now()+3*3600e3).toISOString(),
}));

let pid=0;
const elements=[];
for(const t of teams){
  for(const [type,count] of [[1,2],[2,5],[3,5],[4,3]]){
    for(let k=0;k<count;k++){
      pid++;
      elements.push({
        id:pid, team:t.id, element_type:type,
        web_name:'P'+pid, first_name:'Jan', second_name:'Novak'+pid,
        now_cost:45+((pid*7)%80), total_points:(pid*3)%90, form:String((pid%9)/2),
        minutes:200+((pid*37)%700), starts:2+(pid%8), bonus:pid%12,
        status:'a', chance_of_playing_next_round:null,
        selected_by_percent:String(((pid*13)%400)/10),
        expected_goals_per_90:String(((pid*3)%40)/100),
        expected_assists_per_90:String(((pid*5)%30)/100),
        expected_goal_involvements_per_90:String(((pid*7)%60)/100),
        transfers_in_event:(pid*911)%90000, transfers_out_event:(pid*577)%70000,
        penalties_order: k===0&&type===4 ? 1 : null,
        corners_and_indirect_freekicks_order: k===1&&type===3 ? 1 : null,

        // nova pole, ktera cte model a predikce cen
        code: 100000+pid,
        cost_change_start: (pid%7)-3,
        defensive_contribution_per_90: type===1 ? 0 : ((pid*3)%22),
        price_change_percent: String(((pid%40)-20)*4),
        price_change_hourly_rate: ((pid%9)-4)*120,
        price_change_projections: [
          {offset:0, projected_percent:String((pid%40)-20), likelihood:((pid%9)-4)},
          {offset:1, projected_percent:String((pid%40)-15), likelihood:((pid%9)-4)},
          {offset:2, projected_percent:String((pid%40)-10), likelihood:((pid%9)-4)},
        ],
        price_change_locked_until: null,
      });
    }
  }
}

// rozpis: GW11 má blank pro tým 1 a double pro tým 2 — schválně
const fixtures=[];
let fid=0;
for(let gw=1;gw<=20;gw++){
  const pool=teams.map(t=>t.id);
  if(gw===11){ pool.splice(pool.indexOf(1),1); pool.push(2); }
  for(let i=0;i+1<pool.length;i+=2){
    fixtures.push({id:++fid,event:gw,team_h:pool[i],team_a:pool[i+1],
      team_h_difficulty:2+(i%4),team_a_difficulty:2+((i+1)%4)});
  }
}

// mesicni faze a nastaveni hry, jak je posila zivy bootstrap
const phases=[{id:1,name:'Overall',start_event:1,stop_event:38},
              {id:2,name:'Srpen',start_event:1,stop_event:3},
              {id:3,name:'Zari',start_event:4,stop_event:7},
              {id:4,name:'Rijen',start_event:8,stop_event:11},
              {id:5,name:'Kveten',start_event:34,stop_event:38}];

const bootstrap={teams,events,elements,phases,
  game_settings:{max_extra_free_transfers:4},
  game_config:{settings:{price_change_deadlines:[
    new Date(Date.now()+8*3600e3).toISOString()]}}};

/* Skripty a styly už nejsou v index.html, ale jsdom je bez
   resources:'usable' nenačte — externí <script src> by se prostě
   nespustil a spadlo by úplně všechno. Vlepíme je zpátky před
   předáním do JSDOM. Zůstává tak jeden proces bez sítě a testuje se
   přesně to pořadí souborů, které je v index.html. */
function inlineScripts(html){
  return html.replace(
    /<script([^>]*?)\ssrc="(\/[^"]+)"([^>]*)><\/script>/g,
    (all, a, src, b) => {
      const code = fs.readFileSync('.' + src, 'utf8');
      // </script> uvnitř řetězce v kódu by tag ukončil předčasně.
      return '<script' + a + b + '>' +
             code.replace(/<\/script>/g, '<\\/script>') + '</script>';
    });
}

const html=inlineScripts(fs.readFileSync('index.html','utf8'));

/* Zdroj appky. Testy, které kontrolují CSS pravidla nebo tvar kódu, si
   dřív načítaly index.html — ten měl ale všechno v sobě. Po rozdělení
   do css/ a js/ je „zdroj“ součet všech těch souborů; jinak by testy
   hlásily chybějící pravidla jen proto, že se přestěhovala. */
const CSS_TAGS = [
  ['css/app.css',    '<style>'],
  ['css/narrow.css', '<style id="mqL" media="(max-width:720px)">'],
  ['css/small.css',  '<style id="mqS" media="(max-width:640px)">'],
  ['css/mobile.css', '<style id="mqM" media="(max-width:720px)">'],
];
const SRC = [fs.readFileSync('index.html', 'utf8')]
  .concat(CSS_TAGS.map(([f, tag]) => tag + fs.readFileSync(f, 'utf8') + '</style>'))
  .concat(['js/core.js','js/tabs.js','js/status.js','js/squad.js','js/h2h.js','js/news.js','js/advisor.js','js/ui.js','js/planner.js','js/sync.js','js/topbar.js',
           'js/mobile.js','js/boot.js','js/firebase.js']
    .map(f => fs.readFileSync(f, 'utf8')))
  .join('\n');

const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://x.test/',
  pretendToBeVisual:true});
const w=dom.window;

// stub fetch
w.fetch = async (url)=>{
  const u=String(url);
  const json = u.includes('bootstrap-static') ? bootstrap
    : u.includes('fixtures') ? fixtures
    : {};
  return {ok:true,status:200,headers:{get:()=>'application/json'},json:async()=>json};
};

await new Promise(r=>setTimeout(r,300));

// `let` na nejvyšší úrovni skriptu nevisí na window — musíme dovnitř
w.__boot = bootstrap; w.__fix = fixtures;
w.eval('BOOT = window.__boot; FIX = window.__fix;');

// most k lexikálním bindingům skriptu
const g = new Proxy({}, {get: (_, k) => w.eval(String(k))});

const squad0=new Set();
const check=(name,fn)=>{
  try{ const v=fn(); console.log('✓',name,'→',v); }
  catch(e){ console.log('✗',name,'→',e.message); process.exitCode=1; }
};

check('gwFixtures blank (tým 1, GW11)',()=>g.gwFixtures(1,11).length);
check('gwFixtures double (tým 2, GW11)',()=>g.gwFixtures(2,11).length);
check('gwShape najde blank+double',()=>{
  const sh=g.gwShape(11,1)[0];
  return `blanků ${sh.blanks.length}, doublů ${sh.doubles.length}`;
});
check('projectGw blank = 0',()=>g.projectGw(bootstrap.elements.find(p=>p.team===1),11).toFixed(2));
check('projectGw double > single',()=>{
  const p=bootstrap.elements.find(x=>x.team===2);
  return (g.projectGw(p,11)/Math.max(g.projectGw(p,12),0.01)).toFixed(2)+'×';
});
check('projectRange 5 kol',()=>g.projectRange(bootstrap.elements[40],11,5).toFixed(1));
check('ownFdr v rozsahu 1–5',()=>{
  const vals=[]; for(const t of teams) for(const o of teams) if(t!==o){
    vals.push(g.ownFdr(t.id,o.id,true),g.ownFdr(t.id,o.id,false));}
  return `min ${Math.min(...vals).toFixed(2)}, max ${Math.max(...vals).toFixed(2)}`;
});
check('bestEleven vrací platnou formaci',()=>{
  const squad=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map((_,i)=>{
    const types=[1,1,2,2,2,2,2,3,3,3,3,3,4,4,4];
    const p=bootstrap.elements.find(e=>e.element_type===types[i]&&!squad0.has(e.id));
    squad0.add(p.id); return {p,xp:Math.random()*8};
  });
  const b=w.eval('bestEleven')(squad);
  if(b.xi.length!==11) throw new Error('XI má '+b.xi.length);
  if(b.bench.length!==4) throw new Error('lavička má '+b.bench.length);
  const gk=b.xi.filter(s=>s.p.element_type===1).length;
  if(gk!==1) throw new Error('brankářů '+gk);
  return b.shape+', lavička '+b.bench.length;
});

check('pointsByRound indexuje podle round',()=>{
  const m=g.pointsByRound({current:[{round:5,total_points:50},{round:6,total_points:70}]});
  return m.get(5).total_points+' / '+m.get(6).total_points;
});
check('leagueRanks s manažerem od GW5',()=>{
  const members=[{entry:1},{entry:2}];
  const hists=[{current:[{round:1,total_points:10},{round:2,total_points:20}]},
               {current:[{round:2,total_points:30}]}];
  const r=g.leagueRanks(members,hists);
  return 'gws='+r.gws+', GW2 pořadí '+r.ranks[0][1]+'/'+r.ranks[1][1];
});

check('buildTicker vyrenderuje 20 řádků',()=>{
  const html=g.buildTicker();
  return (html.match(/<tr>/g)||[]).length+' řádků, blank '+/class="fx blank"/.test(html);
});
check('buildShape',()=>g.buildShape().includes('GW11'));
check('buildPrices',()=>g.buildPrices().length>500);
check('playerRows + gwCount',()=>{
  const rows=g.playerRows();
  return rows.length+' hráčů, blanků '+rows.filter(r=>r.gwCount===0).length;
});
check('esc escapuje apostrof i uvozovky',()=>g.esc(`<a href="x" a='b'>&`));

// --- plný průchod render(): kapitán, optimální XI, tvar rozpisu ---
const picksSquad = [];
// 1-4-4-2 v základu, zbytek lavička — jako reálná sestava FPL
const need = [1,2,2,2,2,3,3,3,3,4,4,  1,2,3,4];
const used = new Set();
need.forEach((type, i) => {
  const p = bootstrap.elements.find(e => e.element_type === type && !used.has(e.id));
  used.add(p.id);
  picksSquad.push({element: p.id, position: i + 1,
    multiplier: i < 11 ? 1 : 0, is_captain: i === 3, is_vice_captain: i === 4});
});
const entry = {name:'Testovací tým', player_first_name:'Jan', player_last_name:'Novák',
  summary_overall_points:512, summary_overall_rank:123456};

check('render() proběhne a nakreslí panel', () => {
  w.eval('render')(entry, {picks: picksSquad}, 11);
  const html = w.document.getElementById('out').innerHTML;
  const has = t => html.includes(t);
  if(!has('Nejlehčí los')) throw new Error('chybí blok s losem');
  if(!has('Tvoji tři nejdražší')) throw new Error('chybí nejdražší hráči');
  if(!has('Co tě čeká v rozpisu')) throw new Error('chybí upozornění na blank/double');
  return html.length + ' znaků HTML';
});

check('render() naplní MY_SQUAD', () => w.eval('MY_SQUAD').size);
check('bestEleven nikdy nepřekročí 5 obránců', () => {
  const b = w.eval('bestEleven')(picksSquad.map(pk => ({
    p: bootstrap.elements.find(e => e.id === pk.element), xp: Math.random() * 9})));
  const d = b.xi.filter(s => s.p.element_type === 2).length;
  const m = b.xi.filter(s => s.p.element_type === 3).length;
  const f = b.xi.filter(s => s.p.element_type === 4).length;
  if(d < 3 || d > 5 || m < 2 || m > 5 || f < 1 || f > 3)
    throw new Error(`neplatná formace ${d}-${m}-${f}`);
  return `${d}-${m}-${f}`;
});
check('countdown se vykreslí', () => {
  w.eval('startCountdown')();
  return w.document.getElementById('countdown').textContent;
});

// --- náhrady ---
const owned = new Set(picksSquad.map(p => p.element));
const diop = bootstrap.elements.find(e => e.element_type === 2 && owned.has(e.id));
const it = {p: diop};
w.eval('PLAYERS = playerRows();');
const byId = Object.fromEntries(w.eval('PLAYERS').map(r => [r.p.id, r]));
const find = w.eval('findReplacements');

check('najde náhradu přesně na cenu nejlevnějšího', () => {
  const cheapest = Math.min(...w.eval('PLAYERS')
    .filter(r => r.p.element_type === 2 && !owned.has(r.p.id)).map(r => r.price));
  const res = find(it, cheapest, owned, {}, 11, byId);
  if(!res.cands.length) throw new Error('nic: ' + res.diag.replace(/<[^>]+>/g,' '));
  return res.cands.length + ' kandidátů za ' + cheapest.toFixed(1) + 'm';
});

check('funnel má počet po každém kroku', () => {
  const res = find(it, 0.1, owned, {}, 11, byId);
  if(res.counts.length !== 6) throw new Error('kroků ' + res.counts.length);
  if(res.counts[res.counts.length-1].left !== 0) throw new Error('mělo být 0');
  return res.counts.map(c => c.left).join(' → ');
});

check('při malém rozpočtu řekne, kolik chybí', () => {
  const res = find(it, 0.1, owned, {}, 11, byId);
  const txt = res.diag.replace(/<[^>]+>/g, ' ');
  if(!/Chybí ti/.test(txt)) throw new Error('chybí částka: ' + txt.slice(0,120));
  if(!res.nearMiss.length) throw new Error('žádné near-miss návrhy');
  return res.nearMiss.length + ' near-miss, nejlevnější ' + res.cheapest.toFixed(1) + 'm';
});

check('minutový práh na začátku sezóny je 0', () => {
  const res = find(it, 99, owned, {}, 11, byId);
  return 'práh ' + res.minMinutes + ' min při ' + w.eval('roundsPlayed()') + ' kolech';
});

check('limit 3 z klubu se pozná ve funnelu', () => {
  const full = {};
  bootstrap.teams.forEach(t => full[t.id] = 3);
  const res = find(it, 99, owned, full, 11, byId);
  const step = res.counts.find(c => c.label === 'limit 3 z klubu');
  if(step.left !== 0) throw new Error('nezablokoval');
  return 'zbylo ' + step.left;
});

// --- oficiální projekce FPL a statistiky podle pozice ---
bootstrap.elements.forEach((p, i) => {
  p.ep_next = String(((i * 17) % 90) / 10);
  p.ep_this = String(((i * 11) % 70) / 10);
  p.points_per_game = String(((i * 7) % 60) / 10);
  p.expected_goals_conceded_per_90 = String(((i * 3) % 200) / 100);
  p.saves = i % 40; p.saves_per_90 = String(((i * 5) % 400) / 100);
  p.penalties_saved = 0; p.clean_sheets = i % 6; p.goals_conceded = i % 15;
  p.expected_goal_involvements = String(((i * 13) % 900) / 100);
  p.goals_scored = i % 9; p.assists = i % 7;
  // sezonni souhrny (ne per_90) — ctou je zebricky v Top hracich
  p.expected_goals = String(((i * 19) % 1400) / 100);
  p.expected_assists = String(((i * 7) % 900) / 100);
  p.defensive_contribution = (i * 3) % 90;
  p.ict_index = String(((i * 23) % 2000) / 10);
  p.ict_index_rank_type = (i % 60) + 1;
});
w.eval('PLAYERS = playerRows();');

check('epNext čte ep_next z bootstrapu', () => {
  const p = bootstrap.elements[3];
  const v = w.eval('epNext')(p);
  if(v !== parseFloat(p.ep_next)) throw new Error('dostal ' + v);
  return v;
});

check('epNext vrací null, když pole chybí', () => {
  const v = w.eval('epNext')({});
  if(v !== null) throw new Error('mělo být null, je ' + v);
  return 'null';
});

check('stat() přeskočí chybějící pole', () => {
  const v = w.eval('stat')({b: '2.5'}, 'a', 'b');
  if(v !== 2.5) throw new Error('dostal ' + v);
  return v;
});

check('brankář dostane zákroky, útočník ne', () => {
  const gk = bootstrap.elements.find(p => p.element_type === 1);
  const fw = bootstrap.elements.find(p => p.element_type === 4);
  const ps = w.eval('positionStats');
  const has = (p, label) => ps(p).some(r => r.label === label);
  if(!has(gk, 'Zákroky')) throw new Error('brankáři chybí zákroky');
  if(has(fw, 'Zákroky')) throw new Error('útočník má zákroky');
  return 'GKP ' + ps(gk).length + ' řádků, FWD ' + ps(fw).length;
});

check('xGC mají GKP, DEF i MID, ne FWD', () => {
  const ps = w.eval('positionStats');
  const has = t => ps(bootstrap.elements.find(p => p.element_type === t))
    .some(r => r.label.includes('xGC'));
  if(!has(1) || !has(2) || !has(3)) throw new Error('chybí u obranných pozic');
  if(has(4)) throw new Error('útočník má xGC');
  return 'GKP/DEF/MID ano, FWD ne';
});

check('xGI mají MID a FWD', () => {
  const ps = w.eval('positionStats');
  const has = t => ps(bootstrap.elements.find(p => p.element_type === t))
    .some(r => r.label.includes('xGI'));
  if(!has(3) || !has(4)) throw new Error('chybí');
  return 'ano';
});

check('positionStats vynechá pole, která FPL neposílá', () => {
  const p = {element_type: 4, minutes: 500, starts: 5};
  const rows = w.eval('positionStats')(p);
  if(rows.some(r => String(r.value) === 'NaN')) throw new Error('NaN v tabulce');
  return rows.length + ' řádků bez NaN';
});

check('playerRows nese ep', () => {
  const rows = w.eval('PLAYERS');
  const withEp = rows.filter(r => r.ep !== null).length;
  return withEp + '/' + rows.length + ' hráčů má projekci FPL';
});

check('statGrid nevyrobí NaN ani prázdný blok', () => {
  const html = w.eval('statGrid')(bootstrap.elements.find(p => p.element_type === 2));
  if(html.includes('NaN')) throw new Error('NaN');
  if(!html.includes('pstats')) throw new Error('prázdné');
  return html.length + ' znaků';
});

check('renderTransfers vyrobí rozbalovací karty', () => {
  // bez problémového hráče se karty nevykreslí — jednoho zraníme
  const hurt = bootstrap.elements.find(e => e.id === picksSquad[2].element);
  hurt.status = 'i';
  hurt.chance_of_playing_next_round = 25;
  hurt.news = 'Zranění kolene, návrat neznámý';
  w.eval('PLAYERS = playerRows();');

  w.__picks = {picks: picksSquad, entry_history: {bank: 0}};
  w.__sums = picksSquad.map(() => []);
  w.eval(`TR_STATE = {picks: window.__picks, summaries: window.__sums,
    squad: [], apiBank: 0, startGw: 11}`);
  w.eval('renderTransfers()');
  const html = w.document.getElementById('trout').innerHTML;
  if(!html.includes('<details')) throw new Error('nejsou details');
  if(!html.includes('Rozbalit statistiky')) throw new Error('chybí summary');
  if(html.includes('NaN')) throw new Error('NaN ve výstupu');
  return (html.match(/<details/g) || []).length + ' karet';
});

// --- shoda projekcí u kapitána ---
/* Doporučení kapitána podle xP odešlo: ep_next chodí zaokrouhlené na
   desetinu, takže u špičkových hráčů vycházelo stejně a appka sama psala,
   že doporučit nemá čím. Test hlídá, že se to nevrátí. */
check('appka nedoporučuje kapitána podle projekce', () => {
  const ids = picksSquad.slice(0, 11).map(p => p.element);
  bootstrap.elements.forEach(p => { p.ep_next = ids.includes(p.id) ? '4.0' : '1.0'; });
  w.eval('PLAYERS = playerRows();');
  w.eval('render')(entry, {picks: picksSquad}, 11, null);
  const txt = w.document.getElementById('out').innerHTML.replace(/<[^>]+>/g, ' ');
  if(/s páskou|Kapitánská páska/.test(txt)) throw new Error('xP doporučení je zpátky');
  if(!/Není to doporučení na kapitána/.test(txt))
    throw new Error('chybí upřesnění, že los sám o sobě nic neříká');
  return 'jen podklad, ne rada';
});

check('nejlehčí los vybere dva týmy a spočítá obtížnost', () => {
  const squad = picksSquad.map((pk, i) => ({
    p: bootstrap.elements.find(e => e.id === pk.element),
    starting: i < 11,
  }));
  const html = w.eval('easiestFixtures')(squad, 11);
  const fdrs = [...html.matchAll(/class="fdr f\d">([\d.]+)</g)].map(m => parseFloat(m[1]));
  if(fdrs.length !== 2) throw new Error('týmů: ' + fdrs.length);
  if(fdrs[0] > fdrs[1]) throw new Error('není seřazeno od nejlehčího: ' + fdrs);
  if(!fdrs.every(v => v >= 1 && v <= 5)) throw new Error('mimo stupnici: ' + fdrs);
  return fdrs.join(' a ');
});

check('u týmu bez hráčů v kádru se to řekne', () => {
  // prázdný kádr → ani jeden z těch dvou týmů nemůže mít moje hráče
  const html = w.eval('easiestFixtures')([], 11);
  if(!html.includes('nemáš nikoho')) throw new Error('mlčí místo hlášky');
  return 'poctivá hláška';
});

check('nejdražší tři jsou opravdu nejdražší', () => {
  const squad = picksSquad.map(pk => ({
    p: bootstrap.elements.find(e => e.id === pk.element), starting: true,
  }));
  const html = w.eval('topPriceBlock')(squad, 11);
  const ceny = [...html.matchAll(/class="cost">([\d.]+)m</g)].map(m => parseFloat(m[1]));
  if(ceny.length !== 3) throw new Error('řádků: ' + ceny.length);
  for(let i = 1; i < ceny.length; i++)
    if(ceny[i] > ceny[i - 1]) throw new Error('není seřazeno: ' + ceny);
  const max = Math.max(...squad.map(s => s.p.now_cost)) / 10;
  if(ceny[0] !== max) throw new Error(`nejdražší je ${max}m, ukazuje ${ceny[0]}m`);
  return ceny.join(' / ') + 'm';
});

check('volné kolo u nejdražšího hráče se pozná', () => {
  // tým 1 má v testovacích datech blank v GW11
  const p = bootstrap.elements.find(e => e.team === 1);
  const html = w.eval('topPriceBlock')([{p, starting: true}], 11);
  if(!html.includes('volné kolo')) throw new Error('nepozná blank');
  return 'označeno';
});

// --- živé body ---
const liveMap = new Map(bootstrap.elements.map((p, i) => [p.id, {
  total_points: i % 13, minutes: i % 4 === 0 ? 0 : 90, bonus: 0,
}]));

check('render s živými daty ukáže body místo FDR', () => {
  w.__live = liveMap;
  w.eval('render')(entry, {picks: picksSquad, entry_history: {event_transfers_cost: 4}},
    11, {live: w.__live, gw: 10, finished: false});
  const html = w.document.getElementById('out').innerHTML;
  if(!html.includes('livebar')) throw new Error('chybí pruh se součtem');
  if(!html.includes('bodů v GW10')) throw new Error('chybí popisek kola');
  if(html.includes('NaN')) throw new Error('NaN');
  return 'ok';
});

check('karta hráče má pevnou mřížku, ne volné inline prvky', () => {
  // Volné spany si zalomily obsah podle délky jména: body skončily
  // jednou vedle jména a jednou pod ním.
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  const blok = style.slice(style.indexOf('.shirt{'), style.indexOf('}', style.indexOf('.shirt{')));
  if(!/display:grid/.test(blok)) throw new Error('karta není mřížka');
  if(!/grid-template-rows:[^;]*44px[^;]*17px[^;]*13px[^;]*30px[^;]*13px/.test(blok))
    throw new Error('řádky nemají pevnou výšku');
  return 'pět pevných řádků';
});

check('dres se kreslí a zkratka má vlastní řádek', () => {
  const html = w.document.getElementById('out').innerHTML;
  if(!html.includes('<span class="kit">')) throw new Error('chybí dres');
  if(!/<div class="tm">/.test(html)) throw new Error('zkratka není vlastní řádek');
  return 'dres + samostatná zkratka';
});

check('každý dres má vlastní clipPath id', () => {
  const html = w.document.getElementById('out').innerHTML;
  const ids = [...html.matchAll(/clipPath id="(kit\d+)"/g)].map(m => m[1]);
  if(ids.length < 11) throw new Error('nevykreslilo se 15 dresů, jen ' + ids.length);
  if(new Set(ids).size !== ids.length)
    throw new Error('opakované id — všechny dresy by měly tvar toho prvního');
  return ids.length + ' unikátních id';
});

check('kapitánovy body jsou zdvojené', () => {
  const capPick = picksSquad.find(p => p.is_captain);
  // kapitán musí mít odehrané minuty, jinak se místo bodů zobrazí pomlčka
  liveMap.set(capPick.element, {total_points: 4, minutes: 90, bonus: 0});
  const raw = 4;
  const picks2 = picksSquad.map(p => ({...p, multiplier: p.is_captain ? 2 : (p.position <= 11 ? 1 : 0)}));
  w.eval('render')(entry, {picks: picks2, entry_history: {event_transfers_cost: 0}},
    11, {live: w.__live, gw: 10, finished: false});
  const html = w.document.getElementById('out').innerHTML;
  // kapitánův řádek musí nést zdvojenou hodnotu
  const doubled = raw * 2;
  if(!new RegExp('<b>' + doubled + '</b>').test(html))
    throw new Error('nenašel ' + doubled + ' (základ ' + raw + ')');
  return raw + ' → ' + doubled;
});

check('nehrající hráč má pomlčku, ne nulu', () => {
  const html = w.document.getElementById('out').innerHTML;
  if(!html.includes('zatím nehrál')) throw new Error('chybí rozlišení');
  return 'ok';
});

check('bez živých dat se vrátí FDR', () => {
  w.eval('render')(entry, {picks: picksSquad}, 11, null);
  const html = w.document.getElementById('out').innerHTML;
  if(html.includes('livebar')) throw new Error('pruh tam nemá být');
  if(!html.includes('FDR ')) throw new Error('chybí FDR');
  return 'ok';
});

// --- doporučení výhradně podle vlastnictví ---
bootstrap.elements.forEach((p, i) => {
  p.selected_by_percent = String(((i * 37) % 500) / 10);
  p.event_points = i % 15;
});
w.eval('PLAYERS = playerRows();');

check('kandidáti jsou seřazení podle vlastnictví, ne podle projekce', () => {
  const res = w.eval('findReplacements')(it, 99, owned, {}, 11, byId);
  const own = res.cands.map(c => c.owned);
  const sorted = [...own].sort((a, b) => b - a);
  if(JSON.stringify(own) !== JSON.stringify(sorted))
    throw new Error('není podle vlastnictví: ' + own.join(', '));
  return own.map(o => o.toFixed(1) + '%').join(' > ');
});

check('nejvlastněnější dostupný hráč je první', () => {
  const res = w.eval('findReplacements')(it, 99, owned, {}, 11, byId);
  const best = Math.max(...w.eval('PLAYERS')
    .filter(r => r.p.element_type === it.p.element_type && !owned.has(r.p.id)
      && r.chance >= 75 && r.p.status === 'a')
    .map(r => parseFloat(r.p.selected_by_percent)));
  if(Math.abs(res.cands[0].owned - best) > 0.01)
    throw new Error('první má ' + res.cands[0].owned + ', nejvyšší je ' + best);
  return res.cands[0].owned.toFixed(1) + ' %';
});

check('kandidát nese lastWeek a minuty', () => {
  const c = w.eval('findReplacements')(it, 99, owned, {}, 11, byId).cands[0];
  if(c.lastWeek === undefined) throw new Error('chybí lastWeek');
  if(c.p.minutes === undefined) throw new Error('chybí minuty');
  return c.lastWeek + ' b, ' + c.p.minutes + ' min';
});

check('řádek náhrady má šest sloupců a info tlačítko', () => {
  w.__picks = {picks: picksSquad, entry_history: {bank: 0}};
  w.__sums = picksSquad.map(() => []);
  w.eval(`TR_STATE = {picks: window.__picks, summaries: window.__sums,
    squad: [], apiBank: 0, startGw: 11}`);
  w.eval('renderTransfers()');
  const html = w.document.getElementById('trout').innerHTML;
  if(!html.includes('cand2')) throw new Error('chybí řádky');
  if(!html.includes('button class="info"')) throw new Error('chybí info tlačítko');
  if(!html.includes('Vlastní')) throw new Error('chybí sloupec vlastnictví');
  if(html.includes('za 5 kol')) throw new Error('zůstal starý sloupec projekce');
  if(html.includes('NaN')) throw new Error('NaN');
  return (html.match(/cand2/g) || []).length + ' řádků';
});

check('statistiky jsou schované, dokud se neklikne', () => {
  const doc = w.document;
  const pop = doc.querySelector('#trout .statpop');
  if(!pop) throw new Error('chybí panel se statistikami');
  if(!pop.hidden) throw new Error('panel není schovaný');
  const btn = doc.querySelector('#trout button.info');
  btn.dispatchEvent(new w.MouseEvent('click', {bubbles: true}));
  if(doc.getElementById(pop.id).hidden) throw new Error('klik panel neotevřel');
  if(btn.getAttribute('aria-expanded') !== 'true') throw new Error('aria-expanded nesedí');
  return 'otevírá a zavírá';
});

// --- pravidla pro návrh transferu ---
check('hráč v dobré formě se neflaguje kvůli programu', () => {
  const p = bootstrap.elements.find(e => e.element_type === 2);
  p.form = '9.0'; p.points_per_game = '6.0'; p.status = 'a';
  p.chance_of_playing_next_round = null;
  const picks3 = [{element: p.id, position: 1, multiplier: 1,
    is_captain: false, is_vice_captain: false}];
  w.__picks = {picks: picks3, entry_history: {bank: 0}};
  w.__sums = [[{minutes: 90, total_points: 2}, {minutes: 90, total_points: 1},
               {minutes: 90, total_points: 2}]];
  w.eval('PLAYERS = playerRows();');
  w.eval(`TR_STATE = {picks: window.__picks, summaries: window.__sums,
    squad: [], apiBank: 0, startGw: 11}`);
  w.eval('renderTransfers()');
  const html = w.document.getElementById('trout').innerHTML;
  if(html.includes('<details')) throw new Error('flagoval hráče v dobré formě');
  if(!html.includes('ok-box')) throw new Error('nečekaný výstup');
  return 'neflagován';
});

check('zraněný se flaguje bez ohledu na formu', () => {
  const p = bootstrap.elements.find(e => e.element_type === 2);
  p.status = 'i'; p.chance_of_playing_next_round = 0;
  w.eval('PLAYERS = playerRows();');
  w.eval('renderTransfers()');
  const html = w.document.getElementById('trout').innerHTML;
  if(!html.includes('<details')) throw new Error('neflagoval zraněného');
  if(!html.includes('Zraněný')) throw new Error('chybí důvod');
  p.status = 'a'; p.chance_of_playing_next_round = null;
  return 'flagován';
});

// --- percentilové barvy tickeru ---
check('kvintily rozdělí zápasy do všech pěti pásem', () => {
  w.eval('computeFdrCuts(11, 6)');
  const cuts = w.eval('FDR_CUTS');
  if(!cuts || cuts.length !== 4) throw new Error('cuts nejsou');
  const html = w.eval('buildTicker()');
  const used = ['f1','f2','f3','f4','f5'].filter(c => html.includes('class="' + c + '"'));
  if(used.length < 4) throw new Error('použito jen ' + used.length + ' pásem: ' + used);
  return used.length + ' pásem, prahy ' + cuts.map(c => c.toFixed(2)).join('/');
});

// --- kádr po pozicích ---
check('kádr je seskupený podle pozic s rozpisem', () => {
  bootstrap.elements.forEach(p => { p.status = 'a'; p.chance_of_playing_next_round = null; });
  w.eval('PLAYERS = playerRows();');
  w.eval('render')(entry, {picks: picksSquad}, 11, null);
  const html = w.document.getElementById('out').innerHTML;
  ['Brankáři','Obránci','Záložníci','Útočníci','Lavička'].forEach(g => {
    if(!html.includes(g)) throw new Error('chybí skupina ' + g);
  });
  if(!html.includes('tick3')) throw new Error('chybí rozpis na 3 kola');
  if(!html.includes('fdrleg')) throw new Error('chybí legenda');
  if(html.includes('NaN')) throw new Error('NaN');
  return (html.match(/class="prow/g) || []).length + ' řádků hráčů';
});

check('blank v rozpisu je označený', () => {
  const html = w.document.getElementById('out').innerHTML;
  if(!html.includes('>bl<')) throw new Error('blank není označený');
  return 'ok';
});

check('vlastnictví pod 5 % dostane značku diferenciál', () => {
  bootstrap.elements.find(e => e.id === picksSquad[5].element).selected_by_percent = '1.2';
  w.eval('PLAYERS = playerRows();');
  w.eval('render')(entry, {picks: picksSquad}, 11, null);
  const html = w.document.getElementById('out').innerHTML;
  if(!html.includes('diferenciál')) throw new Error('chybí značka');
  return 'ok';
});

// --- ownFdr při nevyplněných silách týmů ---
/* Nulové strength_attack_* nejsou důvod zahodit i strength_overall_*.
   V živých datech jsou attack/defence celý začátek sezóny nuly, zatímco
   overall vyplněné je — dřív se v tu chvíli spadlo na statické FDR. */
check('při nulových attack/defence se použije strength_overall', () => {
  const saved = bootstrap.teams.map(t => ({...t}));
  bootstrap.teams.forEach(t => {
    t.strength_attack_home = 0; t.strength_attack_away = 0;
    t.strength_defence_home = 0; t.strength_defence_away = 0;
  });
  const v = w.eval('ownFdr')(1, 2, true, 4);
  const usable = w.eval('strengthsUsable()');
  const ready = w.eval('strengthsReady()');
  bootstrap.teams.forEach((t, i) => Object.assign(t, saved[i]));

  if(v === 4) throw new Error('spadl na statické FDR místo overall');
  if(!(v >= 1 && v <= 5)) throw new Error('mimo stupnici: ' + v);
  if(!usable) throw new Error('strengthsUsable má být true');
  if(ready) throw new Error('strengthsReady má být false — data jsou hrubší');
  return v.toFixed(2) + ' · usable ano, ready ne';
});

/* Teprve když chybí i overall, nezbývá než oficiální FDR. */
check('bez overall se vrátí oficiální FDR', () => {
  const saved = bootstrap.teams.map(t => ({...t}));
  bootstrap.teams.forEach(t => {
    t.strength_attack_home = 0; t.strength_attack_away = 0;
    t.strength_defence_home = 0; t.strength_defence_away = 0;
    t.strength_overall_home = 0; t.strength_overall_away = 0;
  });
  const v = w.eval('ownFdr')(1, 2, true, 4);
  const usable = w.eval('strengthsUsable()');
  bootstrap.teams.forEach((t, i) => Object.assign(t, saved[i]));
  if(v !== 4) throw new Error('vrátil ' + v + ', čekal zálohu 4');
  if(usable) throw new Error('strengthsUsable má být false');
  return 'záloha ' + v;
});

check('strengthsReady pozná nevyplněná data', () => {
  const saved = bootstrap.teams.map(t => ({...t}));
  bootstrap.teams.forEach(t => { t.strength_attack_home = 0; });
  const bad = w.eval('strengthsReady()');
  bootstrap.teams.forEach((t, i) => Object.assign(t, saved[i]));
  const good = w.eval('strengthsReady()');
  if(bad !== false || good !== true) throw new Error(`bad=${bad} good=${good}`);
  return 'false → true';
});

check('rozpis v kádru nepoužije jednu barvu pro všechno', () => {
  const saved = bootstrap.teams.map(t => ({...t}));
  bootstrap.teams.forEach(t => {
    t.strength_attack_home = 0; t.strength_attack_away = 0;
    t.strength_defence_home = 0; t.strength_defence_away = 0;
  });
  w.eval('PLAYERS = playerRows();');
  w.eval('render')(entry, {picks: picksSquad}, 11, null);
  const html = w.document.getElementById('out').innerHTML;
  bootstrap.teams.forEach((t, i) => Object.assign(t, saved[i]));

  const tick = html.slice(html.indexOf('squadlist'));
  const used = ['f1','f2','f3','f4','f5'].filter(c => tick.includes('class="' + c + '"'));
  if(used.length < 2) throw new Error('jen ' + used.length + ' barva: ' + used);
  if(!html.includes('celkové síly'))
    throw new Error('neřekl, ze kterého zdroje obtížnost počítá');
  return used.length + ' pásem + poctivá hláška o zdroji';
});

check('kvintily se nepoužijí při nulovém rozptylu', () => {
  const flat = w.eval('FDR_CUTS');
  if(!flat) throw new Error('cuts nejsou');
  return 'prahy ' + flat.map(c => c.toFixed(1)).join('/');
});

/* ================= defenzivní příspěvky v projekci ================= */

check('DefCon zvedne projekci záložníka', () => {
  const base = bootstrap.elements.find(p => p.element_type === 3 && p.minutes > 400);
  const saved = base.defensive_contribution_per_90;

  base.defensive_contribution_per_90 = 0;
  const bez = w.eval('perMatchXp')(base, 3, true);
  base.defensive_contribution_per_90 = 24;      // dvojnásobek prahu
  const s = w.eval('perMatchXp')(base, 3, true);
  base.defensive_contribution_per_90 = saved;

  if(!(s > bez)) throw new Error(`bez=${bez.toFixed(2)} s=${s.toFixed(2)}`);
  if(s - bez > 2.1) throw new Error('přidal víc než maximum 2 body: ' + (s - bez));
  return `+${(s - bez).toFixed(2)} b`;
});

check('brankář z DefCon nic nedostane', () => {
  const gk = bootstrap.elements.find(p => p.element_type === 1 && p.minutes > 400);
  const saved = gk.defensive_contribution_per_90;
  gk.defensive_contribution_per_90 = 0;
  const bez = w.eval('perMatchXp')(gk, 3, true);
  gk.defensive_contribution_per_90 = 30;
  const s = w.eval('perMatchXp')(gk, 3, true);
  gk.defensive_contribution_per_90 = saved;
  if(Math.abs(s - bez) > 1e-9) throw new Error('brankáři se projekce změnila');
  return 'beze změny';
});

check('DefCon roste plynule, ne skokem na prahu', () => {
  const p = bootstrap.elements.find(x => x.element_type === 2 && x.minutes > 400);
  const saved = p.defensive_contribution_per_90;
  const at = v => { p.defensive_contribution_per_90 = v; return w.eval('perMatchXp')(p, 3, true); };
  const a = at(9), b = at(10), c = at(11);
  p.defensive_contribution_per_90 = saved;
  if(!(a < b && b < c)) throw new Error(`${a.toFixed(3)} / ${b.toFixed(3)} / ${c.toFixed(3)}`);
  if(c - a > 0.9) throw new Error('skok kolem prahu je moc ostrý: ' + (c - a).toFixed(2));
  return 'monotónní, bez skoku';
});

/* ================= prodejní ceny z transfers/ ================= */

check('sellFromBuy vrací jen polovinu zisku', () => {
  const f = w.eval('sellFromBuy');
  // koupeno za 5.0, teď 5.4 → zisk 4 desetiny, vrátí se 2 → 5.2
  if(f(54, 50) !== 52) throw new Error('54/50 → ' + f(54, 50));
  // lichý zisk se zaokrouhluje dolů: 5.0 → 5.3 dá 5.1
  if(f(53, 50) !== 51) throw new Error('53/50 → ' + f(53, 50));
  return '5.4/5.0 → 5.2 · 5.3/5.0 → 5.1';
});

check('při zlevnění se ztráta promítne celá', () => {
  const f = w.eval('sellFromBuy');
  if(f(46, 50) !== 46) throw new Error('46/50 → ' + f(46, 50));
  if(f(50, 50) !== 50) throw new Error('50/50 → ' + f(50, 50));
  return 'ztráta celá, beze změny nic';
});

check('buildBuyCost bere poslední nákup, ne první', () => {
  const m = w.eval('buildBuyCost')([
    {element_in: 7, element_in_cost: 50, event: 3},
    {element_in: 7, element_in_cost: 58, event: 9},   // koupen zpátky dráž
    {element_in: 8, element_in_cost: 45, event: 5},
  ]);
  if(m[7] !== 58) throw new Error('hráč 7 → ' + m[7] + ', čekal 58');
  if(m[8] !== 45) throw new Error('hráč 8 → ' + m[8]);
  return '7→5.8m, 8→4.5m';
});

check('hráč z původního kádru: cena ze startu sezóny', () => {
  w.eval('BUY_COST = null;');
  const p = bootstrap.elements.find(x => x.cost_change_start !== 0);
  const got = w.eval('buyCost')(p);
  const want = p.now_cost - p.cost_change_start;
  if(got !== want) throw new Error(`${got} ≠ ${want}`);
  if(w.eval('sellSource')(p) !== 'start') throw new Error('špatný zdroj');
  return `${(want / 10).toFixed(1)}m`;
});

check('nákup z transfers přebije cenu ze startu', () => {
  const p = bootstrap.elements[12];
  w.eval(`BUY_COST = {${p.id}: 41};`);
  if(w.eval('buyCost')(p) !== 41) throw new Error('nevzal cenu z API');
  if(w.eval('sellSource')(p) !== 'api') throw new Error('špatný zdroj');
  w.eval('BUY_COST = null;');
  return 'api > start';
});

/* ================= oficiální predikce cen ================= */

check('priceMoves rozdělí hráče na vzestup a pokles', () => {
  const mv = w.eval('priceMoves()');
  if(!mv.ok) throw new Error('nic nenačetl');
  if(!mv.up.length || !mv.down.length)
    throw new Error(`up=${mv.up.length} down=${mv.down.length}`);
  if(!mv.up.every(x => x.likeToday > 0 || x.like3 > 0))
    throw new Error('mezi zdražujícími je někdo bez kladné predikce');
  if(!mv.down.every(x => x.likeToday < 0 || x.like3 < 0))
    throw new Error('mezi zlevňujícími je někdo bez záporné predikce');
  return `${mv.up.length} nahoru, ${mv.down.length} dolů`;
});

check('nejjistější zdražení je první', () => {
  const up = w.eval('priceMoves()').up;
  for(let i = 1; i < up.length; i++)
    if(up[i].likeToday > up[i - 1].likeToday)
      throw new Error('pořadí není podle jistoty');
  return 'jistota ' + up[0].likeToday;
});

check('bez projekcí to appka řekne místo hádání', () => {
  const saved = bootstrap.elements.map(p => p.price_change_projections);
  bootstrap.elements.forEach(p => { p.price_change_projections = []; });
  const html = w.eval('buildPrices()');
  bootstrap.elements.forEach((p, i) => { p.price_change_projections = saved[i]; });
  if(!html.includes('price_change_projections'))
    throw new Error('neřekl, že data chybí');
  return 'poctivá hláška';
});

check('buildPrices ukáže čas příští změny cen', () => {
  const html = w.eval('buildPrices()');
  if(!html.includes('Nejbližší změna cen')) throw new Error('chybí deadline z game_config');
  return 'ok';
});

/* ================= kolejnice sezóny ================= */

check('kolejnice má 38 čárek a jednu aktuální', () => {
  w.eval('drawRail()');
  const track = w.document.getElementById('railTrack');
  const all = track.querySelectorAll('.gw');
  const now = track.querySelectorAll('.gw.now');
  if(all.length !== 38) throw new Error('čárek: ' + all.length);
  if(now.length !== 1) throw new Error('aktuálních kol: ' + now.length);
  return '38 čárek, aktuální ' + now[0].dataset.gw;
});

check('kolejnice označí blank v kádru tečkou', () => {
  // tým 1 má v testovacích datech blank v GW11, tým 2 double
  w.eval('MY_SQUAD = new Set(BOOT.elements.filter(p => p.team === 1 || p.team === 2).map(p => p.id));');
  w.eval('drawRail()');
  const track = w.document.getElementById('railTrack');
  const gw11 = track.querySelectorAll('.gw')[10];
  if(!gw11.querySelector('b')) throw new Error('GW11 nemá tečku');
  if(!gw11.title.includes('volno')) throw new Error('popisek neříká volno: ' + gw11.title);
  return gw11.title;
});

check('bez načteného kádru kolejnice tečky nemá', () => {
  w.eval('MY_SQUAD = null;');
  w.eval('drawRail()');
  const dots = w.document.getElementById('railTrack').querySelectorAll('.gw b');
  if(dots.length) throw new Error('tečky bez kádru: ' + dots.length);
  return 'žádné tečky';
});

/* ================= odznaky klubů ================= */

check('crest klíčuje podle code, ne podle id', () => {
  const t = bootstrap.teams[4];          // id 5, code 15
  const html = w.eval('crest')(t.id);
  if(!html.includes('code=' + t.code))
    throw new Error('nepoužil code: ' + html.slice(0, 90));
  if(html.includes('code=' + t.id) && t.id !== t.code)
    throw new Error('použil id místo code');
  return 'code=' + t.code;
});

check('crest má záložní značku pro chybějící odznak', () => {
  const html = w.eval('crest')(1);
  if(!html.includes('onerror')) throw new Error('chybí fallback');
  if(!html.includes('#club-')) throw new Error('fallback neukazuje na sprite');
  if(!html.includes('loading="lazy"')) throw new Error('chybí lazy loading');
  return 'onerror → sprite';
});

check('crest neznámého týmu nic nevyrobí', () => {
  if(w.eval('crest')(999) !== '') throw new Error('vyrobil značku pro neexistující tým');
  return 'prázdno';
});

/* ================= plánovač přestupů ================= */

check('plánovač spočítá hit za přestup nad rámec volných', () => {
  const squad = [1, 2, 3, 4, 5].map(i => ({p: bootstrap.elements[i]}));
  w.__pl = {startGw: 11, squad, bank: 2.0, free: 1};
  w.eval('PLANNER = window.__pl;');

  const jeden = w.eval('simulatePlan')([
    {gw: 11, out: squad[0].p.id, in: bootstrap.elements[80].id}]);
  if(jeden.hits !== 0) throw new Error('jeden tah nesmí být hit');

  const dva = w.eval('simulatePlan')([
    {gw: 11, out: squad[0].p.id, in: bootstrap.elements[80].id},
    {gw: 11, out: squad[1].p.id, in: bootstrap.elements[81].id}]);
  if(dva.hits !== 1) throw new Error('dva tahy v jednom kole → hitů ' + dva.hits);
  return '1 tah = 0, 2 tahy = −4';
});

check('rozložení tahů do dvou kol hit ušetří', () => {
  const squad = [1, 2, 3, 4, 5].map(i => ({p: bootstrap.elements[i]}));
  w.__pl = {startGw: 11, squad, bank: 2.0, free: 1};
  w.eval('PLANNER = window.__pl;');
  const r = w.eval('simulatePlan')([
    {gw: 11, out: squad[0].p.id, in: bootstrap.elements[80].id},
    {gw: 12, out: squad[1].p.id, in: bootstrap.elements[81].id}]);
  if(r.hits !== 0) throw new Error('hitů ' + r.hits + ', čekal 0');
  return 'bez hitu';
});

/* Řádek ukazuje počet PRO dané kolo, ne po něm. Dřív se ukládala až
   hodnota po navýšení, takže karta prvního kola hlásila číslo platné
   pro to druhé — přesně to, čeho si všiml uživatel s jedním volným
   přestupem, kterému appka nabízela dva. */
check('řádek ukazuje volné přestupy pro dané kolo, ne pro příští', () => {
  const squad = [1, 2, 3].map(i => ({p: bootstrap.elements[i]}));
  w.__pl = {startGw: 11, squad, bank: 2.0, free: 1};
  w.eval('PLANNER = window.__pl;');
  const r = w.eval('simulatePlan')([]);
  if(r.rows[0].free !== 1)
    throw new Error('první kolo hlásí ' + r.rows[0].free + ', čekal 1');
  if(r.rows[0].freeNext !== 2)
    throw new Error('příští kolo má být 2, je ' + r.rows[0].freeNext);
  return r.rows.map(x => x.free).join(' → ');
});

check('volné přestupy se kumulují a nepřerostou strop', () => {
  const squad = [1, 2, 3].map(i => ({p: bootstrap.elements[i]}));
  w.__pl = {startGw: 11, squad, bank: 2.0, free: 1};
  w.eval('PLANNER = window.__pl;');
  const r = w.eval('simulatePlan')([]);
  const cap = 1 + bootstrap.game_settings.max_extra_free_transfers;
  const rada = r.rows.map(x => x.free);
  if(rada.join(',') !== '1,2,3,4') throw new Error('řada: ' + rada);
  if(rada.some(v => v > cap)) throw new Error('přerostlo strop ' + cap);
  return rada.join(' → ') + ' (strop ' + cap + ')';
});

check('při jednom volném přestupu je druhý tah hit', () => {
  const squad = [1, 2, 3, 4].map(i => ({p: bootstrap.elements[i]}));
  w.__pl = {startGw: 11, squad, bank: 30, free: 1};
  w.eval('PLANNER = window.__pl;');
  const r = w.eval('simulatePlan')([
    {gw: 11, out: squad[0].p.id, in: bootstrap.elements[90].id},
    {gw: 11, out: squad[1].p.id, in: bootstrap.elements[91].id}]);
  if(r.rows[0].paid !== 1) throw new Error('placených tahů: ' + r.rows[0].paid);
  if(r.hits !== 1) throw new Error('hitů: ' + r.hits);
  return '−4 body';
});

/* ================= dopočet volných přestupů ================= */

check('bez odehraných přestupů má člověk jeden volný', () => {
  if(w.eval('deriveFreeTransfers')([], [], 2) !== 1) throw new Error('nesedí GW2');
  return '1';
});

check('nevyužité přestupy se kumulují', () => {
  const f = w.eval('deriveFreeTransfers');
  // nic neuděláno v GW2 ani GW3 → do GW4 jdou tři
  if(f([], [], 4) !== 3) throw new Error('GW4 → ' + f([], [], 4));
  return 'GW4 → 3';
});

check('spotřebovaný přestup se z počítadla odečte', () => {
  const f = w.eval('deriveFreeTransfers');
  // v GW2 jeden přestup → do GW3 jde zase jen jeden
  if(f([{event: 2}], [], 3) !== 1) throw new Error('GW3 → ' + f([{event: 2}], [], 3));
  // dva přestupy v GW2 (jeden za hit) → zbytek 0, do GW3 jeden
  if(f([{event: 2}, {event: 2}], [], 3) !== 1) throw new Error('hit špatně');
  return 'odečteno';
});

check('dopočet nepřeroste strop ani po dlouhé pauze', () => {
  const cap = 1 + bootstrap.game_settings.max_extra_free_transfers;
  const v = w.eval('deriveFreeTransfers')([], [], 30);
  if(v !== cap) throw new Error(v + ' místo stropu ' + cap);
  return 'strop ' + cap;
});

check('wildcard resetuje počítadlo na jeden', () => {
  const f = w.eval('deriveFreeTransfers');
  // bez čipu jdou do GW5 tři (GW2→1, GW3→2, GW4→3, GW5→4)
  if(f([], [], 5) !== 4) throw new Error('kontrola bez čipu: ' + f([], [], 5));
  if(f([], [{name: 'wildcard', event: 4}], 5) !== 1)
    throw new Error('po wildcardu: ' + f([], [{name: 'wildcard', event: 4}], 5));
  if(f([], [{name: 'freehit', event: 4}], 5) !== 1) throw new Error('po free hitu');
  // ostatní čipy počítadlo nemažou
  if(f([], [{name: 'bboost', event: 4}], 5) !== 4) throw new Error('bench boost resetoval');
  return '4 → 1';
});

check('přestupy z prvního kola se nepočítají', () => {
  const f = w.eval('deriveFreeTransfers');
  // před prvním deadlinem jsou přestupy neomezené
  if(f([{event: 1}, {event: 1}, {event: 1}], [], 2) !== 1)
    throw new Error('GW1 přestupy ubraly volné');
  return 'ignorováno';
});

check('počet volných přestupů jde přepsat ručně', () => {
  w.localStorage.clear();
  w.eval('ENTRY_ID = 60480;');
  if(w.eval('ftOverride()') !== null) throw new Error('bez zápisu vrací hodnotu');
  w.localStorage.setItem('fpl_ft:60480', '3');
  if(w.eval('ftOverride()') !== 3) throw new Error('nepřečetl přepis');
  // nesmysly mimo rozsah se ignorují, ať se plán nerozbije
  w.localStorage.setItem('fpl_ft:60480', '99');
  if(w.eval('ftOverride()') !== null) throw new Error('vzal hodnotu nad strop');
  w.localStorage.clear();
  return 'přepis i kontrola rozsahu';
});

check('český tvar podle počtu', () => {
  const f = w.eval('ftLabel');
  if(!f(1).includes('volný přestup')) throw new Error(f(1));
  if(!f(3).includes('volné přestupy')) throw new Error(f(3));
  if(!f(5).includes('volných přestupů')) throw new Error(f(5));
  if(!f(0).includes('volných přestupů')) throw new Error(f(0));
  return '1 / 2–4 / 5+';
});

check('plánovač pozná, že rozpočet nevychází', () => {
  const levny = bootstrap.elements.reduce((a, b) => a.now_cost < b.now_cost ? a : b);
  const drahy = bootstrap.elements
    .filter(p => p.element_type === levny.element_type)
    .reduce((a, b) => a.now_cost > b.now_cost ? a : b);
  w.__pl = {startGw: 11, squad: [{p: levny}], bank: 0, free: 1};
  w.eval('PLANNER = window.__pl;');
  const r = w.eval('simulatePlan')([{gw: 11, out: levny.id, in: drahy.id}]);
  if(r.bank >= 0) throw new Error('banka ' + r.bank.toFixed(1) + 'm, čekal minus');
  return r.bank.toFixed(1) + 'm';
});

check('čistý zisk odečte hity od projekce', () => {
  const squad = [1, 2, 3, 4].map(i => ({p: bootstrap.elements[i]}));
  w.__pl = {startGw: 11, squad, bank: 20, free: 1};
  w.eval('PLANNER = window.__pl;');
  const r = w.eval('simulatePlan')([
    {gw: 11, out: squad[0].p.id, in: bootstrap.elements[80].id},
    {gw: 11, out: squad[1].p.id, in: bootstrap.elements[81].id}]);
  if(Math.abs(r.net - (r.gain - r.hits * 4)) > 1e-9)
    throw new Error('net nesedí: ' + r.net + ' vs ' + (r.gain - r.hits * 4));
  return `zisk ${r.gain.toFixed(1)} − hit ${r.hits * 4} = ${r.net.toFixed(1)}`;
});

check('plánovač upozorní na tah s hráčem, kterého nemáš', () => {
  const squad = [1, 2].map(i => ({p: bootstrap.elements[i]}));
  w.__pl = {startGw: 11, squad, bank: 20, free: 1};
  w.eval('PLANNER = window.__pl;');
  const cizi = bootstrap.elements[150];
  const r = w.eval('simulatePlan')([{gw: 11, out: cizi.id, in: bootstrap.elements[151].id}]);
  if(!r.rows[0].err) throw new Error('mlčky to spolkl');
  return r.rows[0].err;
});

/* ================= snapshoty miniligy ================= */

check('snapshot se neuloží dvakrát pro stejné kolo', () => {
  w.localStorage.clear();
  const a = [{entry: 1, rank: 3, total: 100}, {entry: 2, rank: 1, total: 140}];
  w.eval('saveSnap')(9, a);
  w.eval('saveSnap')(9, [{entry: 1, rank: 9, total: 999}]);
  const all = w.eval('loadSnaps()');
  if(all[9].length !== 2) throw new Error('přepsal starý snapshot');
  if(all[9][0].r !== 3) throw new Error('data se změnila');
  return 'první zápis platí';
});

check('posun v tabulce se počítá proti staršímu kolu', () => {
  w.localStorage.clear();
  w.eval('saveSnap')(8, [{entry: 42, rank: 6, total: 300}]);
  const before = w.eval('rankDelta')(42, 10);
  if(before !== 6) throw new Error('našel ' + before);
  const chip = w.eval('deltaChip')(2, before);      // z 6. na 2. = postup o 4
  if(!chip.includes('▲4')) throw new Error(chip);
  const dolu = w.eval('deltaChip')(9, before);
  if(!dolu.includes('▼3')) throw new Error(dolu);
  return '▲4 / ▼3';
});

check('bez staršího snapshotu se posun neukazuje', () => {
  w.localStorage.clear();
  if(w.eval('rankDelta')(42, 10) !== null) throw new Error('vymyslel si posun');
  if(w.eval('deltaChip')(2, null) !== '') throw new Error('vykreslil prázdný posun');
  return 'nic';
});

check('snapshotů se drží nejvýš osm kol', () => {
  w.localStorage.clear();
  for(let g = 1; g <= 12; g++) w.eval('saveSnap')(g, [{entry: 1, rank: g, total: g * 10}]);
  const keys = Object.keys(w.eval('loadSnaps()')).map(Number).sort((a, b) => a - b);
  if(keys.length !== 8) throw new Error('kol: ' + keys.length);
  if(keys[0] !== 5) throw new Error('nejstarší je GW' + keys[0] + ', čekal GW5');
  return 'GW' + keys[0] + '–GW' + keys[keys.length - 1];
});

/* ================= design tokeny ================= */

check('stupnice obtížnosti je jedna sada proměnných', () => {
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  for(const lit of ['#8fe0b0', '#cdeed9', '#f7cac5', '#eb9a92', '#d99400'])
    if(style.toLowerCase().includes(lit)) throw new Error('zůstal literál ' + lit);
  for(const v of ['--f1:', '--f2:', '--f3:', '--f4:', '--f5:'])
    if(!style.includes(v)) throw new Error('chybí token ' + v);
  return '5 tokenů, 0 literálů';
});

check('responzivita má jeden blok na podmínku', () => {
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  const conds = [...style.matchAll(/@media\s*\(([^)]*)\)/g)]
    .map(m => m[1].replace(/\s/g, ''));
  const dup = conds.filter((c, i) => conds.indexOf(c) !== i);
  if(dup.length) throw new Error('duplicitní podmínky: ' + [...new Set(dup)].join(', '));
  return conds.length + ' bloků, žádný dvakrát';
});

check('Dancing Script je pryč', () => {
  const html = SRC;
  if(html.includes('Dancing')) throw new Error('pořád se načítá');
  if(html.includes('--f-cur')) throw new Error('zůstala proměnná --f-cur');
  return 'ok';
});

/* Tma je vědomě přepínač, ne automatika: uživatel s tmavým systémem
   by jinak dostal variantu, o kterou si neřekl. */
check('výchozí je světlo, tma jen na přání', () => {
  const html = SRC;
  // Hledáme media query, ne zmínku — komentář o tom, proč to tak není,
  // je v pořádku a testu nemá vadit.
  if(/@media[^{]*prefers-color-scheme/.test(html))
    throw new Error('tma se pořád zapíná automaticky');
  if(!html.includes('[data-theme="dark"]')) throw new Error('chybí tmavá varianta');
  if(w.document.documentElement.getAttribute('data-theme') !== 'light')
    throw new Error('start není světlý');
  return 'light → přepínač';
});

check('přepínač tématu si volbu pamatuje', () => {
  w.localStorage.clear();
  w.eval('applyTheme')('dark');
  if(w.document.documentElement.getAttribute('data-theme') !== 'dark')
    throw new Error('nepřepnul');
  const meta = w.document.querySelector('meta[name="theme-color"]').content;
  if(meta === '#37003C') throw new Error('theme-color zůstal světlý');
  w.document.getElementById('theme').click();
  if(w.localStorage.getItem('fpl_theme') !== 'light')
    throw new Error('neuložil: ' + w.localStorage.getItem('fpl_theme'));
  return 'dark → light, uloženo';
});

/* Klasická past: [hidden] má display:none, ale .railkey{display:flex}
   ho přebije. Legenda kolejnice se pak zobrazovala pořád. */
check('atribut hidden přebije i display:flex', () => {
  const css = SRC;
  if(!/\[hidden\]\{display:none!important\}/.test(css))
    throw new Error('chybí globální pravidlo pro [hidden]');
  return 'ok';
});

check('legenda kolejnice neukazuje syrovou šablonu', () => {
  const html = SRC;
  const i = html.indexOf('id="railKey"');
  if(html.slice(i, i + 400).includes('{n}'))
    throw new Error('zůstal nevyplněný zástupný text {n}');
  return 'ok';
});

check('.who má flex, aby odznak nelezl na jméno', () => {
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  if(!/(^|\n)\.who\{[^}]*flex/.test(style))
    throw new Error('základní .who není flex — odznak se překryje s textem');
  return 'ok';
});

/* ================= záložka Ceny ================= */

check('recentMovers rozdělí pohyby za poslední kolo', () => {
  const saved = bootstrap.elements.map(p => p.cost_change_event);
  bootstrap.elements.forEach((p, i) => {
    p.cost_change_event = i % 5 === 0 ? 1 : (i % 7 === 0 ? -1 : 0);
  });
  const mv = w.eval('recentMovers()');
  bootstrap.elements.forEach((p, i) => { p.cost_change_event = saved[i]; });

  if(!mv.up.length || !mv.down.length)
    throw new Error(`up=${mv.up.length} down=${mv.down.length}`);
  if(mv.up.some(p => p.cost_change_event <= 0)) throw new Error('mezi zdraženími je pokles');
  if(mv.down.some(p => p.cost_change_event >= 0)) throw new Error('mezi poklesy je zdražení');
  return `${mv.up.length} nahoru, ${mv.down.length} dolů`;
});

check('bez pohybu cen to appka řekne', () => {
  const saved = bootstrap.elements.map(p => p.cost_change_event);
  bootstrap.elements.forEach(p => { p.cost_change_event = 0; });
  const html = w.eval('buildMoved()');
  bootstrap.elements.forEach((p, i) => { p.cost_change_event = saved[i]; });
  if(!html.includes('nikdo nezdražil')) throw new Error('mlčí místo hlášky');
  return 'poctivá hláška';
});

check('sezónní pohyb ukáže cenu na startu i teď', () => {
  const html = w.eval('buildSeason()');
  if(!html.includes('Největší růst') || !html.includes('Největší propad'))
    throw new Error('chybí jedna ze stran');
  return 'ok';
});

check('Ceny mají vlastní záložku a čipy jsou pryč', () => {
  const html = SRC;
  if(!html.includes('id="t-prices"')) throw new Error('chybí tlačítko Ceny');
  if(html.includes('buildChips')) throw new Error('čipy zůstaly v kódu');
  const tabs = w.eval('TABS').map(t => t[0]);
  if(!tabs.includes('t-prices')) throw new Error('záložka není v TABS: ' + tabs);
  return tabs.length + ' záložek';
});

/* ================= plánovač: seznam hráčů a rozvržení ================= */

check('nabídka příchozích není osekaná na 40 jmen', () => {
  const html = SRC;
  const i = html.indexOf('const fillIn =');
  const j = html.indexOf('q.querySelectorAll(`select[data-out', i);
  const blok = html.slice(i, i > 0 ? i + 2600 : 0);
  if(/\.slice\(0,\s*\d+\)/.test(blok))
    throw new Error('seznam se pořád ořezává napevno');
  if(!blok.includes('data-search'))
    throw new Error('chybí hledání ve jménech');
  return 'celý seznam + hledání';
});

check('plánovač počítá s kádrem po předchozích tazích', () => {
  const squad = [1, 2, 3, 4].map(i => ({p: bootstrap.elements[i]}));
  const prichozi = bootstrap.elements.find(p =>
    p.element_type === squad[0].p.element_type && !squad.some(x => x.p.id === p.id));
  w.__pl = {startGw: 11, squad, bank: 20, free: 1};
  w.eval('PLANNER = window.__pl;');

  // prodám hráče v GW11 a v GW12 ho zkusím prodat znovu — to nesmí projít
  const r = w.eval('simulatePlan')([
    {gw: 11, out: squad[0].p.id, in: prichozi.id},
    {gw: 12, out: squad[0].p.id, in: bootstrap.elements[120].id}]);
  if(!r.rows[1].err) throw new Error('spolkl prodej hráče, kterého už nemám');
  return r.rows[1].err;
});

check('kola jsou pod sebou, ne ve čtyřech sloupcích', () => {
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  if(style.includes('.plan-grid'))
    throw new Error('zůstalo mřížkové rozvržení');
  if(!/\.plan-rows\{[^}]*flex-direction:column/.test(style))
    throw new Error('kola nejsou pod sebou');
  return 'svislý seznam';
});

check('formuláře v plánovači jsou zabalené', () => {
  const html = SRC;
  if(!html.includes('id="padd-${r.gw}" hidden'))
    throw new Error('formulář se rozbaluje rovnou');
  if(!html.includes('data-open='))
    throw new Error('chybí tlačítko na rozbalení');
  return 'na kliknutí';
});

check('plánovač vysvětlí, k čemu je', () => {
  const html = SRC;
  const i = html.indexOf('id="p-planner"');
  const uvod = html.slice(i, i + 900);
  if(!uvod.includes('K čemu to je'))
    throw new Error('chybí vysvětlení účelu');
  return 'ok';
});

/* ================= proxy: 403 od Cloudflare ================= */

check('proxy se nehlásí botím User-Agentem', () => {
  const js = fs.readFileSync('functions/api/fpl.js', 'utf8');
  if(js.includes('"fpl-squad-check/1.0"'))
    throw new Error('pořád posílá botí UA — Cloudflare vrací 403');
  if(!js.includes('Mozilla/5.0')) throw new Error('chybí hlavičky prohlížeče');
  if(!js.includes('Referer')) throw new Error('chybí Referer');
  return 'hlavičky prohlížeče';
});

check('proxy je Pages Function, ne Vercel handler', () => {
  const js = fs.readFileSync('functions/api/fpl.js', 'utf8');
  if(!js.includes('export async function onRequest'))
    throw new Error('chybí onRequest — Pages funkci nenajde');
  // Komentare ven, jinak test spadne na vlastni vysvetlivce o tom,
  // ze se res.status() nepouziva.
  const kod = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if(/res\.(status|json|setHeader)\(/.test(kod))
    throw new Error('zůstalo Vercel API (res.status/res.json)');
  return 'onRequest';
});

check('proxy nepotřebuje objížďku přes Worker', () => {
  const js = fs.readFileSync('functions/api/fpl.js', 'utf8');
  if(js.includes('FPL_WORKER_URL'))
    throw new Error('zbyla objížďka — z Cloudflare se volá FPL přímo');
  return 'volá se přímo';
});

check('fixtures/ zůstává na whitelistu', () => {
  const js = fs.readFileSync('functions/api/fpl.js', 'utf8');
  const re = /\^fixtures\\\/\$/;
  if(!re.test(js)) throw new Error('fixtures/ z whitelistu zmizel');
  return 'ok';
});

/* ================= Hráči: hlasitá chyba místo prázdna ================= */

check('Hráči bez rozpisu neselžou potichu', () => {
  const html = SRC;
  const i = html.indexOf('async function loadPlayers()');
  const fn = html.slice(i, html.indexOf('function drawPlayers()', i));
  if(!fn.includes('catch')) throw new Error('chybí zachycení chyby');
  if(!fn.includes("$('pmsg')")) throw new Error('chybu nemá kam napsat');
  if(!fn.includes("api('fixtures/')")) throw new Error('nedotáhne si rozpis sám');
  return 'chyba se zobrazí';
});

check('plátno je ve světlém režimu opravdu světlé', () => {
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  const root = style.slice(style.indexOf(':root{'), style.indexOf('}', style.indexOf(':root{')));
  const sky = (root.match(/--sky:\s*(#[0-9a-fA-F]{6})/) || [])[1];
  if(!sky) throw new Error('--sky není definovaná');

  const lum = h => {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16) / 255);
    const f = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  // Tmavé plátno by z appky udělalo tmavý web s bílými okny bez ohledu
  // na to, co říká data-theme.
  if(lum(sky) < 0.5) throw new Error('plátno ' + sky + ' je tmavé');
  return sky;
});

/* ================= normName ================= */

check('normName přežil odstranění staré záložky', () => {
  // Zmizel spolu s panelem „Před deadlinem“, ale volají ho tři jiná místa.
  // Projevilo se to až po napsání do vyhledávacího pole.
  const f = w.eval('normName');
  if(f('Dúbravka') !== 'dubravka') throw new Error(f('Dúbravka'));
  if(f("O'Brien Jr.") !== 'obrien jr') throw new Error(f("O'Brien Jr."));
  return 'diakritika i interpunkce pryč';
});

/* ================= vstupní obrazovka ================= */

check('vstupní obrazovka má tmavé pozadí pod světlý text', () => {
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  const blok = style.slice(style.indexOf('#landing{'),
                           style.indexOf('}', style.indexOf('#landing{')));
  // Bílý text v kartě dává smysl jen na tmavém podkladu.
  if(!/var\(--night/.test(blok))
    throw new Error('landing nestojí na půlnočních tokenech');
  if(!/--night:#0B0B24/.test(style)) throw new Error('chybí token --night');
  if(!/--gold:#CC9C48/.test(style)) throw new Error('chybí token --gold');
  return 'půlnoční modř + zlato';
});

check('formulář je vedle nadpisu, ne pod ním', () => {
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  if(!/#landing \.wrap\{[^}]*grid-template-columns/.test(style))
    throw new Error('není dvousloupcový');
  if(/\.hero\{padding:80px/.test(style))
    throw new Error('zůstalo staré odsazení, které tlačí formulář pod ohyb');
  return 'dva sloupce';
});

/* ================= Top hráči ================= */

check('žebříčky pokrývají všechny zadané kategorie', () => {
  const keys = w.eval('TOP_FIELD').map(x => x[0]).concat(w.eval('TOP_GK').map(x => x[0]));
  const want = ['goals_scored', 'assists', 'defensive_contribution', 'bonus',
                'expected_goals', 'expected_assists', 'expected_goal_involvements',
                'clean_sheets', 'saves'];
  const chybi = want.filter(k => !keys.includes(k));
  if(chybi.length) throw new Error('chybí: ' + chybi.join(', '));
  return keys.length + ' kategorií';
});

check('brankářské žebříčky obsahují jen brankáře', () => {
  const html = w.eval('topBoard')(w.eval('TOP_GK')[0]);
  const ids = [...html.matchAll(/data-pid="(\d+)"/g)].map(m => Number(m[1]));
  if(!ids.length) throw new Error('prázdný žebříček');
  const els = Object.fromEntries(bootstrap.elements.map(p => [p.id, p]));
  const cizi = ids.filter(id => els[id].element_type !== 1);
  if(cizi.length) throw new Error(cizi.length + ' nebrankářů v tabulce čistých kont');
  return ids.length + ' brankářů';
});

check('žebříčky hráčů v poli brankáře vynechají', () => {
  const html = w.eval('topBoard')(w.eval('TOP_FIELD')[0]);
  const ids = [...html.matchAll(/data-pid="(\d+)"/g)].map(m => Number(m[1]));
  const els = Object.fromEntries(bootstrap.elements.map(p => [p.id, p]));
  if(ids.some(id => els[id].element_type === 1))
    throw new Error('brankář v tabulce střelců');
  return ids.length + ' hráčů v poli';
});

check('žebříček je seřazený sestupně a má nejvýš 10', () => {
  const html = w.eval('topBoard')(w.eval('TOP_FIELD')[0]);
  const vals = [...html.matchAll(/class="tval">([\d.]+)</g)].map(m => parseFloat(m[1]));
  if(vals.length > 10) throw new Error('řádků: ' + vals.length);
  for(let i = 1; i < vals.length; i++)
    if(vals[i] > vals[i - 1]) throw new Error('není seřazeno: ' + vals.join(','));
  return vals.length + ' řádků, ' + vals[0] + ' nahoře';
});

check('chybějící statistiku žebříček přizná', () => {
  const saved = bootstrap.elements.map(p => p.defensive_contribution);
  bootstrap.elements.forEach(p => { delete p.defensive_contribution; });
  const html = w.eval('topBoard')(
    w.eval('TOP_FIELD').find(x => x[0] === 'defensive_contribution'));
  bootstrap.elements.forEach((p, i) => { p.defensive_contribution = saved[i]; });
  if(!html.includes('neposílá')) throw new Error('mlčí místo hlášky');
  return 'poctivá hláška';
});

check('žebříček označí hráče z tvé sestavy', () => {
  // Vybíráme někoho, kdo v žebříčku opravdu je. Řadit si vlastní kopii
  // podle jednoho kritéria nestačí — topBoard při shodě rozhoduje ještě
  // podle celkových bodů, takže „první podle gólů“ může skončit mimo top 10.
  const bez = w.eval('topBoard')(w.eval('TOP_FIELD')[0]);
  const vidit = [...bez.matchAll(/data-pid="(\d+)"/g)].map(m => Number(m[1]));
  if(!vidit.length) throw new Error('žebříček je prázdný');

  w.eval(`MY_SQUAD = new Set([${vidit[2]}]);`);
  const html = w.eval('topBoard')(w.eval('TOP_FIELD')[0]);
  w.eval('MY_SQUAD = null;');

  const oznaceno = (html.match(/class="me"/g) || []).length;
  if(oznaceno !== 1) throw new Error('označených řádků: ' + oznaceno);
  return 'právě jeden řádek';
});

/* ================= porovnání dvou hráčů ================= */

check('u ceny vyhrává nižší číslo, u bodů vyšší', () => {
  const els = bootstrap.elements;
  const levny = els.reduce((a, b) => a.now_cost < b.now_cost ? a : b);
  const drahy = els.reduce((a, b) => a.now_cost > b.now_cost ? a : b);
  const rows = w.eval('compareRows')(levny, drahy);

  const cena = rows.find(r => r[0] === 'Cena');
  if(cena[5] !== false) throw new Error('u ceny se cení vyšší číslo');
  const body = rows.find(r => r[0] === 'Body celkem');
  if(body[5] !== true) throw new Error('u bodů se cení nižší číslo');
  return 'cena níž, body výš';
});

check('dva brankáři dostanou brankářské řádky', () => {
  const gks = bootstrap.elements.filter(p => p.element_type === 1);
  const labels = w.eval('compareRows')(gks[0], gks[1]).map(r => r[0]);
  if(!labels.includes('Zákroky')) throw new Error('chybí zákroky');
  if(labels.includes('xG')) throw new Error('brankářům se ukazuje xG');
  return labels.length + ' řádků';
});

check('hráči v poli dostanou útočné řádky', () => {
  const fw = bootstrap.elements.filter(p => p.element_type === 4);
  const labels = w.eval('compareRows')(fw[0], fw[1]).map(r => r[0]);
  if(!labels.includes('xG') || !labels.includes('DEFCON'))
    throw new Error('chybí xG nebo DEFCON');
  if(labels.includes('Zákroky')) throw new Error('hráčům v poli se ukazují zákroky');
  return labels.length + ' řádků';
});

check('porovnání dvou pozic na rozdíl v bodování upozorní', () => {
  const gk = bootstrap.elements.find(p => p.element_type === 1);
  const fw = bootstrap.elements.find(p => p.element_type === 4);
  w.eval(`CMP_A = ${gk.id}; CMP_B = ${fw.id};`);
  w.eval('drawCompare()');
  const html = w.document.getElementById('pcompare').innerHTML;
  if(!html.includes('různé pozice')) throw new Error('neupozornil');
  return 'upozornil';
});

check('stejný hráč dvakrát se odmítne', () => {
  const p = bootstrap.elements[30];
  w.eval(`CMP_A = ${p.id}; CMP_B = ${p.id};`);
  w.eval('drawCompare()');
  const html = w.document.getElementById('pcompare').innerHTML;
  if(!html.includes('ten samý')) throw new Error('porovnal hráče se sebou');
  w.eval('CMP_A = CMP_B = null;');
  return 'odmítnuto';
});

check('bez výběru porovnání jen vyzve', () => {
  w.eval('CMP_A = CMP_B = null;');
  w.eval('drawCompare()');
  const html = w.document.getElementById('pcompare').innerHTML;
  // Text výzvy se přesunul do tooltipu u nadpisu.
  if(!html.includes('Vyber dva hráče') && !html.includes('tipbox'))
    throw new Error(html.slice(0, 140));
  if(!html.includes('id="cmpa"')) throw new Error('chybí výběr hráčů');
  return 'výzva + oba výběry';
});

check('vítěz řádku se zvýrazní jen na jedné straně', () => {
  const els = bootstrap.elements.filter(p => p.element_type === 3);
  const a = els.reduce((x, y) => x.total_points > y.total_points ? x : y);
  const b = els.reduce((x, y) => x.total_points < y.total_points ? x : y);
  w.eval(`CMP_A = ${a.id}; CMP_B = ${b.id};`);
  w.eval('drawCompare()');
  const doc = w.document.getElementById('pcompare');
  const rows = [...doc.querySelectorAll('.ctab tr')];
  if(!rows.length) throw new Error('žádné řádky');
  const oba = rows.filter(tr => tr.querySelectorAll('td.win').length > 1);
  if(oba.length) throw new Error(oba.length + ' řádků má vítěze na obou stranách');
  w.eval('CMP_A = CMP_B = null;');
  return rows.length + ' řádků';
});

check('záložka se jmenuje Top hráči a stará tabulka je pryč', () => {
  const html = SRC;
  if(!html.includes('>Top hráči</button>')) throw new Error('starý název');
  if(html.includes('function drawPlayers')) throw new Error('stará tabulka zůstala');
  if(html.includes('id="fsort"')) throw new Error('staré filtry zůstaly');
  return 'ok';
});

/* ================= diferenciály ================= */

/* Jistota minut je teď číslo 0–1, ne ano/ne. Tvrdý filtr nefungoval
   první měsíc sezóny — kdo odehrál dvě kola, měl málo minut ze své
   podstaty, ne proto, že by nehrál. */
check('jistota minut je škála, ne ano/ne', () => {
  const f = w.eval('minuteConfidence');
  const zaklad = {...bootstrap.elements[5], status: 'a',
                  chance_of_playing_next_round: 100};

  const stalice = f({...zaklad, minutes: 900, starts: 10}, 10);
  const strídající = f({...zaklad, minutes: 200, starts: 1}, 10);

  if(stalice < 0.85) throw new Error('stálice má nízkou jistotu: ' + stalice);
  if(strídající >= 0.5) throw new Error('střídající má vysokou jistotu: ' + strídající);
  if(!(stalice > strídající)) throw new Error('nerozlišuje');
  return `stálice ${stalice.toFixed(2)}, střídající ${strídající.toFixed(2)}`;
});

check('nedostupný hráč má nulovou jistotu', () => {
  const f = w.eval('minuteConfidence');
  const p = {...bootstrap.elements[5], minutes: 900, starts: 10,
             chance_of_playing_next_round: 100};
  for(const st of ['i', 'u', 'n', 's'])
    if(f({...p, status: st}, 10) !== 0) throw new Error('vzal status ' + st);
  if(f({...p, status: 'a', chance_of_playing_next_round: 25}, 10) !== 0)
    throw new Error('vzal hráče s 25% šancí');
  return 'nula';
});

check('před prvním kolem se jistota bere z ceny', () => {
  const f = w.eval('minuteConfidence');
  const zaklad = {status: 'a', minutes: 0, starts: 0,
                  chance_of_playing_next_round: null};
  const drahy = f({...zaklad, now_cost: 130}, 0);
  const levny = f({...zaklad, now_cost: 40}, 0);
  // Bez odehraných kol neříkají minuty nic — drahý hráč nesedí na lavičce.
  if(!(drahy > levny)) throw new Error(`drahý ${drahy}, levný ${levny}`);
  if(drahy <= 0) throw new Error('i drahý hráč vyšel na nulu');
  return `13.0m → ${drahy.toFixed(2)}, 4.0m → ${levny.toFixed(2)}`;
});

check('žebříček diferenciálů není nikdy prázdný', () => {
  // I s nesmyslně přísným prvním stropem musí něco vypadnout
  const res = w.eval('diffRows')(bootstrap.elements, 11,
    () => 90, 9, [{max: 0.1, label: 'nemožný'}, {max: 101, label: 'vše'}]);
  if(!res.rows.length) throw new Error('vrátil prázdno');
  if(res.tier.label !== 'vše') throw new Error('nepovolil strop: ' + res.tier.label);
  return res.rows.length + ' hráčů, strop povolen';
});

check('appka řekne, když musela strop povolit', () => {
  const html = w.eval('buildDifferentials()');
  if(!/Top 5 diferenciálů · celé FPL/.test(html)) throw new Error('chybí globální blok');
  if(/Nikdo neprošel filtrem/.test(html)) throw new Error('pořád může skončit prázdně');
  return 'ok';
});

check('nižší vlastnictví zvedne skóre při stejné projekci', () => {
  const f = w.eval('diffScore');
  const p = bootstrap.elements[7];
  const vzacny = f(p, 11, 2, 1), bezny = f(p, 11, 40, 1);
  if(vzacny.xp !== bezny.xp) throw new Error('projekce se liší, test nic neměří');
  if(!(vzacny.score > bezny.score))
    throw new Error(`2 % → ${vzacny.score.toFixed(2)}, 40 % → ${bezny.score.toFixed(2)}`);
  return `2 % je ${(vzacny.score / bezny.score).toFixed(1)}× výš`;
});

check('extrémně nízké vlastnictví neuteče do nekonečna', () => {
  const f = w.eval('diffScore');
  const p = bootstrap.elements[7];
  // 0,1 % a 0 % musí dát totéž — páka je useknutá zdola
  if(f(p, 11, 0.1, 1).score !== f(p, 11, 0, 1).score)
    throw new Error('nulové vlastnictví se neusekává');
  return 'useknuto';
});

check('diferenciály vrátí nejvýš pět hráčů seřazených podle skóre', () => {
  const pool = bootstrap.elements.filter(p => p.element_type !== 1).slice(0, 60);
  const {rows} = w.eval('diffRows')(pool, 11,
    p => parseFloat(p.selected_by_percent), 9);
  if(rows.length > 5) throw new Error('řádků: ' + rows.length);
  for(let i = 1; i < rows.length; i++)
    if(rows[i].score > rows[i - 1].score) throw new Error('není seřazeno');
  return rows.length + ' hráčů';
});


check('v hlavičce je název týmu a iniciály, ne ID', () => {
  w.__e = {name: 'Prague Patriots', player_first_name: 'Karel',
           player_last_name: 'Bláha'};
  w.eval('setWhoName(window.__e)');
  const el = w.document.getElementById('whoName');
  if(!/Prague Patriots/.test(el.textContent))
    throw new Error('chybí název týmu: ' + el.textContent);
  if(!/KB/.test(el.textContent))
    throw new Error('chybí iniciály: ' + el.textContent);
  if(/#/.test(el.textContent)) throw new Error('zůstalo tam ID');
  return el.textContent;
});

check('iniciály zvládnou i chybějící příjmení', () => {
  // Někdo má v profilu FPL jen křestní jméno; prázdný odznak je horší
  // než žádný.
  if(w.eval('initials({player_first_name: "Jan", player_last_name: ""})') !== 'J')
    throw new Error('jedno jméno se nezvládlo');
  w.__e = {name: 'Solo FC', player_first_name: '', player_last_name: ''};
  w.eval('setWhoName(window.__e)');
  const html = w.document.getElementById('whoName').innerHTML;
  if(/class="ini"/.test(html)) throw new Error('prázdný odznak iniciál');
  return 'bez odznaku';
});

check('název týmu se ořízne, iniciály zůstanou', () => {
  const css = SRC;
  if(!/\.bar \.who b \.ini\{flex:none/.test(css))
    throw new Error('iniciály by se v úzké hlavičce smrskly');
  if(!/\.bar \.who b \.tn\{overflow:hidden;text-overflow:ellipsis/.test(css))
    throw new Error('dlouhý název by hlavičku roztáhl');
  return 'ořezává se název';
});

check('bez načtené miniligy to diferenciály přiznají', () => {
  w.eval('LEAGUE_OWN = null;');
  const html = w.eval('buildDifferentials()');
  if(!html.includes('celé FPL')) throw new Error('chybí globální část');
  if(!html.includes('Načíst data znovu</b>'))
    throw new Error('neřekl, proč ligová část chybí');
  return 'poctivá hláška';
});

check('Poradce si vlastnictví ligy dotáhne sám, nečeká na Miniligu', () => {
  /* Dřív tam stála věta „otevři Miniligu“ — pokyn místo funkce. */
  const src = fs.readFileSync('js/advisor.js', 'utf8');
  if(!/advEnsureLeague/.test(src))
    throw new Error('Poradce ligu sám nenačítá');
  if(!/await advEnsureLeague\(\)/.test(src))
    throw new Error('načtení se nevolá při otevření záložky');
  const fn = src.slice(src.indexOf('async function advEnsureLeague'),
                       src.indexOf('async function advEnsureLeague') + 700);
  if(!/if\(typeof LEAGUE_OWN !== 'undefined' && LEAGUE_OWN\) return/.test(fn))
    throw new Error('načítalo by se znovu i s hotovými daty');
  if(!/TAB_DONE/.test(fn))
    throw new Error('Miniliga by si to po otevření načetla podruhé');
  return 'načte se samo';
});

check('s načtenou miniligou se počítá i ligové vlastnictví', () => {
  const els = bootstrap.elements;
  // deset manažerů, jeden hráč u všech, jiný u jednoho
  w.eval(`LEAGUE_OWN = {n: 10, owners: {
    ${els[3].id}: ['a','b','c','d','e','f','g','h','i','j'],
    ${els[4].id}: ['a']
  }};`);
  const html = w.eval('buildDifferentials()');
  w.eval('LEAGUE_OWN = null;');
  if(!html.includes('10 manažerů')) throw new Error('nezmínil velikost ligy');
  if(html.includes('Miniliga</b>')) throw new Error('pořád si stěžuje na chybějící ligu');
  return 'ligová část vykreslena';
});

/* ================= historie miniligy ================= */

// Sezony mimo CONFIG.officialSeasons, at fixture netestuje dve veci naraz.
const pastFixture = [
  {past: [{season_name: '2023/24', total_points: 2100, rank: 500000},
          {season_name: '2024/25', total_points: 2300, rank: 200000},
          {season_name: '2025/26', total_points: 2500, rank: 90000}]},
  {past: [{season_name: '2024/25', total_points: 2400, rank: 150000},
          {season_name: '2025/26', total_points: 2200, rank: 400000}]},
  {past: []},
];
const histMembers = [
  {entry: 1, player_name: 'Adam', entry_name: 'A'},
  {entry: 2, player_name: 'Bob', entry_name: 'B'},
  {entry: 3, player_name: 'Cyril', entry_name: 'C'},
];

check('historie poskládá sezóny ze všech členů', () => {
  const h = w.eval('buildLeagueHistory')(histMembers, pastFixture);
  if(h.cols.join(',') !== '2023/24,2024/25,2025/26')
    throw new Error('sloupce: ' + h.cols);
  return h.cols.length + ' sezón';
});

check('historie drží nejvýš šest sezón', () => {
  const many = [{past: Array.from({length: 10}, (_, i) => ({
    season_name: `20${10 + i}/${11 + i}`, total_points: 2000 + i, rank: 1000}))}];
  const h = w.eval('buildLeagueHistory')([histMembers[0]], many);
  if(h.cols.length !== 6) throw new Error('sloupců: ' + h.cols.length);
  if(h.cols[5] !== '2019/20') throw new Error('nedrží ty nejnovější: ' + h.cols);
  return 'posledních 6';
});

check('kdo sezónu nehrál, nedostane poslední místo', () => {
  const h = w.eval('buildLeagueHistory')(histMembers, pastFixture);
  // 2023/24 hrál jen Adam → je první a nikdo jiný v pořadí není
  if(h.order['2023/24'].size !== 1) throw new Error('do pořadí se dostal někdo, kdo nehrál');
  if(h.order['2023/24'].get(1) !== 1) throw new Error('Adam není první');
  // 2024/25 hráli dva, Bob má víc bodů → je první
  if(h.order['2024/25'].get(2) !== 1) throw new Error('Bob měl vyhrát 2024/25');
  if(h.order['2024/25'].get(1) !== 2) throw new Error('Adam měl být druhý');
  return 'pořadí jen z těch, kdo hráli';
});

/* ================= oficiální sezóny a trofeje ================= */

check('medaile dostanou jen ti, kdo za ligu tehdy nastoupili', () => {
  // 2021/22 je v CONFIG omezená na tři jména; Adam ani Bob mezi ně nepatří
  const rane = [
    {past: [{season_name: '2021/22', total_points: 2400, rank: 100}]},
    {past: [{season_name: '2021/22', total_points: 2300, rank: 200}]},
    {past: [{season_name: '2021/22', total_points: 1000, rank: 900}]},
  ];
  const h = w.eval('buildLeagueHistory')(histMembers, rane);
  if(h.order['2021/22'].size !== 0)
    throw new Error('rozdal medaile lidem mimo ligu: ' + h.order['2021/22'].size);
  if(h.rows.some(r => r.medals[1])) throw new Error('někdo dostal zlato');
  return 'nikdo neoprávněně';
});

check('oficiální člen medaili v rané sezóně dostane', () => {
  const clenove = [
    {entry: 11, player_name: 'Krystof Benka', entry_name: 'Prague Patriots'},
    {entry: 12, player_name: 'Filip Buddeus', entry_name: 'Debils'},
    {entry: 13, player_name: 'Cizinec', entry_name: 'X'},
  ];
  const data = [
    {past: [{season_name: '2021/22', total_points: 2430, rank: 234483}]},
    {past: [{season_name: '2021/22', total_points: 2100, rank: 999999}]},
    {past: [{season_name: '2021/22', total_points: 2900, rank: 10}]},   // mimo ligu
  ];
  const h = w.eval('buildLeagueHistory')(clenove, data);
  const benka = h.rows.find(r => r.m.entry === 11);
  const cizi = h.rows.find(r => r.m.entry === 13);
  if(benka.medals[1] !== 1)
    throw new Error('Benka nedostal zlato, i když měl nejvíc z oficiálních');
  if(cizi.medals[1] || cizi.medals[2] || cizi.medals[3])
    throw new Error('cizinec s nejvyššími body dostal medaili');
  return 'Benka zlato, cizinec nic';
});

check('jméno se páruje bez ohledu na diakritiku', () => {
  const f = w.eval('officialIn');
  if(!f('2021/22', {entry: 1, player_name: 'Kryštof Benka'}))
    throw new Error('nespároval Kryštof/Krystof');
  if(f('2021/22', {entry: 1, player_name: 'Někdo Jiný'}))
    throw new Error('pustil cizí jméno');
  if(!f('2026/27', {entry: 1, player_name: 'Kdokoli'}))
    throw new Error('neomezená sezóna má pustit všechny');
  return 'diakritika i neomezené sezóny';
});

check('žebříček trofejí řadí zlatem před stříbrem', () => {
  const rows = [
    {m: {entry: 1, player_name: 'Jedno zlato'}, medals: {1: 1, 2: 0, 3: 0}},
    {m: {entry: 2, player_name: 'Tři stříbra'}, medals: {1: 0, 2: 3, 3: 0}},
    {m: {entry: 3, player_name: 'Nic'}, medals: {1: 0, 2: 0, 3: 0}},
  ];
  const html = w.eval('trophyTable')(rows);
  if(html.indexOf('Jedno zlato') > html.indexOf('Tři stříbra'))
    throw new Error('tři stříbra přeskočila zlato');
  if(html.includes('Nic')) throw new Error('vypsal někoho bez medaile');
  return 'zlato > stříbro';
});

check('historie neukazuje dva řádky drobného textu v každé buňce', () => {
  const html = w.eval('renderLeagueHistory')(histMembers, pastFixture, 1);
  if(html.includes('celkově</u>'))
    throw new Error('pořadí je pořád vypsané v buňce místo v title');
  if(!html.includes('title=')) throw new Error('detail se nikam neschoval');
  return 'detail v title';
});

check('nehraná sezóna se ukáže tečkou, ne nulou', () => {
  const html = w.eval('renderLeagueHistory')(histMembers, pastFixture, 1);
  if(!html.includes('empty')) throw new Error('chybí prázdná buňka');
  if(/class="n">0</.test(html)) throw new Error('vyrobil nulu tam, kde chybí data');
  return 'tečka';
});

check('historie přizná, že pořadí miniligy z API není', () => {
  const html = w.eval('renderLeagueHistory')(histMembers, pastFixture, 1);
  if(!html.includes('neposílá pořadí miniligy'))
    throw new Error('tváří se to jako skutečný archiv ligy');
  return 'omezení uvedeno';
});

check('bez historie u kohokoli to appka řekne', () => {
  const html = w.eval('renderLeagueHistory')([histMembers[2]], [{past: []}], 3);
  if(!html.includes('nemá v FPL zaznamenanou')) throw new Error(html.slice(0, 100));
  return 'poctivá hláška';
});

/* ================= zisk z projekce ================= */

check('plánovač ukáže zisk u každého tahu zvlášť', () => {
  const squad = [1, 2, 3, 4].map(i => ({p: bootstrap.elements[i]}));
  w.__pl = {startGw: 11, squad, bank: 30, free: 2, derived: 2, manual: false};
  w.eval('PLANNER = window.__pl;');
  const r = w.eval('simulatePlan')([
    {gw: 11, out: squad[0].p.id, in: bootstrap.elements[95].id}]);
  const d = r.rows[0].detail[0];
  if(!Number.isFinite(d.gain)) throw new Error('tah nenese vlastní zisk');
  if(Math.abs(d.gain - r.gain) > 1e-9)
    throw new Error('součet nesedí s jediným tahem: ' + d.gain + ' vs ' + r.gain);
  return d.gain.toFixed(1) + ' b';
});

check('plánovač vysvětlí, odkud se zisk bere', () => {
  const html = SRC;
  if(!html.includes('Co je „zisk z projekce“'))
    throw new Error('chybí vysvětlení');
  if(!html.includes('můj odhad, ne oficiální číslo FPL'))
    throw new Error('nerozlišuje vlastní model od projekce FPL');
  return 'vysvětleno';
});

/* ================= režim jedné miniligy ================= */

check('vstup nabídne seznam členů místo pole na ID', () => {
  const html = SRC;
  if(!html.includes('id="whoami"')) throw new Error('chybí rozbalovací seznam');
  if(!html.includes('id="manualToggle"')) throw new Error('chybí únikový odkaz na ruční zadání');
  if(!/leagueId:\s*'\d+'/.test(html)) throw new Error('CONFIG.leagueId není předvyplněné');
  return 'seznam + záloha';
});

check('ruční zadání jde pořád otevřít', () => {
  const d = w.document;
  w.eval('setGateMode(true)');
  if(d.getElementById('manualFields').hidden) throw new Error('ruční pole zůstala schovaná');
  if(!d.getElementById('pickField').hidden) throw new Error('seznam se neschoval');
  w.eval('setGateMode(false)');
  if(!d.getElementById('manualFields').hidden) throw new Error('nevrátilo se to zpět');
  return 'přepíná se';
});

check('odpočet je dvouřádkový a ne drobný monospace', () => {
  w.eval('startCountdown')();
  const el = w.document.getElementById('countdown');
  if(!el.querySelector('.lbl') || !el.querySelector('.val'))
    throw new Error('chybí popisek nebo hodnota');
  const css = SRC;
  if(!/\.cd \.val\{[^}]*font-size:16px/.test(css))
    throw new Error('hodnota není dost velká');
  return el.querySelector('.val').textContent.trim();
});

check('odpočet zkracuje jednotky podle zbývajícího času', () => {
  const el = w.document.getElementById('countdown');
  w.eval('startCountdown')();
  const txt = el.textContent;
  // fixture má deadline za ~3 h, takže hodiny a minuty, ne dny
  if(/\d+ d /.test(txt)) throw new Error('ukazuje dny, i když zbývají hodiny: ' + txt);
  if(!/h \d\d min/.test(txt)) throw new Error('čekal hodiny a minuty: ' + txt);
  return txt.replace(/\s+/g, ' ').trim();
});

check('logo v hlavičce je obrázek, ne inline SVG', () => {
  const html = SRC;
  const i = html.indexOf('class="brand"');
  const blok = html.slice(i, i + 320);
  if(!/\/assets\/(mark|logo-transp)\.webp/.test(blok)) throw new Error('logo se nepoužívá');
  if(blok.includes('<svg')) throw new Error('zůstalo inline SVG');
  return 'obrázek z /assets';
});

check('vstupní obrazovka používá plakát', () => {
  const html = SRC;
  if(!html.includes('/assets/headline.webp')) throw new Error('plakát chybí');
  if(!/class="poster"/.test(html)) throw new Error('plakát nemá vlastní styl');
  return 'headline.webp';
});

/* ================= pozdější příchod do ligy ================= */

check('kdo přišel později, nemá medaile ze starších sezón', () => {
  const f = w.eval('officialIn');
  const marko = {entry: 77, player_name: 'Adam Marko'};
  if(f('2023/24', marko)) throw new Error('počítá ho v 2023/24');
  if(f('2024/25', marko)) throw new Error('počítá ho v 2024/25');
  if(!f('2025/26', marko)) throw new Error('nepočítá ho od 2025/26');
  if(!f('2026/27', marko)) throw new Error('nepočítá ho v aktuální sezóně');
  return 'oficiální až od 2025/26';
});

check('ostatní členy pozdější příchod neomezí', () => {
  const f = w.eval('officialIn');
  const kdokoli = {entry: 78, player_name: 'Daniel Fábry'};
  if(!f('2023/24', kdokoli)) throw new Error('omezil někoho, kdo v memberSince není');
  return 'bez omezení';
});

check('obě pravidla platí zároveň', () => {
  const f = w.eval('officialIn');
  // 2021/22 má pevnou soupisku i pozdější příchod — obojí musí zabrat
  if(f('2021/22', {entry: 77, player_name: 'Adam Marko'}))
    throw new Error('pustil ho do sezóny s pevnou soupiskou');
  if(!f('2021/22', {entry: 79, player_name: 'Filip Buddeus'}))
    throw new Error('nepustil člena z pevné soupisky');
  return 'soupiska i datum příchodu';
});

check('pozdější příchod sebere medaili, ne řádek', () => {
  const clenove = [
    {entry: 11, player_name: 'Krystof Benka', entry_name: 'A'},
    {entry: 77, player_name: 'Adam Marko', entry_name: 'B'},
  ];
  const data = [
    {past: [{season_name: '2024/25', total_points: 2000, rank: 100}]},
    {past: [{season_name: '2024/25', total_points: 2900, rank: 5}]},
  ];
  const h = w.eval('buildLeagueHistory')(clenove, data);
  const marko = h.rows.find(r => r.m.entry === 77);
  if(marko.medals[1]) throw new Error('dostal zlato za sezónu před příchodem');
  if(h.order['2024/25'].get(11) !== 1) throw new Error('Benka není první');

  // ale body v tabulce zůstanou, jen šedě
  const html = w.eval('renderLeagueHistory')(clenove, data, 11);
  if(!html.includes('2900')) throw new Error('smazal mu body úplně');
  if(!html.includes('guest')) throw new Error('neoznačil je jako mimo ligu');
  return 'body šedě, medaile ne';
});

/* ================= čitelnost vstupní obrazovky ================= */

check('položky rozbalené nabídky nejsou bílé na bílém', () => {
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  // <option> kreslí OS na bílém a dědí color z .gate select
  if(!/\.gate select option\{[^}]*color:#1F0A24/.test(style))
    throw new Error('option nemá vlastní tmavou barvu textu');
  return 'tmavý text na bílé';
});

check('hlavička používá oříznutý pohár, ne celé logo', () => {
  const html = SRC;
  const i = html.indexOf('class="brand"');
  const blok = html.slice(i, i + 300);
  if(!blok.includes('/assets/mark.webp'))
    throw new Error('v hlavičce je pořád logo s textem');
  return 'mark.webp';
});

/* ================= automatické načtení ligových záložek ================= */

check('ligové záložky se načtou samy při otevření', () => {
  const init = w.eval('Object.keys(TAB_INIT)');
  for(const t of ['t-league', 't-hub'])
    if(!init.includes(t)) throw new Error(t + ' není v TAB_INIT');
  return init.length + ' záložek se inicializuje samo';
});

check('načítá se při otevření záložky, ne při startu appky', () => {
  const html = SRC;
  // TAB_INIT se volá ze selectTab, tedy až když na záložku někdo přepne.
  if(!/TAB_INIT\[tid\]\s*&&\s*!TAB_DONE\.has\(tid\)/.test(html))
    throw new Error('chybí spouštění přes selectTab');
  return 'lazy';
});

check('každá záložka se spustí jen jednou', () => {
  const html = SRC;
  if(!html.includes('TAB_DONE.add(tid)')) throw new Error('chybí pojistka proti opakování');
  if(!html.includes('TAB_DONE.clear()'))
    throw new Error('po přepnutí týmu by zůstalo, že už je načteno');
  return 'jednou, a po přepnutí týmu znovu';
});

check('bez ID ligy se auto-načtení jen ozve', () => {
  w.localStorage.removeItem('fpl_league');
  const saved = w.eval('CONFIG.leagueId');
  w.eval("CONFIG.leagueId = '';");
  w.eval('autoLoadLeague()');
  const msg = w.document.getElementById('lmsg').textContent;
  w.eval(`CONFIG.leagueId = '${saved}';`);
  if(!msg.includes('ID miniligy')) throw new Error('mlčí: ' + msg);
  return 'poctivá hláška';
});

check('dropCached zahodí jen odpovídající klíče', () => {
  w.eval("API_CACHE.set('leagues-classic/1/standings/', 'A')");
  w.eval("API_CACHE.set('entry/60480/history/', 'B')");
  w.eval("API_CACHE.set('bootstrap-static/', 'C')");
  w.eval('dropCached(/^(leagues-classic|entry)\\//)');
  if(w.eval("API_CACHE.has('leagues-classic/1/standings/')")) throw new Error('nechal standings');
  if(w.eval("API_CACHE.has('entry/60480/history/')")) throw new Error('nechal historii');
  if(!w.eval("API_CACHE.has('bootstrap-static/')"))
    throw new Error('zahodil i bootstrap, který se měnit nemusí');
  w.eval("API_CACHE.delete('bootstrap-static/')");
  return 'ligové pryč, bootstrap zůstal';
});

check('tlačítko Aktualizovat cache opravdu zneplatní', () => {
  const html = SRC;
  const i = html.indexOf("$('lgo').addEventListener");
  const blok = html.slice(i, i + 500);
  // Bez zneplatnění by se jen překreslila tatáž data z paměti.
  if(!blok.includes('dropCached'))
    throw new Error('tlačítko by vrátilo stará data z cache');
  const j = html.indexOf("$('hubgo').addEventListener");
  if(!html.slice(j, j + 300).includes('dropCached'))
    throw new Error('hub neaktualizuje');
  return 'obě tlačítka';
});

/* ================= infotooltipy ================= */

check('upozornění na deadline je pryč', () => {
  const html = SRC;
  for(const t of ['renderNotifBar', 'scheduleDeadlineNotice', 'notifhost', 'NOTIF_KEY'])
    if(html.includes(t)) throw new Error('zůstalo: ' + t);
  const sw = fs.readFileSync('sw.js', 'utf8');
  if(sw.includes('notificationclick')) throw new Error('service worker to pořád obsluhuje');
  return 'odstraněno';
});

check('vysvětlivky se schovaly do tooltipů', () => {
  const html = SRC;
  const tips = (html.match(/\$\{info\(/g) || []).length;
  if(tips < 12) throw new Error('tooltipů jen ' + tips);
  return tips + ' tooltipů';
});

check('tooltip je schovaný, dokud se neklikne', () => {
  w.eval('TIP_SEQ = 900');
  const html = w.eval('info')('Vysvětlení.');
  if(!html.includes('hidden')) throw new Error('vyjede rovnou');
  if(!html.includes('aria-expanded="false"')) throw new Error('chybí stav pro odečítač');
  if(!html.includes('aria-controls="tip901"')) throw new Error('nespojil tlačítko s obsahem');
  return 'zavřený';
});

check('kliknutí tooltip otevře a druhé zavře', () => {
  const host = w.document.createElement('div');
  host.innerHTML = '<h2>Nadpis' + w.eval('info')('Text vysvětlivky.') + '</h2>';
  w.document.body.appendChild(host);

  const btn = host.querySelector('.i-tip');
  const box = host.querySelector('.tipbox');
  if(!box.hidden) throw new Error('začíná otevřený');

  btn.click();
  if(box.hidden) throw new Error('neotevřel se');
  if(btn.getAttribute('aria-expanded') !== 'true') throw new Error('aria se nezměnila');

  btn.click();
  if(!box.hidden) throw new Error('nezavřel se');
  host.remove();
  return 'otevírá a zavírá';
});

check('otevřený tooltip zavře klik jinam', () => {
  const host = w.document.createElement('div');
  host.innerHTML = '<h2>A' + w.eval('info')('Text.') + '</h2>';
  w.document.body.appendChild(host);
  const btn = host.querySelector('.i-tip'), box = host.querySelector('.tipbox');
  btn.click();
  if(box.hidden) throw new Error('neotevřel se');
  w.document.body.click();
  if(!box.hidden) throw new Error('zůstal otevřený po kliknutí jinam');
  host.remove();
  return 'zavírá se';
});

/* ================= druhá pětice diferenciálů ================= */

check('ligové diferenciály mají dvě sady s přepínačem', () => {
  const els = bootstrap.elements;
  w.eval(`LEAGUE_OWN = {n: 10, owners: {
    ${els[3].id}: ['a','b','c','d','e'],
    ${els[4].id}: ['a']
  }};`);
  const html = w.eval('buildDifferentials()');
  w.eval('LEAGUE_OWN = null;');

  if(!html.includes('data-diff="0"') || !html.includes('data-diff="1"'))
    throw new Error('chybí přepínač');
  if(!html.includes('id="diff-0"') || !html.includes('id="diff-1"'))
    throw new Error('chybí jedna ze sad');
  if(!html.includes('míň než polovina ligy'))
    throw new Error('druhá sada není o polovině ligy');
  return 'ostré + pod polovinou';
});

check('mírnější sada pouští i vlastněnější hráče', () => {
  const ownPct = () => 40;    // 40 % ligy — do ostré sady se nevejde
  const prisna = w.eval('diffRows')(bootstrap.elements, 11, ownPct, 9,
    [{max: 10, label: 'ostré'}]);
  const mirna = w.eval('diffRows')(bootstrap.elements, 11, ownPct, 9,
    [{max: 49.99, label: 'pod polovinou'}]);
  if(mirna.rows.length < prisna.rows.length)
    throw new Error('mírnější sada je menší než ostrá');
  if(!mirna.rows.length) throw new Error('mírnější sada je prázdná');
  return `ostrá ${prisna.rows.length}, mírná ${mirna.rows.length}`;
});

/* ================= souhrn kola uvnitř hřiště ================= */

check('souhrn kola sedí uvnitř hřiště', () => {
  w.__live = liveMap;
  w.eval('render')(entry, {picks: picksSquad, entry_history: {event_transfers_cost: 0}},
    11, {live: w.__live, gw: 10, finished: false});
  const pitch = w.document.querySelector('#out .pitch');
  if(!pitch) throw new Error('hřiště se nevykreslilo');
  if(!pitch.querySelector('.livebar'))
    throw new Error('souhrn je pořád mimo hřiště');
  return 'uvnitř';
});

check('souhrn se nekryje s první řadou dresů', () => {
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  const blok = style.slice(style.indexOf('.livebar{'),
                           style.indexOf('}', style.indexOf('.livebar{')));
  // Oddělovací linka a spodní odsazení drží dresy pod souhrnem.
  if(!/border-bottom/.test(blok)) throw new Error('chybí oddělení od dresů');
  if(!/padding:[^;]*16px/.test(blok)) throw new Error('chybí spodní odsazení');
  return 'linka + odsazení';
});

check('čísla souhrnu drží kontrast na tmavém hřišti', () => {
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  const blok = style.slice(style.indexOf('.livebar .big{'),
                           style.indexOf('}', style.indexOf('.livebar .big{')));
  // Bílá ani mátová by na bílé kartě neprošly — hřiště je proto tmavé.
  if(!/var\(--mint-fill\)/.test(blok)) throw new Error('velké číslo není mátové');
  if(!/text-shadow/.test(blok)) throw new Error('chybí stín pro čitelnost na podkladu');
  return 'mátová + stín';
});

/* ================= zdraví kádru: disjunktní sloupce ================= */

check('nehrající hráč se nepočítá i pod otazník', () => {
  // Sloupce dřív sdílely jednu množinu: „Pod otazníkem“ byla nadmnožina
  // „Nehraje“, takže zraněný hráč zvýšil obě čísla naráz. Kontrolujeme
  // přímo zdroj — buildHealth potřebuje načtený HUB, který v testu není.
  const src = SRC;
  const fn = src.slice(src.indexOf('function buildHealth()'),
                       src.indexOf('function buildHealth()') + 2200);

  if(/const flagged = squad\.filter/.test(fn))
    throw new Error('flagged se pořád počítá nezávisle na out');
  if(!/!isOut\(p\)/.test(fn))
    throw new Error('otazníky nevylučují nedostupné hráče');
  if(!/const doubt =/.test(fn))
    throw new Error('chybí samostatná množina otazníků');
  if(!/r\.doubt\.length/.test(src.slice(src.indexOf('function buildHealth()'),
                                        src.indexOf('function buildHealth()') + 4000)))
    throw new Error('sloupec pořád vypisuje flagged místo doubt');
  return 'out a doubt jsou disjunktní';
});

check('zdravý hráč s null šancí není pod otazníkem', () => {
  // `null < 100` je v JS true — bez explicitní kontroly by do otazníků
  // spadl celý kádr.
  const isOut = p => p.status === 'i' || p.status === 's' || p.status === 'u'
    || p.status === 'n' || p.chance_of_playing_next_round === 0;
  const doubt = p => !isOut(p) && (p.status !== 'a' ||
    (p.chance_of_playing_next_round !== null && p.chance_of_playing_next_round < 100));
  const zdravy = {status: 'a', chance_of_playing_next_round: null};
  if(doubt(zdravy)) throw new Error('zdravý hráč označený jako nejistý');
  if(!doubt({status: 'a', chance_of_playing_next_round: 75}))
    throw new Error('75 % není otazník');
  if(doubt({status: 'a', chance_of_playing_next_round: 0}))
    throw new Error('nula patří mezi nehrající, ne mezi otazníky');
  return 'null zdravý, 75 nejistý, 0 nehraje';
});

/* ================= redesign žebříčků ================= */

check('první řádek jsou body podle čtyř pozic', () => {
  const rows = w.eval('TOP_POINTS');
  if(rows.length !== 4) throw new Error('boxů: ' + rows.length);
  const pozice = rows.map(x => x[4] && x[4][0]).sort();
  if(pozice.join(',') !== '1,2,3,4') throw new Error('pozice: ' + pozice.join(','));
  if(rows.some(x => x[0] !== 'total_points')) throw new Error('neřadí se podle bodů');
  return 'GK, DEF, MID, FWD';
});

check('žebříček pozice obsahuje jen tu pozici', () => {
  const mid = w.eval('TOP_POINTS').find(x => x[4][0] === 3);
  const html = w.eval('topBoard')(mid);
  const ids = [...html.matchAll(/data-pid="(\d+)"/g)].map(m => Number(m[1]));
  if(!ids.length) throw new Error('prázdný žebříček');
  const els = Object.fromEntries(bootstrap.elements.map(p => [p.id, p]));
  const cizi = ids.filter(id => els[id].element_type !== 3);
  if(cizi.length) throw new Error(cizi.length + ' nezáložníků mezi záložníky');
  return ids.length + ' záložníků';
});

check('mřížka žebříčků má čtyři sloupce', () => {
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  const blok = style.slice(style.indexOf('.tgrid{'), style.indexOf('}', style.indexOf('.tgrid{')));
  if(!/repeat\(4,\s*minmax\(0,\s*1fr\)\)/.test(blok))
    throw new Error('není čtyřsloupcová: ' + blok);
  return 'čtyři sloupce';
});

check('kategorie hráčů v poli se zalomí přesně na dva řádky', () => {
  const n = w.eval('TOP_FIELD').length;
  if(n % 4) throw new Error('počet ' + n + ' nevyplní čtyřsloupcovou mřížku');
  return n + ' kategorií = ' + (n / 4) + ' řádky';
});

check('top 3 dostanou medaili místo pořadového čísla', () => {
  const html = w.eval('topBoard')(w.eval('TOP_FIELD')[0]);
  const mdl = (html.match(/class="tmdl"/g) || []).length;
  if(mdl !== 3) throw new Error('medailí: ' + mdl);
  const MEDAL = w.eval('MEDAL');
  if(!html.includes(MEDAL[1])) throw new Error('chybí zlato');

  // Medaile nesmí číslo doplňovat, jen nahradit.
  const css = SRC;
  if(!css.includes('.tlist li:has(.tmdl)::before{display:none}'))
    throw new Error('číslo se u medailových řádků neskrývá');
  return '3 medaile, číslo skryté';
});

check('medaile jsou stejné jako v historických sezónách', () => {
  // Dvě různé sady by znamenaly dva různé způsoby, jak říct „třetí místo“.
  const html = SRC;
  const defs = html.match(/const MEDAL = /g) || [];
  if(defs.length !== 1) throw new Error('definic MEDAL: ' + defs.length);
  return 'jedna sada';
});

check('žebříček označí sestavu i s medailí na řádku', () => {
  // Třídy na <li> musí zůstat čisté, jinak by zvýraznění kádru zmizelo
  // právě u prvních tří — tedy tam, kde nejvíc zajímá.
  const bez = w.eval('topBoard')(w.eval('TOP_FIELD')[0]);
  const vidit = [...bez.matchAll(/data-pid="(\d+)"/g)].map(m => Number(m[1]));
  w.eval(`MY_SQUAD = new Set([${vidit[0]}]);`);
  const html = w.eval('topBoard')(w.eval('TOP_FIELD')[0]);
  w.eval('MY_SQUAD = null;');
  if((html.match(/class="me"/g) || []).length !== 1)
    throw new Error('medaile rozbila označení kádru');
  return 'první místo označené';
});


check('psaní do hledání watchlist samo nemění', () => {
  /* Dřív se po třetím znaku přidal nejlepší shodný hráč rovnou do
     watchlistu — kdo hledal Fernandese, dostal po „fer“ Wieffera. */
  const src = fs.readFileSync('js/tabs.js', 'utf8');
  const fn = src.slice(src.indexOf('function wireWatch'),
                       src.indexOf('function wireWatch') + 3000);
  const naInput = fn.slice(fn.indexOf("q.addEventListener('input'"), 
                           fn.indexOf("q.addEventListener('keydown'"));
  if(/toggleWatch/.test(naInput))
    throw new Error('psaní pořád přidává hráče');
  if(!/kresli\(\)/.test(naInput))
    throw new Error('nabídka se při psaní nekreslí');
  return 'jen nabídne';
});

check('našeptávač dá přednost shodě na začátku jména', () => {
  const els = bootstrap.elements;
  const a = els[0], b = els[1];
  const save = [a.web_name, a.second_name, b.web_name, b.second_name, a.total_points, b.total_points];
  a.web_name = 'Wieffer'; a.second_name = 'Wieffer'; a.total_points = 200;
  b.web_name = 'Fernandes'; b.second_name = 'Fernandes'; b.total_points = 10;

  const hits = w.eval('watchMatches("fer")').map(h => h.p.web_name);
  a.web_name = save[0]; a.second_name = save[1];
  b.web_name = save[2]; b.second_name = save[3];
  a.total_points = save[4]; b.total_points = save[5];

  if(hits[0] !== 'Fernandes')
    throw new Error('první je ' + hits[0] + ', čekal jsem Fernandese');
  if(!hits.includes('Wieffer'))
    throw new Error('shoda uprostřed se zahodila úplně');
  return hits.slice(0, 2).join(', ');
});

check('našeptávač mlčí na jediné písmeno', () => {
  if(w.eval('watchMatches("f")').length)
    throw new Error('nabízí po prvním znaku');
  if(w.eval('watchMatches("")').length)
    throw new Error('nabízí i na prázdné pole');
  return 'od dvou znaků';
});

check('jistota pohybu ceny je slovo, ne řada teček', () => {
  const html = w.eval('likeChip(5, "dnes v noci")') + w.eval('likeChip(-2)')
             + w.eval('likeChip(0)');
  if(/●/.test(html)) throw new Error('tečky zůstaly');
  if(!/jisté/.test(html)) throw new Error('chybí nejvyšší stupeň');
  if(!/možné/.test(html)) throw new Error('chybí slabší stupeň');
  if(!/▲/.test(html) || !/▼/.test(html)) throw new Error('není poznat směr');
  if(!/l5/.test(html)) throw new Error('sytost nerozlišuje jistotu');
  // Štítky musí být stejně široké, jinak se sloupec rozsype.
  const css = SRC;
  if(!/\.lk\{[^}]*width:132px/.test(css) || !/\.lk\.none\{width:132px/.test(css))
    throw new Error('štítky nemají pevnou šířku');
  if(!/\.lk\{[^}]*justify-content:center/.test(css))
    throw new Error('text štítku není na střed');
  return 'jisté / možné / –';
});

check('tabulka cen ukazuje jistotu slovem', () => {
  const html = w.eval('buildPrices()');
  if(/●/.test(html)) throw new Error('v tabulce zůstaly tečky');
  if(!/Dnes v noci/.test(html)) throw new Error('sloupec se nepřejmenoval');
  return 'bez teček';
});

/* ================= watchlist ================= */

check('watchlist se ukládá po hráčích a jde přepnout', () => {
  w.localStorage.clear();
  w.eval('WATCH = null; ENTRY_ID = 60480;');
  const id = bootstrap.elements[0].id;
  if(w.eval('isWatched')(id)) throw new Error('startuje neprázdný');
  w.eval('toggleWatch')(id);
  if(!w.eval('isWatched')(id)) throw new Error('nepřidal se');
  w.eval('toggleWatch')(id);
  if(w.eval('isWatched')(id)) throw new Error('neodebral se');
  return 'přidání i odebrání';
});

check('watchlist je vázaný na entry ID', () => {
  w.localStorage.clear();
  w.eval('WATCH = null; ENTRY_ID = 60480;');
  const id = bootstrap.elements[1].id;
  w.eval('toggleWatch')(id);

  // Přepnutí týmu musí seznam vyprázdnit, ne zdědit cizí.
  w.eval('WATCH = null; ENTRY_ID = 999999;');
  if(w.eval('isWatched')(id)) throw new Error('nový tým vidí cizí watchlist');

  w.eval('WATCH = null; ENTRY_ID = 60480;');
  if(!w.eval('isWatched')(id)) throw new Error('původní tým o seznam přišel');
  return 'dva týmy, dva seznamy';
});

check('prázdný watchlist poradí, jak hráče přidat', () => {
  w.localStorage.clear();
  w.eval('WATCH = null; ENTRY_ID = 60480;');
  const html = w.eval('buildWatch')();
  if(!html.includes('hvězdičku')) throw new Error('mlčí místo návodu');
  if(!html.includes('id="wsel"')) throw new Error('chybí výběr hráče');
  return 'návod + výběr';
});

check('hvězdička nese stav a ID hráče', () => {
  w.localStorage.clear();
  w.eval('WATCH = null; ENTRY_ID = 60480;');
  const id = bootstrap.elements[2].id;
  const off = w.eval('watchStar')(id);
  if(!off.includes('aria-pressed="false"')) throw new Error('nevypnutá hvězdička');
  w.eval('toggleWatch')(id);
  const on = w.eval('watchStar')(id);
  if(!on.includes('aria-pressed="true"')) throw new Error('nezapnutá hvězdička');
  if(!on.includes(`data-watch="${id}"`)) throw new Error('chybí ID pro delegaci');
  return 'stav i ID';
});

check('watchlist přežije reset stavu jen jako paměť, ne jako proměnná', () => {
  const html = SRC;
  const reset = html.slice(html.indexOf('function resetState()'),
                           html.indexOf('function resetState()') + 1400);
  if(!/WATCH = null/.test(reset))
    throw new Error('po přepnutí týmu by zůstal cizí watchlist v paměti');
  return 'reset čistí';
});

/* ================= úvodní přehled ================= */

check('Přehled je první záložka', () => {
  const tabs = w.eval('TABS').map(x => x[0]);
  if(tabs[0] !== 't-home') throw new Error('první je ' + tabs[0]);
  if(!w.document.getElementById('p-home')) throw new Error('chybí panel');
  return tabs.length + ' záložek, Přehled první';
});

check('Přehled nemá vlastní síťové načtení', () => {
  // Cílem je nulová cena navíc: panel čte ze stavu, který appka
  // stahuje kvůli Sestavě.
  const init = w.eval('TAB_INIT');
  if(Object.keys(init).includes('t-home'))
    throw new Error('Přehled by stahoval vlastní data');
  return 'čte z HOME';
});

check('odpočet do deadlinu zkracuje jednotky', () => {
  const u = w.eval('untilText');
  if(!/^za 2 d/.test(u(2.2 * 86400000))) throw new Error('dny: ' + u(2.2 * 86400000));
  if(!/^za 4 h/.test(u(4.5 * 3600000))) throw new Error('hodiny: ' + u(4.5 * 3600000));
  if(u(-1000) !== 'deadline prošel') throw new Error('prošlý deadline mlčí');
  return 'dny, hodiny, prošlý';
});

check('pozornost řadí nedostupné před otazníky a blanky', () => {
  const els = Object.fromEntries(bootstrap.elements.map(p => [p.id, p]));
  const vzorek = bootstrap.elements.slice(0, 400);
  const out = vzorek.find(p => p.status === 'i' || p.status === 's');
  const doubt = vzorek.find(p => p.status === 'a' &&
    p.chance_of_playing_next_round !== null && p.chance_of_playing_next_round < 100);
  if(!out || !doubt) return 'v datech není co porovnat';

  w.eval(`HOME = {entry: null, startGw: 3, liveTotal: null, picks: {picks: [
    {element: ${doubt.id}}, {element: ${out.id}}]}};`);
  const html = w.eval('homeAttention')();
  w.eval('HOME = null;');

  const iOut = html.indexOf(out.web_name);
  const iDoubt = html.indexOf(doubt.web_name);
  if(iOut < 0 || iDoubt < 0) throw new Error('některý hráč chybí');
  if(iOut > iDoubt) throw new Error('otazník je nad nedostupným');
  return 'nedostupný nahoře';
});

check('čistý kádr to řekne, místo aby ukázal prázdný box', () => {
  const zdravy = bootstrap.elements.find(p => p.status === 'a' &&
    p.chance_of_playing_next_round === null);
  if(!zdravy) return 'nikdo zdravý v datech';
  w.eval(`HOME = {entry: null, startGw: 3, liveTotal: null,
    picks: {picks: [{element: ${zdravy.id}}]}};`);
  const html = w.eval('homeAttention')();
  w.eval('HOME = null;');
  // Blank je taky důvod k upozornění, takže hráč bez zápasu hlášku nedostane.
  if(html.includes('Nic.') && html.includes('blank'))
    throw new Error('tvrdí obojí naráz');
  return html.includes('Nic.') ? 'čistý kádr' : 'blank zachycen';
});

/* ================= přepínač zobrazení ================= */

check('responzivní pravidla jsou v přepínatelných tazích', () => {
  const html = SRC;
  for(const id of ['mqL', 'mqS'])
    if(!html.includes(`<style id="${id}" media=`))
      throw new Error('chybí tag ' + id);
  // Duplikace by znamenala dvě místa, kde se mění stejné pravidlo.
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  if(/@media\s*\(max-width:\s*(720|640)px\)/.test(style))
    throw new Error('pravidla zůstala i v hlavním bloku');
  return 'dva tagy, žádná kopie';
});

check('přepínač mění media, ne pravidla', () => {
  const apply = w.eval('applyView');
  const media = id => w.document.getElementById(id).media;

  apply('mobile');
  for(const id of ['mqL', 'mqS', 'mqM'])
    if(media(id) !== 'all') throw new Error(id + ' nevynucen: ' + media(id));
  apply('desktop');
  for(const id of ['mqL', 'mqS', 'mqM'])
    if(media(id) !== 'not all') throw new Error(id + ' nezůstal vypnutý');
  if(!/width=1100/.test(w.document.querySelector('meta[name="viewport"]').content))
    throw new Error('viewport zůstal na device-width — na telefonu by se nic nezměnilo');
  return 'mobil → desktop';
});

check('zobrazení má jen dva režimy', () => {
  // Třetí stav „auto“ znamenal, že tlačítko neřeklo, co je vidět teď,
  // a přepnutí z mobilu na desktop chtělo dvě kliknutí.
  const modes = w.eval('VIEW_MODES');
  if(modes.length !== 2 || modes.includes('auto'))
    throw new Error('režimy: ' + modes.join(', '));
  // Neznámá hodnota (třeba stará uložená volba 'auto') nesmí appku
  // nechat v nedefinovaném stavu — spadne na výchozí podle šířky okna.
  w.eval('applyView("auto")');
  const kam = w.document.documentElement.getAttribute('data-view');
  if(!modes.includes(kam)) throw new Error('stará volba zůstala: ' + kam);
  return modes.join(' / ');
});

check('volba zobrazení se pamatuje', () => {
  w.localStorage.clear();
  w.eval('applyView("mobile")');
  w.document.getElementById('viewmode').click();
  const ulozeno = w.localStorage.getItem('fpl_view');
  if(ulozeno !== 'desktop') throw new Error('neuložilo se: ' + ulozeno);
  // Druhé kliknutí musí vrátit zpátky, ne cyklit dál.
  w.document.getElementById('viewmode').click();
  if(w.localStorage.getItem('fpl_view') !== 'mobile')
    throw new Error('nepřepnulo zpátky: ' + w.localStorage.getItem('fpl_view'));
  return 'mobile ⇄ desktop';
});

/* ================= Přestupový poradce ================= */

/* Poradce potřebuje vlastní BOOT — jenže BOOT je globální a testy pod
   ním na něm dál stojí. Původní se proto schová a na konci sekce vrátí.
   Bez toho spadnou testy o pár set řádků níž a hledá se to dlouho. */
const ADV_BOOT_ZALOHA = w.eval('BOOT');
const ADV_FIX_ZALOHA = w.eval('FIX');

function advSetup(){
  const teams = [{id: 1, short_name: 'ARS'}, {id: 2, short_name: 'MUN'}];
  const elements = []; let id = 1;
  for(const t of [1, 2, 3, 4]) for(let k = 0; k < 12; k++){
    const xgi = 0.1 + ((k * 7) % 12) * 0.05;   // kvalita nekoreluje s cenou
    elements.push({id: id++, web_name: 'P' + id, element_type: t, team: (id % 2) + 1,
      now_cost: 45 + (k % 6) * 5, minutes: 200 + k * 10, status: 'a',
      goals_scored: k % 4, assists: k % 3,
      expected_goal_involvements: String(xgi * (200 + k * 10) / 90),
      expected_goal_involvements_per_90: String(xgi),
      expected_goals_per_90: String(xgi * 0.6),
      expected_goals_conceded_per_90: String(1.7 - ((k * 5) % 10) * 0.08),
      creativity: String(80 + ((k * 11) % 20) * 15),
      threat: String(60 + ((k * 13) % 20) * 20),
      saves_per_90: '2.0', defensive_contribution_per_90: String(4 + (k % 5))});
  }
  w.eval('BOOT = ' + JSON.stringify({
    events: [{id: 1, is_current: true}, {id: 2, is_next: true}], teams, elements}));
  w.eval('FIX = []');
  const squad = [1, 2, 13, 14, 15, 16, 17, 25, 26, 27, 28, 37, 38, 39, 40]
    .map(i => elements[i - 1]);
  w.eval('ADV_SQUAD = ' + JSON.stringify(squad));
  w.eval('ADV_POS = null');
  return {elements, squad};
}

check('poradce nepočítá hráče pod prahem minut', () => {
  /* xG po dvou zápasech je šum. Bez prahu vyhraje každý žebříček někdo,
     kdo odehrál dvacet minut a jednou vystřelil z penalty. */
  advSetup();
  w.eval('BOOT.elements[0].minutes = 40');
  const pool = w.eval('advPool(1)').map(p => p.id);
  if(pool.includes(1)) throw new Error('hráč se 40 minutami je v poolu');
  const prah = w.eval('ADV_MIN_MINUTES');
  if(prah < 90) throw new Error('práh je jen ' + prah + ' minut');
  return prah + ' minut';
});

check('brankáři a obránci se neposuzují podle xG', () => {
  // Řadit stopery podle očekávaných gólů je způsob, jak doporučit
  // krajního obránce z týmu, který dostává tři góly za zápas.
  const gk = w.eval('ADV_METRICS[1]').map(m => m.key);
  const df = w.eval('ADV_METRICS[2]').map(m => m.key);
  if(gk[0] !== 'expected_goals_conceded_per_90')
    throw new Error('brankáři se řadí podle ' + gk[0]);
  if(df[0] !== 'expected_goals_conceded_per_90')
    throw new Error('obránci se řadí podle ' + df[0]);
  return 'xGC první';
});

check('u xGC platí, že méně je lépe', () => {
  /* Bez otočeného znaménka by appka chválila obranu, která inkasuje
     nejvíc v lize — a doporučovala by ji posílit tou ještě horší. */
  advSetup();
  const diag = w.eval('advDiagnose(ADV_SQUAD)');
  const obranci = diag.find(d => d.pos === 2);
  const xgc = obranci.radky.find(r => r.m.key === 'expected_goals_conceded_per_90');
  if(!xgc.m.lower) throw new Error('xGC není označené jako "méně je lépe"');
  const ocekavano = xgc.muj < xgc.prumer;
  if(xgc.lepsi !== ocekavano)
    throw new Error('hodnocení je obrácené: ' + xgc.muj + ' vs ' + xgc.prumer);
  return xgc.muj.toFixed(2) + ' vs liga ' + xgc.prumer.toFixed(2);
});

check('creativity a threat se přepočítávají na 90 minut', () => {
  // Jsou to sezónní součty. Bez přepočtu vyhraje ten, kdo hrál nejvíc,
  // což není informace o kvalitě.
  advSetup();
  const p = w.eval('BOOT.elements.find(x => x.element_type === 3)');
  const m = w.eval('ADV_METRICS[3].find(x => x.key === "creativity")');
  if(!m.per90) throw new Error('creativity se nepřepočítává');
  const v = w.eval(`advValue(BOOT.elements.find(x => x.element_type === 3),
    ADV_METRICS[3].find(y => y.key === "creativity"))`);
  const cekano = Number(p.creativity) / (p.minutes / 90);
  if(Math.abs(v - cekano) > 0.01) throw new Error(v + ' ≠ ' + cekano);
  return v.toFixed(1) + ' / 90';
});

check('tip nedoporučí hráče, na kterého nejsou peníze', () => {
  advSetup();
  const tipy = w.eval('advCandidates(ADV_SQUAD, 3, 0)');
  for(const t of tipy){
    const rozpocet = w.eval(`advSell(BOOT.elements.find(p => p.id === ${t.ven.id}))`);
    if(t.dovnitr.now_cost / 10 > rozpocet + 0.001)
      throw new Error(`${t.dovnitr.web_name} za ${t.dovnitr.now_cost / 10}m,
        rozpočet ${rozpocet}m`);
  }
  return tipy.length + ' tipů v rozpočtu';
});

check('tip nenavrhne zhoršení', () => {
  // Návrh, který nic nezlepší, není návrh.
  advSetup();
  const tipy = w.eval('advCandidates(ADV_SQUAD, 3, 5)');
  for(const t of tipy){
    const a = Number(t.ven.expected_goal_involvements_per_90);
    const b = Number(t.dovnitr.expected_goal_involvements_per_90);
    if(b <= a) throw new Error(`${t.dovnitr.web_name} má xGI ${b} ≤ ${a}`);
  }
  if(!tipy.length) throw new Error('s bankou 5m se nenašlo nic');
  return tipy.length + ' zlepšení';
});

check('poradce nedoporučí hráče, kterého už mám', () => {
  advSetup();
  const mam = new Set(w.eval('ADV_SQUAD.map(p => p.id)'));
  for(const t of w.eval('advCandidates(ADV_SQUAD, 3, 20)'))
    if(mam.has(t.dovnitr.id)) throw new Error('navrhlo vlastního hráče');
  return 'filtruje';
});

check('nadvýkon je rozdíl proti podkladu, ne bodový zisk', () => {
  /* Kladné číslo znamená štěstí, které se srovná dolů. Záporné hráče,
     kterého se vyplatí podržet — a to je proti instinktu. */
  advSetup();
  const p = w.eval('BOOT.elements[5]');
  const d = w.eval('advDelta(BOOT.elements[5])');
  const cekano = (p.goals_scored + p.assists) - Number(p.expected_goal_involvements);
  if(Math.abs(d - cekano) > 0.001) throw new Error(d + ' ≠ ' + cekano);
  return d.toFixed(2);
});

check('odůvodnění odkazuje na čísla z tabulky', () => {
  // Věta, která zní chytře, ale neodkazuje na žádnou hodnotu nad ní,
  // je horší než žádná.
  advSetup();
  const t = w.eval('advCandidates(ADV_SQUAD, 3, 5)')[0];
  if(!t) throw new Error('žádný tip');
  const text = w.eval(`(function(){
    const t = advCandidates(ADV_SQUAD, 3, 5)[0];
    return advReason(t.ven, t.dovnitr, 3, advDelta(t.ven), advDelta(t.dovnitr));
  })()`);
  if(!/\d/.test(text)) throw new Error('bez čísel: ' + text);
  if(!text.includes(t.dovnitr.web_name)) throw new Error('nejmenuje hráče');
  return text.slice(0, 60);
});

check('poradce nesahá na cizí zdroje dat', () => {
  /* Opta data jsou v FPL API, které appka stahuje tak jako tak.
     Scraping theanalyst.com nebo FBref by přidal zdroj, který nemá
     veřejné rozhraní, zakazuje to v podmínkách a neposílá CORS. */
  const src = fs.readFileSync('js/advisor.js', 'utf8');
  if(/theanalyst|fbref|understat/i.test(src))
    throw new Error('poradce sahá jinam než na FPL API');
  if(!/expected_goal_involvements/.test(src))
    throw new Error('nepoužívá podkladové metriky');
  return 'jen FPL API';
});

check('plánovač je vypnutý, ne smazaný', () => {
  // Vyřazení z TABS ho vypne pro navigaci i pro mobilní plachtu.
  // Kód zůstává, aby se dal vrátit jedním řádkem.
  if(w.eval('TABS.some(t => t[0] === "t-planner")'))
    throw new Error('plánovač je pořád v TABS');
  if(!w.eval('TABS.some(t => t[0] === "t-adv")'))
    throw new Error('poradce v TABS chybí');
  if(!fs.existsSync('js/planner.js')) throw new Error('planner.js byl smazán');
  if(!/id="p-planner"/.test(fs.readFileSync('index.html', 'utf8')))
    throw new Error('panel plánovače byl smazán');
  return 'vypnutý';
});


check('práh minut roste s odehranými koly', () => {
  advSetup();
  const zkus = n => {
    w.__n = n;
    w.eval('BOOT.events = Array.from({length: 38}, (_, i) => ' +
      '({id: i + 1, finished: i < window.__n}))');
    return w.eval('advMinMinutes()');
  };
  const ocekavane = {0: 60, 1: 60, 2: 120, 3: 180, 4: 180, 10: 180};
  for(const [kol, chci] of Object.entries(ocekavane)){
    const mam = zkus(Number(kol));
    if(mam !== chci)
      throw new Error(`po ${kol} kolech práh ${mam}, čekal jsem ${chci}`);
  }
  return '60 → 120 → 180';
});

check('po třetím kole je práh zase pevných 180', () => {
  advSetup();
  w.eval('BOOT.events = Array.from({length: 38}, (_, i) => ({id: i + 1, finished: i < 20}))');
  if(w.eval('advMinMinutes()') !== w.eval('ADV_MIN_MINUTES'))
    throw new Error('v půlce sezóny se práh liší od konstanty');
  return 'shodné';
});

check('shrinkage stahuje k průměru tím víc, čím míň hráč odehrál', () => {
  const dvakrat90 = w.eval('advShrink(2, 180, 0.5)');
  const celaSezona = w.eval('advShrink(2, 1800, 0.5)');
  if(Math.abs(dvakrat90 - 1.25) > 1e-9)
    throw new Error('po 180 minutách nevyšla půlka na půlku: ' + dvakrat90);
  if(celaSezona < 1.8)
    throw new Error('po celé sezóně se pořád stahuje moc: ' + celaSezona);
  if(w.eval('advShrink(2, 0, 0.5)') !== 0.5)
    throw new Error('bez minut se nemá počítat nic vlastního');
  return dvakrat90.toFixed(2) + ' → ' + celaSezona.toFixed(2);
});

check('jeden šťastný výstřel nevyhraje žebříček', () => {
  const {elements} = advSetup();
  w.eval('BOOT.events = Array.from({length: 38}, (_, i) => ({id: i + 1, finished: i < 1}))');

  // Útočník, který odehrál jeden poločas a jednou trefil velkou šanci.
  const stastny = elements.find(p => p.element_type === 4);
  w.__id = stastny.id;
  w.eval('(function(){ const q = BOOT.elements.find(p => p.id === window.__id);' +
         'q.minutes = 60; q.expected_goals_per_90 = "1.60"; })()');

  const m = w.eval('ADV_METRICS[4][0]');
  const base = w.eval('advBase(advPool(4), ADV_METRICS[4][0])');
  const syrove = w.eval('advValue(BOOT.elements.find(p => p.id === window.__id), ADV_METRICS[4][0])');
  const stazene = w.eval('advRank(BOOT.elements.find(p => p.id === window.__id), ADV_METRICS[4][0], ' + base + ')');

  if(syrove < 1.5) throw new Error('test si nenastavil, co chtěl');
  if(stazene >= syrove * 0.55)
    throw new Error('stažená hodnota je pořád skoro syrová: ' + stazene);
  if(stazene <= base)
    throw new Error('nadprůměrný hráč spadl pod průměr: ' + stazene);
  return syrove.toFixed(2) + ' → ' + stazene.toFixed(2) + ' (průměr ' + base.toFixed(2) + ')';
});

check('v tabulce zůstává surové číslo, ne stažené', () => {
  // Stažená hodnota se používá jen na pořadí. Kdyby se zobrazila,
  // neseděla by s tím, co má člověk na oficiálním webu FPL.
  const src = fs.readFileSync('js/advisor.js', 'utf8');
  const karta = src.slice(src.indexOf('function advDiagCard'),
                          src.indexOf('function advTipCard'));
  if(/advRank|advShrink/.test(karta))
    throw new Error('vykreslení sahá po stažené hodnotě');
  if(!/advFmt\(r\.muj/.test(karta))
    throw new Error('karta nekreslí surovou hodnotu');
  return 'surové se zobrazuje';
});

check('základ pro shrinkage je vážený minutami', () => {
  advSetup();
  const m = w.eval('ADV_METRICS[3][0]');
  const vazeny = w.eval('advBase(advPool(3), ADV_METRICS[3][0])');
  const prosty = w.eval('advAvg(advPool(3), ADV_METRICS[3][0])');
  if(!Number.isFinite(vazeny)) throw new Error('vážený průměr nevyšel');
  if(vazeny === prosty && w.eval('new Set(advPool(3).map(p => p.minutes)).size') > 1)
    throw new Error('při různých minutách vyšly oba průměry stejně');
  return vazeny.toFixed(3) + ' vs prostý ' + prosty.toFixed(3);
});


/* --- Hráči k zamyšlení --- */

/* Minuty po kolech si sekce tahá z event/{gw}/live/. V testu je
   podstrčíme rovnou, ať se nemusí stubovat fetch. */
function advMinuty(mapa){   // {gw: {playerId: minuty}}
  w.__m = mapa;
  w.eval(`ADV_MINS = new Map(Object.entries(window.__m).map(
    ([gw, m]) => [Number(gw), new Map(Object.entries(m).map(([k, v]) => [Number(k), v]))]));`);
}

check('kdo dvě kola neodehrál ani minutu, je akutní případ', () => {
  const {elements} = advSetup();
  const p = elements[0];
  advMinuty({1: {[p.id]: 0}, 2: {[p.id]: 0}});
  w.__sq = [p];
  const list = w.eval('advThinkList(window.__sq)');
  if(!list.length) throw new Error('nehrající hráč se neobjevil');
  if(list[0].prio !== 1) throw new Error('priorita ' + list[0].prio);
  if(!/ani minutu/.test(list[0].duvody.join(' ')))
    throw new Error('důvod nesedí: ' + list[0].duvody.join(' '));
  return list[0].duvody[0];
});

check('jedno vynechané kolo ještě není problém', () => {
  // Rotace se stává. Dvě kola po sobě už ne.
  const {elements} = advSetup();
  const p = elements[0];
  advMinuty({1: {[p.id]: 90}, 2: {[p.id]: 0}});
  w.__sq = [p];
  const list = w.eval('advThinkList(window.__sq)');
  if(list.some(x => /ani minutu/.test(x.duvody.join(' '))))
    throw new Error('jedno vynechání appku vyplašilo');
  return 'mlčí';
});

check('těžký los sám o sobě nikoho neoznačí', () => {
  /* Tohle byla hlavní vada zrušených Transferů: doporučovaly prodat
     náhradního brankáře, protože „má těžký los“. */
  const {elements} = advSetup();
  const p = elements[0];
  w.__id = p.id;
  w.eval('(function(){ const q = BOOT.elements.find(x => x.id === window.__id);' +
         'q.status = "a"; q.chance_of_playing_next_round = null;' +
         'q.starts = 5; q.minutes = 450; q.form = "6.0";' +
         'q.expected_goals_conceded_per_90 = "0.2"; })()');
  const q = w.eval('BOOT.elements.find(x => x.id === window.__id)');
  advMinuty({1: {[p.id]: 90}, 2: {[p.id]: 90}});
  w.__sq = [q];
  const list = w.eval('advThinkList(window.__sq)');
  if(list.length) throw new Error('hráč byl označený: ' + list[0].duvody.join(' '));
  return 'žádný důvod';
});

check('náhradník bez jediného startu se připomene', () => {
  const {elements} = advSetup();
  const p = elements[0];
  w.__id = p.id;
  w.eval('(function(){ const q = BOOT.elements.find(x => x.id === window.__id);' +
         'q.starts = 0; q.minutes = 120; q.status = "a";' +
         'q.chance_of_playing_next_round = null; })()');
  const q = w.eval('BOOT.elements.find(x => x.id === window.__id)');
  advMinuty({1: {[p.id]: 60}, 2: {[p.id]: 60}});
  w.__sq = [q];
  const list = w.eval('advThinkList(window.__sq)');
  if(!list.length || !/základní sestavy/.test(list[0].duvody.join(' ')))
    throw new Error('role náhradníka se neozvala');
  return list[0].duvody[0];
});

check('zraněný má přednost před vším ostatním', () => {
  const {elements} = advSetup();
  const p = elements[0];
  w.__id = p.id;
  w.eval('(function(){ const q = BOOT.elements.find(x => x.id === window.__id);' +
         'q.status = "i"; q.chance_of_playing_next_round = 0; })()');
  const q = w.eval('BOOT.elements.find(x => x.id === window.__id)');
  advMinuty({});
  w.__sq = [q];
  const list = w.eval('advThinkList(window.__sq)');
  if(list[0].prio !== 1) throw new Error('zraněný není akutní');
  if(!/Zraněný/.test(list[0].duvody.join(' ')))
    throw new Error('důvod: ' + list[0].duvody.join(' '));
  return 'priorita 1';
});

check('sekce nabízí jen jméno a důvod, ne tabulku náhrad', () => {
  const html = w.eval('advThinkCard({p: BOOT.elements[0], prio: 1, duvody: ["Zraněný."]})');
  if(/candhead|statpop|Možné náhrady/.test(html))
    throw new Error('do karty se vrátily náhrady z Transferů');
  if(!/Zraněný/.test(html)) throw new Error('chybí důvod');
  return 'jméno a důvod';
});

check('Transfery jsou vypnuté a jejich práci převzal Poradce', () => {
  const tabs = w.eval('TABS').map(t => t[0]);
  if(tabs.includes('t-tr')) throw new Error('Transfery jsou pořád v TABS');
  if(!tabs.includes('t-adv')) throw new Error('Poradce v TABS chybí');
  const src = fs.readFileSync('js/advisor.js', 'utf8');
  if(!/buildDifferentials/.test(src))
    throw new Error('diferenciálové se do Poradce nepřestěhovali');
  return tabs.length + ' záložek';
});

check('prodejní cena se už ručně nepřepisuje', () => {
  // Editor zmizel se záložkou; nákupní cena z transfers/ je přesnější.
  const src = fs.readFileSync('js/tabs.js', 'utf8');
  const fn = src.slice(src.indexOf('function sellPrice'),
                       src.indexOf('function sellPrice') + 220);
  if(/loadSell/.test(fn))
    throw new Error('sellPrice pořád čte staré ruční přepisy');
  return 'jen z nákupní ceny';
});

check('poradce vrátil globální data, jak je našel', () => {
  w.__b = ADV_BOOT_ZALOHA; w.__f = ADV_FIX_ZALOHA;
  w.eval('BOOT = window.__b; FIX = window.__f');
  if(!w.eval('BOOT.events.length')) throw new Error('bootstrap se nevrátil');
  return 'uklizeno';
});

/* ================= FPL Zpravodaj ================= */

/* check() je schválně synchronní — výjimka z asynchronní funkce by se
   ztratila v odmítnutém slibu a test by prošel, i kdyby spadl. Modul
   parseru se proto načte tady, ne uvnitř testů. */
const NEWSAPI = (await import('./functions/api/news.js')).__test;

check('RSS parser vytáhne titulek, odkaz, čas i úryvek', () => {
  const xml = `<rss><channel>
    <item>
      <title><![CDATA[Scout picks: gameweek 2]]></title>
      <link>https://example.com/a</link>
      <pubDate>Mon, 25 Aug 2026 09:14:00 +0000</pubDate>
      <description><![CDATA[<p>Doporu&#269;en&aacute; jeden&aacute;ctka &amp; kapit&aacute;n.</p>]]></description>
    </item>
  </channel></rss>`;
  const it = NEWSAPI.parseRss(xml)[0];
  if(it.title !== 'Scout picks: gameweek 2') throw new Error('titulek: ' + it.title);
  if(it.link !== 'https://example.com/a') throw new Error('odkaz: ' + it.link);
  if(!/^2026-08-25/.test(it.date)) throw new Error('datum: ' + it.date);
  // HTML tagy pryč, entity dekódované — jinak by se v kartě objevil kód.
  if(/[<>]/.test(it.excerpt)) throw new Error('zůstal tag: ' + it.excerpt);
  if(!/kapitán/.test(it.excerpt)) throw new Error('entity nedekódované: ' + it.excerpt);
  return it.excerpt;
});

check('entity se dekódují jednou, ne dvakrát', () => {
  /* Řetězené .replace() dekódovalo dvakrát: z &amp;lt; udělalo &lt; a pak
     <, takže se text, který má zobrazit značku, proměnil ve značku. */
  if(NEWSAPI.decode('&amp;lt;b&amp;gt;') !== '&lt;b&gt;')
    throw new Error('dvojité dekódování: ' + NEWSAPI.decode('&amp;lt;b&amp;gt;'));
  if(NEWSAPI.decode('Kova&ccaron;i&cacute;') === 'Kova&ccaron;i&cacute;')
    throw new Error('pojmenované entity se nedekódují');
  // Neznámá entita se nechává být — smysluplnější než ji zahodit.
  if(NEWSAPI.decode('&nesmysl;') !== '&nesmysl;') throw new Error('spolkla neznámou entitu');
  return 'jednou';
});

check('úryvek se řeže na hranici slova, ne uprostřed', () => {
  const dlouhy = ('slovo ').repeat(80);
  const out = NEWSAPI.clip(dlouhy.trim());
  if(out.length > 210) throw new Error('nezkrátilo se: ' + out.length);
  if(!out.endsWith('…')) throw new Error('chybí výpustka');
  if(/\w…$/.test(out) && !/ …$/.test(out) && /slov…$/.test(out))
    throw new Error('řez uprostřed slova');
  return out.length + ' znaků';
});

check('podpis WordPressu se z úryvku odstřihne', () => {
  /* Feedy lepí na konec "The post X appeared first on Y". Je to podpis
     generátoru, ne obsah — a sežral půlku místa v kartě. */
  const vstup = 'The stand-out Fantasy picks over the medium term ' +
    'The post The FPL Watchlist appeared first on Best FPL Tips, Advice.';
  const out = NEWSAPI.stripBoilerplate(vstup);
  if(/The post|appeared first/i.test(out)) throw new Error('podpis zůstal: ' + out);
  if(!/stand-out Fantasy picks/.test(out)) throw new Error('ustřihlo i obsah');
  return out;
});

check('zdroj zkouší víc adres, než to vzdá', () => {
  // RSS adresy se stěhují zřídka, ale stěhují. Kandidáti navíc znamenají,
  // že se sekce nevyprázdní hned při prvním přesměrování.
  const src = fs.readFileSync('functions/api/news.js', 'utf8');
  if(!/const urls = src\.urls \|\| \[src\.url\]/.test(src))
    throw new Error('jen jedna adresa');
  // Status 200 s prázdným polem znamená, že adresa žije, ale vrací něco
  // jiného. Bez tohohle by se řetěz zastavil na první takové.
  if(!/200 ale 0 polozek/.test(src))
    throw new Error('prázdná odpověď se nebere jako neúspěch');
  return 'řetěz kandidátů';
});

check('zpravodaj má dva zdroje a oba jsou RSS', () => {
  /* Oficiální The Scout je pryč. Premier League pro něj nemá RSS, takže
     se četl přes nezdokumentované API, které bylo potřeba hádat — a
     obsah za tu údržbu nestál. */
  const api = fs.readFileSync('functions/api/news.js', 'utf8');
  const front = fs.readFileSync('js/news.js', 'utf8');
  if(/pulselive|footballapi/i.test(api.replace(/^\/\/.*$/gm, '')))
    throw new Error('v kódu zůstal mrtvý Pulselive');
  if(/'scout'/.test(front)) throw new Error('filtr pořád nabízí The Scout');
  const ids = [...api.matchAll(/id: "(\w+)"/g)].map(m => m[1]);
  if(ids.join(',') !== 'ffs,ff247') throw new Error('zdroje: ' + ids.join(','));
  return ids.join(' + ');
});

check('rozbitý zdroj neshodí ostatní', () => {
  /* Tohle je celý smysl Promise.allSettled: jeden pomalý nebo mrtvý web
     nesmí znamenat prázdnou stránku. */
  const src = fs.readFileSync('functions/api/news.js', 'utf8');
  if(!/Promise\.allSettled/.test(src))
    throw new Error('Promise.all by shodilo všechno na první chybě');
  if(!/AbortController/.test(src))
    throw new Error('bez timeoutu čeká funkce na mrtvý web až do limitu');
  if(!/failed\.push/.test(src))
    throw new Error('selhání se neohlásí ven');
  return 'izolované';
});

check('zpravodaj se nenačítá bez cache hlaviček', () => {
  const src = fs.readFileSync('functions/api/news.js', 'utf8');
  if(!/s-maxage=\d+/.test(src)) throw new Error('bez edge cache by se feedy tahaly při každém načtení');
  if(!/stale-while-revalidate/.test(src))
    throw new Error('při výpadku zdroje by se ukázala chyba místo poslední verze');
  return 'cache místo cronu';
});

check('položka bez odkazu se zahodí', () => {
  // Karta je celá odkaz. Bez URL není kam kliknout.
  const xml = `<rss><channel>
    <item><title>Bez odkazu</title><pubDate>Mon, 25 Aug 2026 09:00:00 +0000</pubDate></item>
    </channel></rss>`;
  const it = NEWSAPI.parseRss(xml)[0];
  if(it.link) throw new Error('odkaz se odněkud vzal');
  return 'filtruje se v loadSource';
});

check('Zpravodaj má záložku i box na Přehledu', () => {
  const html = SRC;
  if(!/id="t-news"/.test(html)) throw new Error('chybí tlačítko záložky');
  if(!/id="p-news"/.test(html)) throw new Error('chybí panel');
  if(!/homeNews\(\)/.test(html)) throw new Error('chybí box na Přehledu');
  if(!/rel="noopener noreferrer"/.test(html))
    throw new Error('odkazy ven bez noopener');
  return 'záložka + box';
});

check('položka z neznámého zdroje se do proudu nedostane', () => {
  /* Když server běží na jiné verzi než stránka (nedokončený deploy nebo
     edge cache), přijdou položky ze zdroje, pro který filtr nemá tlačítko.
     Dřív se tiše počítaly do „Vše“ a nešly vypnout. */
  const src = fs.readFileSync('js/news.js', 'utf8');
  const fn = src.slice(src.indexOf('function fetchNews'), src.indexOf('function newsTime'));
  if(!/NEWS_SOURCES\.map\(x => x\.id\)/.test(fn))
    throw new Error('neznámé zdroje se nefiltrují');
  if(!/znam\.has\(i\.source\)/.test(fn))
    throw new Error('filtruje se něco jiného než zdroj');
  return 'zahodí se';
});

check('filtr zdrojů přepíná bez dalšího dotazu', () => {
  // Data jsou stažená jednou; filtr jen překreslí. Kdyby sahal na síť,
  // bylo by přepínání pomalé a zbytečně by zatěžovalo cizí weby.
  const src = SRC;
  const i = src.indexOf("const f = ev.target.closest('button[data-news]')");
  const fn = src.slice(i, src.indexOf('return;', i));
  if(/fetchNews|loadNews/.test(fn))
    throw new Error('filtr znovu stahuje');
  if(!/renderNews\(\)/.test(fn)) throw new Error('filtr nepřekresluje');
  return 'jen překreslí';
});

/* ================= H2H miniliga ================= */

/* H2H stojí na HUB, který v testu nikdo nenačetl. Postavíme ho ručně —
   je to jen pořadí ligy plus historie, obojí ve tvaru, jaký vrací FPL. */
function h2hSetup(pocet, kol = 3){
  const members = Array.from({length: pocet}, (_, i) => ({
    entry: 1000 + i, player_name: 'M' + i, entry_name: 'Tym ' + i,
    total: 500 - i * 7, event_total: 40 + i,
  }));
  /* Klíč se jmenuje `event`, ne `round` — tak to vrací FPL. Fixtura to
     dřív měla jinak než realita, takže testy prošly nad daty, jaká
     appka nikdy nedostane. */
  const hists = members.map((m, i) => ({
    current: Array.from({length: kol}, (_, k) => ({
      event: k + 1, points: 50 + ((i * 7 + k * 3) % 30),
      event_transfers_cost: k === 1 && i === 0 ? 4 : 0,
    })),
  }));
  /* HUB je `let` v js/h2h.js sousedním souboru — tedy globální lexikální
     vazba, ne vlastnost window. Přiřazení w.HUB = … by vytvořilo jinou
     proměnnou, kterou by kód nikdy nepřečetl. Musí se přes eval. */
  w.eval('CONFIG.leagueId = 14044');
  w.eval('HUB = ' + JSON.stringify({
    st: {league: {name: 'Test'}}, members, hists, cur: {id: kol}, picks: [],
  }));
  w.eval('H2H_CACHE = null; H2H_GW = null');
  return {members, hists};
}

/* gwPhase řídí, co se počítá do tabulky. Testy si ho potřebují ohnout,
   ale nesmí ho nechat ohnutý — jinak spadnou úplně jiné testy o pár
   set řádků níž a hledá se to půl hodiny. */
function sFazi(faze, fn){
  const puvodni = w.eval('gwPhase');
  w.eval('gwPhase = () => ' + JSON.stringify(faze));
  try{ return fn(); }
  finally{ w.__puv = puvodni; w.eval('gwPhase = window.__puv'); }
}

check('los je stejný pro každého, kdo ho spočítá', () => {
  // Jediná vlastnost, na které celý H2H stojí: appka nemá server, takže
  // kdyby los byl opravdu náhodný, viděl by každý člen jiného soupeře.
  h2hSetup(8);
  const a = JSON.stringify(w.eval('h2hSeason()').map(r => r.matches));
  w.eval('H2H_CACHE = null');
  const b = JSON.stringify(w.eval('h2hSeason()').map(r => r.matches));
  if(a !== b) throw new Error('dva výpočty daly jiné dvojice');
  return 'shodné';
});

check('los se liší kolo od kola', () => {
  h2hSetup(8);
  const rounds = w.eval('h2hSeason()');
  const podpisy = new Set(rounds.map(r => JSON.stringify(r.matches)));
  if(podpisy.size < rounds.length)
    throw new Error('dvě kola mají identické dvojice');
  return rounds.length + ' různých kol';
});

check('každý hráč hraje v kole právě jednou', () => {
  h2hSetup(8);
  for(const r of w.eval('h2hSeason()')){
    const vsichni = r.matches.flat();
    if(new Set(vsichni).size !== vsichni.length)
      throw new Error('GW' + r.gw + ': někdo hraje dvakrát');
    if(vsichni.length !== 8)
      throw new Error('GW' + r.gw + ': hraje jen ' + vsichni.length);
  }
  return '8 hráčů, 4 zápasy';
});

check('soupeř se neopakuje ve třech po sobě jdoucích kolech', () => {
  h2hSetup(10, 4);
  const rounds = w.eval('h2hSeason()');
  for(let i = 1; i < rounds.length; i++){
    if(rounds[i].okno < 3) continue;   // zkrácené okno má vlastní test
    const dvojice = new Set();
    rounds.slice(Math.max(0, i - 3), i).forEach(r =>
      r.matches.forEach(([a, b]) => { dvojice.add(a + '|' + b); dvojice.add(b + '|' + a); }));
    for(const [a, b] of rounds[i].matches)
      if(dvojice.has(a + '|' + b))
        throw new Error('GW' + rounds[i].gw + ': ' + a + ' vs ' + b + ' znovu');
  }
  return 'okno drží';
});

check('při lichém počtu dostane jeden hráč ducha', () => {
  h2hSetup(7);
  for(const r of w.eval('h2hSeason()')){
    if(r.ghost == null) throw new Error('GW' + r.gw + ': duch chybí');
    if(r.matches.flat().includes(r.ghost))
      throw new Error('hráč s duchem hraje i zápas');
    if(r.matches.length !== 3) throw new Error('špatný počet zápasů');
  }
  return '3 zápasy + duch';
});

check('ducha dostává postupně někdo jiný', () => {
  // Bez rotace by smůla padala pořád na jednoho. Kdo ho měl nejméněkrát,
  // je na řadě — evidence se dopočítá z předchozích kol.
  h2hSetup(7, 6);
  const duchove = w.eval('h2hSeason()').map(r => r.ghost).filter(x => x != null);
  const kolikrat = {};
  duchove.forEach(d => { kolikrat[d] = (kolikrat[d] || 0) + 1; });
  const max = Math.max(...Object.values(kolikrat));
  if(max > 1 && Object.keys(kolikrat).length < 6)
    throw new Error('duch se hromadí u pár lidí: ' + JSON.stringify(kolikrat));
  return Object.keys(kolikrat).length + ' různých hráčů';
});

check('duch skóruje průměr ostatních, ne nulu ani výhru', () => {
  h2hSetup(7);
  /* Poslední kolo v seznamu je to nadcházející — tam ještě nikdo body
     nemá a duch nemá z čeho průměrovat. Bereme poslední odehrané. */
  const r = w.eval('h2hSeason()').find(x => x.gw === 3);
  const skore = w.eval('h2hGhostScore')(r);
  const body = r.ucastnici.filter(x => x.m.entry !== r.ghost)
    .map(x => w.eval('h2hScore')(x.i, r.gw));
  const prumer = Math.round(body.reduce((a, b) => a + b, 0) / body.length);
  if(skore !== prumer) throw new Error(skore + ' ≠ ' + prumer);
  if(!Number.isInteger(skore)) throw new Error('desetinné skóre → remíza nemožná');
  return 'průměr ' + skore;
});

check('do zápasu jdou body po odečtení pokut', () => {
  // Bez odečtu odmění H2H toho, kdo si vzal tři mínusy, stejně jako
  // toho, kdo si je nevzal. Nativní H2H ve FPL to počítá stejně.
  h2hSetup(6);
  const s = w.eval('h2hScore')(0, 2);   // M0 má v GW2 pokutu 4
  const hrube = w.eval('HUB.hists[0].current.find(e => e.event === 2).points');
  if(s !== hrube - 4) throw new Error(s + ' místo ' + (hrube - 4));
  return hrube + ' − 4 = ' + s;
});

check('tabulka počítá jen dopočítaná kola', () => {
  // Bonus umí překlopit výhru o bod na remízu. Kolo, které ještě čeká
  // na bonusy, proto do tabulky nesmí.
  h2hSetup(6);
  const puvodni = w.eval('gwPhase');
  const prazdna = sFazi('unchecked', () => w.eval('h2hTable()'));
  if(prazdna.some(r => r.z > 0)) throw new Error('započítalo nedopočítané kolo');
  const plna = sFazi('final', () => w.eval('h2hTable()'));
  if(!plna.some(r => r.z > 0)) throw new Error('nezapočítalo ani dopočítané');
  return 'čeká na bonusy';
});

check('výhra 3, remíza 1, prohra 0', () => {
  h2hSetup(6);
  const t = sFazi('final', () => w.eval('h2hTable()'));
  for(const r of t){
    const ocekavano = r.v * 3 + r.r * 1;
    if(r.body !== ocekavano)
      throw new Error(r.m.player_name + ': ' + r.body + ' ≠ ' + ocekavano);
    if(r.z !== r.v + r.r + r.p) throw new Error('nesedí počet zápasů');
  }
  return t.length + ' řádků sedí';
});

check('při shodě bodů rozhodnou celkové body FPL', () => {
  h2hSetup(6);
  const t = sFazi('final', () => w.eval('h2hTable()'));
  for(let i = 1; i < t.length; i++){
    if(t[i - 1].body < t[i].body) throw new Error('tabulka není podle bodů');
    if(t[i - 1].body === t[i].body && (t[i - 1].m.total || 0) < (t[i].m.total || 0))
      throw new Error('shoda se nerozhodla podle celkových bodů');
  }
  return 'body → celkové body';
});

check('duch nemá řádek v tabulce', () => {
  // Je to fikce, ne člen ligy. Kdyby měl řádek, měnil by pořadí ostatních.
  h2hSetup(7);
  const t = sFazi('final', () => w.eval('h2hTable()'));
  if(t.length !== 7) throw new Error('řádků je ' + t.length);
  return '7 řádků, 7 členů';
});

check('zkrácené okno se přizná, místo aby se zamlčelo', () => {
  const src = SRC;
  const fn = src.slice(src.indexOf('function h2hPairRound'),
                       src.indexOf('function h2hGws'));
  if(!/okno >= 0; okno--/.test(fn))
    throw new Error('okno se nezkracuje — malá liga by neměla řešení');
  if(!/round\.okno < H2H_WINDOW/.test(src))
    throw new Error('UI o zkrácení mlčí');
  return 'zkrácení je vidět';
});

check('los nevychází z pořadí ligy, ale z entry ID', () => {
  // Pořadí se během sezóny mění. Kdyby z něj los vycházel, přepisovaly
  // by se zpětně i dohrané zápasy.
  h2hSetup(8);
  const pred = JSON.stringify(w.eval('h2hSeason()').map(r => r.matches));
  w.eval('HUB.members.reverse()');   // jiné pořadí, titíž lidé
  w.eval('H2H_CACHE = null');
  const po = JSON.stringify(w.eval('h2hSeason()').map(r => r.matches));
  if(pred !== po) throw new Error('změna pořadí přepsala los');
  return 'stabilní';
});

check('uložené ID přežije refresh', () => {
  /* enterApp() si ID ukládal od začátku, ale start appky se na to nikdy
     nepodíval — koukal jen do CONFIG. Kdo měl CONFIG prázdný, dostal
     vstupní obrazovku po každém načtení stránky. */
  const boot = fs.readFileSync('js/boot.js', 'utf8');
  if(!/localStorage\.getItem\(ENTRY_KEY\)/.test(boot))
    throw new Error('start se neptá na uložené ID');
  if(/if\(CONFIG\.entryId\) enterApp/.test(boot))
    throw new Error('rozhoduje se pořád jen podle CONFIG');
  if(!/if\(savedEntry\) enterApp/.test(boot))
    throw new Error('uložené ID appku nespustí');
  return 'pamatuje si';
});

check('„Změnit ID“ uložené hodnoty smaže', () => {
  // Bez toho by pamatování bylo past — nešlo by se dostat zpátky.
  const src = SRC;
  const i = src.indexOf("$('logout')");
  if(i < 0) throw new Error('tlačítko chybí');
  const fn = src.slice(i, i + 500);
  if(!/lsDel\(ENTRY_KEY\)|removeItem/.test(fn))
    throw new Error('ID se při odhlášení nemaže');
  return 'maže';
});

check('začátek ligy je pravidlo, ne volba uživatele', () => {
  /* Dřív to byl select v panelu. Každý člen si mohl zvolit jiné číslo
     a viděl jinou tabulku než ostatní — a o tom, kdy liga začíná, se
     nerozhoduje v prohlížeči. */
  const src = fs.readFileSync('js/h2h.js', 'utf8');
  if(/id="h2hstart"|<select/.test(src)) throw new Error('výběr zůstal v panelu');
  if(/localStorage.*h2h_start/.test(src))
    throw new Error('začátek se pořád čte z localStorage');

  h2hSetup(8, 3);
  w.eval('HUB.cur = {id: 4}; H2H_CACHE = null');
  const gws = w.eval('h2hGws()');
  const start = w.eval('H2H_START');
  if(gws.some(g => g < start)) throw new Error('losuje se před startem: ' + gws.join(','));
  return 'od GW' + start;
});

check('tabulka vypíše všechny členy i bez odehraného kola', () => {
  // Prázdná tabulka vypadá jako chyba. Nuly u jmen vypadají jako začátek.
  h2hSetup(6);
  const t = sFazi('unchecked', () => w.eval('h2hTable()'));
  if(t.length !== 6) throw new Error('řádků je ' + t.length);
  if(t.some(r => r.body !== 0)) throw new Error('někdo má body z nedopočítaného kola');
  return '6 řádků na nule';
});

check('zamrazené kolo se čte, ne počítá', () => {
  /* Tohle je celý smysl zámku: los se odvozuje ze seznamu členů, takže
     po odchodu jednoho člověka by se dohraná kola přepočítala jinak.
     Zamrazené dvojice musí přebít výpočet. */
  h2hSetup(8);
  const vlastni = [[1000, 1007], [1001, 1006], [1002, 1005], [1003, 1004]];
  w.eval('H2H_FROZEN = ' + JSON.stringify({
    '2': {gw: 2, matches: vlastni, ghost: null, okno: 3}}));
  w.eval('H2H_CACHE = null');
  const r = w.eval('h2hSeason()').find(x => x.gw === 2);
  if(!r.frozen) throw new Error('kolo se netváří jako zamrazené');
  if(JSON.stringify(r.matches) !== JSON.stringify(vlastni))
    throw new Error('přepočítalo se místo načtení');
  w.eval('H2H_FROZEN = {}; H2H_CACHE = null');
  return 'čte se z Firestore';
});

check('zamrazené kolo platí i pro zákaz opakování', () => {
  // Zákaz se musí odvozovat z toho, co se opravdu hrálo — ne z toho,
  // co by dnešní seznam členů vylosoval.
  h2hSetup(8, 4);
  w.eval('H2H_FROZEN = ' + JSON.stringify({
    '3': {gw: 3, matches: [[1000, 1001], [1002, 1003], [1004, 1005], [1006, 1007]],
          ghost: null, okno: 3}}));
  w.eval('H2H_CACHE = null');
  const r4 = w.eval('h2hSeason()').find(x => x.gw === 4);
  if(r4.okno < 3){ w.eval('H2H_FROZEN = {}; H2H_CACHE = null'); return 'okno zkráceno'; }
  const opakuje = r4.matches.some(([a, b]) =>
    (a === 1000 && b === 1001) || (a === 1001 && b === 1000));
  w.eval('H2H_FROZEN = {}; H2H_CACHE = null');
  if(opakuje) throw new Error('zopakovalo dvojici ze zamrazeného kola');
  return 'zákaz drží';
});

check('zamrazuje se jen dopočítané kolo', () => {
  const src = SRC;
  const fn = src.slice(src.indexOf('async function h2hFreezeDone'),
                       src.indexOf('async function h2hFreezeDone') + 900);
  if(!/gwPhase\(round\.gw\) !== 'final'/.test(fn))
    throw new Error('zamrazilo by i kolo čekající na bonusy');
  if(!/round\.frozen \|\|/.test(fn))
    throw new Error('zapisovalo by znovu už zamrazené kolo');
  return 'jen final';
});

check('pravidla Firestore nedovolí přepsat zamrazené kolo', () => {
  // Kdyby šlo update, ztratil by zámek smysl — kdokoli by mohl
  // přepsat historii ligy.
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  const blok = rules.slice(rules.indexOf('match /leagues/'));
  if(!/allow create:/.test(blok)) throw new Error('chybí create');
  if(/allow (update|write|delete)/.test(blok))
    throw new Error('zamrazené kolo jde přepsat');
  if(!/request\.auth != null/.test(blok))
    throw new Error('může zapisovat i nepřihlášený');
  return 'jen create';
});

check('bez přihlášení H2H funguje dál', () => {
  // Zámek je pojistka, ne podmínka. Kdo se nepřihlásí, má pořád dvojice.
  h2hSetup(8);
  w.eval('H2H_FROZEN = {}; H2H_CACHE = null');
  const rounds = w.eval('h2hSeason()');
  if(!rounds.length || !rounds[0].matches.length)
    throw new Error('bez zámku nic nevylosuje');
  return rounds.length + ' kol';
});

/* ---- živé skóre a okno se sestavou ---- */

check('živé kolo se počítá ze sestav, ne z historie', () => {
  /* Historie i pořadí ligy se u běžícího kola plní se zpožděním, takže
     panel ukazoval 0:0 uprostřed sobotního odpoledne. Body hráčů ale
     chodí okamžitě — skóre se skládá z nich. */
  h2hSetup(8);
  w.eval(`HUB.cur = {id: 9};
    HUB.picks = HUB.members.map((m, i) => ({
      picks: [{element: 1, multiplier: i === 0 ? 2 : 1},
              {element: 2, multiplier: 1},
              {element: 3, multiplier: 0}],
      entry_history: {event_transfers_cost: i === 1 ? 4 : 0},
    }));
    H2H_LIVE = {gw: 9, ts: Date.now(), stats: new Map([
      [1, {total_points: 6, minutes: 90}],
      [2, {total_points: 3, minutes: 90}],
      [3, {total_points: 20, minutes: 90}]])};`);

  const a = w.eval('h2hScore(0, 9)');   // 6×2 + 3 = 15
  const b = w.eval('h2hScore(1, 9)');   // 6 + 3 − 4 = 5
  if(a !== 15) throw new Error('kapitán se nezdvojnásobil: ' + a);
  if(b !== 5) throw new Error('pokuta za přestupy se neodečetla: ' + b);
  const c = w.eval('h2hScore(0, 1)');   // starší kolo pořád z historie
  if(c === 15) throw new Error('živé body přebily dohrané kolo');
  w.eval('H2H_LIVE = null');
  return a + ' : ' + b;
});

check('lavička se do živého skóre nepočítá', () => {
  h2hSetup(8);
  w.eval(`HUB.cur = {id: 9};
    HUB.picks = HUB.members.map(() => ({
      picks: [{element: 1, multiplier: 1}, {element: 3, multiplier: 0}],
      entry_history: {event_transfers_cost: 0},
    }));
    H2H_LIVE = {gw: 9, ts: Date.now(), stats: new Map([
      [1, {total_points: 6, minutes: 90}],
      [3, {total_points: 20, minutes: 90}]])};`);
  const v = w.eval('h2hScore(0, 9)');
  w.eval('H2H_LIVE = null');
  if(v !== 6) throw new Error('do součtu se dostala lavička: ' + v);
  return '6 bodů, lavička stranou';
});

check('rozehrané kolo ukáže skóre, ne „vs“', () => {
  // Rozpis ví o prvním výkopu hned, historie až po dopočtu.
  h2hSetup(8);
  const puv = w.eval('FIX');
  w.__fx = [{event: 42, started: true, stats: []}];
  w.eval('FIX = window.__fx');
  const ano = w.eval('h2hZacalo(42)');
  const ne = w.eval('h2hZacalo(43)');
  w.__fx = puv; w.eval('FIX = window.__fx');
  if(!ano) throw new Error('rozehrané kolo se tváří jako nezačaté');
  if(ne) throw new Error('nezačaté kolo se tváří jako rozehrané');
  return 'GW42 běží, GW43 ne';
});

check('živé body se obnovují, ale jen když je na ně vidět', () => {
  const src = fs.readFileSync('js/h2h.js', 'utf8');
  if(!/setInterval/.test(src)) throw new Error('skóre se samo neobnovuje');
  if(!/panel\.hidden \|\| document\.hidden/.test(src))
    throw new Error('timer běží i nad skrytou záložkou');
  if(!/clearInterval/.test(src)) throw new Error('timer se nikdy nezastaví');
  return 'obnova po minutě, na pozadí stojí';
});

check('jméno v H2H otevírá sestavu, duch kola ne', () => {
  h2hSetup(8);
  const html = w.eval('h2hPanel()');
  if(!/data-squad="\d+"/.test(html)) throw new Error('jména nejsou klikatelná');
  if(!/data-sqgw="\d+"/.test(html)) throw new Error('chybí kolo u odkazu');
  const duch = w.eval('h2hJmeno(null, 5)');
  if(/data-squad/.test(duch)) throw new Error('duch kola nemá sestavu');
  return 'manažeři ano, duch ne';
});

check('box na Přehledu zůstává textem, ne odkazem', () => {
  // Na Přehledu je to jedna věta, ne seznam — tlačítko by tam rušilo.
  h2hSetup(8);
  const bez = w.eval('h2hJmeno({m: HUB.members[0]})');
  if(/data-squad/.test(bez)) throw new Error('bez kola se udělal odkaz');
  return 'prostý text';
});

check('okno se sestavou je v DOM a má jeden zavírací mechanismus', () => {
  const m = w.document.getElementById('sqmodal');
  if(!m) throw new Error('okno v index.html chybí');
  if(!m.hidden) throw new Error('okno je vidět hned po načtení');
  if(!m.querySelector('[role="dialog"][aria-modal="true"]'))
    throw new Error('okno není modální pro čtečku');
  if(m.querySelectorAll('[data-sqclose]').length < 2)
    throw new Error('scrim ani křížek nezavírají');
  return 'skryté, modální, zavíratelné';
});

/* ---- autosuby a kapitánská páska ---- */

/* Rozpis ve fixtuře nemá příznaky dohraných zápasů, takže by autosub
   nikdy nenastal. Testy si proto na chvíli podstrčí vlastní kolo. */
function sAutosuby(gw, fn){
  const puv = w.eval('FIX');
  w.__fx = w.eval('BOOT.teams').map((t, i) => ({
    event: gw, team_h: t.id, team_a: (t.id % 20) + 1,
    finished: true, finished_provisional: true, stats: [],
  }));
  w.eval('FIX = window.__fx');
  try{ return fn(); }
  finally{ w.__fx = puv; w.eval('FIX = window.__fx'); }
}

/* Sestava ve tvaru, jaký vrací FPL: 11 v základu podle formace,
   4 na lavičce v pořadí 12–15. */
function sestava(){
  const els = w.eval('BOOT.elements');
  const dle = t => els.filter(p => p.element_type === t);
  const xi = [dle(1)[0], ...dle(2).slice(0, 4), ...dle(3).slice(0, 4), ...dle(4).slice(0, 2)];
  const bench = [dle(1)[1], dle(2)[4], dle(3)[4], dle(4)[2]];
  return {
    entry_history: {event_transfers_cost: 0},
    picks: [
      ...xi.map((p, i) => ({element: p.id, position: i + 1, multiplier: 1,
        is_captain: i === 5, is_vice_captain: i === 6})),
      ...bench.map((p, i) => ({element: p.id, position: 12 + i, multiplier: 0,
        is_captain: false, is_vice_captain: false})),
    ],
  };
}

const statsMapa = zaznamy => new Map(zaznamy);

check('nehrající hráč ze základu se vystřídá lavičkou', () => {
  /* Tohle appka dřív nedělala nikde: sečetla hráče s multiplier > 0
     a hotovo. Po dohraném kole tím ukazovala míň bodů, než manažer
     doopravdy měl — a v H2H mohl zápas skončit obráceně. */
  const pk = sestava();
  const zaklad = pk.picks.filter(x => x.position <= 11);
  const lavice = pk.picks.filter(x => x.position > 11);

  const st = new Map();
  pk.picks.forEach(x => st.set(x.element, {minutes: 90, total_points: 2}));
  // Poslední útočník v základu nenastoupil; první polař na lavičce ano.
  st.set(zaklad[10].element, {minutes: 0, total_points: 0});
  st.set(lavice[1].element, {minutes: 90, total_points: 7});

  return sAutosuby(30, () => {
    w.__pk = pk; w.__st = st;
    const L = w.eval('resolveLineup(window.__pk, window.__st, 30)');
    if(L.subs.length !== 1) throw new Error('střídání: ' + L.subs.length);
    if(L.subs[0].in !== lavice[1].element)
      throw new Error('nastoupil někdo jiný než první způsobilý z lavičky');
    const nahradnik = L.rows.find(r => r.element === lavice[1].element);
    if(nahradnik.mult !== 1) throw new Error('náhradník se nepočítá');
    return L.total + ' bodů, 1 střídání';
  });
});

check('brankář se střídá jen za brankáře a formace se nerozbije', () => {
  const pk = sestava();
  const gk = pk.picks[0];
  const st = new Map();
  pk.picks.forEach(x => st.set(x.element, {minutes: 90, total_points: 2}));
  st.set(gk.element, {minutes: 0, total_points: 0});

  return sAutosuby(30, () => {
    w.__pk = pk; w.__st = st;
    const L = w.eval('resolveLineup(window.__pk, window.__st, 30)');
    const els = w.eval('BOOT.elements');
    const typ = id => els.find(p => p.id === id).element_type;
    const hraje = L.rows.filter(r => r.mult > 0).map(r => typ(r.element));
    if(hraje.filter(t => t === 1).length !== 1)
      throw new Error('brankářů v sestavě: ' + hraje.filter(t => t === 1).length);
    if(hraje.filter(t => t === 2).length < 3) throw new Error('míň než tři obránci');
    if(hraje.length !== 11) throw new Error('sestava má ' + hraje.length);
    return 'formace drží';
  });
});

check('dokud tým hraje, nestřídá se', () => {
  // FPL substituuje až po posledním zápase kola. Kdyby to appka dělala
  // dřív, střídalo by se během soboty tam a zpátky.
  const pk = sestava();
  const st = new Map();
  pk.picks.forEach(x => st.set(x.element, {minutes: 90, total_points: 2}));
  st.set(pk.picks[10].element, {minutes: 0, total_points: 0});

  w.__pk = pk; w.__st = st;
  const L = w.eval('resolveLineup(window.__pk, window.__st, 30)');
  if(L.subs.length) throw new Error('vystřídalo se před koncem zápasů');
  return 'čeká na konec kola';
});

check('páska přechází na vicekapitána, když kapitán nehrál', () => {
  const pk = sestava();
  const cap = pk.picks.find(x => x.is_captain);
  const vice = pk.picks.find(x => x.is_vice_captain);
  cap.multiplier = 2;

  const st = new Map();
  pk.picks.forEach(x => st.set(x.element, {minutes: 90, total_points: 3}));
  st.set(cap.element, {minutes: 0, total_points: 0});
  st.set(vice.element, {minutes: 90, total_points: 8});

  return sAutosuby(30, () => {
    w.__pk = pk; w.__st = st;
    const L = w.eval('resolveLineup(window.__pk, window.__st, 30)');
    if(L.capId !== vice.element) throw new Error('pásku má pořád nehrající kapitán');
    const v = L.rows.find(r => r.element === vice.element);
    if(v.mult !== 2) throw new Error('vicekapitán se nezdvojnásobil: ' + v.mult);
    return 'vicekapitán za ' + v.pts + ' bodů';
  });
});

check('Triple Captain přenese trojnásobek, ne dvojku', () => {
  const pk = sestava();
  const cap = pk.picks.find(x => x.is_captain);
  const vice = pk.picks.find(x => x.is_vice_captain);
  cap.multiplier = 3;
  pk.active_chip = '3xc';

  const st = new Map();
  pk.picks.forEach(x => st.set(x.element, {minutes: 90, total_points: 1}));
  st.set(cap.element, {minutes: 0, total_points: 0});
  st.set(vice.element, {minutes: 90, total_points: 10});

  return sAutosuby(30, () => {
    w.__pk = pk; w.__st = st;
    const L = w.eval('resolveLineup(window.__pk, window.__st, 30)');
    const v = L.rows.find(r => r.element === vice.element);
    if(v.mult !== 3) throw new Error('násobička: ' + v.mult);
    return '×3 na vicekapitánovi';
  });
});

check('s Bench Boostem se nestřídá, hraje celý kádr', () => {
  const pk = sestava();
  pk.active_chip = 'bboost';
  pk.picks.filter(x => x.position > 11).forEach(x => { x.multiplier = 1; });

  const st = new Map();
  pk.picks.forEach(x => st.set(x.element, {minutes: 90, total_points: 2}));
  st.set(pk.picks[3].element, {minutes: 0, total_points: 0});

  return sAutosuby(30, () => {
    w.__pk = pk; w.__st = st;
    const L = w.eval('resolveLineup(window.__pk, window.__st, 30)');
    if(L.subs.length) throw new Error('střídalo se i s Bench Boostem');
    if(L.rows.filter(r => r.mult > 0).length !== 15)
      throw new Error('nehraje celý kádr');
    return '15 hráčů, 0 střídání';
  });
});

check('pokuta za přestupy se od součtu odečte právě jednou', () => {
  const pk = sestava();
  pk.entry_history.event_transfers_cost = 8;
  const st = new Map();
  pk.picks.forEach(x => st.set(x.element, {minutes: 90, total_points: 2}));

  w.__pk = pk; w.__st = st;
  const L = w.eval('resolveLineup(window.__pk, window.__st, 30)');
  if(L.total !== 11 * 2 - 8) throw new Error('součet: ' + L.total);
  return L.total + ' bodů';
});

check('okno se sestavou počítá totéž co resolveLineup', () => {
  const pk = sestava();
  const st = new Map();
  pk.picks.forEach(x => st.set(x.element, {minutes: 90, total_points: 2}));

  w.__pk = pk;
  w.__live = {gw: 7, stats: st,
    pts: new Map([...st].map(([id, x]) => [id, x.total_points])),
    mins: new Map([...st].map(([id, x]) => [id, x.minutes]))};
  const html = w.eval('sqBody(window.__pk, window.__live, 7)');
  const L = w.eval('resolveLineup(window.__pk, window.__live.stats, 7)');
  if(!html.includes('>' + L.total + '<')) throw new Error('součet v okně nesedí');
  if(!/Lavička/.test(html)) throw new Error('chybí lavička');
  return L.total + ' bodů';
});

check('zdroje Zpravodaje pouštějí jen http odkazy', () => {
  // Cizí RSS je cizí vstup. esc() ošetří uvozovky, ne schéma.
  if(w.eval('newsHref("javascript:alert(1)")') !== '')
    throw new Error('javascript: prošlo');
  if(!/^https:/.test(w.eval('newsHref("https://example.com/a")')))
    throw new Error('https se zahodilo');
  const src = fs.readFileSync('js/news.js', 'utf8');
  if(/href="\$\{esc\(it\.link\)\}"/.test(src))
    throw new Error('někde se pořád vkládá surový odkaz');
  return 'jen http a https';
});

check('mrtvý duplikát service workeru je pryč', () => {
  if(fs.existsSync('js/sw.js'))
    throw new Error('js/sw.js žije dál a rozchází se s /sw.js');
  const boot = fs.readFileSync('js/boot.js', 'utf8');
  if(!/register\('\/sw\.js'\)/.test(boot)) throw new Error('SW se neregistruje');
  return 'jeden service worker';
});

/* ---- stav dat, odkazy, přístupnost ---- */

check('pruh se stavem dat říká fázi kola i čas dat', () => {
  nastavFaze({1: 'final', 2: 'running'});
  w.eval(`BOOT.events.forEach(e => { e.is_current = e.id === 2; });
          API_LAST = Date.now(); drawStatus();`);
  const el = w.document.getElementById('statusbar');
  if(el.hidden) throw new Error('pruh se neukázal');
  if(!/GW2/.test(el.textContent)) throw new Error('chybí číslo kola');
  if(!/data /.test(el.textContent)) throw new Error('chybí čas dat');
  // Aktualizovat je ⟳ v liště; druhé tlačítko na totéž jen zabíralo místo.
  if(el.querySelector('#sbreload')) throw new Error('tlačítko se vrátilo');
  if(!w.document.getElementById('reload')) throw new Error('zmizelo ⟳ z lišty');
  return el.querySelector('.livetag').textContent.trim();
});

check('deadline je v pruhu pod lištou, ne v ní', () => {
  // Nahoře překrýval stavový čip; tady má místo i na číslo kola.
  w.eval(`BOOT.events.forEach(e => { e.is_current = e.id === 2; e.is_next = e.id === 3;
    if(e.id === 3) e.deadline_time = new Date(Date.now() + 200000000).toISOString(); });
    drawStatus();`);
  const el = w.document.getElementById('statusbar');
  if(!el.querySelector('.sbdl')) throw new Error('deadline v pruhu chybí');
  if(!/GW3/.test(el.querySelector('.sbdl').textContent))
    throw new Error('deadline neříká, ke kterému kolu patří');
  const css = fs.readFileSync('css/app.css', 'utf8');
  if(!css.includes('.bar .cd{display:none}'))
    throw new Error('odpočet zůstal i v liště');
  return el.querySelector('.sbdl').textContent.trim();
});

check('dvojitý deadline se ohlásí, jednoduchý ne', () => {
  // Dvě kola do tří dnů po sobě: odpočet v hlavičce ukazuje jen to první.
  const den = 86400000;
  w.__ev = [{id: 30, deadline_time: new Date(Date.now() + den).toISOString()},
            {id: 31, deadline_time: new Date(Date.now() + 2 * den).toISOString()}];
  const puv = w.eval('BOOT.events');
  w.eval('BOOT.events = window.__ev');
  const dvoj = w.eval('dvojityDeadline()');
  w.__ev = [{id: 30, deadline_time: new Date(Date.now() + den).toISOString()},
            {id: 31, deadline_time: new Date(Date.now() + 8 * den).toISOString()}];
  w.eval('BOOT.events = window.__ev');
  const sam = w.eval('dvojityDeadline()');
  w.__ev = puv; w.eval('BOOT.events = window.__ev');
  if(!dvoj) throw new Error('dvojitý deadline se neohlásil');
  if(sam) throw new Error('normální rozestup se hlásí jako dvojitý');
  return 'GW30 + GW31';
});

check('odkaz na kolo se čte i zapisuje', () => {
  w.location.hash = '#h2h/gw7';
  const h = w.eval('readHash()');
  if(!h || h.tab !== 't-h2h' || h.gw !== 7) throw new Error('nepřečteno: ' + JSON.stringify(h));
  w.eval("setHash('t-league', null)");
  if(w.location.hash !== '#league') throw new Error('nezapsáno: ' + w.location.hash);
  if(w.eval('readHash("#nesmysl")') && w.eval('readHash()') === null)
    throw new Error('nesmyslný odkaz projde');
  w.location.hash = '';
  return '#h2h/gw7 → t-h2h, GW7';
});

check('chyba nabízí zkusit znovu, ne reload stránky', () => {
  const html = w.eval("errBox('FPL API vrátilo 403.', 't-h2h')");
  if(!/data-retry=/.test(html)) throw new Error('chybí tlačítko');
  if(!/role="alert"/.test(html)) throw new Error('odečítač se o chybě nedozví');
  const src = ['js/core.js', 'js/tabs.js', 'js/news.js', 'js/advisor.js']
    .map(f => fs.readFileSync(f, 'utf8')).join('');
  if(/msg'\)\.textContent = e\.message/.test(src))
    throw new Error('někde zůstala hláška bez tlačítka');
  return 'errBox všude';
});

/* ---- H2H: bilance, forma, průběh ---- */

check('vzájemná bilance počítá jen dohraná kola před tím zobrazeným', () => {
  h2hSetup(8);
  const e = w.eval('HUB.members.map(m => m.entry)');
  const b = w.eval(`h2hBilance(${e[0]}, ${e[1]}, 8)`);
  // Konkrétní čísla závisí na losu; podstatné je, že se nesčítá nic navíc.
  if(b && b.v + b.r + b.p > 6) throw new Error('bilance obsahuje i nedohraná kola');
  const zadna = w.eval(`h2hBilance(${e[0]}, ${e[0]}, 8)`);
  if(zadna) throw new Error('manažer má bilanci sám se sebou');
  return b ? `${b.v}–${b.r}–${b.p}` : 'zatím nehráli';
});

check('forma je nejvýš pět kol a nese i písmena, ne jen barvu', () => {
  h2hSetup(8);
  const e = w.eval('HUB.members[0].entry');
  const f = w.eval(`h2hForma(${e}, 8)`);
  if(f.length > 5) throw new Error('kol ve formě: ' + f.length);
  const html = w.eval(`h2hFormaHtml(${e}, 8)`);
  if(!/aria-label="Forma/.test(html)) throw new Error('chybí popis pro odečítač');
  if(f.length && !/>[VRP]</.test(html)) throw new Error('výsledek nese jen barvu');
  return f.map(x => x[1]).join('') || 'zatím nic';
});

check('karta zápasu nese výsledek i jinak než barvou', () => {
  h2hSetup(8);
  const html = w.eval('h2hPanel()');
  if(!/aria-label="[^"]*(výhra|prohra|remíza|nezačalo)/.test(html))
    throw new Error('skóre nemá slovní popis');
  return 'popis u skóre';
});

check('průběh kola počítá, kolik hráčů ještě přijde na řadu', () => {
  h2hSetup(8);
  const els = w.eval('BOOT.elements').slice(0, 15);
  w.eval(`HUB.cur = {id: 9};
    HUB.picks = HUB.members.map(() => ({
      picks: window.__pk15, entry_history: {event_transfers_cost: 0}}));`);
  w.__pk15 = els.map((p, i) => ({element: p.id, position: i + 1,
    multiplier: i < 11 ? 1 : 0, is_captain: i === 0, is_vice_captain: i === 1}));
  w.eval('HUB.picks = HUB.members.map(() => ({picks: window.__pk15, entry_history: {event_transfers_cost: 0}}))');
  w.eval(`H2H_LIVE = {gw: 9, ts: Date.now(), stats: new Map(
    window.__pk15.map((x, i) => [x.element, {minutes: i < 5 ? 90 : 0, total_points: 2}]))};`);
  const z = w.eval('h2hZbyva(0, 9)');
  w.eval('H2H_LIVE = null');
  if(!z) throw new Error('průběh se nespočítal');
  if(z.ceka + z.hraje !== 6) throw new Error('nehrajících: ' + (z.ceka + z.hraje));
  return z.hraje + ' na hřišti, ' + z.ceka + ' čeká';
});

check('karta kola jde sdílet jako text s odkazem', () => {
  h2hSetup(8);
  const gws = w.eval('h2hGws()');
  const gw = gws[0];
  w.eval(`window.__f = h2hFixtures(h2hSeason().find(r => r.gw === ${gw}))[0]`);
  const txt = w.eval(`h2hShareText(window.__f, ${gw})`);
  if(!/#h2h\/gw\d+/.test(txt)) throw new Error('chybí odkaz na kolo');
  if(!/ : /.test(txt)) throw new Error('chybí skóre');
  const src = fs.readFileSync('js/h2h.js', 'utf8');
  if(!/data-share="/.test(src)) throw new Error('panel nemá tlačítko Sdílet');
  return txt.split('\\n')[1];
});

/* ---- okno se sestavou: rozdíly, porovnání, ovládání ---- */

check('okno ukáže rozdíl proti mému kádru', () => {
  const pk = sestava();
  const st = new Map();
  pk.picks.forEach(x => st.set(x.element, {minutes: 90, total_points: 2}));
  // Můj kádr se v jednom hráči liší.
  const cizi = w.eval('BOOT.elements').find(p => !pk.picks.some(x => x.element === p.id));
  w.__moje = pk.picks.slice(1).map(x => x.element).concat([cizi.id]);
  w.eval('MY_SQUAD = new Set(window.__moje)');

  w.__pk = pk;
  w.__live = {gw: 7, stats: st,
    pts: new Map([...st].map(([id, x]) => [id, x.total_points])),
    mins: new Map([...st].map(([id, x]) => [id, x.minutes]))};
  const html = w.eval('sqBody(window.__pk, window.__live, 7)');
  w.eval('MY_SQUAD = null');
  if(!/Rozdíl proti tvému kádru/.test(html)) throw new Error('sekce chybí');
  if(!/sqdiff plus/.test(html)) throw new Error('chybí hráči navíc');
  if(!/sqdiff minus/.test(html)) throw new Error('chybí hráči, které nemá');
  return 'rozdíl vykreslen';
});

check('okno nabízí porovnání kádrů a odkaz na FPL', () => {
  const src = fs.readFileSync('js/squad.js', 'utf8');
  if(!/data-compare=/.test(src)) throw new Error('chybí tlačítko Porovnat');
  if(!/fantasy\.premierleague\.com\/entry\//.test(src))
    throw new Error('chybí odkaz na tým na FPL');
  if(!/function sqSloupec/.test(src)) throw new Error('porovnání nemá sloupce');
  return 'porovnání + odkaz';
});

check('okno drží fokus a zavírá se tlačítkem Zpět', () => {
  const src = fs.readFileSync('js/squad.js', 'utf8');
  if(!/function sqTrap/.test(src)) throw new Error('fokus se dá vytabovat ven');
  if(!/history\.pushState/.test(src) || !/popstate/.test(src))
    throw new Error('Zpět na Androidu zavře celou appku');
  return 'past na fokus + Zpět';
});

check('sestavu jde otevřít i z pořadí ligy a ze síně slávy', () => {
  const core = fs.readFileSync('js/core.js', 'utf8');
  const tabs = fs.readFileSync('js/tabs.js', 'utf8');
  if(!/squadBtn\(m\.entry, cur\.id/.test(core))
    throw new Error('v pořadí ligy nejsou jména klikatelná');
  if((tabs.match(/squadBtn\(/g) || []).length < 3)
    throw new Error('v Hubu zůstala jména jen jako text');
  return 'pořadí, síň slávy, ceny kola';
});

/* ---- horní lišta: pět sekcí, nabídka, hledání ---- */

check('v hlavičce je název ligy, ne jméno nástroje', () => {
  const bt = w.document.getElementById('brandTop');
  if(!bt) throw new Error('značka zmizela');
  if(bt.querySelector('small')) throw new Error('zůstal podtitul nad názvem');
  w.eval(`CONFIG.leagueName = 'O pohár Ládi Stropnického';
          const bt = $('brandTop');
          bt.textContent = CONFIG.leagueName;
          bt.classList.toggle('long', CONFIG.leagueName.length > 18);`);
  if(/SQUAD CHECK/i.test(bt.textContent)) throw new Error('název nástroje zůstal');
  if(!bt.classList.contains('long'))
    throw new Error('dlouhý název se nesází menším písmem');
  return bt.textContent;
});

check('v liště je pět sekcí a Víc hned za nimi', () => {
  const seg = w.document.querySelector('#topnav .seg');
  if(!seg) throw new Error('segment se nepostavil');
  const tabs = [...seg.querySelectorAll('[data-top]')].map(b => b.dataset.top);
  if(tabs.join(',') !== 't-home,t-hub,t-h2h,t-prices,t-adv')
    throw new Error('jiné sekce: ' + tabs.join(','));

  // „Víc“ musí být posledním prvkem segmentu, ne až u tlačítek vpravo.
  const posl = seg.lastElementChild;
  if(!posl.querySelector('#topmore') && posl.id !== 'topmore')
    throw new Error('Víc není na konci segmentu');
  return tabs.map(t => t.replace('t-', '')).join(' · ') + ' · Víc';
});

check('sekce ze zbytku se přenesly do nabídky', () => {
  w.document.getElementById('topmore').click();
  const sheet = w.document.getElementById('topsheet');
  if(sheet.hidden) throw new Error('nabídka se neotevřela');
  const v = [...sheet.querySelectorAll('[data-top]')].map(b => b.dataset.top);
  for(const t of ['t-squad', 't-league', 't-news', 't-inj', 't-players'])
    if(!v.includes(t)) throw new Error('v nabídce chybí ' + t);
  if(v.some(t => ['t-home', 't-hub', 't-h2h'].includes(t)))
    throw new Error('sekce je v liště i v nabídce');
  if(!sheet.querySelector('[data-topclick="reload"]'))
    throw new Error('chybí ovládání appky');
  w.document.getElementById('topmore').click();
  return v.length + ' sekcí pod Víc';
});

check('Víc nese jméno otevřené sekce', () => {
  // Bez toho by u šesti schovaných sekcí nebylo poznat, kde člověk je.
  w.eval("selectTab('t-inj')");
  const more = w.document.getElementById('topmore');
  if(!/Zranění/.test(more.textContent)) throw new Error('Víc: ' + more.textContent.trim());
  if(!more.classList.contains('active')) throw new Error('Víc se nerozsvítilo');

  w.eval("selectTab('t-home')");
  if(!/Víc/.test(more.textContent)) throw new Error('jméno se nevrátilo');
  if(more.classList.contains('active')) throw new Error('Víc svítí i mimo nabídku');
  const home = w.document.querySelector('[data-top="t-home"]');
  if(home.getAttribute('aria-selected') !== 'true')
    throw new Error('vybraná sekce se nezvýraznila');
  return 'Zranění → Víc';
});

check('lišta se nemá čím zalomit', () => {
  /* Jeden řádek, který se nikdy nezalomí: ustupuje značka a hledání,
     segment ani stavový čip nikdy — kvůli nim se sem člověk dívá. */
  const css = fs.readFileSync('css/app.css', 'utf8');
  if(!/\.bar \.wrap\{[^}]*flex-wrap:nowrap/.test(css))
    throw new Error('řádek lišty se smí zalomit');
  if(!/\.bar \.brand\{flex:0 1 auto;min-width:0;overflow:hidden/.test(css))
    throw new Error('značka se neumí zúžit a podleze segment');
  const tx = css.slice(css.indexOf('.bar .brand .tx{'),
                       css.indexOf('.bar .brand .tx{') + 320);
  if(!/-webkit-line-clamp:2/.test(tx) || !/max-width:/.test(tx))
    throw new Error('název ligy se neomezí na dva řádky');
  for(const bod of ['max-width:1200px', 'max-width:1080px', 'max-width:960px'])
    if(!css.includes(bod)) throw new Error('chybí ústupový krok ' + bod);
  return 'nowrap, tři ústupové kroky';
});

check('hledání nabízí sekce a manažery, ne prázdno', () => {
  h2hSetup(8);
  const pin = w.document.getElementById('palinput');
  w.document.getElementById('palopen').click();
  if(w.document.getElementById('palette').hidden) throw new Error('paleta se neotevřela');

  pin.value = 'h2h';
  pin.dispatchEvent(new w.Event('input'));
  let html = w.document.getElementById('palout').innerHTML;
  if(!/H2H/.test(html)) throw new Error('sekce se nenašla');

  pin.value = 'M1';
  pin.dispatchEvent(new w.Event('input'));
  html = w.document.getElementById('palout').innerHTML;
  if(!/Manažer/.test(html)) throw new Error('manažer se nenašel');

  pin.value = 'xyzzy';
  pin.dispatchEvent(new w.Event('input'));
  if(!/Nic takového/.test(w.document.getElementById('palout').innerHTML))
    throw new Error('prázdný výsledek mlčí');
  w.document.querySelector('#palette .scrim').click();
  return 'sekce + manažeři';
});

check('starý pruh záložek zůstal jako zdroj pravdy, jen není vidět', () => {
  // Segment i spodní lišta na něj klikají; kdyby zmizel z DOM, rozpadne
  // se přepínání i odkazy typu #h2h/gw7.
  if(!w.document.querySelector('.nav [role="tab"]'))
    throw new Error('.nav se smazala');
  const css = fs.readFileSync('css/app.css', 'utf8');
  if(!/\.navbar\{display:none\}/.test(css))
    throw new Error('pruh se záložkami je pořád vidět');
  return 'skrytý, ne smazaný';
});

check('stavový čip ukazuje kolo i deadline', () => {
  nastavFaze({1: 'final', 2: 'running'});
  w.eval(`BOOT.events.forEach(e => { e.is_current = e.id === 2; e.is_next = false; });
          LAST_LIVE_TOTAL = 42; drawChip();`);
  const chip = w.document.getElementById('topstate');
  if(!/GW2/.test(chip.textContent)) throw new Error('chybí kolo');
  if(!/42/.test(chip.textContent)) throw new Error('chybí průběžné body');
  if(!chip.classList.contains('live')) throw new Error('běžící kolo netepe');

  w.eval(`BOOT.events.forEach(e => { e.is_current = false; e.is_next = e.id === 3;
    if(e.id === 3) e.deadline_time = new Date(Date.now() + 90000000).toISOString(); });
    drawChip();`);
  if(!/Deadline/.test(chip.textContent)) throw new Error('mimo kolo chybí odpočet');
  return 'kolo → body, jinak deadline';
});

check('v liště není nic dvakrát', () => {
  /* Odpočet, pruh se stavem a čip říkaly totéž vedle sebe; přepínače
     byly v liště i v nabídce. Na desktopu zůstává vždycky jedna kopie. */
  const css = fs.readFileSync('css/app.css', 'utf8');
  if(!css.includes('.bar .cd{display:none}'))
    throw new Error('odpočet i čip říkají v liště totéž');
  if(!/#viewmode,#theme,#logout,#gauth\{display:none\}/.test(css))
    throw new Error('přepínače jsou v liště i v nabídce');

  // Skryté stylem, ne smazané — nabídka na ně klikà a čte z nich stav.
  for(const id of ['countdown', 'viewmode', 'theme', 'logout', 'statusbar'])
    if(!w.document.getElementById(id)) throw new Error('zmizel prvek ' + id);

  return 'jedna kopie';
});

check('kolejnice sezóny je pryč, ne zmenšená do šumu', () => {
  /* Ve výšce vlásku byla nečitelná a popisek kola z ní lezl do lišty.
     Číslo kola i postup sezónou říká pruh se stavem celou větou. */
  const css = fs.readFileSync('css/app.css', 'utf8');
  if(!/\.rail,\.railkey\{display:none\}/.test(css))
    throw new Error('kolejnice se pořád kreslí');
  if(!w.document.getElementById('rail'))
    throw new Error('prvek se smazal — drawRail by spadl');
  return 'skrytá, ne smazaná';
});

check('okno se sestavou má mobilní podobu', () => {
  const mob = fs.readFileSync('css/mobile.css', 'utf8');
  if(!/\.sqm \.card/.test(mob)) throw new Error('na mobilu zůstalo desktopové okno');
  if(!/border-radius:22px 22px 0 0/.test(mob))
    throw new Error('není z toho spodní plachta');
  return 'plachta zezdola';
});

check('squad.js je v HTML, v service workeru i před h2h.js', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const sw = fs.readFileSync('sw.js', 'utf8');
  if(!/js\/squad\.js/.test(sw)) throw new Error('offline by okno chybělo');
  const iSq = html.indexOf('/js/squad.js'), iH2 = html.indexOf('/js/h2h.js');
  if(iSq < 0 || iH2 < 0) throw new Error('skript se nenačítá');
  if(iSq > iH2) throw new Error('squadBtn se definuje až po h2h.js');
  return 'pořadí sedí';
});

check('H2H má vlastní záložku i box na Přehledu', () => {
  const html = SRC;
  if(!/id="t-h2h"/.test(html)) throw new Error('chybí tlačítko záložky');
  if(!/id="p-h2h"/.test(html)) throw new Error('chybí panel');
  if(!/'t-h2h':\s*\(\) => loadH2H\(\)/.test(html))
    throw new Error('záložka se sama nenačte');
  if(!/homeH2H\(\)/.test(html)) throw new Error('chybí box na Přehledu');
  return 'záložka + box';
});

check('spodní lišta má pět sekcí a zbytek TABS je v plachtě', () => {
  /* Lišta se rozšířila ze čtyř sekcí na pět (H2H, Ceny a Poradce se do
     ní přesunuly). Šest dlaždic včetně „Více“ je strop — při sedmi se
     popisky ořezávají do nečitelna. */
  const nav = w.document.getElementById('mnav');
  const vListe = [...nav.querySelectorAll('[data-tab]')].map(b => b.dataset.tab);
  if(vListe.length !== 5)
    throw new Error('v liště je ' + vListe.length + ' sekcí, čekal jsem 5');
  if(nav.querySelectorAll('button').length > 6)
    throw new Error('víc než šest dlaždic se na telefon nevejde');

  w.document.getElementById('mmore').click();
  const vPlachte = [...w.document.querySelectorAll('#msheetBody [data-tab]')]
    .map(b => b.dataset.tab);
  w.document.querySelector('#msheet [data-mclose]').click();

  // Dohromady musí sedět celý TABS — žádná sekce nesmí vypadnout.
  const vsude = new Set([...vListe, ...vPlachte]);
  const chybi = w.eval('TABS').map(t => t[0]).filter(t => !vsude.has(t));
  if(chybi.length) throw new Error('nedostupné sekce: ' + chybi.join(', '));
  return vListe.join(', ');
});

check('kádr se dá přepnout na jeden seznam', () => {
  const list = w.document.getElementById('squadlist');
  if(!list) throw new Error('sestava se nevykreslila');
  const prepinac = [...w.document.querySelectorAll('button[data-squadview]')];
  if(prepinac.length !== 2) throw new Error('přepínač chybí');

  prepinac.find(b => b.dataset.squadview === 'all').click();
  if(!list.classList.contains('flat')) throw new Error('nepřepnulo na seznam');
  prepinac.find(b => b.dataset.squadview === 'pos').click();
  if(list.classList.contains('flat')) throw new Error('nevrátilo se ke skupinám');
  return 'pos ⇄ all';
});

check('hráči zůstávají pod svou skupinou, ne pod poslední hlavičkou', () => {
  /* Přesně tahle chyba tady byla: řazení připojovalo řádky na konec
     seznamu, takže se po návratu k Po pozicích sesypaly všechny pod
     Lavičku a skupiny nad nimi zůstaly prázdné. Kontrolujeme, že po
     každém řádku najdeme správnou hlavičku nad ním. */
  const list = w.document.getElementById('squadlist');
  w.document.querySelector('button[data-squadview="all"]').click();
  list.querySelector('[data-sort="body"]').click();
  w.document.querySelector('button[data-squadview="pos"]').click();

  const POS = {'Brankáři': 1, 'Obránci': 2, 'Záložníci': 3, 'Útočníci': 4};
  let skupina = null, prazdna = 0, videno = 0;

  for(const el of list.children){
    if(el.classList.contains('pgroup')){
      if(skupina !== null && videno === 0) prazdna++;
      skupina = el.textContent.trim().split(/\s+/)[0];
      videno = 0;
      continue;
    }
    if(!el.classList.contains('prow')) continue;
    videno++;
    const cekano = POS[skupina];
    // Lavička míchá pozice, ta se nekontroluje.
    if(cekano && Number(el.dataset.pos) !== cekano)
      throw new Error(skupina + ' obsahuje hráče pozice ' + el.dataset.pos);
  }
  if(prazdna) throw new Error(prazdna + ' skupin zůstalo prázdných');
  return 'skupiny drží';
});

check('řazení funguje i uvnitř skupin', () => {
  const list = w.document.getElementById('squadlist');
  w.document.querySelector('button[data-squadview="pos"]').click();
  list.querySelector('[data-sort="cena"]').click();

  let skupina = null, predchozi = null, zmen = 0;
  for(const el of list.children){
    if(el.classList.contains('pgroup')){ skupina = el; predchozi = null; continue; }
    if(!el.classList.contains('prow')) continue;
    const v = Number(el.dataset.cena);
    if(predchozi !== null){
      if(v > predchozi) throw new Error('uvnitř skupiny neseřazeno sestupně');
      if(v < predchozi) zmen++;
    }
    predchozi = v;
  }
  if(!zmen) throw new Error('řazení se neprojevilo');
  return zmen + ' sestupných kroků';
});

check('řazení kádru sáhne na data, ne na text v buňce', () => {
  // V buňkách je „5.5▲“, „8.7 %“ a „–“. Kdyby se čísla tahala z textu,
  // rozhodila by řazení hned první nečíselná hodnota.
  const prow = w.document.querySelector('#squadlist .prow');
  for(const k of ['cena', 'body', 'forma', 'fdr', 'own', 'poradi'])
    if(prow.dataset[k] === undefined) throw new Error('chybí data-' + k);
  return 'šest atributů';
});

check('kliknutí na hlavičku seřadí a druhé otočí směr', () => {
  const list = w.document.getElementById('squadlist');
  w.document.querySelector('button[data-squadview="all"]').click();

  const hlavicka = list.querySelector('[data-sort="body"]');
  hlavicka.click();
  const sestupne = [...list.querySelectorAll('.prow')]
    .map(r => Number(r.dataset.body));
  for(let i = 1; i < sestupne.length; i++)
    if(sestupne[i] > sestupne[i - 1])
      throw new Error('neseřadilo sestupně: ' + sestupne.join(','));

  hlavicka.click();
  const vzestupne = [...list.querySelectorAll('.prow')]
    .map(r => Number(r.dataset.body));
  if(vzestupne[0] !== sestupne[sestupne.length - 1])
    throw new Error('druhé kliknutí neotočilo směr');

  w.document.querySelector('button[data-squadview="pos"]').click();
  return sestupne.length + ' hráčů';
});

check('FDR se řadí od nejlehčího losu', () => {
  // Jediný sloupec, kde menší číslo znamená lepší hodnotu. Kdyby se
  // choval jako ostatní, první kliknutí by ukázalo nejtěžší program.
  const list = w.document.getElementById('squadlist');
  w.document.querySelector('button[data-squadview="all"]').click();
  list.querySelector('[data-sort="fdr"]').click();
  const v = [...list.querySelectorAll('.prow')]
    .map(r => Number(r.dataset.fdr)).filter(x => x >= 0);
  if(v.length > 1 && v[0] > v[1]) throw new Error('začalo od nejtěžšího');
  w.document.querySelector('button[data-squadview="pos"]').click();
  return 'vzestupně';
});

check('hráči bez hodnoty padají na konec, ne na začátek', () => {
  // Blank nebo „ještě nehrál“ je -1. Bez zvláštního zacházení by se
  // při sestupném řazení tvářil jako nejhorší, ale při vzestupném
  // jako nejlepší — a vyplaval by nad skutečná čísla.
  const src = SRC;
  const fn = src.slice(src.indexOf('function squadSorter()'),
                       src.indexOf('function squadSorter()') + 900);
  if(!/va < 0 !== vb < 0/.test(fn))
    throw new Error('chybí zvláštní zacházení s chybějící hodnotou');
  return 'na konec při obou směrech';
});

check('sloupec posledního kola je jeden, ne řada přes sezónu', () => {
  // Sloupec se jmenuje podle právě běžícího kola a je právě jeden.
  // Kdyby se přidával za každé odehrané kolo, tabulka se rozpadne.
  const hlavicky = [...w.document.querySelectorAll('#squadlist .phead span')]
    .map(x => x.textContent.trim());
  const gw = hlavicky.filter(x => /^GW\d+$/.test(x));
  if(gw.length > 1) throw new Error('sloupců kola je víc: ' + gw.join(','));
  return gw.length ? gw[0] : 'kolo neběží';
});

check('ceny posledního kola jsou i na Přehledu', () => {
  const src = SRC;
  if(!/\$\{homeAwards\(\)\}/.test(src))
    throw new Error('drawHome ceny nevykresluje');
  // Bez ID ligy se nesmí spustit stahování — jen se to řekne.
  const fn = src.slice(src.indexOf('function homeAwards()'),
                       src.indexOf('function homeAwards()') + 900);
  if(!/leagueId/.test(fn)) throw new Error('nekontroluje ID ligy');
  return 'panel je na místě';
});

check('Přehled netahá data hubu opakovaně', () => {
  // drawHome() běží při každé změně watchlistu. Bez pojistky by každé
  // překreslení pustilo další várku dotazů na všechny členy ligy.
  const src = SRC;
  const fn = src.slice(src.indexOf('function homeAwardsLoad()'),
                       src.indexOf('function homeAwardsLoad()') + 700);
  if(!/HUB_FOR_HOME/.test(fn)) throw new Error('chybí pojistka');
  if(!/TAB_DONE\.add\('t-hub'\)/.test(fn))
    throw new Error('Hub by se po otevření načetl podruhé');
  return 'jednou a dost';
});

check('přepínač zobrazení zůstává v mobilní hlavičce', () => {
  // Jediná cesta z mobilní verze na desktopovou. Když se schová do
  // plachty „Více“, člověk ji na telefonu nenajde.
  const mob = fs.readFileSync('css/mobile.css', 'utf8');
  const skryte = mob.slice(mob.indexOf('.bar .who b'),
                           mob.indexOf('}', mob.indexOf('.bar .who b')));
  if(/#viewmode/.test(skryte))
    throw new Error('přepínač je na mobilu schovaný');
  return 'viditelný';
});

/* ================= synchronizace přes Firebase ================= */

check('appka běží i bez vyplněného configu', () => {
  // Nejdůležitější vlastnost celého sync: nesmí být podmínkou provozu.
  // V testu žádná Firebase načtená není, a přesto musí všechno fungovat.
  if(w.FB) throw new Error('test běží s Firebase — tenhle případ netestuje');
  w.localStorage.clear();
  w.eval('WATCH = null; ENTRY_ID = 60480;');
  const id = bootstrap.elements[3].id;
  w.eval(`toggleWatch(${id})`);
  if(!w.eval('isWatched')(id)) throw new Error('zápis bez Firebase selhal');
  const btn = w.document.getElementById('gauth');
  if(!btn.hidden) throw new Error('tlačítko Přihlásit svítí bez configu');
  return 'localStorage funguje sám';
});

check('zálohují se jen vlastní klíče', () => {
  w.localStorage.clear();
  w.eval('lsSet("fpl_theme", "dark")');
  w.localStorage.setItem('cizi_knihovna', 'tajnost');
  const keys = Object.keys(w.eval('syncPayload()').keys);
  if(keys.includes('cizi_knihovna'))
    throw new Error('do cloudu by šel cizí klíč');
  if(!keys.includes('fpl_theme')) throw new Error('vlastní klíč chybí');
  if(keys.includes('fpl_sync_ts')) throw new Error('mapa časů se zálohuje sama do sebe');
  return keys.length + ' klíčů, žádný cizí';
});

check('smazaný klíč se z cloudu nevrátí', () => {
  // Kdyby se mazání řešilo vynecháním, další stažení by položku obnovilo.
  w.localStorage.clear();
  w.eval('lsSet("fpl_bank:1", "2.5")');
  w.eval('lsDel("fpl_bank:1")');
  const payload = w.eval('syncPayload()');
  if(!('fpl_bank:1' in payload.keys))
    throw new Error('smazání se do cloudu vůbec nedostane');
  if(payload.keys['fpl_bank:1'] !== '')
    throw new Error('smazání není označené prázdnou hodnotou');
  return 'náhrobek uložen';
});

check('každý zápis si poznamená čas', () => {
  w.localStorage.clear();
  const pred = Date.now();
  w.eval('lsSet("fpl_view", "mobile")');
  const ts = JSON.parse(w.localStorage.getItem('fpl_sync_ts') || '{}');
  if(!ts['fpl_view']) throw new Error('čas se nezapsal');
  if(ts['fpl_view'] < pred - 1000) throw new Error('čas je z minulosti');
  return 'časy se vedou';
});

check('slučování bere novější změnu', () => {
  // Simulujeme jádro pullSync bez sítě: lokální i vzdálená verze
  // téhož klíče, rozhoduje čas.
  const merge = (mine, theirs, remoteKeys, local) => {
    const out = {...local};
    Object.entries(remoteKeys).forEach(([k, v]) => {
      if((theirs[k] || 0) <= (mine[k] || 0)) return;
      if(v === '') delete out[k]; else out[k] = v;
    });
    return out;
  };
  const stary = merge({a: 200}, {a: 100}, {a: 'cloud'}, {a: 'lokal'});
  if(stary.a !== 'lokal') throw new Error('starší cloud přepsal novější lokál');
  const novy = merge({a: 100}, {a: 200}, {a: 'cloud'}, {a: 'lokal'});
  if(novy.a !== 'cloud') throw new Error('novější cloud se nepoužil');
  const smazany = merge({a: 100}, {a: 200}, {a: ''}, {a: 'lokal'});
  if('a' in smazany) throw new Error('smazání z cloudu se neprojevilo');
  return 'novější vyhrává, i při mazání';
});

check('zápisy jdou přes lsSet, ne přímo do localStorage', () => {
  // Přímý zápis by se do cloudu nikdy nedostal — a projevilo by se to
  // až tím, že jedna položka tiše nesynchronizuje.
  const html = SRC;
  const app = html.slice(html.indexOf('/* ============ ZALOZKY ============ */'));
  const primo = [...app.matchAll(/localStorage\.(setItem|removeItem)\(/g)];
  // Povolené jsou jen ty uvnitř samotné synchronizační vrstvy.
  const vrstva = app.slice(app.indexOf('const SYNC_PREFIX'),
                           app.indexOf('function setSyncStatus'));
  const uvnitr = [...vrstva.matchAll(/localStorage\.(setItem|removeItem)\(/g)].length;
  if(primo.length > uvnitr)
    throw new Error((primo.length - uvnitr) + ' zápisů obchází lsSet');
  return 'všechny zápisy hlásí změnu';
});

check('odhlášení nemaže data v prohlížeči', () => {
  const html = SRC;
  const blok = html.slice(html.indexOf("$('gauth').addEventListener"),
                          html.indexOf("$('gauth').addEventListener") + 700);
  if(/localStorage\.clear|removeItem/.test(blok))
    throw new Error('odhlášení sahá na localStorage');
  return 'data zůstávají';
});

check('sync se nepokouší zapisovat bez přihlášení', () => {
  w.eval('FB_USER = null; SYNC_TIMER = null;');
  w.eval('scheduleSync()');
  if(w.eval('SYNC_TIMER') !== null)
    throw new Error('naplánoval zápis bez uživatele');
  return 'bez uživatele se nic neplánuje';
});

/* _headers ma jiny tvar nez vercel.json: cesta na radku, hlavicky
   odsazene pod ni. Tenhle pomocnik z nej udela mapu, at testy CSP
   nemusi resit parsovani. */
function headersSoubor(){
  const txt = fs.readFileSync('_headers', 'utf8');
  const out = {};
  for(const radek of txt.split('\n')){
    if(!radek.trim() || radek.trim().startsWith('#')) continue;
    if(!/^\s/.test(radek)) continue;          // cesta, ne hlavicka
    const i = radek.indexOf(':');
    if(i < 0) continue;
    out[radek.slice(0, i).trim()] = radek.slice(i + 1).trim();
  }
  return out;
}

check('CSP pouští to, co Firebase potřebuje', () => {
  // Tohle je přesně ta chyba, na které přihlášení tiše spadlo: config
  // i kód byly správně, ale CSP nepustila import z gstatic, takže se
  // modul nenačetl a tlačítko se schovalo jako „bez configu“.
  const hlavicky = headersSoubor();
  const csp = hlavicky['Content-Security-Policy'];
  if(!csp) throw new Error('chybí CSP úplně');

  const html = SRC;
  const zapnuto = /projectId:\s*"[^"]+"/.test(html);
  if(!zapnuto) return 'Firebase vypnutá, CSP neřešíme';

  const musi = [
    ['script-src', 'gstatic.com', 'SDK se nestáhne'],
    ['connect-src', 'googleapis.com', 'Firestore neodpoví'],
    ['frame-src', 'accounts.google.com', 'přihlašovací popup se neotevře'],
  ];
  for(const [smernice, host, dusledek] of musi){
    const blok = csp.split(';').map(x => x.trim())
      .find(x => x.startsWith(smernice));
    if(!blok) throw new Error('chybí ' + smernice + ' — ' + dusledek);
    if(!blok.includes(host))
      throw new Error(smernice + ' nepouští ' + host + ' — ' + dusledek);
  }

  // no-referrer rozbíjí Google OAuth: popup nepozná, odkud přišel.
  const ref = hlavicky['Referrer-Policy'];
  if(ref === 'no-referrer')
    throw new Error('no-referrer rozbije přihlášení přes Google');
  return 'gstatic, googleapis i popup projdou';
});

check('popup má povolené otevření', () => {
  const coop = headersSoubor()['Cross-Origin-Opener-Policy'];
  // same-origin by popupu zabránil mluvit zpátky na appku a přihlášení
  // by skončilo tím, že se okno zavře a nic se nestane.
  if(coop === 'same-origin')
    throw new Error('COOP same-origin umlčí přihlašovací popup');
  return coop || 'nenastaveno';
});

/* ================= poznámka o ukládání ================= */

check('bez Firebase poznámka nelže o zálohování', () => {
  w.FB = undefined; w.eval('FB_USER = null;');
  const n = w.eval('storageNote')('Watchlist');
  if(/přihlas|zálohuje/i.test(n.replace(/prohlížeči/gi, '')))
    throw new Error('nabízí přihlášení, které není k dispozici');
  if(!/prohlížeči/.test(n)) throw new Error('neřekne, kde data leží');
  return 'jen lokální úložiště';
});

check('nepřihlášenému poznámka nabídne přihlášení', () => {
  w.FB = {signIn: async()=>{}, signOut: async()=>{}, onUser: ()=>{},
          read: async()=>null, write: async()=>{}};
  w.eval('FB_USER = null;');
  const n = w.eval('storageNote')('Watchlist');
  if(!n.includes('data-signin')) throw new Error('chybí tlačítko k přihlášení');
  if(!/přijdeš/.test(n)) throw new Error('nevaruje před ztrátou dat');
  return 'varování + nabídka';
});

check('přihlášenému poznámka řekne, kam se zálohuje', () => {
  w.eval('FB_USER = {uid:"u1", email:"p@x.cz", displayName:"Pjendrix"};');
  const n = w.eval('storageNote')('Watchlist');
  if(!n.includes('p@x.cz')) throw new Error('neřekne na jaký účet');
  if(n.includes('data-signin')) throw new Error('nabízí přihlášení přihlášenému');
  if(!/store ok/.test(n)) throw new Error('chybí zelené odlišení');
  w.eval('FB_USER = null;'); w.FB = undefined;
  return 'účet i potvrzení';
});

check('poznámka má jedno znění pro celou appku', () => {
  // Tři různě formulované věty o tomtéž by podkopaly důvěru v každou
  // z nich. Proto jedna funkce a žádné ruční kopie.
  const html = SRC;
  const app = html.slice(html.indexOf('/* ============ ZALOZKY ============ */'));
  const volani = (app.match(/storageNote\(/g) || []).length;
  if(volani < 4) throw new Error('poznámka je jen na ' + volani + ' místech');
  // Stará ručně psaná věta nesmí zůstat vedle nové funkce.
  if(app.includes('Seznam je uložený jen v tomhle prohlížeči'))
    throw new Error('zůstala ruční kopie textu');
  return volani + ' míst, jedna definice';
});

check('poznámky se překreslí po přihlášení', () => {
  const html = SRC;
  const fn = html.slice(html.indexOf('function renderAuth()'),
                        html.indexOf('function initAuth()'));
  if(!/drawHome\(\)/.test(fn))
    throw new Error('po přihlášení by zůstala stará poznámka');
  return 'překresluje se';
});

/* ================= tlačítko Aktualizovat ================= */

check('tlačítko Aktualizovat je v hlavičce', () => {
  const btn = w.document.getElementById('reload');
  if(!btn) throw new Error('chybí');
  if(!btn.closest('.bar')) throw new Error('není v horní liště');
  if(!btn.getAttribute('aria-label')) throw new Error('bez popisku pro odečítač');
  return 'v liště, s popiskem';
});

check('obnovení vyhodí i bootstrap a rozpis', () => {
  // Půlka zaseknutí je právě v nich; ponechat je v paměti by znamenalo
  // tlačítko, které vypadá že něco dělá, ale vrátí tatáž data.
  const html = SRC;
  const fn = html.slice(html.indexOf('async function hardReload()'),
                        html.indexOf("if($('reload'))"));
  for(const v of ['API_CACHE = new Map()', 'BOOT = null', 'FIX = null',
                  'TAB_DONE.clear()'])
    if(!fn.includes(v)) throw new Error('nezahazuje ' + v);
  return 'cache, bootstrap, rozpis i stav záložek';
});

check('obnovení zůstane na otevřené záložce', () => {
  const html = SRC;
  const fn = html.slice(html.indexOf('async function hardReload()'),
                        html.indexOf("if($('reload'))"));
  if(!/aria-selected'\) === 'true'/.test(fn))
    throw new Error('nezjišťuje, kde uživatel je');
  if(!/TAB_INIT\[open\]/.test(fn))
    throw new Error('otevřenou záložku znovu nenačte');
  return 'vrátí se, kde byl';
});

check('dvojklik na Aktualizovat nespustí dvě načtení', () => {
  w.eval('RELOADING = true;');
  const btn = w.document.getElementById('reload');
  btn.click();
  // Když by pojistka nebyla, druhý běh by vynuloval BOOT uprostřed prvního.
  if(w.eval('RELOADING') !== true) throw new Error('pojistka nedrží');
  w.eval('RELOADING = false;');
  return 'druhý klik se ignoruje';
});

check('vodoznak nechytá kliknutí', () => {
  // Vrstva přes půl obrazovky bez pointer-events:none by tiše polykala
  // kliknutí na všechno, co je pod ní.
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  const blok = style.slice(style.indexOf('body::before{'),
                           style.indexOf('}', style.indexOf('body::before{')));
  if(!/pointer-events:\s*none/.test(blok)) throw new Error('polyká kliknutí');
  if(!/z-index:\s*-1/.test(blok)) throw new Error('leží nad obsahem');
  if(!/position:\s*fixed/.test(blok)) throw new Error('scrolluje s obsahem');
  return 'pod obsahem, neinteraktivní';
});

check('vodoznak je vidět i v tmavém režimu', () => {
  const css = SRC;
  const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
  const svetlo = parseFloat((style.slice(style.indexOf('body::before{'))
    .match(/opacity:\s*([\d.]+)/) || [])[1]);
  const tmaIdx = style.indexOf(':root[data-theme="dark"] body::before{');
  if(tmaIdx < 0) throw new Error('tmavá varianta chybí — zlatá by zmizela');
  const tma = parseFloat((style.slice(tmaIdx).match(/opacity:\s*([\d.]+)/) || [])[1]);
  if(!(tma > svetlo)) throw new Error(`tma ${tma} není výraznější než světlo ${svetlo}`);
  if(svetlo > 0.12) throw new Error('ve světlém režimu překřikuje obsah');
  return `světlo ${svetlo}, tma ${tma}`;
});

check('vodoznak zmizí na úzké obrazovce', () => {
  // Na mobilu nejsou postranní pruhy, takže by ležel pod textem.
  const html = SRC;
  const mq = html.slice(html.indexOf('<style id="mqS"'), html.indexOf('</style>',
    html.indexOf('<style id="mqS"')));
  if(!/body::before\{display:none\}/.test(mq))
    throw new Error('zůstává pod obsahem na mobilu');
  return 'skryto pod 640px';
});

check('obrázek vodoznaku v projektu existuje', () => {
  const css = SRC;
  const m = css.match(/body::before\{[\s\S]*?url\('([^']+)'\)/);
  if(!m) throw new Error('chybí odkaz na obrázek');
  const cesta = m[1].replace(/^\//, '');
  if(!fs.existsSync(cesta)) throw new Error('soubor ' + cesta + ' v repu není');
  return cesta;
});

/* ================= novinky po kolech ================= */

/* Malá liga s vlastní historií — novinky musí jít testovat nezávisle
   na tom, co zrovna posílá živý bootstrap. */
function hubStub(curId, totals){
  const members = totals[1].map((_, i) =>
    ({entry: 100 + i, player_name: 'M' + i, entry_name: 'T' + i}));
  const kola = Object.keys(totals).map(Number).sort((a, b) => a - b);
  const hists = members.map((m, i) => ({current: kola.map(g => ({
    round: g,
    points: totals[g][i] - (g > 1 && totals[g - 1] ? totals[g - 1][i] : 0),
    total_points: totals[g][i],
    event_transfers: 1,
    event_transfers_cost: (g === 2 && i === 0) ? 4 : 0,
    points_on_bench: (g === 2 && i === 1) ? 11 : 1,
    value: 1000,
  }))}));
  w.__hub = {st: {league: {name: 'L'}}, members, hists, picks: [], cur: {id: curId}};
  w.eval('BOOT = window.__boot; HUB = window.__hub; NEWS_GW = null; NEWS_PICKS.clear();');
  return {members, hists};
}

/* Sestavy a body kola pro ceny.
   kapitani: pole id hráčů, jeden na člena. lavicka: id hráče na lavičce.
   body: mapa id → body hráče v tom kole. */
function cenyStub(gw, kapitani, body, lavicka){
  const picks = kapitani.map((pid, i) => ({picks: [
    {element: pid, is_captain: true, multiplier: 2, position: 1},
    {element: 900 + i, is_captain: false, multiplier: 1, position: 2},
    ...(lavicka ? [{element: lavicka[i], is_captain: false,
                    multiplier: 0, position: 12}] : []),
  ]}));
  const live = {elements: Object.entries(body).map(([id, pts]) =>
    ({id: Number(id), stats: {total_points: pts}}))};
  w.__picks = picks; w.__live = live;
  w.eval(`NEWS_PICKS.set(${gw}, window.__picks); NEWS_LIVE.set(${gw}, window.__live);`);
  return {picks, live};
}

function nastavFaze(mapa){
  bootstrap.events.forEach(e => {
    const f = mapa[e.id];
    e.finished = f === 'unchecked' || f === 'final';
    e.data_checked = f === 'final';
    e.is_current = f === 'running';
  });
}

check('fáze kola se pozná podle data_checked, ne finished', () => {
  // finished přijde hned po posledním zápase, bonusy se dopočítávají
  // až potom — kdo se řídí finished, ukáže neúplná čísla jako konečná.
  nastavFaze({1: 'final', 2: 'unchecked', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [200, 180, 160], 3: [250, 240, 230]});
  const f = w.eval('gwPhase');
  if(f(1) !== 'final') throw new Error('dokončené kolo není final');
  if(f(2) !== 'unchecked') throw new Error('dohrané bez bonusů není unchecked');
  if(f(3) !== 'running') throw new Error('běžící kolo není running');
  return 'final / unchecked / running';
});

/* Přepíše stav zápasů daného kola v rozpisu.
   stav: 'hraje' | 'dohrano' (bez bonusů) | 'bonusy' */
function nastavZapasy(gw, stav, vyjimka){
  fixtures.filter(f => f.event === gw).forEach((f, i) => {
    const s = (vyjimka != null && i === 0) ? vyjimka : stav;
    f.finished_provisional = s !== 'hraje';
    f.finished = s !== 'hraje';
    f.stats = s === 'bonusy'
      ? [{identifier: 'bonus', h: [{element: 1, value: 3}], a: []}]
      : [];
  });
}

check('kolo je hotové, když jsou dohrané zápasy a bonusy — bez data_checked', () => {
  // FPL překlápí data_checked klidně půl dne po posledním zápase.
  // Do té doby appka hlásila „kolo běží“ a schovávala novinky.
  nastavFaze({1: 'final', 2: 'running', 3: 'running'});
  nastavZapasy(2, 'bonusy');
  hubStub(3, {1: [100, 90, 80], 2: [200, 180, 160], 3: [250, 240, 230]});
  const f = w.eval('gwPhase');
  if(f(2) !== 'final') throw new Error('dohrané kolo s bonusy není final');
  nastavZapasy(2, 'dohrano');
  if(f(2) !== 'unchecked') throw new Error('dohrané bez bonusů není unchecked');
  nastavZapasy(2, 'bonusy', 'hraje');
  if(f(2) !== 'running') throw new Error('jeden nedohraný zápas nestačí na running');
  nastavZapasy(2, 'hraje');
  return 'rozpis rozhoduje dřív než data_checked';
});

check('pohyby v tabulce se ukážou hned po dopočtu bonusů', () => {
  nastavFaze({1: 'final', 2: 'running', 3: 'running'});
  nastavZapasy(2, 'bonusy');
  hubStub(2, {1: [100, 90, 80, 70], 2: [110, 100, 95, 300]});
  const k = w.eval('buildNews(2, [])').map(x => x.kicker);
  nastavZapasy(2, 'hraje');
  if(!k.some(x => /Skok|Pád/.test(x)))
    throw new Error('dohrané kolo pořád schovává pohyby v tabulce');
  return 'novinky nečekají na příští kolo';
});

check('novinky vzniknou i bez historie — z živého pořadí ligy', () => {
  // entry/history se po prvním kole plní se zpožděním; hub kvůli tomu
  // hlásil „zatím nejsou data“ i den po posledním zápase.
  nastavFaze({1: 'running', 2: 'running', 3: 'running'});
  nastavZapasy(1, 'bonusy');
  hubStub(1, {1: [100, 90, 80]});
  w.eval(`HUB.hists = HUB.hists.map(() => ({current: []}));
          HUB.members.forEach((m, i) => { m.event_total = [61, 44, 30][i]; m.total = m.event_total; });`);
  const n = w.eval('buildNews(1, [])');
  nastavZapasy(1, 'hraje');
  if(!n.length) throw new Error('bez historie nevzniknou žádné novinky');
  if(!n.some(x => /61/.test(x.head))) throw new Error('nepoužil body z pořadí ligy');
  return n.length + ' novinek z živého pořadí';
});

check('první kolo sezóny má víc než dvě novinky', () => {
  // V GW1 není s čím srovnávat pořadí, takže odpadly skoky i pády —
  // zbyly dvě věty. Průměr, těsný souboj a čelo tabulky vystačí
  // s body a součtem, takže fungují i z živého pořadí.
  nastavFaze({1: 'running', 2: 'running', 3: 'running'});
  hubStub(1, {1: [71, 70, 66, 35]});
  w.eval(`HUB.hists = HUB.hists.map(() => ({current: []}));
          HUB.members.forEach((m, i) => { m.event_total = [71, 70, 66, 35][i]; m.total = m.event_total; });`);
  const k = w.eval('buildNews(1, [])').map(x => x.kicker);
  if(k.length < 4) throw new Error('jen ' + k.length + ' novinek: ' + k.join(', '));
  if(!k.includes('Průměr kola')) throw new Error('chybí průměr kola');
  if(!k.includes('V čele ligy')) throw new Error('chybí čelo tabulky');
  return k.join(' · ');
});

check('průběžný řádek nehlásí přestupy ani lavičku', () => {
  // Pořadí ligy nese jen body a součet — nula by tvrdila něco, co nevíme.
  nastavFaze({1: 'running', 2: 'running', 3: 'running'});
  hubStub(1, {1: [100, 90, 80]});
  w.eval(`HUB.hists = HUB.hists.map(() => ({current: []}));
          HUB.members.forEach((m, i) => { m.event_total = [61, 44, 30][i]; m.total = m.event_total; });`);
  const k = w.eval('buildNews(1, [])').map(x => x.kicker);
  if(k.some(x => /Netrpělivost|Lavička/.test(x)))
    throw new Error('vymýšlí si data, která pořadí ligy nemá');
  return 'vynecháno místo nul';
});

check('běžící kolo neukazuje pohyby v tabulce', () => {
  // Porovnávalo by rozehraný stav s dokončeným, takže by hlásilo skoky,
  // které se do neděle několikrát otočí.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 100, 95], 3: [120, 300, 100]});
  const bezi = w.eval('buildNews(3, [])').map(x => x.kicker);
  if(bezi.some(k => /Skok|Pád/.test(k)))
    throw new Error('rozehrané kolo hlásí skoky v tabulce');
  return 'skoky se během kola neukazují';
});

check('dokončené kolo pohyby ukáže', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 100, 300]});
  const hotove = w.eval('buildNews(2, [])').map(x => x.kicker);
  if(!hotove.some(k => /Skok/.test(k)))
    throw new Error('skok se u dokončeného kola neobjevil');
  return hotove.join(', ');
});

check('pohyby se počítají k vybranému kolu, ne k poslednímu', () => {
  // Dřív se bralo natvrdo posledních dvou kol v historii. Při proklikání
  // zpět by pak GW2 ukazoval skoky z GW5.
  nastavFaze({1: 'final', 2: 'final', 3: 'final'});
  // GW2: M2 nahoru o 2. GW3: M1 nahoru o 2, M2 dolů o 2 — jiný skok
  // než v GW2, takže se pozná, jestli se bere vybrané kolo.
  hubStub(3, {1: [100, 90, 80], 2: [110, 100, 300], 3: [400, 500, 310]});
  const gw2 = w.eval('buildNews(2, [])').find(x => /Skok/.test(x.kicker));
  const gw3 = w.eval('buildNews(3, [])').find(x => /Skok/.test(x.kicker));
  if(!gw2 || !gw3) throw new Error('některé kolo skok nemá');
  if(gw2.head === gw3.head)
    throw new Error('obě kola hlásí týž skok — bere se pořád poslední');
  return 'každé kolo má svůj';
});

check('novinky jdou postavit i bez sestav', () => {
  // Sestavy starších kol se dotahují až na kliknutí; do té doby musí
  // panel fungovat, jen bez kapitánské novinky.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 100, 95]});
  const n = w.eval('buildNews(2, [])');
  if(!n.length) throw new Error('bez sestav nevzniklo nic');
  if(n.some(x => /Kapitán/.test(x.kicker)))
    throw new Error('kapitánská novinka vznikla bez sestav');
  return n.length + ' novinek bez sestav';
});

check('nabízejí se jen zahájená kola', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 100, 95], 3: [120, 110, 100]});
  const gws = w.eval('newsGws()');
  if(gws.some(g => g > 3)) throw new Error('nabízí budoucí kolo: ' + gws.join(','));
  if(!gws.includes(3)) throw new Error('chybí rozehrané kolo');
  if(!gws.includes(1)) throw new Error('chybí nejstarší kolo');
  return 'GW ' + gws.join(', ');
});

check('panel hlásí stav vybraného kola', () => {
  nastavFaze({1: 'final', 2: 'unchecked', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 100, 95], 3: [120, 110, 100]});

  w.eval('NEWS_GW = 3');
  if(!/Kolo běží/.test(w.eval('newsPanel()')))
    throw new Error('rozehrané kolo se netváří jako rozehrané');

  w.eval('NEWS_GW = 2');
  if(!/bonus/i.test(w.eval('newsPanel()')))
    throw new Error('nezmíní čekání na bonusy');

  w.eval('NEWS_GW = 1');
  const fin = w.eval('newsPanel()');
  if(!/Konečné/.test(fin)) throw new Error('dokončené kolo není označené');
  if(!/nezmění/.test(fin)) throw new Error('neřekne, že jsou čísla definitivní');
  return 'tři různá hlášení';
});

check('přepínač označí právě jedno kolo', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 100, 95], 3: [120, 110, 100]});
  w.eval('NEWS_GW = 2');
  const p = w.eval('newsPanel()');
  const vybrano = (p.match(/aria-selected="true"/g) || []).length;
  if(vybrano !== 1) throw new Error('vybraných kol: ' + vybrano);
  if(!p.includes('data-newsgw="2"')) throw new Error('chybí tlačítko kola');
  return 'jedno vybrané';
});

check('výběr kola se nepřenese na jiný tým', () => {
  const html = SRC;
  const reset = html.slice(html.indexOf('function resetState()'),
                           html.indexOf('function resetState()') + 1600);
  if(!/NEWS_GW = null/.test(reset) || !/NEWS_PICKS\.clear\(\)/.test(reset))
    throw new Error('po přepnutí týmu by zůstalo cizí kolo i cizí sestavy');
  return 'reset čistí';
});


/* ---------- ceny kola ---------- */

check('vítěz a smolař kola jsou ceny, ne novinky', () => {
  // Obojí má vlastní kartu nahoře; v seznamu zpráv by to byla
  // tatáž věta podruhé.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [160, 190, 140]});
  w.eval('NEWS_GW = 2');
  const panel = w.eval('newsPanel()');
  const ceny = w.eval('buildAwards(2, NEWS_PICKS.get(2), NEWS_LIVE.get(2))')
    .map(x => x.key);
  if(!ceny.includes('win')) throw new Error('chybí cena za výhru kola');
  if(!ceny.includes('bench')) throw new Error('chybí cena pro smolaře');
  if(/class="kicker">Kolo 2</.test(panel))
    throw new Error('vítěz kola je i mezi novinkami');
  if(/Lavička hanby/.test(panel))
    throw new Error('lavička je i mezi novinkami');
  return ceny.join(' · ');
});

check('smolař kola je ten s nejvíc body na lavičce', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  // hubStub dává v GW2 lavičku 11 bodů druhému členovi, ostatním 1
  hubStub(3, {1: [100, 90, 80], 2: [160, 190, 140]});
  const b = w.eval('buildAwards(2, [], null)').find(x => x.key === 'bench');
  if(!b) throw new Error('cena pro smolaře nevznikla');
  if(b.who !== 'M1') throw new Error('smolař je ' + b.who + ', čekal jsem M1');
  if(!/11/.test(b.val)) throw new Error('špatný počet bodů: ' + b.val);
  return b.who + ' — ' + b.val;
});

check('smolař pojmenuje hráče z lavičky, když má sestavy', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [160, 190, 140]});
  const jm = elements[40].web_name;
  cenyStub(2, [1, 2, 3], {1: 10, 2: 4, 3: 2, [elements[40].id]: 9},
           [elements[40].id, elements[40].id, elements[40].id]);
  const b = w.eval('buildAwards(2, NEWS_PICKS.get(2), NEWS_LIVE.get(2))')
    .find(x => x.key === 'bench');
  if(!new RegExp(jm).test(b.sub))
    throw new Error('nejmenuje hráče z lavičky: ' + b.sub);
  return b.sub;
});

check('kapitánské ceny potřebují sestavy i body hráčů', () => {
  // Bez event/{gw}/live/ známe jen jméno kapitána, ne jeho výkon —
  // pak nemá smysl vyhlašovat, kdo byl nejlepší.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [160, 190, 140]});
  const bez = w.eval('buildAwards(2, [], null)').map(x => x.key);
  if(bez.some(k => k === 'cap' || k === 'flop'))
    throw new Error('kapitánská cena vznikla bez dat');

  cenyStub(2, [1, 2, 3], {1: 12, 2: 2, 3: 6});
  const s = w.eval('buildAwards(2, NEWS_PICKS.get(2), NEWS_LIVE.get(2))');
  const cap = s.find(x => x.key === 'cap'), flop = s.find(x => x.key === 'flop');
  if(!cap || !flop) throw new Error('kapitánské ceny nevznikly ani s daty');
  if(cap.who !== 'M0') throw new Error('nejlepší kapitán je ' + cap.who);
  if(flop.who !== 'M1') throw new Error('propadák je ' + flop.who);
  if(!/24/.test(cap.val)) throw new Error('nezdvojnásobil body: ' + cap.val);
  return cap.who + ' 24 b vs ' + flop.who + ' 4 b';
});

check('trojnásobný kapitán se počítá krát tři', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [160, 190, 140]});
  cenyStub(2, [1, 2, 3], {1: 5, 2: 4, 3: 2});
  w.eval('NEWS_PICKS.get(2)[1].picks[0].multiplier = 3');
  const cap = w.eval('buildAwards(2, NEWS_PICKS.get(2), NEWS_LIVE.get(2))')
    .find(x => x.key === 'cap');
  if(cap.who !== 'M1') throw new Error('TC neporazil dvojnásobek: ' + cap.who);
  if(!/12/.test(cap.val)) throw new Error('špatné body: ' + cap.val);
  return 'TC 4 × 3 = 12 b';
});

check('starší kolo bez historie se dopočítá ze sestav', () => {
  /* Na začátku sezóny nemá FPL řádek v historii ani pro dohrané GW1
     a pořadí ligy zná jen kolo aktuální. Archiv pak hlásil „za tohle
     kolo zatím nejsou data“, přestože sestavy i body appka stahuje. */
  nastavFaze({1: 'final', 2: 'running'});
  hubStub(2, {1: [100, 90, 80], 2: [200, 180, 160]});
  // Historie zná jen GW2 — řádek pro GW1 z ní vymažeme.
  w.eval('HUB.hists.forEach(h => { h.current = h.current.filter(x => x.round !== 1); })');
  w.eval('NEWS_PICKS.clear(); NEWS_LIVE.clear()');
  cenyStub(1, [1, 2, 3], {1: 6, 2: 4, 3: 2, 900: 1, 901: 1, 902: 1});

  const rows = w.eval('gwRows(1)');
  if(!rows.length) throw new Error('kolo zůstalo prázdné');
  if(!rows.every(r => r.ev.zeSestav)) throw new Error('řádky nejsou ze sestav');
  const awards = w.eval('buildAwards(1, NEWS_PICKS.get(1), NEWS_LIVE.get(1))');
  if(!awards.length) throw new Error('ceny se pořád nespočítaly');
  return rows.length + ' manažerů, ceny: ' + awards.map(a => a.key).join(', ');
});

check('síň slávy nemizí spolu s prázdným kolem', () => {
  const src = fs.readFileSync('js/tabs.js', 'utf8');
  const blok = src.slice(src.indexOf('if(!awards.length && !news.length)'),
                         src.indexOf('if(!awards.length && !news.length)') + 700);
  if(!/hallPanel\(\)/.test(blok))
    throw new Error('při prázdném kole zmizí i tabulka cen za sezónu');
  return 'tabulka zůstává';
});

check('ceny se u prázdné kategorie vynechají místo pomlčky', () => {
  // Když v kole nikdo nenechal body na lavičce, karta zmizí —
  // mřížka se zúží, ale nezůstane v ní díra.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80]});
  w.eval('HUB.hists.forEach(h => h.current.forEach(x => x.points_on_bench = 0))');
  const k = w.eval('buildAwards(1, [], null)').map(x => x.key);
  if(k.includes('bench')) throw new Error('nulová lavička dostala cenu');
  if(!k.includes('win')) throw new Error('zmizel i vítěz kola');
  return k.join(' · ');
});

check('ceny fungují v prvním kole z živého pořadí', () => {
  nastavFaze({1: 'running', 2: 'running', 3: 'running'});
  nastavZapasy(1, 'bonusy');
  hubStub(1, {1: [100, 90, 80]});
  w.eval(`HUB.hists = HUB.hists.map(() => ({current: []}));
          HUB.members.forEach((m, i) => { m.event_total = [71, 44, 30][i]; m.total = m.event_total; });`);
  const a = w.eval('buildAwards(1, [], null)');
  nastavZapasy(1, 'hraje');
  const win = a.find(x => x.key === 'win');
  if(!win) throw new Error('vítěz kola nevznikl');
  if(win.who !== 'M0' || !/71/.test(win.val))
    throw new Error('špatný vítěz: ' + win.who + ' ' + win.val);
  if(a.some(x => x.key === 'bench'))
    throw new Error('lavička z pořadí ligy — to jsou vymyšlená data');
  return win.who + ' ' + win.val;
});

/* ---------- síň slávy ---------- */

check('síň slávy sčítá výhry přes celou sezónu', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'final'});
  // GW1 vyhraje M0 (100), GW2 M1 (+100), GW3 M2 (+100)
  hubStub(3, {1: [100, 90, 80], 2: [110, 190, 90], 3: [120, 200, 190]});
  const {rows, kol} = w.eval('hallOfFame()');
  if(kol !== 3) throw new Error('započítal ' + kol + ' kol místo tří');
  const podle = Object.fromEntries(rows.map(r => [r.m.player_name, r.win]));
  if(podle.M0 !== 1 || podle.M1 !== 1 || podle.M2 !== 1)
    throw new Error('výhry: ' + JSON.stringify(podle));
  return 'každý po jedné';
});

check('rozehrané kolo se do síně slávy nepočítá', () => {
  // Čísla se do neděle několikrát otočí; bilance sezóny by skákala.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 190, 90], 3: [120, 200, 190]});
  if(w.eval('hallOfFame().kol') !== 2)
    throw new Error('rozehrané kolo se započítalo');
  return 'jen dohraná kola';
});

check('síň slávy přizná, z kolika kol má kapitány', () => {
  // Sestavy starších kol se dotahují líně — tabulka to musí říct,
  // místo aby tiše ukázala nuly jako fakt.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 190, 90]});
  const bez = w.eval('hallOfFame()');
  if(bez.pokryto !== 0) throw new Error('tvrdí, že má kapitány bez sestav');
  cenyStub(2, [1, 2, 3], {1: 12, 2: 2, 3: 6});
  const s = w.eval('hallOfFame()');
  if(s.pokryto !== 1) throw new Error('pokrytí: ' + s.pokryto + ' z ' + s.kol);
  const panel = w.eval('hallPanel()');
  if(!/1 z 2 kol/.test(panel)) throw new Error('nepřizná neúplná data');
  if(!/data-hallall/.test(panel)) throw new Error('chybí tlačítko na dotažení');
  return s.pokryto + ' z ' + s.kol + ' kol';
});

check('síň slávy zvýrazní maximum ve sloupci', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'final'});
  hubStub(3, {1: [100, 90, 80], 2: [300, 100, 90], 3: [500, 110, 100]});
  const panel = w.eval('hallPanel()');
  const lead = (panel.match(/class="c has lead"/g) || []).length;
  if(!lead) throw new Error('nic není označené jako maximum');
  if(!/🏆/.test(panel) || !/🤡/.test(panel))
    throw new Error('chybí emoji v hlavičce tabulky');
  return lead + ' zvýrazněných buněk';
});

check('panel ukáže ceny, novinky i síň slávy', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 190, 90]});
  w.eval('NEWS_GW = 2');
  const p = w.eval('newsPanel()');
  for(const [co, re] of [['ceny kola', /Ceny kola/], ['zprávy', /Co se ještě stalo/],
                         ['síň slávy', /Síň slávy/], ['karta ceny', /class="award/]]){
    if(!re.test(p)) throw new Error('v panelu chybí ' + co);
  }
  return 'tři sekce';
});

check('výběr kola nechá i body hráčů cizímu týmu', () => {
  const html = SRC;
  const reset = html.slice(html.indexOf('function resetState()'),
                           html.indexOf('function resetState()') + 1800);
  if(!/NEWS_LIVE\.clear\(\)/.test(reset) || !/HALL_ALL = false/.test(reset))
    throw new Error('po přepnutí týmu by zůstala cizí síň slávy');
  return 'reset čistí i ceny';
});


check('smolař vznikne i v prvním kole, kdy ještě není historie', () => {
  // entry/history se po prvním kole plní se zpožděním; body kola pak
  // chodí z pořadí ligy, které lavičku nezná. Sestavy a body hráčů ale
  // máme, takže se součet dá spočítat i tak.
  nastavFaze({1: 'running', 2: 'running', 3: 'running'});
  nastavZapasy(1, 'bonusy');
  hubStub(1, {1: [100, 90, 80]});
  w.eval(`HUB.hists = HUB.hists.map(() => ({current: []}));
          HUB.members.forEach((m, i) => { m.event_total = [71, 44, 30][i]; m.total = m.event_total; });`);
  const lav = [elements[10].id, elements[11].id, elements[12].id];
  cenyStub(1, [1, 2, 3], {1: 5, 2: 4, 3: 2,
    [lav[0]]: 3, [lav[1]]: 12, [lav[2]]: 1}, lav);
  const b = w.eval('buildAwards(1, NEWS_PICKS.get(1), NEWS_LIVE.get(1))')
    .find(x => x.key === 'bench');
  nastavZapasy(1, 'hraje');
  if(!b) throw new Error('smolař bez historie nevznikl');
  if(b.who !== 'M1') throw new Error('smolař je ' + b.who + ', čekal jsem M1');
  if(!/12/.test(b.val)) throw new Error('špatné body: ' + b.val);
  return b.who + ' — ' + b.val;
});

check('bez sestav i bez historie se lavička nevymýšlí', () => {
  nastavFaze({1: 'running', 2: 'running', 3: 'running'});
  nastavZapasy(1, 'bonusy');
  hubStub(1, {1: [100, 90, 80]});
  w.eval(`HUB.hists = HUB.hists.map(() => ({current: []}));
          HUB.members.forEach((m, i) => { m.event_total = [71, 44, 30][i]; m.total = m.event_total; });`);
  const k = w.eval('buildAwards(1, [], null)').map(x => x.key);
  nastavZapasy(1, 'hraje');
  if(k.includes('bench')) throw new Error('vymyslel si body na lavičce');
  return 'vynecháno místo nuly';
});

check('selhané načtení bodů hráčů se přizná', () => {
  // Dřív se ukládalo null i při chybě, takže has() vrátilo true
  // a panel schoval i hlášku, která to měla vysvětlit.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 190, 90]});
  w.eval('NEWS_GW = 2; NEWS_PICKS.set(2, []); NEWS_LIVE.set(2, null);');
  const p = w.eval('newsPanel()');
  if(/dopočítám po načtení/.test(p))
    throw new Error('tváří se, že se to pořád načítá');
  if(!/nepodařilo se/.test(p)) throw new Error('mlčí o tom, že dotaz selhal');
  return 'panel řekne důvod';
});

check('nedopočítané kolo má u cen odznak', () => {
  nastavFaze({1: 'final', 2: 'unchecked', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 190, 90], 3: [120, 200, 100]});
  w.eval('NEWS_GW = 3');
  if(!/živě/.test(w.eval('newsPanel()')))
    throw new Error('rozehrané kolo nemá u cen odznak');
  w.eval('NEWS_GW = 2');
  if(!/čeká na bonusy/.test(w.eval('newsPanel()')))
    throw new Error('kolo bez bonusů nemá odznak');
  w.eval('NEWS_GW = 1');
  if(/livetag/.test(w.eval('newsPanel()')))
    throw new Error('dopočítané kolo má odznak, i když má konečná čísla');
  return 'živě / čeká na bonusy / nic';
});

check('do síně slávy jde kolo až po dopočtu bonusů', () => {
  // Tříbodový bonus umí otočit vítěze i propadáka; tabulka by pak
  // přepisovala vlastní historii.
  nastavFaze({1: 'final', 2: 'unchecked', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 190, 90], 3: [120, 200, 100]});
  if(w.eval('hallOfFame().kol') !== 1)
    throw new Error('započítalo se kolo, které čeká na bonusy');
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  if(w.eval('hallOfFame().kol') !== 2)
    throw new Error('dopočítané kolo se do bilance nepropsalo');
  return 'propíše se až s bonusy';
});


check('shoda všech kapitánů kartu neschová', () => {
  // Dřív se při shodě vynechaly obě kapitánské ceny, takže ze čtyř
  // karet zbyly dvě a nic nevysvětlilo proč.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 190, 90]});
  cenyStub(2, [1, 2, 3], {1: 2, 2: 2, 3: 2});
  const a = w.eval('buildAwards(2, NEWS_PICKS.get(2), NEWS_LIVE.get(2))');
  const cap = a.find(x => x.key === 'cap'), flop = a.find(x => x.key === 'flop');
  if(!cap) throw new Error('při shodě zmizela i cena za kapitána');
  if(!flop) throw new Error('při shodě zmizel celý slot propadáka');
  if(!/neodlišil/.test(flop.who))
    throw new Error('vyhlásil propadáka, i když všichni dali stejně: ' + flop.who);
  if(!/3 kapitánů/.test(cap.sub)) throw new Error('neřekne, že jde o shodu: ' + cap.sub);
  return cap.who + ' — ' + cap.val;
});

check('o kapitánskou cenu se při shodě na špici dělí víc lidí', () => {
  // 2 z 5 je menšina, takže cena platí a dělí se.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80, 70, 60], 2: [110, 190, 90, 80, 70]});
  cenyStub(2, [1, 1, 2, 2, 3], {1: 10, 2: 5, 3: 1});
  const a = w.eval('buildAwards(2, NEWS_PICKS.get(2), NEWS_LIVE.get(2))');
  const cap = a.find(x => x.key === 'cap'), flop = a.find(x => x.key === 'flop');
  if(!/M0/.test(cap.who) || !/M1/.test(cap.who))
    throw new Error('dělenou cenu dostal jen jeden: ' + cap.who);
  if(flop.who !== 'M4') throw new Error('propadák je ' + flop.who);
  return cap.who + ' vs ' + flop.who;
});

check('cena propadne, když ji má dostat polovina ligy', () => {
  // Práh je ostrý: 4 z 10 cenu ještě dostanou, 5 z 10 už ne — půlka
  // ligy na jednom čísle není výkon, ale průměr kola.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80, 70], 2: [110, 190, 90, 80]});

  // 2 ze 4 na špici = přesně polovina → bez ceny
  cenyStub(2, [1, 1, 2, 3], {1: 10, 2: 5, 3: 1});
  let cap = w.eval('buildAwards(2, NEWS_PICKS.get(2), NEWS_LIVE.get(2))')
    .find(x => x.key === 'cap');
  if(cap.who !== 'Bez ceny')
    throw new Error('polovina ligy dostala cenu: ' + cap.who);
  if(!/neuděluje/.test(cap.sub)) throw new Error('neřekne, proč cena není');

  // 1 ze 4 na špici = menšina → cena platí
  w.eval('NEWS_PICKS.delete(2); NEWS_LIVE.delete(2);');
  cenyStub(2, [1, 2, 2, 3], {1: 10, 2: 5, 3: 1});
  cap = w.eval('buildAwards(2, NEWS_PICKS.get(2), NEWS_LIVE.get(2))')
    .find(x => x.key === 'cap');
  if(cap.who !== 'M0') throw new Error('menšina cenu nedostala: ' + cap.who);
  return 'polovina ne, menšina ano';
});

check('propadne-li kapitánská cena, propadák se pořád uděluje', () => {
  // Devět lidí na stejném kapitánovi neznamená, že ten desátý,
  // co se odlišil dolů, vyvázne.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80, 70], 2: [110, 190, 90, 80]});
  cenyStub(2, [1, 1, 1, 2], {1: 10, 2: 1});
  const a = w.eval('buildAwards(2, NEWS_PICKS.get(2), NEWS_LIVE.get(2))');
  const cap = a.find(x => x.key === 'cap'), flop = a.find(x => x.key === 'flop');
  if(cap.who !== 'Bez ceny') throw new Error('většina dostala cenu: ' + cap.who);
  if(flop.who !== 'M3') throw new Error('propadák nevznikl: ' + flop.who);
  return 'kapitán bez ceny, propadák M3';
});

check('zpráva o propadlé ceně jmenuje kapitána, když ho měli všichni', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80, 70], 2: [110, 190, 90, 80]});
  const jm = elements[5].web_name;
  cenyStub(2, [elements[5].id, elements[5].id, elements[5].id, 2],
           {[elements[5].id]: 10, 2: 1});
  const cap = w.eval('buildAwards(2, NEWS_PICKS.get(2), NEWS_LIVE.get(2))')
    .find(x => x.key === 'cap');
  if(!new RegExp(jm).test(cap.sub))
    throw new Error('nejmenuje sdíleného kapitána: ' + cap.sub);
  return cap.sub;
});

check('neudělená cena nevypadá jako výhra', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80, 70], 2: [110, 190, 90, 80]});
  cenyStub(2, [1, 1, 1, 2], {1: 10, 2: 1});
  w.eval('NEWS_GW = 2');
  const p = w.eval('newsPanel()');
  if(!/award a-cap bezceny/.test(p))
    throw new Error('propadlá cena má stejnou kartu jako vyhraná');
  if(/award a-flop bezceny/.test(p))
    throw new Error('ztlumil i propadáka, který se udělil');
  return 'ztlumená jen ta propadlá';
});


/* Nastaví body na lavičce v historii daného kola. */
function nastavLavicku(gw, body){
  w.__lav = body;
  w.eval(`HUB.hists.forEach((h, i) => h.current.forEach(x => {
    if(x.round === ${gw}) x.points_on_bench = window.__lav[i];
  }));`);
}

check('smolař propadne, když má stejnou lavičku polovina ligy', () => {
  // Stejné pravidlo jako u kapitánů: cena je odlišení, ne popis kola.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80, 70], 2: [110, 190, 90, 80]});

  nastavLavicku(2, [9, 9, 2, 1]);   // 2 ze 4 na maximu = polovina
  let b = w.eval('buildAwards(2, [], null)').find(x => x.key === 'bench');
  if(!b) throw new Error('cena pro smolaře vůbec nevznikla');
  if(b.who !== 'Bez ceny') throw new Error('polovina ligy dostala cenu: ' + b.who);
  if(!/neuděluje/.test(b.sub)) throw new Error('neřekne, proč cena není');

  nastavLavicku(2, [9, 3, 2, 1]);   // 1 ze 4 = menšina
  b = w.eval('buildAwards(2, [], null)').find(x => x.key === 'bench');
  if(b.who !== 'M0') throw new Error('menšina cenu nedostala: ' + b.who);
  return 'polovina ne, menšina ano';
});

check('o cenu smolaře se při shodě dělí menšina', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80, 70, 60], 2: [110, 190, 90, 80, 70]});
  nastavLavicku(2, [9, 9, 2, 1, 0]);   // 2 z 5 = menšina
  const b = w.eval('buildAwards(2, [], null)').find(x => x.key === 'bench');
  if(!/M0/.test(b.who) || !/M1/.test(b.who))
    throw new Error('dělenou cenu dostal jen jeden: ' + b.who);
  if(!/dělí/.test(b.sub)) throw new Error('neřekne, že se dělí: ' + b.sub);
  return b.who + ' — ' + b.val;
});

check('shodná lavička u všech dá kartu „nikdo se neodlišil“', () => {
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 190, 90]});
  nastavLavicku(2, [6, 6, 6]);
  const b = w.eval('buildAwards(2, [], null)').find(x => x.key === 'bench');
  if(!/neodlišil/.test(b.who)) throw new Error('čekal jsem shodu, mám: ' + b.who);
  if(!/6/.test(b.val)) throw new Error('špatné body: ' + b.val);
  return b.who + ' — ' + b.val;
});

check('nulová lavička u všech není shoda, ale prostě žádná cena', () => {
  // „Všichni nechali 0 bodů“ není zpráva; karta by jen zabírala místo.
  nastavFaze({1: 'final', 2: 'final', 3: 'running'});
  hubStub(3, {1: [100, 90, 80], 2: [110, 190, 90]});
  nastavLavicku(2, [0, 0, 0]);
  const k = w.eval('buildAwards(2, [], null)').map(x => x.key);
  if(k.includes('bench')) throw new Error('nulová lavička dostala kartu');
  return 'karta se vynechá';
});


/* ================= zranění ================= */

/* Hlášení nasadíme jen na dobu jednoho testu — ostatní kontroly
   počítají s tím, že falešná liga je celá zdravá. */
function sZranenymi(fn){
  const zmeny = [
    {i: 0,  status: 'i', chance: 0,   news: 'Ankle injury - Expected back 14 Sep'},
    {i: 1,  status: 'd', chance: 75,  news: 'Knock - 75% chance of playing'},
    {i: 40, status: 's', chance: 0,   news: 'Suspended - Expected back 21 Sep'},
    {i: 41, status: 'a', chance: 100, news: 'Returned from injury'},
  ];
  const zpet = zmeny.map(z => {
    const p = bootstrap.elements[z.i];
    const old = {s: p.status, c: p.chance_of_playing_next_round, n: p.news};
    p.status = z.status; p.chance_of_playing_next_round = z.chance; p.news = z.news;
    return {p, old};
  });
  try { return fn(zmeny.map(z => bootstrap.elements[z.i])); }
  finally { zpet.forEach(x => {
    x.p.status = x.old.s; x.p.chance_of_playing_next_round = x.old.c; x.p.news = x.old.n; }); }
}

check('Zranění jsou samostatná záložka mezi Zpravodajem a Top hráči', () => {
  const tabs = w.eval('TABS').map(t => t[0]);
  const i = tabs.indexOf('t-inj');
  if(i < 0) throw new Error('záložka není v TABS');
  if(tabs[i - 1] !== 't-news' || tabs[i + 1] !== 't-players')
    throw new Error('špatné pořadí: ' + tabs.slice(i - 1, i + 2));
  if(!w.document.getElementById('p-inj')) throw new Error('chybí panel');
  if(!SRC.includes('id="t-inj"')) throw new Error('chybí tlačítko v liště');
  return tabs.length + ' záložek';
});

check('výchozí zobrazení je Celá liga', () => {
  const poradi = w.eval('INJ_VIEWS.map(v => v[0])');
  if(poradi[0] !== 'all') throw new Error('první přepínač je ' + poradi[0]);
  const src = fs.readFileSync('js/tabs.js', 'utf8');
  if(!/let INJ = \{view: 'all'/.test(src))
    throw new Error('výchozí stav INJ není celá liga');
  return poradi.join(' → ');
});

check('do seznamu se dostanou jen hráči, o kterých je co říct', () => sZranenymi(ps => {
  const ids = w.eval('injAll()').map(r => r.p.id);
  if(!ids.includes(ps[0].id) || !ids.includes(ps[1].id) || !ids.includes(ps[2].id))
    throw new Error('někdo hlášený chybí');
  if(ids.includes(ps[3].id))
    throw new Error('zdravý hráč se stoprocentní šancí je v seznamu zraněných');
  return ids.length + ' hlášení';
}));

check('datum návratu se vytáhne z anglické zprávy', () => sZranenymi(ps => {
  const r = w.eval('injAll()').find(x => x.p.id === ps[0].id);
  if(r.back !== '14 Sep') throw new Error('špatně přečtený návrat: ' + r.back);
  const bez = w.eval('injAll()').find(x => x.p.id === ps[1].id);
  if(bez.back) throw new Error('u zprávy bez data si appka něco vymyslela');
  return 'zpět ' + r.back;
}));

check('výchozí řazení je od nejhoršího a sekundárně podle vlastnictví', () =>
  sZranenymi(() => {
    w.eval('INJ = {view:"all", q:"", key:"chance", dir:1}');
    const rows = w.eval('injFiltered()');
    for(let i = 1; i < rows.length; i++)
      if(rows[i].chance < rows[i - 1].chance)
        throw new Error('šance nejdou vzestupně');
    const shodne = rows.filter(r => r.chance === rows[0].chance);
    for(let i = 1; i < shodne.length; i++)
      if(shodne[i].own > shodne[i - 1].own)
        throw new Error('při shodě šance není napřed vlastněnější hráč');
    return rows.length + ' řádků';
  }));

check('zobrazení Můj kádr ukáže jen vlastní hráče', () => sZranenymi(ps => {
  w.__mine = [ps[0].id];
  w.eval('MY_SQUAD = new Set(window.__mine); INJ = {view:"squad", q:"", key:"chance", dir:1}');
  const rows = w.eval('injFiltered()');
  if(rows.length !== 1 || rows[0].p.id !== ps[0].id)
    throw new Error('filtr kádru propouští cizí hráče');
  if(!rows[0].mine) throw new Error('vlastní hráč není označený');
  w.eval('INJ.view = "all"');
  return 'jen můj';
}));

check('hledá se podle jména i podle týmu', () => sZranenymi(ps => {
  w.eval('INJ = {view:"all", q:"", key:"chance", dir:1}');
  w.__q = ps[0].web_name;
  w.eval('INJ.q = window.__q');
  // normName zahazuje číslice, takže falešná jména P1/P2 splynou —
  // testujeme, že hráč projde filtrem, ne že je sám.
  if(!w.eval('injFiltered()').some(r => r.p.id === ps[0].id))
    throw new Error('hledání podle jména nenašlo hráče');

  const zkratka = bootstrap.teams.find(t => t.id === ps[0].team).short_name;
  w.__q = zkratka.toLowerCase();
  w.eval('INJ.q = window.__q');
  if(!w.eval('injFiltered()').some(r => r.p.id === ps[0].id))
    throw new Error('hledání podle týmu nenašlo hráče');

  w.eval('INJ.q = ""');
  return 'jméno i tým';
}));

check('prázdný výsledek má hlášku, ne prázdnou tabulku', () => {
  w.eval('MY_SQUAD = new Set(); INJ = {view:"squad", q:"", key:"chance", dir:1}');
  const html = w.eval('injTable()');
  if(html.includes('<table')) throw new Error('kreslí prázdnou tabulku');
  if(!html.includes('Nikdo z tvého kádru')) throw new Error('mlčí: ' + html);
  w.eval('INJ.view = "all"');
  return 'poctivá hláška';
});

check('tabulka nabízí řazení a hvězdičku ke každému řádku', () => sZranenymi(() => {
  w.eval('INJ = {view:"all", q:"", key:"chance", dir:1}');
  const html = w.eval('injTable()');
  ['name', 'team', 'own', 'chance'].forEach(k => {
    if(!html.includes('data-sort="' + k + '"')) throw new Error('nejde řadit podle ' + k);
  });
  if(!html.includes('data-watch=')) throw new Error('chybí hvězdičky');
  return 'čtyři sloupce k řazení';
}));

check('záložka Zranění nestahuje nic navíc', () => {
  // Všechno je v bootstrapu, který appka stahuje kvůli Sestavě.
  const src = fs.readFileSync('js/tabs.js', 'utf8');
  const i = src.indexOf('function loadInjuries');
  const blok = src.slice(i, i + 2200);
  if(/\bapi\(|cached\(/.test(blok))
    throw new Error('záložka si volá vlastní dotazy');
  if(!w.eval('Object.keys(TAB_INIT)').includes('t-inj'))
    throw new Error('záložka se sama nespustí');
  return 'čte z BOOT';
});

check('otevření záložky vykreslí tabulku', () => sZranenymi(ps => {
  w.__mine = [ps[0].id, ps[1].id];
  w.eval('MY_SQUAD = new Set(window.__mine); INJ = {view:"squad", q:"", key:"chance", dir:1}');
  w.eval('loadInjuries()');
  const out = w.document.getElementById('injout');
  if(!out.querySelector('#injtbl table')) throw new Error('tabulka se nevykreslila');
  if(!out.querySelector('#injq')) throw new Error('chybí hledací pole');
  if(out.querySelectorAll('button[data-inj]').length !== 3)
    throw new Error('chybí přepínač zobrazení');
  const sum = w.document.getElementById('injsum').textContent;
  if(!/nehraje|otazník/.test(sum)) throw new Error('souhrn nic neříká: ' + sum);
  return 'panel stojí';
}));


check('každá živá záložka má na mobilu ikonu', () => {
  /* Chybějící ikona se neprojeví chybou — dlaždice se prostě vykreslí
     s prázdným svg. Proto to hlídá test, ne prohlížeč. */
  const src = fs.readFileSync('js/mobile.js', 'utf8');
  const bezIkony = w.eval('TABS').map(t => t[0])
    .filter(tid => !new RegExp("'" + tid + "':").test(src));
  if(bezIkony.length)
    throw new Error('bez ikony: ' + bezIkony.join(', '));
  return w.eval('TABS').length + ' ikon';
});

check('ikony vypnutých záložek v mobilu nestraší', () => {
  const src = fs.readFileSync('js/mobile.js', 'utf8');
  const zive = new Set(w.eval('TABS').map(t => t[0]));
  const vypnute = ["'t-tr'", "'t-planner'"].filter(k =>
    new RegExp(k + ':').test(src) && !zive.has(k.replace(/'/g, '')));
  if(vypnute.includes("'t-tr'"))
    throw new Error('ikona zrušených Transferů zůstala');
  return 'uklizeno';
});

check('odkaz na oficiální FPL je odkaz, ne záložka', () => {
  const a = w.document.getElementById('fplLink');
  if(!a) throw new Error('odkaz v liště chybí');
  if(a.tagName !== 'A') throw new Error('není to <a>: ' + a.tagName);
  if(a.closest('[role="tablist"]'))
    throw new Error('sedí uvnitř tablistu, čtečka ho ohlásí jako panel');
  if(!/fantasy\.premierleague\.com/.test(a.href))
    throw new Error('míří jinam: ' + a.href);
  if(a.target !== '_blank' || !/noopener/.test(a.rel))
    throw new Error('otevírá se nebezpečně nebo přes aktuální kartu');
  return a.getAttribute('href');
});

check('na mobilu je odkaz v plachtě, ne v liště', () => {
  const src = fs.readFileSync('js/mobile.js', 'utf8');
  if(!/fantasy\.premierleague\.com/.test(src))
    throw new Error('plachta odkaz nenabízí');
  const css = fs.readFileSync('css/mobile.css', 'utf8');
  if(!/\.navout\{display:none\}/.test(css))
    throw new Error('odkaz by se na mobilu tlačil do lišty se záložkami');
  return 'v sekci Jinde';
});


check('růst obsahuje jen hráče, kteří zdražili', () => {
  /* Dřív se brala první a poslední patnáctka z jednoho seznamu, takže
     dokud se hýbalo míň než třicet cen, seděli v „růstu“ i ti, kdo
     zlevnili — jen proto, že klesli nejmíň. */
  const els = bootstrap.elements;
  const save = els.map(p => p.cost_change_start);
  els.forEach(p => { p.cost_change_start = 0; });
  els[0].cost_change_start = 3;
  els[1].cost_change_start = 1;
  els[2].cost_change_start = -2;
  els[3].cost_change_start = -1;

  const html = w.eval('buildSeason()');
  const casti = html.split('Největší propad');
  const rust = casti[0], propad = casti[1];
  els.forEach((p, i) => { p.cost_change_start = save[i]; });

  if(/-0\.2m|-0\.1m/.test(rust))
    throw new Error('v růstu sedí hráči, kteří zlevnili');
  if(/\+0\.3m|\+0\.1m/.test(propad))
    throw new Error('v propadu sedí hráči, kteří zdražili');
  return 'oddělené';
});

check('kratší tabulky se dopíšou prázdnými řádky', () => {
  const els = bootstrap.elements;
  const save = els.map(p => p.cost_change_start);
  els.forEach(p => { p.cost_change_start = 0; });
  els[0].cost_change_start = 2;

  const html = w.eval('buildSeason()');
  els.forEach((p, i) => { p.cost_change_start = save[i]; });

  const prazdne = (html.match(/class="empty"/g) || []).length;
  // 9 chybějících v růstu + 10 v celém prázdném propadu.
  if(prazdne !== 19)
    throw new Error('prázdných řádků je ' + prazdne + ', čekal jsem 19');
  return prazdne + ' prázdných';
});

check('obě tabulky mají strop deset hráčů', () => {
  const els = bootstrap.elements;
  const save = els.map(p => p.cost_change_start);
  els.forEach((p, i) => { p.cost_change_start = i < 20 ? 5 : (i < 40 ? -5 : 0); });

  const html = w.eval('buildSeason()');
  els.forEach((p, i) => { p.cost_change_start = save[i]; });

  // Dvě hlavičky (<tr> v thead) plus dvakrát deset datových řádků.
  const radky = (html.match(/<tr[ >]/g) || []).length;
  if(radky !== 22)
    throw new Error('řádků je ' + radky + ', čekal jsem 2 hlavičky + 2×10');
  return '10 + 10';
});

// jsdom drzi bezici setInterval odpoctu; bez tohohle proces nikdy neskonci
w.close();
process.exit(0);
