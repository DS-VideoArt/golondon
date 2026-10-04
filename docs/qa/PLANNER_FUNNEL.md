# Planner funnel: planner_open, planner_start, planner_complete

Changed 4 Oct 2026. Event names are unchanged; their meaning is now a real funnel.

## Root cause of the old numbers

- **planner_open** was sent by `analytics.js` when a visitor clicked a link to the Planner on another
  page (and twice for the trip-tray pill: once by `trip-tray.js`, once by the site-wide link listener).
  Anyone who reached the Planner without such a click never sent it: direct visits, Google, bookmarks,
  shared trips (`/t/...`), social short links (`/fb`, `/ig`, `/gr`, `/areas`...), reloads and returning
  visitors.
- **planner_start** was the first click of any kind inside the Planner page, once per page load:
  switching a tab, opening a place card or following a link counted, and every reload started again.
- **planner_complete** was sent on every click of "בנו לי מסלול" in auto mode (twice for two builds) and
  never in manual mode or for routes built by hand.

So start and complete were counted from a much larger population (every Planner page load) than open
(only clicks on internal links), and complete was inflated by repeat builds.

## Definitions now (planner-funnel.js)

| Event | Fires when | At most |
|---|---|---|
| planner_open | the Planner is viewed, on load, any entry path | once per tab session |
| planner_start | first planning action: a choice or build in auto mode; adding a place or a day in manual mode; a user-chosen location (tap, GPS, zone centre) or a filter in nearby mode | once per tab session |
| planner_complete | a real route: auto results rendered, or a manual day with 2+ places built by the user | once per tab session |

A tab session survives reloads (sessionStorage). Order is guaranteed in code: complete implies start,
start implies open. Switching tabs, opening info cards, automatic map centring and loading a preset
are not planning actions. Preset and shared routes arrive already built and are measured by the
existing `route_created`; if the visitor then edits them into a 2+ place day, complete fires with
`built_from=preset_edit`.

## Parameters

On all three: `planner_session_id`, `planner_entry`.

- planner_entry: `direct`, `external` (another site, e.g. Google), `internal_link`, `tray_pill`,
  `area_preset` (`?day=`), `route_preset` (`?route=`), `share` (`/t/` or `?p=`), `nearby_link`
  (`?mode=nearby`), `campaign` (utm short links).
- planner_open: `planner_mode` (tab shown first), `has_saved_plan`, `tray_places`, and when known
  `route_source` (the `from=` tag), `entry_page` and `link_text` (the internal link that was clicked,
  handed over from `analytics.js`; this keeps the information the old click event carried).
- planner_start: `planner_mode`, `start_action` (`choice`, `build`, `add_place`, `add_day`,
  `nearby_location`, `nearby_filter`).
- planner_complete: the existing auto parameters (`days`, `budget`, `interests`, `child_ages`), plus
  `planner_mode`, `day_count`, `place_count`, `built_from` (`auto`, `manual`, `preset_edit`) and
  `route_source` when the entry had one.

To use the new parameters in GA4 reports and explorations, register them as event-scoped custom
dimensions (Admin, Custom definitions): planner_entry, planner_session_id, start_action, built_from,
entry_page, tray_places, has_saved_plan, day_count, place_count. Data before 4 Oct 2026 keeps the old
meaning; compare funnels only from the deploy date onward.

## Event matrix (docs/qa/planner-funnel-harness.js)

Counts are planner_open / planner_start / planner_complete for one visitor in a fresh browser.
"Before" is production main dce72dc; "after" is this change.

| Entry path | Before | After | planner_entry |
|---|---|---|---|
| Direct /planner visit, no action | 0 / 0 / 0 | 1 / 0 / 0 | direct |
| Direct visit, then reload twice | 0 / 0 / 0 | 1 / 0 / 0 | direct |
| Homepage hero CTA to Planner | 1 / 0 / 0 , open sent on / | 1 / 0 / 0 | internal_link |
| Attractions page: saved places, tray pill to Planner | 2 / 0 / 0 , open sent on /guide-attractions | 1 / 0 / 0 | tray_pill |
| Tray pill, then "add all saved places" to day 1 | 2 / 0 / 0 (run failed) , open sent on /guide-attractions | 1 / 1 / 1 | tray_pill |
| Area guide category preset (?day=&from=camden_exp_...) | 1 / 0 / 0 , open sent on /guide-areas-camden | 1 / 0 / 0 | area_preset |
| Ready route preset (?route=&rv=) from london-3-days | 1 / 0 / 0 , open sent on /london-3-days | 1 / 0 / 0 | route_preset |
| Shared trip short link /t/<codes> | 0 / 0 / 0 | 1 / 0 / 0 | share |
| Nearby mode link (?mode=nearby&zone=) | 0 / 0 / 0 | 1 / 0 / 0 | nearby_link |
| Nearby link, then tap a radius filter | 0 / 1 / 0 | 1 / 1 / 0 | nearby_link |
| Area preset, then add one more place | 1 / 1 / 0 , open sent on /guide-areas-camden | 1 / 1 / 1 | area_preset |
| Auto: pick options, never build | 0 / 1 / 0 | 1 / 1 / 0 | direct |
| Social short link /fb (utm campaign) | 0 / 0 / 0 | 1 / 0 / 0 | campaign |
| Direct visit, switch tabs only | 0 / 1 / 0 | 1 / 0 / 0 | direct |
| Auto: pick days, build, build again, new version | 0 / 1 / 2 | 1 / 1 / 1 | direct |
| Manual: open tab, add 3 places to day 1 | 0 / 1 / 0 | 1 / 1 / 1 | direct |
| Returning visitor with a saved manual plan, no action | 0 / 0 / 0 | 1 / 0 / 0 | direct |

Run: `NODE_PATH=<node_modules with puppeteer-core> node docs/qa/planner-funnel-harness.js --expect`
(serves the site locally, blocks all external requests, exits 1 on any miss).
