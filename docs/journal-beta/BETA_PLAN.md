# Kids Journal free Beta: website funnel (draft for management review)

Status 12 Oct 2026: branch `journal-beta-draft-2026-10-12`, not deployed, not published. The Kids Journal engine,
maps, modules, PDFs, Passport, Reflection and rendering are unchanged and out of scope.

## 1. Funnel

```
Planner (auto result or manual board)
  -> real itinerary on screen (auto: "בנו לי מסלול"; manual: a day with 2+ stops, the same rule as planner_complete)
  -> CTA "הופכים את המסלול ליומן מסע לילדים"            journal_beta_start (entry planner_cta)
  -> /kids-journal-beta#r=<route code>&f=<0|1>&m=<auto|manual>&e=planner_cta     journal_beta_view
  -> the family checks its route on the page, fills email (+ optional first name), confirms Beta
  -> POST /.netlify/functions/journal-beta-request (NOT BUILT, section 6)        journal_beta_submit (server confirmed)
  -> operator: route code -> snapshot -> existing Kids Journal assembler/render -> PDF -> email (manual)
                                                                                journal_beta_delivered (ops)
  -> optional short feedback                                                    journal_beta_feedback (ops)
```

The journal is always tied to a real Planner itinerary: the page only accepts a route code, never a free list.

## 2. Planner -> Journal handoff (recommendation)

Use the existing route code, the string after `/t/` (route-code.js). It is already the single representation every
Planner output uses (screen, WhatsApp, copy, print, /t/ links): days in order, places in order, permanent 2-character
place codes, no personal data, and old codes keep decoding. The CTA builds it with the same `encodePlan()` the share
buttons use, from the plan that is on screen (`LAST` for the auto result, `manualPlan()` for the board).

The handoff is exactly three values, carried after `#` so they never reach the server or GA4 (`page_location`
excludes the fragment):

| value | source | why |
|---|---|---|
| `r` route code | `encodePlan(visible plan)` | the itinerary itself: day grouping and order |
| `f` family_route | `state.childAges` has a strict band (infant/kid), identical to `needsStrictKidFilter` | the only snapshot field a route code cannot carry (Kids Journal ARCHITECTURE.md section 3) |
| `m` planner mode | auto / manual | analytics only |

Everything else in the Kids Journal snapshot 1.1 is derived deterministically from the route code and the canonical
Planner data: names, place status (closed), coordinates and OSM provenance, area, hood, map eligibility, plus the
category from the Kids Journal's own `data/locations-manifest.json`. Day area = area of the first stop of the day
(in an auto route that is the anchor, so it equals the Planner's own day area). `stop_instance_id` = opaque hash of
a private random job id and the position.

Proof (prototype in the review scratchpad, not committed): the four approved fixture books, re-encoded as plain route
codes and rebuilt through this bridge, give page manifests identical to the approved fixtures (11, 21, 27 and 37
pages, every page and every selection decision), schema-valid 1.1 snapshots, closed stops kept as closed-stop
notices, repeat places on two days kept, and the assembler's own boundary answers for 8 days
(`unsupported_trip_length`) and 13 stops in a day (`unsupported_daily_stop_count`).

Known gap: a route code does not record that a stop was chosen as an alternative (`selected_alternative_of`). It
changes nothing in the approved fixtures; it only affects the selection log text. Acceptable for Beta.

Where the bridge should live: in the Kids Journal repository (next to `fixtures/make_fixtures.py`, which already
builds snapshots the same way), in the separate Kids Journal snapshot task. Not built here, because this task must not
modify the Kids Journal repository.

`/t/` infrastructure is sufficient for the route itself. Only the family flag is new, and it is one boolean.

## 3. The page (`kids-journal-beta.html`, draft)

noindex/nofollow, linked from nowhere, not in sitemap.xml, excluded from the site search index. Sections: Beta label,
headline, supporting copy, CTA, "the route the journal is built from" (decoded route, closed stops struck through,
product limits explained), how it works (3 steps), what is inside (6 asset slots, section 5), Beta note, request form,
success state, full state, honest draft notice while no backend exists.

Copy note: the approved supporting copy contains a long dash; the site writing rules forbid it in Hebrew, so the
draft uses a comma. Restore it only if management overrides the rule for this page.

## 4. Request fields

Required: email (delivery only), route code (from the handoff), Beta acknowledgement checkbox.
Optional: child's first name only (letters, up to 24 characters, the Kids Journal personalization limit).
Not collected anywhere: surname, date of birth, age, school, hotel, address, location, photo. No child profile.
Payload sent: `route_code, family_route, planner_mode, email, first_name, beta_ack` and nothing else.

## 5. Approved Journal assets to import (not invented)

The approved PDFs exist only as Kids Journal build output, identified in `system/book/final-render-approved-2026-10-11.json`
(tag `final-render-pdf-approved-2026-10-11`). The local copies were checked against the approved SHA-256. Proposed
source: `1-day-westminster-family.pdf` (sha256 c62d192b…), 11 pages:

| slot | page | content |
|---|---|---|
| cover | 1 | personal cover (fixture name "נועה") |
| daily map | 3 | day map with numbered stops and the OpenStreetMap credit |
| full attraction module | 4 | Big Ben |
| colouring / drawing | 5 | Big Ben colouring page |
| Passport | 8 | travel passport |
| whole book | 1 to 11 | contact sheet of all pages |

To import: page renders exported by the Kids Journal pipeline from that exact PDF (WebP, about 1200 px wide, plus a
contact sheet), with the PDF hash recorded next to them. Decisions needed: is the fixture name on the cover acceptable
in marketing, and should the adults fixture be avoided (yes, the 1-day family book is proposed).

## 6. Backend (needs approval: this is the part that is new architecture)

A reliable 25-family cap cannot be enforced in the browser, and Netlify Forms cannot cap submissions. Smallest
reliable design, no new vendor:

- One Netlify Function `netlify/functions/journal-beta-request.mjs`:
  - `GET` -> `{open, remaining}` (no personal data).
  - `POST` -> validates (email format, route code decodes against `planner-data.json` to 1 to 7 days, up to 12 stops a
    day, at least one open stop; first name letters only, up to 24; ack true; honeypot), then claims a slot.
- Storage: Netlify Blobs (built into the existing Netlify site, no new account).
  - Cap: 25 slot keys `slot-01` .. `slot-25`, each written with `onlyIfNew` (atomic create). The first free key wins;
    when all exist the answer is `409 {full:true}`. No race can produce a 26th family.
  - Request record: private random id -> `{created_at, route_code, family_route, email, first_name}`, private store,
    never in a URL or log.
- Retention: a scheduled function (daily) deletes request records older than 7 days. Slot keys hold no personal data
  and stay (they are the count). After delivery the operator deletes the record immediately.
- Operator access: `netlify blobs:list` / `netlify blobs:get` from the CLI. No admin page.
- Notification: none automatic; the operator checks daily during Beta (25 families). Optional later.

Why it needs approval: it is the site's first server-side storage (Netlify Blobs), adds the `@netlify/blobs`
dependency (the repository has no package.json today, and the publish directory is the repository root, so adding
one must be checked so `node_modules` is never published), stores personal data (email, first name) for up to 7 days,
and adds a scheduled job.

Alternative without new storage: Netlify Forms + manual cap (operator closes the Beta by config after 25). Simpler,
but the cap is not enforced and extra submissions must be answered by hand. Not recommended given the requirement.

## 7. Privacy and retention

- Email: delivery only. First name: printed on the cover and certificate, deleted with the request.
- Route snapshot, PDF and personalization: at most 7 days (Kids Journal `retention-policy.json`), private, no public or
  permanent PDF URL; PDF sent as an email attachment or a private link that expires.
- No personal data in URLs, analytics, logs or storage keys. The route code travels after `#`.
- privacy.html needs a short Beta paragraph before launch (not changed in this draft).

## 8. GA4

| event | where | params (no personal data, no route code) |
|---|---|---|
| journal_beta_start | Planner CTA click, or first form interaction on the page; once per session | entry, planner_mode, trip_days, family_route |
| journal_beta_view | page load | entry (planner_cta/direct), has_route, route_ok, beta_state |
| journal_beta_submit | only after the server confirms | trip_days, stop_count, family_route, planner_mode, first_name_given |
| journal_beta_delivered, journal_beta_feedback | operational process (Measurement Protocol or manual annotation), never client-side | |

planner_complete and affiliate_click are untouched. Funnel: planner_complete -> journal_beta_start ->
journal_beta_submit in the same session; journal families can later be compared with affiliate_click.
Mark journal_beta_submit as a key event only after launch (GA4 setting, not changed here).

## 9. Return to GoLondon

The success state links back to the same itinerary (`/t/<code>`) and to the existing family guide. No new affiliate
blocks, nothing commercial in the PDF.

## 10. Planner CTA

Off by default. Shown only in a session opened with `?journal_beta=preview`, after a real itinerary exists. Its text is
written by script only when shown, so it does not enter the site search index while the Beta is off. Hidden in print.
Before launch the switch should become a reviewed config change, not a URL parameter.

## 11. Files

This branch: `kids-journal-beta.html` (new), `journal-beta.js` (new), `planner.html` (CTA, 63 lines, gated),
`build_search_index.py` (skip the draft), `_redirects` (generated .html -> clean URL line), `docs/qa/journal-beta-harness.js`
(new), this document.

After approval: `netlify/functions/journal-beta-request.mjs`, `netlify/functions/journal-beta-purge.mjs` (scheduled),
the `@netlify/blobs` dependency, `privacy.html` (Beta paragraph), the imported page renders, and the bridge in the
Kids Journal repository.
