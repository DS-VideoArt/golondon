/*
  Planner place data check (planner-data.json)
  ============================================
  The content standard for every place, checked mechanically. Compared with a baseline (default: the
  production copy, git origin/main) so canonical identity cannot drift:

    identity    same 161 ids, same codes, same name and nameEn, same coordinates as the baseline, except the
                exact transitions listed in approved-coordinate-changes.json
    coordinates every place has coordSource: an active place carries OpenStreetMap provenance (object type,
                id, version, data date, extract, method, accuracy); a closed place is marked not map-eligible
    description present, 2 to 4 sentences, 100 to 450 characters
    tip         present and at least 30 characters (or the place is listed in NO_TIP with a reason)
    writing     no long dash or spaced hyphen, no filler or brochure words, no product words,
                no dated or "currently" wording (years, month names, השנה, כרגע ...)
    source      absent or an http(s) URL; coordinate provenance lives in coordSource (see coordinates)
    closed      true on permanently closed places, which are never offered for a new route
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

const APPROVED_COORDS = {};
JSON.parse(fs.readFileSync(path.join(__dirname, 'approved-coordinate-changes.json'), 'utf8')).changes.forEach(c => { APPROVED_COORDS[c.id] = c; });
const OSM_METHODS = ['direct_place_object', 'geometry_centroid', 'geometry_representative_point', 'nearest_point_on_geometry',
  'street_intersection', 'entrance_or_station', 'existing_representative_point_within_osm_geometry',
  'existing_point_within_tolerance_of_osm_object', 'derived_entrance_nearest_site_point_to_address'];
const isId = n => Number.isInteger(n) && n > 0;
function checkCoordSource(a) {
  const c = a.coordSource;
  if (!c || typeof c !== 'object') return bad(a.id, 'coordSource missing');
  if (a.closed) {
    if (c.map_eligible !== false || c.status !== 'closed_not_map_eligible') bad(a.id, 'closed place must be marked not map-eligible');
    return;
  }
  if (c.provider !== 'OpenStreetMap') bad(a.id, 'coordSource provider is not OpenStreetMap');
  if (['node', 'way', 'relation'].indexOf(c.osm_type) === -1) bad(a.id, 'osm_type ' + c.osm_type);
  if (!isId(c.osm_id) || !isId(c.osm_version)) bad(a.id, 'osm_id / osm_version missing');
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(c.source_date || '')) bad(a.id, 'source_date ' + c.source_date);
  if (!/\.osm\.pbf$/.test(c.extract || '')) bad(a.id, 'extract ' + c.extract);
  if (OSM_METHODS.indexOf(c.method) === -1) bad(a.id, 'unknown method ' + c.method);
  if (['exact', 'approximate'].indexOf(c.accuracy) === -1) bad(a.id, 'accuracy ' + c.accuracy);
  if ('objects' in c && !(Array.isArray(c.objects) && c.objects.length > 1 && c.objects.every(o => ['node', 'way', 'relation'].indexOf(o.osm_type) !== -1 && isId(o.osm_id) && isId(o.osm_version)))) bad(a.id, 'objects list invalid');
}
function checkCoords(a, b) {
  if (a.lat === b.lat && a.lng === b.lng) return;
  const ap = APPROVED_COORDS[a.id];
  if (ap && b.lat === ap.from.lat && b.lng === ap.from.lng && a.lat === ap.to.lat && a.lng === ap.to.lng) return;
  bad(a.id, 'coordinates changed without approval: ' + b.lat + ',' + b.lng + ' -> ' + a.lat + ',' + a.lng);
}

const NO_TIP = {};   // id: reason, for a place where no honest practical tip exists
/* Permanently closed places carry "closed": true. They stay in the data (ids and codes are permanent, old
   /t/ links keep them) but are never offered for a new route: not in routes.json, not in a guide page's
   ?day= link, not in a data-trip-add / data-pday-add / data-place list. Their content is not re-checked. */
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
  for (const k of ['code', 'name', 'nameEn', 'area']) if (a[k] !== b[k]) bad(a.id, k + ' changed: ' + b[k] + ' -> ' + a[k]);
  checkCoords(a, b);
  if ('closed' in a && a.closed !== true) bad(a.id, 'closed must be true when present');
  checkCoordSource(a);
  if (a.closed) return;
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
const counts = { osm_provenance: cur.filter(a => !a.closed && a.coordSource && a.coordSource.provider === 'OpenStreetMap').length,
  exact: cur.filter(a => !a.closed && a.coordSource && a.coordSource.accuracy === 'exact').length,
  approximate: cur.filter(a => !a.closed && a.coordSource && a.coordSource.accuracy === 'approximate').length,
  source_url: cur.filter(a => /^https?:/.test(a.source || '')).length, no_source: cur.filter(a => !a.source).length,
  partly_paid: cur.filter(a => a.access === 'partly_paid').length, spend: cur.filter(a => a.spend).length };
console.log(cur.length + ' places ' + JSON.stringify(counts));
const closed = cur.filter(a => a.closed).map(a => a.id);
const routes = JSON.parse(fs.readFileSync(path.join(ROOT, 'routes.json'), 'utf8')).routes;
routes.forEach(r => r.days.forEach(d => d.stops.concat(d.alternatives || []).forEach(id => { if (closed.indexOf(id) !== -1) bad(id, 'closed place in routes.json ' + r.route_id); })));
fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach(f => {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const lists = [...html.matchAll(/[?&](?:amp;)?day=([^&"']+)/g)].map(m => m[1]).concat(
    [...html.matchAll(/data-(?:trip-add|pday-add|place)="([^"]+)"/g)].map(m => m[1]));
  lists.forEach(l => decodeURIComponent(l).split(',').forEach(id => { if (closed.indexOf(id.trim()) !== -1) bad(id.trim(), 'closed place offered in ' + f); }));
});
console.log('closed (kept for old links, never offered): ' + closed.join(', '));
console.log(fail ? fail + ' FAILED' : 'ALL PASS');
process.exit(fail ? 1 : 0);
