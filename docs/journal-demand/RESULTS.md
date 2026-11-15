# Kids Journal demand test: results and closure (15 Nov 2026)

**Decision (management, 15 Nov 2026):** the experiment did not get enough exposure to decide whether there is demand.
It is closed; the code, the data and the product material are kept for a possible future run. The journal production
system (Beta automation, worker, SES) is not merged and not configured.

## Timeline

- 19 Oct 2026 16:07 UTC: PR 4 merged to `main` (`60b52a2`), redeployed 16:25 after `JOURNAL_INTEREST_ENABLED=true` was
  set in the production context. Experiment live from then (price 14.90 ILS, placements on the planner and 13 guides).
- 19 Oct: two gating corrections pushed before launch (`565fa5c`, `4db063e`): the offer page and every card open only
  after the server answers enabled; no cross-page cache.
- 9 Nov: planned end of the 21 days. 15 Nov: closure (variable removed in production and deploy-preview, redeploy).

## Results

Interest store `journal-interest` (production): **0 records** over 27 days. Preview store: 0 (test records deleted on
19 Oct). Measurement verified healthy on 15 Nov: the GA4 tag loads on golondon.co.il, collect hits are sent, and a
test `journal_offer_view` appeared in the realtime report.

GA4 property golondon.co.il, exploration by event name and by page path, 18 Oct to 14 Nov 2026 (the GA4 28-day window
that covers the whole live period; 15 Nov holds only the operator's test visits):

| metric | value |
|---|---|
| `journal_offer_view` (offer page loads) | 0 |
| `journal_offer_click` (card clicks, any placement) | 0 |
| `journal_sample_download` | 0 |
| `journal_interest_submit` | 0 |
| unique users on `/kids-journal-offer` | 0 (page not among pages with 3+ views; no view event) |
| placement page views: `/guide-winter-christmas` | 67 views, 57 users |
| `/guide-winter-ice-skating`, `/london-december`, `/guide-winter-lights` | 9, 6, 5 views |
| other 9 kids / family / winter placements (incl. `/guide-kids`, `/guide-winter-kids`) | under 3 views each |
| `/planner` | 25 views, 16 users, 7 `planner_complete` by 5 users (family share unknown) |
| whole site in the window | 225 users, 390 page views, 1,326 events |

Estimated exposure to a card: about 90 to 105 page views by about 75 users, zero clicks.

## Reading

Low exposure. With roughly one hundred impressions of a small "coming soon" card, zero clicks is within chance (an
ordinary 1 to 3 percent click rate would give 1 to 3 clicks), so the test neither shows demand nor disproves it. A real
answer needs exposure larger by an order of magnitude (a directly promoted offer page, an audience beyond the site's
small organic traffic), not more days of the same placement.

## What is kept

- Code on `main`: offer page, interest function and daily purge, card component and placements, privacy section,
  tests (`docs/qa/journal-interest-test.mjs`, `docs/qa/journal-offer-harness.js`), `docs/journal-demand/DEMAND_TEST.md`.
  With the variable unset everything is closed: no cards, offer page shows "not open yet", POST answers 503.
- Sample PDF and images (`samples/`, `images/journal-offer/`).
- Beta automation branches (website `journal-automation-finalize-2026-10-15` local, worker
  `automation-env-routing-2026-10-15` local) untouched and unmerged.
- No data to retain: the interest stores are empty.

## To run again later

Set `JOURNAL_INTEREST_ENABLED=true` in the wanted context and deploy; everything reopens as one unit.
