# Kids Journal free Beta: website side (staging-ready, not deployed)

Branch `journal-beta-draft-2026-10-12`. Not deployed, not published, CTA off in production. The Kids Journal engine,
maps, modules, PDFs, Passport, Reflection and rendering are unchanged; the Planner -> snapshot converter is a separate
Kids Journal task.

## 1. Funnel

```
Planner, a FAMILY itinerary on screen (a child under 12 in "מי נוסע", the build() strict-kids rule)
  auto: after "בנו לי מסלול"; manual: once a day has 2+ stops (the manual planner_complete rule)
  -> CTA "הופכים את המסלול ליומן מסע לילדים"                                   journal_beta_start
  -> /kids-journal-beta#r=<route code>&f=1&m=<auto|manual>&e=planner_cta          journal_beta_view
  -> strict route check on the page (shared validator) -> email, optional first name, Beta ack
  -> POST /.netlify/functions/journal-beta-request -> server validation, 25-slot cap -> stored   journal_beta_submit
  -> operator: route code -> snapshot (Kids Journal) -> PDF -> email                  journal_beta_delivered (ops)
```

CTA visibility: Beta switch on (today: a session opened with `?journal_beta=preview`), a real itinerary, and a family
selection. It updates at once when "מי נוסע" changes. Adult-only and teen-only routes never see it. On the manual board
the family signal is the same "מי נוסע" selection (it lives on the auto tab); see section 12.

## 2. Handoff

The route code is the `/t/` code of the visible plan (`encodePlan`), carried after `#` with the family flag and mode.
The fragment never reaches the server, logs or GA4. Proof that the code is a sufficient handoff: the four approved
fixture books rebuilt from their plain route codes give identical page manifests (previous review).

## 3. Strict route validation (`journal-beta-route.js`, the same file on the page and in the function)

The `/t/` decoder stays tolerant for old links. A Journal request is not: days separated by `.`, each day a run of
2-character codes with nothing extra, every code known, 1 to 7 days, at most 12 stops a day, the same place at most once
in a day, at least one open place. Closed places are kept in place. Any failure: the page shows "לא הצלחנו להכין את
המסלול הזה ליומן" with the reason and a button back to the Planner, submit stays disabled and nothing is sent; the
server answers 422 `route_invalid` for the same cases. No partial request is possible.

## 4. Backend

Netlify Function `netlify/functions/journal-beta-request.mjs` + Netlify Blobs (built into the Netlify site, no new
vendor or account). Dependency `@netlify/blobs` 11.1.4, pinned, the only direct dependency (46 packages in the lock,
no install scripts).

- `GET` -> `{enabled, open}`. No personal data, no counts of anyone.
- `POST` -> accepts exactly `route_code, family_route, planner_mode, email, first_name, beta_ack, website`
  (anything else: 400). Body limit 4 KB. Order: switch and config -> honeypot -> field validation -> family only ->
  strict route validation against the deploy's own `planner-data.json` -> duplicate claim -> slot claim -> record.
- Off by default. Opens only with both Netlify environment variables:
  `JOURNAL_BETA_ENABLED=true` and `JOURNAL_BETA_SECRET=<long random string>` (HMAC key for duplicate keys).
  Without them `GET` says `enabled:false`, `POST` answers 503 and nothing is written. Deploying the code alone does not
  open the Beta.

## 5. Blob data model (site-wide store `journal-beta`, strong consistency)

| key | value | personal data | deleted |
|---|---|---|---|
| `slots/01` .. `slots/25` | `{request_id, created_at}` | none | never (it is the count) |
| `requests/<request_id>` | `{request_id, created_at, expires_at, status:"received", email, first_name, route_code, family_route:true, planner_mode}`, metadata `{created_at, expires_at}` | normalized email, optional first name, route | after delivery by the operator, at the latest by the daily purge after 7 days |
| `dedupe/<hmac>` | `{request_id, created_at}` | none in the key or value (HMAC-SHA256 of normalized email + route code, keyed by JOURNAL_BETA_SECRET) | daily purge after 7 days |

`request_id` = `r` + 24 random hex characters, unrelated to the child, route or date. Never stored: IP address,
surname, date of birth, age, school, hotel, address, location, photo. No child profile, no marketing list.

## 6. Cap (concurrency-safe)

Each slot is written with `set(key, value, { onlyIfNew: true })`, the documented Netlify Blobs atomic conditional write
("the write will only succeed if the entry does not exist", returns `modified`). A request walks the free slots and keeps
the first write that returns `modified: true`. When all 25 exist the answer is `409 {full:true}` and the page shows
"ההרצה התמלאה". No locking is invented; a 26th request cannot create a 26th key. If the record write fails, the slot and
the duplicate claim are deleted again.

Test note: the local `BlobsServer` checks existence and writes in two awaited steps, so it is not atomic and cannot
prove production atomicity. Concurrency is tested against an in-memory store with an atomic create-only write and
interleaving awaits (40 simultaneous distinct requests -> exactly 25 accepted); the real client is tested against
`BlobsServer` sequentially for API compatibility. Production atomicity is the platform guarantee.

## 7. Duplicates

Before claiming a slot the function writes `dedupe/<hmac(email, route)>` with `onlyIfNew`. Same normalized email (trim,
lower case, NFC) and same route code -> `200 {status:"already_received"}`, no slot, no second `journal_beta_submit`; the
page says the request was already received. A half-finished claim older than 2 minutes with no stored request is
treated as stale and replaced. There is no lookup endpoint; nothing reveals whether another email exists.

## 8. Honeypot

Hidden field `website` (visually hidden, `tabindex=-1`, `aria-hidden`). Filled -> 400, nothing written, no slot. No IP is
stored, no CAPTCHA, no vendor.

## 9. Retention

Netlify Blobs has no native expiration (documented: expiry is done with metadata and deletes). Implemented:

- `netlify/functions/journal-beta-purge.mjs`, a scheduled function (`@daily`), deletes `requests/*` and `dedupe/*`
  created 7 or more days ago (items without a date are deleted). It logs counts only.
- The operator deletes the request right after the Journal is sent (runbook below).
- Generated Journal material (snapshot, PDF) lives outside the website and follows the Kids Journal retention policy
  (max 7 days, no public or permanent PDF URL).
- The email is deleted with the request. It is never copied to a list.

## 10. GA4

| event | when | params |
|---|---|---|
| journal_beta_start | CTA click (entry planner_cta) or first form interaction on the page (entry form), once a session | entry, planner_mode, trip_days, family_route |
| journal_beta_view | page load | entry, has_route, route_ok, beta_state (open/full/closed/draft) |
| journal_beta_submit | only when the server returns `status: received` | trip_days, stop_count, family_route, planner_mode, first_name_given |

Never in any event: email, first name, route code, request id. planner_complete and affiliate_click unchanged; the 17
Planner funnel scenarios are identical to production. journal_beta_delivered / journal_beta_feedback: operational, not
client-side.

## 11. Netlify safety

- `node_modules/` is in `.gitignore`; `netlify.toml` forces 404 on `/node_modules/*`, `/package.json`,
  `/package-lock.json` (same pattern as `/docs/*` and `/netlify/*`). No `_redirects` rule shadows them.
- Bundling verified with Netlify's own bundler (`@netlify/zip-it-and-ship-it`): both functions bundle with
  `@netlify/blobs`, the shared validator inlined; the bundled code was executed (request accepted, unknown code
  rejected, purge with its `@daily` schedule). The two existing admin functions bundle as before.
- No secrets in the repository; no Blobs configuration or credentials in any client file (inside Functions Netlify
  injects `siteID`, `token` and `deployID`).
- Static output: no build command, publish directory unchanged; only the files listed in section 13 are new or changed.
- `@netlify/blobs` needs Node >= 22.12; the site's functions already run on `nodejs22.x`. Before launch, check on a
  Deploy Preview that the deploy summary lists no `node_modules` files and that `/node_modules/...` answers 404.

## 12. Open points for management

1. Manual-board families: "מי נוסע" sits on the auto tab, so a family that only uses the manual board sees the CTA only
   after choosing a child age there. A one-line prompt on the board would fix it; not added (no redesign).
2. Launch switches: set `JOURNAL_BETA_SECRET` and `JOURNAL_BETA_ENABLED=true` in Netlify, and replace the
   `?journal_beta=preview` CTA switch with a reviewed config change.
3. Operator notification: none automatic; check the store daily during the Beta.

## 13. Files

New: `kids-journal-beta.html`, `journal-beta.js`, `journal-beta-route.js`, `netlify/functions/journal-beta-request.mjs`,
`netlify/functions/journal-beta-purge.mjs`, `package.json`, `package-lock.json`, `images/journal-beta/*` (6 WebP + 6
JPEG + SOURCE.json), `docs/qa/journal-beta-harness.js`, `docs/qa/journal-beta-backend-test.mjs`, this document.
Changed: `planner.html` (gated family-only CTA), `privacy.html` (Beta section), `netlify.toml` (404 rules),
`build_search_index.py` (skip the draft), `_redirects` (generated line for the draft page).

## 14. Operator runbook (Netlify CLI, logged in to the site)

```
netlify blobs:list journal-beta --prefix requests/      # new requests
netlify blobs:get  journal-beta requests/<id>           # one request: email, first name, route code
# build the Journal from route_code + family_route with the Kids Journal tools, email the PDF
netlify blobs:delete journal-beta requests/<id>         # right after sending
netlify blobs:list journal-beta --prefix slots/         # how many of the 25 are taken
```
Never paste request contents into tickets, chats or logs.
