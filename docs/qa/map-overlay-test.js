/*
  Travel Pack map overlay, edge cases (travel-pack/map-overlay.js)
  ================================================================
  The overlay owns the numbered pins and the visiting-order line, independent of the map background.
  These cases must never misrepresent the route:

    duplicate coordinates   two stops on one point (greenwich + royal-observatory): one pin "n·m"
    approximate coordinates hollow pins, exact stops filled
    missing coordinates     no pin, the number is reported as unmapped and not reused
    one mapped stop         centred, fixed zoom, no line
    more than 11 stops      every stop gets its own number, numbers 1..n
    distant stops           segments longer than FAR_KM are marked as travel, not walking
    touching pins           moved apart with a leader line to the true point
    projection              a pin lands where the background expects it (center of the view = center)

    node docs/qa/map-overlay-test.js
*/
const fs = require('fs'), path = require('path');
const M = require('../../travel-pack/map-overlay.js');
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'planner-data.json'), 'utf8'));
const P = {}; DATA.attractions.forEach(a => { P[a.id] = a; });
const W = 696, H = 318, PAD = 42;
let fail = 0; const ok = (name, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : ': ' + d)); if (!c) fail++; };
const run = stops => { const v = M.fit(stops, W, H, PAD); return { v, lay: M.layout(stops, v), svg: M.svg(v, M.layout(stops, v)) }; };

let r = run([P['cutty-sark'] || P['greenwich-market'], P['greenwich'], P['royal-observatory']].filter(Boolean));
const dup = r.lay.pins.find(p => p.numbers.length === 2);
ok('duplicate coordinates share one pin labelled n·m', dup && /^\d+·\d+$/.test(dup.label), JSON.stringify(r.lay.pins.map(p => p.label)));
ok('no zero-length order segment for the duplicate', r.lay.segments.every(g => g.km > 0), JSON.stringify(r.lay.segments.map(g => g.km)));

r = run([P['big-ben'], P['st-james-park'], P['buckingham']]);
ok('approximate stop hollow, exact stops filled', r.lay.pins.map(p => p.approx).join() === 'false,true,false', r.lay.pins.map(p => p.approx).join());
ok('svg draws a dashed ring for the approximate pin', /stroke-dasharray="3.2 2.2"/.test(r.svg), '');

const withMissing = [P['big-ben'], { name: 'x' }, P['buckingham']];
r = run(withMissing);
ok('missing coordinates: unmapped stop 2, pins keep numbers 1 and 3', r.lay.unmapped.join() === '2' && r.lay.pins.map(p => p.label).join() === '1,3', JSON.stringify(r.lay));

r = run([P['big-ben']]);
ok('one mapped stop: centred, zoom 15, no line', r.v.zoom === 15 && r.lay.segments.length === 0 &&
  Math.abs(r.lay.pins[0].x - W / 2) < 0.5 && Math.abs(r.lay.pins[0].y - H / 2) < 0.5, JSON.stringify(r.v));

const many = DATA.attractions.filter(a => a.area === 'westminster').slice(0, 14);
r = run(many);
const labels = r.lay.pins.flatMap(p => p.numbers).sort((a, b) => a - b);
ok('14 stops: numbers 1..14 each once', labels.join() === Array.from({ length: 14 }, (_, i) => i + 1).join(), labels.join());
ok('all pins inside the map', r.lay.pins.every(p => p.x > 0 && p.x < W && p.y > 0 && p.y < H), '');

r = run([P['kew-gardens'], P['raf-museum']]);
ok('Kew to Colindale is marked as a far (travel) segment', r.lay.hasFar && r.lay.segments[0].far, JSON.stringify(r.lay.segments));

r = run([P['big-ben'], P['westminster-abbey']].filter(Boolean).concat([P['tower-of-london']]));
const moved = r.lay.pins.filter(p => p.moved);
const minGap = Math.min(...r.lay.pins.flatMap((a, i) => r.lay.pins.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.y - b.y))));
ok('touching pins are separated (leader line to the true point)', minGap >= 2 * 11, 'min gap ' + minGap.toFixed(1) + ', moved ' + moved.length);

r = run([P['big-ben'], P['tower-of-london']]);
const c = M.project(r.v, r.v.lat, r.v.lng);
ok('projection: view center maps to the image center', Math.abs(c.x - W / 2) < 1e-6 && Math.abs(c.y - H / 2) < 1e-6, JSON.stringify(c));
ok('zoom is a multiple of 0.25 so a background provider gets the same value', r.v.zoom * 4 === Math.round(r.v.zoom * 4), r.v.zoom);

console.log(fail ? fail + ' FAILED' : 'ALL PASS');
process.exit(fail ? 1 : 0);
