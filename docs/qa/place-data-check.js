/*
  Planner place data check (planner-data.json)
  ============================================
  The content standard for every place, checked mechanically. Compared with a baseline (default: the
  production copy, git origin/main) so canonical identity cannot drift:

    identity    same 161 ids, same codes, same name and nameEn, same coordinates as the baseline
    description present, 2 to 4 sentences, 100 to 450 characters
    tip         present and at least 30 characters (or the place is listed in NO_TIP with a reason)
    writing     no long dash or spaced hyphen, no filler or brochure words, no product words,
                no dated or "currently" wording (years, month names, השנה, כרגע ...)
    source      absent or an http(s) URL; coordinate provenance lives in coordSource
    access      free | paid | partly_paid when present; partly_paid exactly where the price text says
                part is paid
    spend       low | mid | high, only on food, drink, nightlife and shop places, and only with access free
    duplicates  no identical description or tip, no near-identical description (word overlap > 70%)

    node docs/qa/place-data-check.js [--baseline <path to planner-data.json>]
*/
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'planner-data.json'), 'utf8')).attractions;
const basePath = args.includes('--baseline') ? args[args.indexOf('--baseline') + 1] : null;
const base = JSON.parse(basePath ? fs.readFileSync(basePath, 'utf8')
  : execFileSync('git', ['-C', ROOT, 'show', 'origin/main:planner-data.json'], { encoding: 'utf8', maxBuffer: 1 << 26 })).attractions;

const NO_TIP = {};   // id: reason, for a place where no honest practical tip exists
/* Confirmed permanently closed on 4 Oct 2026 (official sites / listings). Left untouched until the
   editorial decision (remove, hide or replace); every other check still applies to them except content. */
const CLOSED_PENDING = {
  'boiler-house-food-hall': 'food hall no longer operates; the Boiler House is an events space (trumanbrewery.com)',
  'blitz-london': 'vintage department store closed (Yelp, Foursquare listings)',
  'beyond-retro': 'Cheshire Street store closed; not in the official UK store list (beyondretro.com/pages/uk-stores)',
  'chin-chin-labs': 'Camden shop closed; official site lists Seven Dials and Soho only (chinchinicecream.com)'
};
const FILLER = ['כמובן', 'בהחלט', 'ודאי', 'מרתק', 'מדהים', 'מרהיב', 'קסום', 'פנינה', 'ללא ספק', 'חוויה בלתי נשכחת', 'מומלץ בחום',
  'מקום שכדאי לבקר', 'אטרקציה פופולרית', 'חובה לכל'];
const PRODUCT = ['בחוברת', 'ביום שלכם', 'לחצו', 'במסלול שלכם', 'בבונה המסלול'];
/* "השנה" is dated only as "this year"; "כל השנה", "לאורך השנה", "בשאר השנה", "במשך השנה" are evergreen */
const DATED = /(^|[\s,.(])(20[2-3]\d|(?<!(?:כל|לאורך|בשאר|במשך) )השנה|כרגע|עכשיו|בקרוב|באופן זמני|זמנית|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)(?=$|[\s,.)])/;
const SPEND_CATS = ['restaurant', 'cafe', 'bar', 'shop', 'show', 'market'];
let fail = 0; const bad = (id, m) => { fail++; console.log('FAIL ' + id + ': ' + m); };

const bById = {}; base.forEach(a => { bById[a.id] = a; });
if (cur.length !== base.length) bad('*', 'place count ' + cur.length + ' vs ' + base.length);
cur.forEach(a => {
  const b = bById[a.id];
  if (!b) return bad(a.id, 'not in baseline');
  for (const k of ['code', 'name', 'nameEn', 'lat', 'lng', 'area']) if (a[k] !== b[k]) bad(a.id, k + ' changed: ' + b[k] + ' -> ' + a[k]);
  if (CLOSED_PENDING[a.id]) return;
  const desc = a.desc || '', tip = a.tip || '';
  const sentences = desc.split(/[.!?](?:\s|$)/).filter(s => s.trim()).length;
  if (!desc) bad(a.id, 'no description');
  else if (sentences < 2 || sentences > 4 || desc.length < 100 || desc.length > 450) bad(a.id, 'description ' + sentences + ' sentences, ' + desc.length + ' chars');
  if (!NO_TIP[a.id] && tip.length < 30) bad(a.id, 'tip missing or too short (' + tip.length + ')');
  const text = desc + ' ' + tip;
  if (/[–—]| - /.test(text)) bad(a.id, 'long dash or spaced hyphen');
  FILLER.forEach(w => { if (text.includes(w)) bad(a.id, 'filler word: ' + w); });
  PRODUCT.forEach(w => { if (text.includes(w)) bad(a.id, 'product word: ' + w); });
  const m = DATED.exec(text); if (m) bad(a.id, 'dated wording: ' + m[2]);
  if ('source' in a && !/^https?:\/\//.test(a.source)) bad(a.id, 'source is not a URL: ' + a.source);
  if ('coordSource' in a && a.coordSource !== 'nominatim/osm') bad(a.id, 'unknown coordSource ' + a.coordSource);
  if ('access' in a && ['free', 'paid', 'partly_paid'].indexOf(a.access) === -1) bad(a.id, 'unknown access ' + a.access);
  const partlyText = a.free && /בתשלום/.test(a.priceBand || '');
  if (partlyText !== (a.access === 'partly_paid')) bad(a.id, 'access partly_paid must match the price text');
  if ('spend' in a) {
    if (['low', 'mid', 'high'].indexOf(a.spend) === -1) bad(a.id, 'unknown spend ' + a.spend);
    if (!a.categories.some(c => SPEND_CATS.indexOf(c) !== -1)) bad(a.id, 'spend on a place that is not food, drink, nightlife or shop');
    if (a.access !== 'free') bad(a.id, 'spend venue must have access free (no entry fee)');
  }
});
const seen = {};
cur.forEach(a => ['desc', 'tip'].forEach(k => { const t = (a[k] || '').trim(); if (!t) return; if (seen[k + t]) bad(a.id, 'same ' + k + ' as ' + seen[k + t]); seen[k + t] = a.id; }));
const words = s => new Set((s || '').replace(/[.,]/g, '').split(/\s+/).filter(w => w.length > 2));
for (let i = 0; i < cur.length; i++) for (let j = i + 1; j < cur.length; j++) {
  const A = words(cur[i].desc), B = words(cur[j].desc); let n = 0; A.forEach(w => { if (B.has(w)) n++; });
  if (n / Math.min(A.size, B.size) > 0.7) bad(cur[i].id, 'description nearly identical to ' + cur[j].id);
}
const counts = { source_url: cur.filter(a => /^https?:/.test(a.source || '')).length, no_source: cur.filter(a => !a.source).length,
  partly_paid: cur.filter(a => a.access === 'partly_paid').length, spend: cur.filter(a => a.spend).length };
console.log(cur.length + ' places ' + JSON.stringify(counts));
console.log('closed, decision pending: ' + Object.keys(CLOSED_PENDING).join(', '));
console.log(fail ? fail + ' FAILED' : 'ALL PASS');
process.exit(fail ? 1 : 0);
