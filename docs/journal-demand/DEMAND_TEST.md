# Kids Journal demand validation (Preview implementation, 19 Oct 2026)

Branch `journal-demand-main-2026-10-19`, based on `origin/main` only (the earlier `journal-demand-validation-2026-10-19`
on the automation branch is kept unchanged as the source). This branch holds the demand test alone: no Beta request
flow, no worker, no PDF generation, no SES, no automation library. Sample images live in `images/journal-offer/`
(provenance in `SOURCE.json`). Local only: not pushed, not deployed, not approved for the live site. Goal: measure whether Israeli families planning London want a personal
kids' journal (ages 6 to 10) at a displayed planned price of 14.90 ₪ (changed from 14.90 ₪ on 19 Oct 2026), over 21 days once activated on the live site.

## What it is, and what it is not

- An offer page `kids-journal-offer.html` (noindex, not in the sitemap, not in the search index, not on the home page):
  headline "המסלול שלכם בלונדון. ההרפתקה שלהם.", the five content points, the planned price 14.90 ₪, a visible notice
  that the product is not for sale yet (no order, no payment, no launch or delivery promise), three real pages of
  the approved sample journal, a sample PDF download, and an interest form.
- The sample `samples/kids-journal-sample-big-ben.pdf` = pages 4 and 5 (the Big Ben place page and its colouring
  page) of the approved 1-day fixture book, copied without change (`samples/SOURCE.json` has the provenance and
  hashes). The Master and the journal production system are untouched.
- The interest form: email (required), trip month and child age (optional), "would you consider buying at 14.90 ₪"
  (yes / maybe / no), and an explicit consent checkbox for a single availability email. Honeypot field. No name,
  no route, no payment, no order, no worker dispatch, no automatic email.
- Function `netlify/functions/journal-interest.mjs`: `GET` -> `{enabled}`, `POST` -> `received` / `already`. Open
  only with the plain environment variable `JOURNAL_INTEREST_ENABLED=true` (not a secret); otherwise 503 and nothing
  written. Store by deploy context: `journal-interest` (production only) / `journal-interest-preview` (everything
  else). Key `interest/<sha256(email)>`, written with `onlyIfNew` (one record per email, first answer kept). Record:
  `created_at, expires_at (+90 days), email, trip_month, child_age, willing, consent_at, price_shown` (the price in
  effect when the answer was given). Deleted by the existing daily
  scheduled function `journal-interest-purge` (`@daily`) at 90 days, in the same context's store. Logs: HTTP status
  only. Dependency: `@netlify/blobs` 11.1.4 (pinned, `package.json` + lock); `netlify.toml` answers 404 for
  `/node_modules/*`, `/package.json` and `/package-lock.json`.
- Privacy: `privacy.html#journal-interest` explains the form, the single email, the 90-day deletion, no marketing list.

## Gating: one switch, one controlled release

The server switch `JOURNAL_INTEREST_ENABLED` gates everything, not only the form. Every placement card (planner and
guides) is rendered only after `GET /.netlify/functions/journal-interest` answered `{enabled: true}` (one request per
browser session, cached in `sessionStorage`); the offer page keeps only its headline and a "not open yet" card until
the same answer arrives, then opens the buttons, price, sample and form together. Closed, unreachable or slow (5 s):
nothing is shown anywhere, so a visitor can never meet an active offer with a disabled form. Release is therefore one
step: set the variable in the production context and deploy; to end the experiment, remove it and redeploy, and all
cards and the page close at once.

## Placements (no home page)

- Planner: `#jo-cta` (auto results) and `#m-jo-cta` (manual board), rendered by `journal-offer-card.js` only after a
  family itinerary (a child under 12 in "מי נוסע", the planner's own strict-kids rule). `planner_complete` and the
  funnel are unchanged; without the component script the boxes stay hidden.
- Kids and family guides: `guide-kids`, `guide-kids-museums`, `guide-kids-parks`, `guide-kids-rain`, `guide-kids-free`,
  `guide-stay-family`, `guide-flight-family` (`data-journal-offer="guide"`).
- Winter content: `guide-winter-kids`, `guide-winter`, `guide-winter-christmas`, `guide-winter-lights`,
  `london-december`, `guide-winter-ice-skating` (`data-journal-offer="winter"`).

## Events (GA4 through `glTrack`, never personal data, never revenue)

| event | when | params | duplicates |
|---|---|---|---|
| `journal_offer_view` | offer page load | `entry` (planner / guide / winter / direct), `offer_price` | once per page load |
| `journal_offer_click` | click on a placement card | `entry`, `placement` (page id), `offer_price` | once per session |
| `journal_sample_download` | click on either sample button | `entry`, `offer_price` | once per session |
| `journal_interest_submit` | only when the server answered `received` | `entry`, `willing` (yes / maybe / no), `has_month`, `has_age`, `offer_price` | once per session; `already` never counts |

`offer_price` is the numeric price shown (14.9), so answers can be read per price if it changes again.

Users who answered `willing = yes` can be segmented in GA4 by the event parameter. Interest is never reported as
a purchase: there is no e-commerce event.

## Tests

`docs/qa/journal-interest-test.mjs` (50, offline: validation, honeypot, duplicates, concurrency, switch, store by
context, 90-day purge, real Blobs client, content and isolation checks) and `docs/qa/journal-offer-harness.js` (73,
browser: desktop and 375 px mobile, Hebrew and RTL, accessibility basics, sample download as `application/pdf`, the
four events without duplicates, closed switch, honeypot, placements on six pages, planner family / adult / Beta-open
cases, no request to any other function, no GitHub, AWS or payment host). Existing suites unchanged and green.

## Activation later (not done here, owner decisions)

- Preview QA: deploy the branch as a Deploy Preview and set `JOURNAL_INTEREST_ENABLED=true` in the deploy-preview
  context only. Records go to `journal-interest-preview`.
- Live site: merge to `main` after approval, set `JOURNAL_INTEREST_ENABLED=true` in the production context, deploy.
  Close after 21 days by removing the variable and redeploying (the offer and the sample stay visible; the form says
  "not open yet"). Read results: `netlify blobs:list journal-interest` (count), GA4 events above. Send the one-time
  availability email manually to the consenting addresses when the product launches, then delete the records.
- No Netlify Form, no third-party service, no paid service, no secret is needed for this experiment.
