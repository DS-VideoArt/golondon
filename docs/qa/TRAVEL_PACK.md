# Travel Pack, Phase 0 and Phase 1 (local prototype)

Branch `travel-pack-phase-0-1`, from production 8d3c74b. Not deployed.

## Route code, the single route representation
`route-code.js` holds the only encode / decode of a route (`/t/<code>`): ordered days, separated by `.`,
each day the 2-character place codes in order (`build_plan_codes.py`, codes never change).
Browser: `window.GoLondonRouteCode`. Node: `require('./route-code.js')`.
Empty days are dropped before numbering (`normalizeDays`), so every output numbers days 1..n.
`node docs/qa/route-code-test.js` compares it with the pre-extraction functions (15,350 comparisons).

## Phase 0, Planner print
`node docs/qa/print-harness.js [--root <site>]` prints automatic, manual and shared routes (1, 3, 7 days)
and checks route content, day numbering, community form absent, hours/prices note present, map links,
no controls printed, and that WhatsApp, Copy and the `/t/` link agree on day numbering.

## Phase 1, Travel Pack prototype
`travel-pack.html?p=<route code>` builds the A4 document from the same route code:
cover (brand, title, days, stops, QR to the live `/t/` route), one page per day (map, numbered stops,
practical details, links), final note (live link, hours/prices disclaimer).

Map = two layers:
- background: replaceable, gets only center, zoom and size (`GoLondonMapBackground.render(view)`).
- overlay (`travel-pack/map-overlay.js`, GoLondon owned): numbered pins, visiting-order line, approximate
  pins (hollow, dashed ring), duplicate points (one pin `n·m`), touching pins (moved, leader line),
  long segments (marked as travel), scale bar, north arrow. Edge cases: `node docs/qa/map-overlay-test.js`.

`travel-pack/prototype-background.js` is a TEMPORARY test background (grid and a hand-typed schematic
Thames, no map data, no network). It must be replaced by the chosen provider before any production use.

Render and QA locally: `node docs/qa/travel-pack-render.js [--code ADAGAEAPANAM] [--out <dir>]`.

## Tooling
Root `package.json` holds dev tooling only (puppeteer-core, qrcode-generator, @fontsource/heebo).
netlify.toml is unchanged: publish ".", no build command. Netlify installs dependencies when a
package.json exists; check the install step and that node_modules is not published on a Deploy Preview
before any merge.
