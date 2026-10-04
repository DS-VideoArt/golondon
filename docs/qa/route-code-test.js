/*
  route-code.js compatibility test
  ================================
  route-code.js replaced encodePlan / decodePlanCodes in planner.html (until 4.10.2026, production 8d3c74b).
  Old /t/ links must keep opening exactly the same route. This test runs the old functions (copied verbatim
  below from 8d3c74b) and the new module on the same inputs and requires identical results:

    every single place code, every route in routes.json, 5,000 random plans (with empty days and places
    without a code), and malformed or legacy strings (empty, dots only, odd length, unknown codes).

  Also checks the new rule: empty days are dropped before numbering, the same as in the shared link.

    node docs/qa/route-code-test.js
*/
const fs = require('fs'), path = require('path');
const RC = require('../../route-code.js');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'planner-data.json'), 'utf8'));
const ROUTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'routes.json'), 'utf8')).routes;
const BY_ID = {}; DATA.attractions.forEach(a => { BY_ID[a.id] = a; });

/* ---- verbatim from planner.html at 8d3c74b ---- */
function legacyEncodePlan(plan) {
  return plan.map(function (d) {
    return d.items.map(function (it) { return it.code || ''; }).join('');
  }).filter(function (chunk) { return chunk; }).join('.');
}
function legacyDecodePlanCodes(str) {
  var byCode = {};
  DATA.attractions.forEach(function (a) { if (a.code) byCode[a.code] = a.id; });
  return String(str || '').split('.').map(function (chunk) {
    var ids = [];
    for (var i = 0; i + 2 <= chunk.length; i += 2) {
      var id = byCode[chunk.substr(i, 2)];
      if (id) ids.push(id);
    }
    return ids;
  }).filter(function (ids) { return ids.length; });
}
function legacyTripLink(plan) {
  var code = legacyEncodePlan(plan);
  return code ? 'https://golondon.co.il/t/' + code : 'https://golondon.co.il/planner';
}
/* ---- new, the way planner.html now calls it ---- */
const byCode = {}; DATA.attractions.forEach(a => { if (a.code) byCode[a.code] = a.id; });
const newEncodePlan = plan => RC.encode(plan.map(d => d.items), it => it.code);
const newDecode = str => RC.decode(str, c => byCode[c]);
const newTripLink = plan => RC.link(newEncodePlan(plan));

let n = 0, fail = 0;
const same = (label, a, b) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; if (fail < 10) console.log('DIFF', label, JSON.stringify(a), JSON.stringify(b)); } };
const plan = days => days.map((ids, i) => ({ day: i + 1, items: ids.map(id => (typeof id === 'string' ? BY_ID[id] : id)) }));

DATA.attractions.forEach(a => {
  const p = plan([[a.id]]);
  same('single ' + a.id, newEncodePlan(p), legacyEncodePlan(p));
  same('decode ' + a.code, newDecode(a.code), legacyDecodePlanCodes(a.code));
});
ROUTES.forEach(r => {
  const p = plan(r.days.map(d => d.stops.filter(s => BY_ID[s])));
  const code = legacyEncodePlan(p);
  same('route ' + r.route_id, newEncodePlan(p), code);
  same('route link ' + r.route_id, newTripLink(p), legacyTripLink(p));
  same('route decode ' + r.route_id, newDecode(code), legacyDecodePlanCodes(code));
});
let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
for (let k = 0; k < 5000; k++) {
  const days = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () =>
    Array.from({ length: Math.floor(rnd() * 13) }, () => rnd() < 0.04 ? { id: 'x', code: '' } : DATA.attractions[Math.floor(rnd() * DATA.attractions.length)]));
  const p = days.map((items, i) => ({ day: i + 1, items }));
  const code = legacyEncodePlan(p);
  same('random encode ' + k, newEncodePlan(p), code);
  same('random link ' + k, newTripLink(p), legacyTripLink(p));
  same('random decode ' + k, newDecode(code), legacyDecodePlanCodes(code));
}
['', '.', '..', 'AA', 'AAA', 'AA.', '.AA', 'AA..AB', 'ZZ', 'AA.ZZ', 'zz9', 'AAABAC.ADAEAF', 'AA.AB.AC.AD.AE.AF.AG.AH', '!!', 'AA AB'].forEach(str =>
  same('legacy string "' + str + '"', newDecode(str), legacyDecodePlanCodes(str)));

/* the new rule: empty days leave before numbering, everywhere */
const internal = [['big-ben', 'st-james-park'], [], ['tower-of-london']];
const norm = RC.normalizeDays(internal);
same('normalize drops empty day', norm, [['big-ben', 'st-james-park'], ['tower-of-london']]);
const code = RC.encode(internal.map(d => d.map(id => BY_ID[id])), it => it.code);
same('encode of internal plan has 2 days', code.split('.').length, 2);
same('decode returns the same 2 days', newDecode(code), norm);
same('isWellFormed', ['ADAG', 'AD.AG', '', 'A-B', 'AD AG'].map(RC.isWellFormed), [true, true, false, false, false]);

console.log(`${n} comparisons, ${fail} differences`);
console.log(fail ? 'FAIL' : 'ALL PASS: old /t/ links decode identically, new links encode identically');
process.exit(fail ? 1 : 0);
