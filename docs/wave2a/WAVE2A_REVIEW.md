# GoLondon Wave 2A: foundation + homepage simplification (review package)

Local work only. No push, no PR, no Deploy Preview, no deploy, no Netlify/GitHub/env change.
Reviewer (Codex): REVIEW ONLY. Do not modify code unless management sends a correction task.

Evidence that is too large for the repository (screenshots, Lighthouse JSON, harness scripts) is in the
local folder `/Users/mymac/דפי נחיתה ואתרים/golondon-wave2a-review/` (paths below are relative to it).

## A. Starting point

- origin/main at start: `c9f9b5980c7db165983e1af41045440aa7da24a1` (verified unchanged before work).
- Kids Journal Beta branch `journal-beta-draft-2026-10-12` (a9c6b13) and PR #2: not used, not touched.

## B. Worktree and branch

- Worktree: `/Users/mymac/דפי נחיתה ואתרים/golondon-wave2a-wt` (new, from origin/main, upstream unset)
- Branch: `wave2a-foundation-home-simplification-2026-10-15` (local only)

## C. Homepage BEFORE (390px: 9,548px tall, 1440px: 7,005px)

| # | section | purpose | main links | duplicates | needed on home? | full content elsewhere |
|---|---|---|---|---|---|---|
| 0 | Splash `#splash-screen` | welcome overlay, 1.6s + 0.26s fade, scroll lock, `splash.webp` preloaded (122KB) | none | n/a | no | n/a |
| 1 | Topbar | London time, weather, GBP rate | none | no | kept | n/a |
| 2 | Header/nav | site navigation | 7 + Facebook | no | kept | n/a |
| 3 | Hero | value proposition | Planner, Kosher Map | tools section | yes | n/a |
| 4 | `#tools` "הכלים שמתכננים איתם" | 3 photo cards: Planner, Kosher Map, month card "באיזה חודש אתם טסים?" + 3 small links | planner, kosher-map, london-by-month, checklist, guide-mistakes, before-you-fly | hero, months strip | reduced | planner.html, kosher-map.html, london-by-month.html |
| 5 | `#categories` "המדריכים שמאחורי התכנון" | 10 large photo cards with 3 bullets each + areas link | 10 cluster pages + guide-areas | footer | reduced to tiles | each guide-*.html |
| 6 | `#months` "מתי אתם טסים?" | 12 pale month chips, current/next month line, 2 links | 12 months, by-month, Christmas | tools month card | yes, improved | london-*.html |
| 7 | What's New (built by build_whats_new.py) | 4 timely cards | guides + whats-new.html | no | yes (selected guides) | whats-new.html |
| 8 | `#routes` five mistakes | 5 full paragraphs + 2 CTAs | guide-mistakes, planner | guide-mistakes page | no | guide-mistakes.html (all five, 45 total) |
| 9 | `#community` | social tiles + decorative bubbles ("247 תגובות", not real data) | FB, IG, TikTok | footer | compact | social profiles |
| 10 | Newsletter | Netlify form | form | no | kept | n/a |
| 11 | Footer | all sections | 31 | no | kept | n/a |
| 12 | Kosher floating banner | promo after 60% scroll | kosher-map | hero, tools | no | kosher-map.html |

## D. Homepage AFTER (390px: 7,189px, 1440px: 4,754px)

1. Hero `#home-hero`: same H1 and subtitle, exactly two actions (Planner primary, Kosher Map secondary), no splash, no intro animation. Trust strip inside the hero: "חינם, בלי הרשמה", "מידע שנבדק ומתעדכן", "בעברית, למטיילים ישראלים" (all factual: the site is free, no tool requires an account, prices/kosher list carry check dates).
2. `#categories` "מה אתם צריכים עכשיו?" (after the minor-fix round, section R): 6 tiles (אטרקציות, איפה לישון, אוכל וכשרות, תחבורה, לפני הטיסה, עם ילדים) + 7 "עוד נושאים" chips (אזורים, אירועים, הצגות, כדורגל, חורף, טעויות נפוצות, צ'קליסט): 13 choices instead of 17. Planner, by-month, before-you-fly and search left the block and stay reachable from the hero, planner preview, month section, header, mobile menu and footer. Id `categories` kept (5 pages link to `index.html#categories`).
3. `#home-planner` "בונה המסלול: מה מקבלים בסוף?": 4 factual bullets + one CTA. Planner itself untouched.
4. `#months` "באיזה חודש אתם טסים?": 12 photo cards, current month marked "החודש", current/next month line, compare-all and Christmas links.
5. Selected guides `#home-guides`: the existing What's New block (builder-owned markers unchanged, `whats_new_view`/`whats_new_click` measurement series preserved), plus "לכל העדכונים".
6. `#home-method` "איך אנחנו בודקים מידע": 3 short factual points (visible check dates, official site labelled, affiliate links labelled) + links to about.html and disclosure.html.
7. `#community` compact (no fake bubbles) + newsletter (same Netlify form) + footer (column titles h4 to h2 on the homepage only, same look).

## E. Content migration map

| OLD homepage section | NEW homepage representation | destination page (content unchanged) |
|---|---|---|
| Splash | removed | none |
| Tools: Planner card | hero primary CTA, category tile, planner preview | planner.html |
| Tools: Kosher card | hero secondary CTA | kosher-map.html, guide-kosher.html |
| Tools: month card | month section | london-by-month.html |
| Tools small links (checklist, mistakes, before-you-fly) | chips "צ'קליסט", "טעויות נפוצות"; before-you-fly via header, mobile menu and footer ("לפני שטסים") | checklist.html, guide-mistakes.html, before-you-fly.html |
| 10 guide cards | 8 tiles + chips (events, shows, football, winter, areas) | guide-flight, guide-attractions, guide-transport, guide-stay, guide-kosher, guide-kids, guide-events, guide-attractions-westend, guide-football, guide-winter, guide-areas |
| Months strip | month photo cards + current/next line + 2 links | london-january..december, london-by-month, guide-winter-christmas |
| What's New | same block, framed as selected guides | its 4 guides + whats-new.html |
| Five mistakes | chip "טעויות נפוצות" | guide-mistakes.html (all 5 present, 45 in total) |
| Community bubbles | removed (decorative, unverified numbers) | Facebook group |
| Kosher floating banner | removed (hero + tile cover it) | kosher-map.html |

Every internal page linked from the old homepage is still linked (harness check: 43 old link targets, all 43 present on the new homepage, all answer 200).

## F. Files changed

- `index.html`: new homepage structure, splash markup/script removed, floating banner removed, responsive hero preload, month highlight, footer h2, analytics v6, style v9.
- `style.css` (homepage only): splash, floating banner, hero animations and their keyframes removed; gateway styles added.
- `theme-light.css`: removed the dead `.splash-title` selector only.
- `analytics.js`: separate `homepage_cta_click` listener (existing listeners untouched).
- `affiliate.js`: `trustFor`/`relFor`, visible labels on cards, `rel` by status, note text only when a paid link exists.
- `place-info.js`: labels next to modal CTAs / Tiqets inline blocks; small-text contrast.
- `kosher-map.html`: H1 visible on mobile; checked-date line is a span with AA contrast.
- `planner.html`: hero as WebP (900px mobile, 1600px desktop) with matching preloads; fixed icon box in mode tabs (CLS).
- `search-index.json`: regenerated by build_search_index.py; only the homepage entry changed.
- New images (derived only from owned images already in the repo): `images/home/month-*-320|560.(avif|webp|jpg)`, `images/home/hero-mobile.(webp|jpg)`, `images/planner-hero-900.webp`.
- `docs/wave2a/WAVE2A_REVIEW.md` (this file).
- Not changed: netlify.toml, _redirects, sitemap.xml, functions, Planner logic/flow, data files.

## G. Month section: root cause and fix

Root cause: the "באיזה חודש אתם טסים?" card used `why-months.jpg`, a generic park photo with a blown-out white sky (not recognisably London), cropped by CSS to a 148px strip on mobile (only grass visible); the months strip below used white chips with `--ink-faint` text (#858a9c, 3.3:1) on a cream background. No filter or overlay caused it; it was the asset choice, the crop and the pale chip styling.
Fix: each month card uses that month's own photo from the site's month pages (Big Ben in March, Tower Bridge in July, red bus in November, lights in December), cropped 4:3 around the landmark, with the name and temperatures in white on a dark bottom gradient (17:1). Responsive AVIF/WebP/JPEG (320w and 560w, 7 to 21KB at mobile size), explicit width/height, lazy below the fold, no saturation boost. No new or downloaded imagery. NEW IMAGE ASSET: not needed.

## H. Screenshots (`screenshots/`)

Home full page: `before-home-390-full.png`, `after-home-390-full.png`, `before-home-1440-full.png`, `after-home-1440-full.png`; first viewport `*-home-390-viewport.png`, `*-home-1440-viewport.png`; splash at 300ms `before-home-390-first-300ms.png`.
Crops: `*-crop-hero-390|1440`, `after-crop-categories-390|1440` (old: `before-crop-categories-*`, `before-crop-tools-390`), `*-crop-months-390|1440`, `before-crop-month-card-390|1440`, `after-crop-h-planner-390|1440`, `after-crop-h-guides-390|1440`, `after-crop-h-method-390`, `after-crop-h-trust-390`, `*-crop-community-390`, `before-crop-mistakes-390`.
Other: `*-planner-390`, `*-kosher-390`, `*-modal-tower-of-london-390` (official + affiliate), `*-modal-west-end-theatre-390`, `*-aff-cards-attractions-390` (Booking vs Tiqets), `*-aff-cards-insurance-390`, `*-planner-tabs-360|412|1440`.

## I. Performance (local server, gzip; Lighthouse 13.5; medians)

Two methods, because the default simulated mode is unreliable here: in this environment the unthrottled trace paints first at ~2.3s on BOTH old and new pages (a plain browser paints the new homepage at ~0.6s), and Lantern extrapolates FCP from that.

Homepage, simulated (default), 3 runs:

| | perf | FCP | LCP | CLS | TBT | transfer | LCP element |
|---|---|---|---|---|---|---|---|
| mobile before | 74 | 1.70s | 8.60s | 0.008 | 65ms | 1,818KB | header logo (painted after the splash) |
| mobile after | 69 | 3.80s | 6.20s | 0.008 | 0 | 990KB | hero section |
| desktop before | 98 | 0.45s | 1.05s | 0.011 | 0 | 1,832KB | hero |
| desktop after | 98 | 0.71s | 0.96s | 0.004 | 0 | 1,036KB | hero |

Homepage, applied throttling (DevTools, Moto G profile), 5 consecutive runs each:

| | perf | FCP | LCP | CLS | TBT | LCP element |
|---|---|---|---|---|---|---|
| mobile before | 53 (51 to 54) | 2.26s | 4.37s | 0 | 2,230ms | splash title |
| mobile after | 92 (89 to 93) | 2.49s | 2.49s | 0.005 | 172ms | H1 |

(An earlier 3-run pair on the same machine gave before 82 / LCP 2.44s / TBT 543ms and after 96 / LCP 2.24s / TBT 30ms; the machine was less loaded. Direction is the same.)
Desktop applied: before 89 (TBT 275ms), after 100.

Planner:

| | perf | FCP | LCP | CLS | transfer |
|---|---|---|---|---|---|
| mobile simulated before | 83 | 1.88s | 3.98s | 0.059 | 929KB |
| mobile simulated after | 93 | 2.01s | 2.93s | 0.051 | 702KB |
| mobile applied before (5) | 71 | 2.16s | 5.90s | 0.105 | |
| mobile applied after (5) | 99 | 1.77s | 1.78s | 0.029 | |
| desktop simulated before / after | 98 / 97 | | 0.87s / 1.07s (runs 4.11, 1.07, 0.88: one outlier; earlier after-run 0.83s) | 0.07 / 0.05 | 928 / 827KB |

Planner CLS under a fixed throttle trace (identical, deterministic): before 0.158, after 0.040. The 0.105 shift was the mode tabs shrinking from 80px to 49px when the icon font arrived; a fixed icon box removes it (tab sizes identical within 1px after load).

Kosher Map (H1 CSS only): mobile simulated 78 before; after 78 (80, 78, 78) in one set and 73 (73, 51, 73) in another: run noise, LCP is an OpenStreetMap tile in both.

Measured improvement: homepage transfer -46%, splash wait (~1.86s) and 122KB splash image gone, mobile TBT down, homepage LCP is now real content; Planner mobile hero 287KB JPEG to 57KB WebP, LCP 5.9s to 1.8s (applied).
Remaining bottlenecks: render-blocking third-party CSS (Google Fonts and Font Awesome from cdnjs; about 1s each in simulation; making Font Awesome non-blocking was tried and gave no measurable gain, so it was reverted), Font Awesome webfonts 153KB + 114KB, shared theme-light.css (87KB), `trip-tray.js` fetching planner-data.json (51KB) on every page, Planner fetching planner-data.json three times in parallel (planner.html, planner-nearby.js, auto-link-places.js).
Inference: the simulated mobile score drop (74 to 69) comes from the simulated FCP, which the applied-throttling runs do not reproduce.

## J. Accessibility

- Lighthouse a11y: home 95 to 100 (mobile and desktop); Kosher Map mobile 96 to 100; Planner 94 unchanged (pre-existing: field hint contrast, link-in-text-block).
- axe (wcag2a/aa, 21a/aa, best-practice) home 390: before color-contrast 32 nodes, heading-order 1, region 6; after: none. Kosher 390: before color-contrast 2 + page-has-heading-one; after: none.
- Fixed: Kosher Map H1 hidden on mobile (`display:none`) now visible; `<div>` inside H1 replaced with a span; checked-date text 3.4 to 5.8:1; What's New card labels/dates 4.1/3.4 to 5.5/5.8:1; modal small notes 3.5 to 5.8:1; feedback block badge/note on home; hero secondary button and trust pills on a 0.62 dark backing (white text 5.2:1 even over a white photo area).
- Manual contrast of new elements: titles 16.3:1, subtitles 6.9:1, chips 9.3:1, red links 5.8 to 6.5:1, month labels 17:1, labels 8.2/8.3:1, focus ring 10.4:1.
- Keyboard: 60 Tab presses, no trap (48 distinct stops), every homepage control shows a focus ring (navy 3px, white with navy halo on the hero), every stop has an accessible name; form inputs on home now have an outline ring.
- Colour dependence: labels are text ("אתר רשמי", "קישור שותפים"), current month has text "החודש" + aria-current, not colour only.
- Remaining pre-existing: Planner field-hint contrast and links distinguished by colour only; footer `h4` heading order on other pages; topbar live values outside landmarks on other pages. No full WCAG compliance is claimed.

## K. homepage_cta_click matrix

Params: `destination` (page name without .html, or `external:<domain>`), `component`, `position` (1-based within the component). `source_page` is added by the existing `track()`. One listener, capture phase, homepage only, one event per click. Existing events still fire as before.

| component | position | destination | existing event also sent |
|---|---|---|---|
| hero | 1 | planner | none (planner handoff; planner_open fires in the Planner) |
| hero | 2 | kosher-map | kosher_map_open |
| category_grid | 1 | planner | handoff |
| category_grid | 2..5 | guide-attractions, guide-stay, guide-kosher, guide-transport | category_open |
| category_grid | 6 | london-by-month | month_hub_open |
| category_grid | 7, 8 | guide-flight, guide-kids | category_open |
| category_grid | 9..13 | guide-areas, guide-events, guide-attractions-westend, guide-football, guide-winter | category_open |
| category_grid | 14 | before-you-fly | none |
| category_grid | 15 | checklist | checklist_open |
| category_grid | 16 | guide-mistakes | category_open |
| category_grid | 17 | search | none |
| planner_preview | 1 | planner | handoff |
| month_section | 1, 2 | current month, next month (dynamic) | month_select |
| month_section | 3..14 | london-january..december | month_select |
| month_section | 15 | london-by-month | month_hub_open |
| month_section | 16 | guide-winter-christmas | none |
| guide_highlights | 1..4 | the What's New cards shown that day | whats_new_click |
| guide_highlights | 5 | whats-new | none |
| trust | 1, 2 | about, disclosure | none |
| community | 1..3 | external:facebook.com, external:instagram.com, external:tiktok.com | none |

Header, footer and other pages send no homepage_cta_click. No PII, no free text, no query strings. planner_open/start/complete and affiliate_click unchanged (Planner funnel harness 17/17).

## L. Commercial link statuses (unchanged classification, `statusFor`)

| status | example | visible label | disclosure | rel |
|---|---|---|---|---|
| official_direct | Tower of London official site, British Museum exhibitions (free) | "אתר רשמי" | none | noopener |
| affiliate | Tiqets / GetYourGuide via tp.media, EKTA (Travelpayouts direct link) | "קישור שותפים" | "אם תבוצע הזמנה דרך הקישור, GoLondon עשויה לקבל עמלה." | sponsored noopener nofollow |
| agent_referral | PassportCard, Trip Guaranty (agent links) | "קישור שותפים" | same sentence | sponsored noopener nofollow |
| commercial_direct | Booking (no program id), any marketplace link without tracking | none | none (block note only links to the disclosure page if no paid link is present) | noopener nofollow (was sponsored) |

No "ללא תוספת למחיר" wording was added anywhere. Existing approved insurance group note is kept as is.

## M. Booking

Booking is commercial_direct: no "קישור שותפים" label, no commission sentence, `rel` no longer `sponsored`, and its click still sends affiliate_click once with `affiliate_status: commercial_direct` (harness-verified).

## N. Regression

- Wave 2A harness (`harness/regress.mjs`): 182 passed, 0 failed (`regress-results.txt`): SEO head, structured data, redirects, sitemap, netlify.toml unchanged; no orphaned links; all links 200; no splash/scroll lock/intro animation; one H1; two hero actions; no overflow at 360/390/1440; all images load with explicit size; heading order; current month; mobile menu; full CTA matrix; keyboard; modal labels; affiliate_click once per click with existing params; add_to_trip; map/navigation buttons; Booking/Tiqets/PassportCard/Trip Guaranty/EKTA labels; Kosher H1, map, filter, data file unchanged; Planner WebP hero, build, day maps, planner_open/start/complete, WhatsApp /t/ share, saved place reaches the Planner tray.
- Existing suites: planner-funnel-harness 17/17, ga4-guard-harness 201/201, whats-new-harness all pass (10 dates), closed-places-harness pass, route-code-test 15,350/0, place-data-check pass, print-harness pass.
- build_whats_new.py on a copy leaves index.html byte-identical; build_redirects.py output unchanged; build_search_index.py changes only the homepage entry (committed).

## O. Push / deploy / Netlify trigger audit (read-only)

- No `.github/workflows` in the repository: no GitHub Actions run on push or PR.
- Netlify site `golondon` (Pro team, credit-based), linked to GitHub DS-VideoArt/golondon, production branch `main`, `allowed_branches: ["main"]` (branch deploys only for main), Deploy Previews on for PRs (PR #2 history shows a preview build per push), no build command, publish ".", no build plugins, functions in netlify/functions.
- Push of this branch alone: no Netlify build (not an allowed branch, no PR). Opening a PR: a Deploy Preview build, and every later push to the PR another one. Merge to main: a production deploy.
- Scheduled functions on main: none (journal-beta-purge/reconcile exist only on the Beta branch).

## P. Cost exposure

Known (Netlify docs, credit-based plans): production deploy 15 credits; Deploy Previews and branch deploys 0 credits; functions compute 10 credits per GB-hour; bandwidth 20 credits per GB; web requests 2 credits per 10,000. A Deploy Preview's own visits use bandwidth and requests credits.
Unknown: the team's remaining credit balance and overage settings (not visible read-only), the exact visit volume of any preview.

## Q. Confirmations

- Planner UX unchanged (question order, auto/manual, completion, 3 steps, saved places, routes); only the hero image format and a fixed icon box in the tabs.
- Branding unchanged: same logo, header, hero photo and H1, colours, fonts.
- Kids Journal untouched, PR #2 untouched, production untouched.
- No push, no PR, no Deploy Preview, no deploy, no env or config change.

## R. Final minor fixes (review verdict: APPROVE AFTER MINOR FIXES)

1. Category block: 6 tiles (אטרקציות, איפה לישון, אוכל וכשרות, תחבורה, לפני הטיסה, עם ילדים) + 7 chips (אזורים, אירועים, הצגות, כדורגל, חורף, טעויות נפוצות, צ'קליסט) = 13 choices (was 17). Removed from the block: תכנון מסלול (hero CTA, planner preview, nav, mobile menu: 5 links remain), לפי חודש ועונה (month section + nav: 3 links remain), the "לפני שטסים" chip (before-you-fly stays in nav, mobile menu, footer: 4 links) and "חיפוש באתר" (nav icon, mobile menu: 2 links). One pre-trip label in the block: "לפני הטיסה" (guide-flight). Grid 3 x 2 on desktop, 2 x 3 on mobile; block height at 390px: 622 to 471px; page 7,189 to 7,038px.
   homepage_cta_click category_grid positions now: 1 guide-attractions, 2 guide-stay, 3 guide-kosher, 4 guide-transport, 5 guide-flight, 6 guide-kids (category_open), 7 guide-areas, 8 guide-events, 9 guide-attractions-westend, 10 guide-football, 11 guide-winter, 12 guide-mistakes (category_open), 13 checklist (checklist_open).
2. Tiqets copy: `extra.note` of tower-of-london, st-pauls, kensington-palace and sea-life is now "לפני התשלום בדקו שהמוצר, השעה והמחיר מתאימים לתאריך שלכם." Nothing else in attractions-info.json changed (verified field by field).
3. Cache-busting: affiliate.js?v=4 (129 HTML files) and place-info.js?v=12 (133 HTML files); 0 old, 0 mixed. The generators that write these tags were aligned too (build_article.py was still on affiliate.js?v=2, build_whats_new.py on place-info.js?v=11). Pre-existing, not changed: build_whats_new.py still writes trip-tray.js?v=7 and auto-link-places.js?v=4 while the pages carry v=8 and v=5 (same drift on main).
4. Dead CSS: the five `.fb-bubble` rules removed from style.css (no reference anywhere). Nothing else.

Performance after the fixes (homepage mobile, 5 consecutive runs each, medians):

| | perf | FCP | LCP | CLS | TBT | transfer | LCP element |
|---|---|---|---|---|---|---|---|
| simulated before | 79 (64 to 79) | 1.79s | 5.34s (one run 8.81s) | 0.008 | 28ms | 1,818KB | header logo (behind the splash) |
| simulated after | 68 (66 to 87) | 3.89s | 6.29s (one run 3.98s) | 0.008 | 0 | 990KB | hero section |
| applied before | 73 (67 to 81) | 1.91s | 2.54s | 0.011 | 755ms | 1,818KB | splash title |
| applied after | 95 (92 to 96) | 2.29s | 2.29s | 0.005 | 52ms | 990KB | H1 |
| desktop simulated before / after (3) | 98 / 99 | 0.53 / 0.70s | 1.05 / 0.91s | 0.011 / 0.005 | 0 / 0 | 1,832 / 1,036KB | hero |

The simulated anomaly is still there (79 to 68 in this set). It compares different elements: before, the splash hides the hero, so Lantern's LCP is the 25KB logo; after, the LCP is the hero itself (118KB background image on mobile), and the simulated FCP inherits the late first paint of the unthrottled local trace (about 2.3s on both versions; a plain browser paints the new homepage at about 0.6s). Applied throttling shows the real-load picture: higher score, earlier LCP, much lower TBT, smaller transfer.

Planner CLS: fixed throttle trace before 0.158 (3/3 runs) and after 0.040 to 0.041 (3/3). Lighthouse simulated 5 runs: before median 0.129, after 0.112 (a second 5-run set: 0, 0.091, 0, 0.114, 0.119). The mode-tab shift no longer appears in any after run; the remaining shift is pre-existing: the hero subtitle re-wraps when the Heebo web font loads (also present before). Not changed here (outside this task).

Regression after the fixes: Wave 2A harness 193/193 (adds block structure, reachability, Tiqets label and disclosure once each in all four boxes, cache versions, generators, every page 200); Planner funnel 17/17; GA4 guard 201/201; What's New all pass (9 date checks + raw HTML); closed places 26/26; route codes 15,350/0; place data pass; print pass; search index regenerated (homepage entry only); axe home 0, Kosher 0, Planner unchanged pre-existing (contrast 9, link-in-text-block 6).
Screenshots: `screenshots/fix-home-390-full.png`, `fix-home-1440-full.png`, `fix-crop-categories-390|1440.png`, `fix-crop-months-390|1440.png`, `fix-crop-hero-390|1440.png`, `fix-crop-h-planner-390|1440.png`, `fix-crop-h-guides-390|1440.png`, `fix-planner-390.png`, `fix-kosher-390.png`.
