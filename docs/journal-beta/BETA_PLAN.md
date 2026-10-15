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

CTA visibility: the Beta feature flag is on (section 1a), a real itinerary, and a family selection. It updates at once
when "מי נוסע" changes. Adult-only and teen-only routes never see it. On the manual board the family signal is the same
"מי נוסע" selection (it lives on the auto tab); see section 12.

## 1a. Feature flag (one switch, on the server)

The only switch is the pair of Netlify environment variables read by the request function:
`JOURNAL_BETA_ENABLED=true` and `JOURNAL_BETA_SECRET` (both, per deploy context). Default: neither is set, Beta OFF.

- Function: `GET` answers `{enabled, open}`; `enabled` is true only when both variables are set. `POST` is refused
  (503) unless both are set. The server is authoritative.
- Planner: asks that `GET` only when a family itinerary is on screen, once per page load, and shows the CTA only for
  exactly `{enabled: true, open: true}`. 404, error, timeout (5 s), `enabled:false` or `open:false` keep it hidden.
- Page: the request form is hidden in the HTML and shown only for `{enabled: true, open: true}`; `open:false` shows
  "ההרצה התמלאה"; anything else shows the Hebrew "not open" card. No form without JavaScript either.
- No query parameter, cookie or browser storage value can turn anything on. The flag is not personal data.
- Fail closed: UI off whenever the server is off or unreachable; server off whenever either variable is missing.

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

Site-wide stores are shared by all deploys of the site, so the store is chosen by deploy context: `journal-beta` only when
the function runs in a `production` deploy, `journal-beta-preview` for Deploy Previews, branch deploys, dev and any
unknown context (`storeNameFor`). Preview QA can never claim a real Beta slot or read real requests.

| key | value | personal data | deleted |
|---|---|---|---|
| `slots/01` .. `slots/25` | `{request_id, created_at}` | none | never (it is the count) |
| `requests/<request_id>` | `{request_id, created_at, expires_at, status:"received", email, first_name, route_code, family_route:true, planner_mode}`, metadata `{created_at, expires_at}` | normalized email, optional first name, route | after delivery by the operator, at the latest by the daily purge after 7 days |
| `dedupe/<hmac>` | `{request_id, created_at}` | none in the key or value (HMAC-SHA256 of normalized email + route code, keyed by JOURNAL_BETA_SECRET) | daily purge after 7 days |
| `downloads/<download_token>` | `{request_id, delivery_store, delivery_token, created_at, expires_at}`, metadata `{expires_at}` (automation only, section 15) | none (opaque tokens) | daily purge at its `expires_at` (at most the request's 7 days) |

New records are written with `status:"accepted"`; `received` is the legacy name and is read as `accepted`. With
automation on, the record also carries the state fields of section 15 (`dispatch_attempts`, `dispatch_claimed_at`,
`dispatched_at`, `dispatch_error`, `ready_at`, `download_token`, `download_expires_at`, `pdf_size`, `page_count`,
`worker_version`, `worker_status`, `failed_at`, `delivered_at`); never the worker's `delivery_token`.

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

1. Accepted for the 25-family Beta (management, 12 Oct 2026): "מי נוסע" sits on the auto tab, so a family that only
   uses the manual board, or opens a shared /t/ link, sees the CTA only after choosing a child age on the auto tab.
   Fix before a wider launch.
2. Operator notification: none automatic; check the store daily during the Beta.

## 12a. Launch switch (production context)

TO OPEN BETA:
1. `netlify env:set JOURNAL_BETA_ENABLED true --context production --scope functions`
2. `netlify env:set JOURNAL_BETA_SECRET <new random 64 hex> --context production --scope functions --secret`
3. `netlify blobs:list journal-beta` shows no keys (empty production store)
4. deploy the approved main (env vars apply from that deploy on)
5. smoke test: `GET /.netlify/functions/journal-beta-request` -> `{"enabled":true,"open":true}`; a family route shows the CTA
6. `netlify blobs:list journal-beta --prefix slots/` -> 0 of 25

TO CLOSE BETA:
- `netlify env:unset JOURNAL_BETA_ENABLED --context production`, then redeploy (functions read env at deploy time)
- keep accepted requests until processed or the 7-day purge removes them

## 13. Files

New: `kids-journal-beta.html`, `journal-beta.js`, `journal-beta-route.js`, `netlify/functions/journal-beta-request.mjs`,
`netlify/functions/journal-beta-purge.mjs`, `package.json`, `package-lock.json`, `images/journal-beta/*` (6 WebP + 6
JPEG + SOURCE.json), `docs/qa/journal-beta-harness.js`, `docs/qa/journal-beta-backend-test.mjs`, this document.
Changed: `planner.html` (gated family-only CTA), `privacy.html` (Beta section), `netlify.toml` (404 rules),
`build_search_index.py` (skip the draft), `_redirects` (generated line for the draft page).
Automation foundation (section 15): new `netlify/journal-lib/journal-state.mjs`, `netlify/journal-lib/journal-automation.mjs`,
`netlify/functions/journal-worker-callback.mjs`, `netlify/functions/journal-download.mjs`,
`netlify/functions/journal-beta-reconcile.mjs`, `docs/qa/journal-automation-test.mjs`; changed
`netlify/functions/journal-beta-request.mjs` (dispatch, same-id retry, `accepted`), `netlify/functions/journal-beta-purge.mjs`
(download mappings, delivery store), `journal-beta.js` (dispatch_failed message), `docs/qa/journal-beta-harness.js`.

## 14. Operator runbook (Netlify CLI, logged in to the site)

```
netlify blobs:list journal-beta --prefix requests/      # new requests
netlify blobs:get  journal-beta requests/<id>           # one request: email, first name, route code
# build the Journal from route_code + family_route with the Kids Journal tools, email the PDF
netlify blobs:delete journal-beta requests/<id>         # right after sending
netlify blobs:list journal-beta --prefix slots/         # how many of the 25 are taken
```
Never paste request contents into tickets, chats or logs.

## 15. Automation foundation (website side, code only, nothing configured)

Off unless configured. Without `JOURNAL_GITHUB_DISPATCH_TOKEN` the request function behaves exactly as above (manual
operator flow). Production has no accepted delivery store, so in a `production` deploy dispatch, callback, download and
reconciliation are all off even if a token were set (`deliveryStoreFor` returns null; fail closed). Shared code:
`netlify/journal-lib/journal-state.mjs`, `netlify/journal-lib/journal-automation.mjs`.

### State machine (record `requests/<id>`, every change an `onlyIfMatch` write on the etag just read)

| state | meaning | next |
|---|---|---|
| `accepted` | stored, slot held; not dispatched yet (manual flow), or a dispatch in flight (`dispatch_claimed_at`) | dispatched, dispatch_failed, ready, failed |
| `dispatch_failed` | GitHub refused or was unreachable; typed `dispatch_error` (auth, not_found, invalid, unavailable, timeout, network, http_NNN) | accepted (retry claim, same id), ready, failed |
| `dispatched` | GitHub answered 204 | ready, failed |
| `ready` | a validated worker result; one website download capability created | delivered (explicit step only) |
| `delivered` | set only by `markDelivered`, which nothing calls yet (no email in this phase) | none |
| `failed` | the worker reported a signed non-ready status (`worker_status`), no file | ready (an operator re-run that succeeds) |
| `expired` | derived: now >= `expires_at`; the daily purge deletes the record | none |

No downgrade (a failure after `ready` changes nothing), no second `ready`. A read without an etag is never followed by
a write. Public status (`publicStatus`) is `{status, download_ready}` only.

### Dispatch

After the record is stored: claim (accepted + `dispatch_claimed_at`, conditional write; only the winner sends), then
`POST https://api.github.com/repos/DS-VideoArt/golondon-kids-journal/dispatches` with
`{"event_type":"journal_generate","client_payload":{request_id, route_code, family_route, planner_mode, first_name, created_at}}`,
exactly those six keys (`first_name` null when not given). Bearer token from the server env only; 8 s timeout; the
response body is never read or logged. 204 -> `dispatched`, page gets `received`. Anything else -> `dispatch_failed`,
page gets `502 {code:"dispatch_failed", retryable:true}` and shows a Hebrew "saved, but preparation did not start, press
send again" message (no `journal_beta_submit`). Pressing send again hits the duplicate key, finds the same record and
re-dispatches with the same `request_id`: no new slot, no new record; `journal_beta_submit` fires once when that
succeeds. The reconciliation also retries `dispatch_failed`. At most 5 attempts per request.

### Signed callback `POST /.netlify/functions/journal-worker-callback`

What the approved worker (journal-worker-1.2.0) sends: body `json.dumps(result, ensure_ascii=False, sort_keys=True)`
UTF-8, headers `X-Journal-Signature: sha256=<hex HMAC-SHA256 of that body, key JOURNAL_CALLBACK_SECRET>` and
`X-Journal-Worker: journal-worker-x.y.z`. Order: POST only -> secret and delivery store configured (else 503) -> body
read as raw bytes, max 16 KB -> signature verified on those bytes with `timingSafeEqual` (missing, malformed or wrong:
401) -> worker header -> JSON parse -> `applyWorkerResult`: request id shape, known request (404), not expired (410),
`status` ready (other worker statuses: 422 `not_ready`, record -> `failed` with the status only, never `detail`),
`delivery_store` exactly `journal-delivery-preview` (422 `wrong_store`), `delivery_token` 64 lowercase hex (422),
`expires_at` in the future, optional numeric fields well formed, and `pdf/<delivery_token>` exists in the delivery
store with metadata `request_id` equal to the request (409 `delivery_missing`). Then finalization. Repeats (including
the worker's `reused:true`) answer 200 with `created:false`. Responses carry `{ok, status, created}` or `{ok:false, code}`,
never a token or the request id; the function logs the HTTP status only.

### Download `GET /journal-download/<download_token>`

On the first finalization a new website token (32 random bytes, base64url, 43 characters) is written as
`downloads/<token>` (`onlyIfNew`), then the record moves to `ready` with that token (conditional write); a writer that
loses the race deletes its mapping, so exactly one capability exists. Expiry = min(request `expires_at`, PDF
`expires_at`). The function checks the token shape, the mapping, its expiry (410), that the record still names this
token and is ready or delivered, the store, the PDF metadata (`request_id`, `expires_at`), then streams
`journal-delivery-preview/pdf/<delivery_token>` with `application/pdf`, `attachment; filename="golondon-kids-journal.pdf"`,
`no-store, private`, `noindex`, `no-referrer`. No redirect, no Blob URL, no PII in the URL, no token in headers or logs.
Downloading does not change the state.

Limit: Netlify streamed function responses are documented at 20 MB. A PDF above `MAX_STREAM_BYTES` (20,000,000) is
refused with 503 instead of being cut. The worker's documented example is 48,354,720 bytes, so real books need either a
smaller delivery PDF or a different serving path before customer delivery (see the open points).

### Reconciliation `journal-beta-reconcile` (scheduled `*/15 * * * *` UTC)

Only Beta records awaiting generation (`dispatched`, `dispatch_failed`, `accepted` with a dispatch attempt; never the
manual flow). For each, a direct read of `index/<request_id>` in the delivery store of the context (preview:
`journal-delivery-preview`; production: none, the function does nothing). A ready index goes through the same
`applyWorkerResult` as the callback (same validation, same single capability); an index whose `request_id` differs from
its key is rejected. No index: `dispatch_failed` is re-dispatched (same id), the rest waits. No listing or scanning of
the delivery store. Logs counts only. Scheduled functions run only on published deploys; on a Deploy Preview use
"Run now" in the Netlify UI.

### Retention

`journal-beta-purge` (daily) also deletes `downloads/*` at their `expires_at`, and, through `purgeDelivery`, the
context's delivery store only (preview: `journal-delivery-preview`; production: none): `pdf/*` at the `expires_at` in
their metadata and `index/*` at their `expires_at`. The download expiry is never later than the PDF expiry, so a file
is never deleted while its link is valid; a PDF without metadata cannot be downloaded and is removed.

### Settings for the first Deploy Preview end to end run (not set by this change)

Netlify, context `deploy-preview`, scope Functions: `JOURNAL_BETA_ENABLED=true`, `JOURNAL_BETA_SECRET` (secret),
`JOURNAL_GITHUB_DISPATCH_TOKEN` (secret; fine-grained PAT, only DS-VideoArt/golondon-kids-journal, Contents read and
write), `JOURNAL_CALLBACK_SECRET` (secret, same value as the worker's). Then "Retry with latest branch commit".
Worker repository (operator): secrets `NETLIFY_SITE_ID`, `NETLIFY_BLOBS_TOKEN`, `JOURNAL_CALLBACK_URL` =
`https://deploy-preview-2--<site>.netlify.app/.netlify/functions/journal-worker-callback`, `JOURNAL_CALLBACK_SECRET`;
variable `JOURNAL_DELIVERY_STORE=journal-delivery-preview`.

### Tests

`docs/qa/journal-automation-test.mjs` (offline; mocked dispatch; python3 produces the callback bytes and HMAC with the
worker's exact serialization; MemoryStore with atomic `onlyIfNew`/`onlyIfMatch`, plus the real client against the local
BlobsServer). The local BlobsServer returns no ETag on reads (the hosted API does), so that layer fills the read etag
from `list()`; the production code itself refuses to write without an etag.
