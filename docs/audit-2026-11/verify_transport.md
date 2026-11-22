# Transport and UK entry costs: verification (read-only audit, 2026-11-17)

Scope: transport fares, airport transfers, ETA and customs. Local copy: `/Users/mymac/דפי נחיתה ואתרים/golondon-audit-wt`.
Session note: partway through, the web tools hit a usage limit. Every item marked UNVERIFIED below is one I could not check against a primary source in this session. I did not guess any value.

Main sources:
- S1 MD3464, March 2026 fares: https://www.london.gov.uk/md3464-march-2026-transport-london-fare-changes
- S2 TfL "Adult rate prices 2026", caps and Travelcards table: https://content.tfl.gov.uk/adult-fares.pdf
- S3 MD3517, July 2026 fare changes (bus and tram from 1 Nov 2026): https://www.london.gov.uk/md3517-july-2026-fare-changes
- S4 Mayor's 2026 fares package (Heathrow Elizabeth line £13.90 to £15.50, caps frozen to March 2027): https://www.london.gov.uk/mayor-announces-plans-2026-tfl-fares-package-including-further-freeze-seventh-time-bus-and-tram
- S5 TfL, buying Oyster: https://tfl.gov.uk/fares/how-to-pay-and-where-to-buy-tickets-and-oyster/buying-tickets-and-oyster
- S6 TfL taxi fare card from 25 April 2026: https://content.tfl.gov.uk/taxi-fare-card-2026.pdf
- S7 Heathrow Express one-way fares: https://www.heathrowexpress.com/ticket-fares/one-way
- S8 Uber, LHR airport page: https://www.uber.com/global/en/r/airports/lhr/
- S9 GOV.UK, apply for an ETA: https://www.gov.uk/eta/apply
- S10 GOV.UK, ETA guidance: https://www.gov.uk/guidance/electronic-travel-authorisation-eta
- S11 GOV.UK, Appendix ETA National List: https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-eta-national-list

| # | Page file(s) | Claim on site (brief) | Verified current value | Source | Status | Severity | Suggested exact fix |
|---|---|---|---|---|---|---|---|
| 1 | guide-transport-zones.html | Zone 1 PAYG single: £3.10 peak, £3.00 off-peak | £3.10 / £3.00 since 1 Mar 2026 | S1 | OK | n/a | none |
| 2 | guide-transport-zones.html, guide-flight-budget.html, guide-transport-airport.html | Zones 1-6 peak "almost £6" (Piccadilly from Heathrow); airport page says "about £6" | £5.90 peak, £4.00 off-peak | S1 | OK (VARIABLE) | cosmetic | Airport page: "קו פיקדילי 5.90 ליש״ט בשעות העומס ו-4.00 מחוצה להן" |
| 3 | guide-transport-zones.html, guide-oyster.html, guide-flight-budget.html, guide-stay-budget.html, posts.json | Daily cap Zones 1-2 £8.90, weekly £44.70 | £8.90 / £44.70, frozen until March 2027 | S2, S4 | OK | n/a | none |
| 4 | guide-transport-zones.html | Zones 1-4 £12.80 / £64.20 | £12.80 / £64.20 | S2 | OK | n/a | none |
| 5 | guide-transport-zones.html | Zones 1-6 £16.30 / £81.60 | £16.30 / £81.60 | S2 | OK | n/a | none |
| 6 | guide-transport-zones.html | Zones 1-6 cap is the same at peak and off-peak | Peak £16.30, off-peak £16.30 | S2 | OK | n/a | none |
| 7 | guide-transport-zones.html | Weekly cap runs Monday to Sunday | Caps are "Monday to Sunday" | S2 | OK | n/a | none |
| 8 | guide-transport-zones.html | "From the third journey of the day you travel free" (also "after two journeys, the rest cost nothing") | At £3.10 peak: journeys 1 and 2 cost £6.20, journey 3 costs £2.70 to reach the £8.90 cap, journey 4 onward is free (off-peak: £3.00 + £3.00 + £2.90) | S1, S2 | WRONG | important | "הנסיעה השלישית ביום כבר מגיעה לתקרה, ומהנסיעה הרביעית נוסעים בחינם" (fix the "אחרי שתי נסיעות ביום" bullet the same way) |
| 9 | guide-transport-zones.html, guide-transport-bus-routes.html, guide-flight-budget.html, guide-attractions-rainy.html | Bus £1.85, bus and tram daily cap £5.55, Hopper free for an hour | £1.85 and £5.55 from 1 Nov 2026 (were £1.75 and £5.25 until then). Hopper unchanged | S3 | OK now | n/a | none for the values (see #10) |
| 10 | guide-transport-zones.html | Header "נכון לאוגוסט 2026" above the £1.85 / £5.55 bus figures | Those figures only took effect on 1 Nov 2026. In August they were £1.75 / £5.25 | S3 | OUTDATED (date label) | important | Change to "נכון לנובמבר 2026" (bus fares updated on 1.11.2026) |
| 11 | guide-transport-bus.html, guide-transport-zones.html | No weekly bus cap mentioned | 7-day bus and tram cap or pass: £26.10 from 1 Nov 2026 (was £24.70). The site has no outdated figure | S3 | OK (omission) | cosmetic | Optional: "תקרה שבועית לאוטובוסים 26.10 ליש״ט" |
| 12 | guide-transport-zones.html | Separate bus cap "לאוטובוסים ולרכבת הקלה" | The bus cap covers buses and trams only, not the DLR. In Hebrew "רכבת קלה" reads as DLR or light rail | S3 | WRONG (wording) | cosmetic | "לאוטובוסים ולחשמלית (Tram) יש תקרה נפרדת" |
| 13 | posts.json (2026-08-07, "מחירי הרכבת התחתית עלו במרץ 2026") | "גם מחירי האוטובוס הוקפאו" | True when posted. Bus fares rose on 1 Nov 2026 | S3 | OUTDATED | cosmetic (dated post) | If the post is still shown or reused, add: "מ-1.11.2026 האוטובוס עלה ל-1.85 והתקרה ל-5.55" |
| 14 | posts.json (same post) | Single fares rose "כמה עשרות פני לנסיעה" | Zones 1-6 Tube singles rose 10p to 20p at most (Zone 1 +20p) | S1 | WRONG (overstated) | cosmetic | "העלייה היא 10 עד 20 פני לנסיעה" |
| 15 | guide-oyster.html, guide-mistakes.html (twice) | Oyster card £10.50, non-refundable fee; family of four = £42 | TfL: "You need to pay £10.50 for an Oyster card"; non-refundable if bought on or after 4 Sep 2022 | S5 | OK | n/a | none |
| 16 | guide-oyster.html, posts.json | March 2026: singles rose, caps frozen | Confirmed (Travelcards and caps frozen until March 2027) | S1, S4 | OK | n/a | none |
| 17 | guide-transport-airport.html | Elizabeth line Heathrow to central about £15.50 (2026, contactless) | £15.50 (from £13.90, 1 Mar 2026) | S4 | OK | n/a | none |
| 18 | guide-transport-airport.html; posts.json (2026-08-07 purple line post) | The Elizabeth line "costs a small fraction of the Express price" | £15.50 vs £26 Express walk-up (about 60%). The Express Advance fare from £10 (booked 30+ days ahead) is cheaper than the Elizabeth line | S4, S7 | WRONG (misleading) | important | "עולה כ-15.50 ליש״ט, לעומת 26 באקספרס בקנייה ביום הנסיעה. מי שמזמין אקספרס 30 יום מראש יכול לשלם 10 בלבד" |
| 19 | guide-transport-airport.html | Heathrow Express "up to about £26" walk-up, much cheaper in advance | Standard single £26.00; Advance from £10 (30+ days); under 16 free | S7 | OK | n/a | Optional: add "ילדים עד גיל 15 חינם" |
| 20 | guide-transport-cost.html | The airport journey "is not included in the regular cap" | Caps cover Tube, Elizabeth line and Overground. Only Heathrow Express and Southeastern high-speed are excluded. Heathrow commuters are "protected by the cap" | S2, S4 | WRONG | important | "בקו אליזבת ובפיקדילי הנסיעה מהיתרו נספרת בתקרה של אזורים 1 עד 6 (16.30 ליש״ט). רק האקספרס לפדינגטון מחוץ לתקרה" |
| 21 | guide-transport-airport.html (text, table, FAQ) | Black cab Heathrow to central £70 to £120, 30 to 60 minutes | £70.00 to £120.00, 30 to 60 minutes (fares from 25 Apr 2026) | S6 | OK | n/a | none |
| 22 | guide-transport-airport.html | £1.60 extra for pickup at the Heathrow rank | £1.60 for journeys starting from the airport taxi ranks | S6 | OK | n/a | none |
| 23 | guide-transport-airport.html | Uber "about £56 regular, about £86 six-seater" (table) vs "55 to 60" (FAQ) | Uber's page now shows UberX £51, UberXL £80, with no date and "not guaranteed" | S8 | VARIABLE, and internally inconsistent | cosmetic | Use one phrasing in both places: "בסביבות 50 עד 60 ליש״ט לרכב רגיל וכ-80 לרכב שש מקומות, לפי הממוצע שאובר מפרסמת, ומשתנה לפי ביקוש" |
| 24 | guide-flight-eta.html, guide-flight.html, guide-flight-budget.html, guide-mistakes.html | ETA £20 per person; family of 4 = £80, family of 5 = £100 | £20 | S9, S10 | OK | n/a | none |
| 25 | guide-flight-eta.html, guide-mistakes.html | Valid 2 years or until the passport expires | "2 years or until your passport expires, whichever is sooner" | S9 | OK | n/a | none |
| 26 | guide-flight-eta.html | Up to 6 months per visit; every traveller including babies | Up to 6 months; "Each person travelling needs an ETA, including babies and children" | S10 | OK | n/a | none |
| 27 | guide-flight-eta.html | Required for Israelis since 8 Jan 2025; transit only if passing UK border control | Israel is on the list for travel on or after 8 Jan 2025; transit wording matches GOV.UK | S11, S10 | OK | n/a | none |
| 28 | guide-flight.html | "נכון ל-25 באוגוסט 2026, ההגשה הרשמית עולה 20 ליש״ט" | Still £20 | S9 | OK (stale date) | cosmetic | "נכון לנובמבר 2026" |
| 29 | guide-flight-customs.html | Other goods £390 (£270 by private plane or boat); full value is taxed if over; allowances cannot be pooled | Not checked this session (web limit) | (gov.uk/duty-free-goods, not fetched) | UNVERIFIED | n/a | Recheck at gov.uk/duty-free-goods/arrivals-from-outside-the-eu |
| 30 | guide-flight-customs.html | 200 cigarettes / 100 cigarillos / 50 cigars / 250 g tobacco / 200 heated sticks; 42 L beer, 18 L wine, 4 L spirits or 9 L up to 22%; under-17s get no alcohol or tobacco allowance | Not checked this session | (same) | UNVERIFIED | n/a | Recheck as above |
| 31 | posts.json (2026-08-07 driving post) | Congestion charge £15 to £18 from 2 Jan 2026; £21 if paid up to 3 days late; EVs lost their exemption; ULEZ £12.50; both = £30.50 | Not checked this session | (tfl.gov.uk/modes/driving/congestion-charge, not fetched) | UNVERIFIED | n/a | Recheck at TfL congestion charge and ULEZ pages. The arithmetic £18 + £12.50 = £30.50 is consistent |
| 32 | guide-kids-transport.html, posts.json (stroller post) | Under 11 free: always on buses, on the Tube up to 4 children with a paying adult | Not checked this session | (tfl.gov.uk free and discounted travel, not fetched) | UNVERIFIED | n/a | Recheck at tfl.gov.uk/fares/free-and-discounted-travel |
| 33 | posts.json (2026-08-14 Oyster post) | Visitor Oyster: delivery fees, "sometimes an activation fee", no discount | Visitor shop page returned HTTP 429. One search snippet mentioned a £10.50 non-refundable card fee | (visitorshop.tfl.gov.uk, not fetched) | UNVERIFIED | n/a | Recheck and state the actual card fee and postage |
| 34 | posts.json (2026-08-14 seniors post) | "רוב הרכבות התחתית והאוטובוסים מציעים הנחה למבוגרים" | TfL's 60+ Oyster and Freedom Pass are London-resident schemes (MD3517 lists them as concessions). I could not fetch a page that states the visitor eligibility rule | S3 (partial) | UNVERIFIED (likely WRONG for tourists) | important if confirmed | Recheck. If confirmed: "אין הנחת גיל לתיירים בתחבורה של לונדון, ההנחות לגיל 60+ מיועדות לתושבי לונדון בלבד" |
| 35 | posts.json (2026-08-14 airports post) | Luton: "רכבת ואז אוטובוס מעביר"; "every airport has a dedicated fast train"; "buying at the station costs more" | guide-transport-airport.html says the Luton link is a short train (no bus). Station price and advance-ticket claims were not checked | n/a | Internal inconsistency; rest UNVERIFIED | cosmetic | Align with the airport page: "מהטרמינל רכבת קצרה לתחנה, ומשם רכבת לסנט פנקראס" |
| 36 | guide-transport-bus-routes.html | Open-top tour bus "around £30" | Not checked (outside core scope) | n/a | UNVERIFIED | n/a | n/a |

## Totals
- Claims checked (rows): 36
- OK: 21 (rows 1-7, 9, 11, 15-17, 19, 21, 22, 24-28. Rows 2 and 11 are OK with optional wording improvements, and row 28 needs only a date refresh)
- WRONG or misleading: 5 (rows 8, 12, 14, 18, 20)
- OUTDATED: 2 (rows 10, 13)
- VARIABLE or inconsistent: 1 (row 23)
- UNVERIFIED: 7 (rows 29-34, 36; row 34 is likely wrong). Row 35 is an internal inconsistency whose remaining claims are unverified.

## Internal inconsistencies found
- Uber price: about £56 / £86 in the table vs "55 to 60" in the FAQ on the same page (guide-transport-airport.html).
- Luton access: shuttle bus (posts.json) vs short train (guide-transport-airport.html).
- guide-transport-cost.html says the airport journey is outside the cap. guide-transport-zones.html presents the Heathrow Piccadilly fare as an ordinary Zones 1-6 fare, which is capped.
- Bus fare £1.85 under the "נכון לאוגוסט 2026" header, while the 7 Aug 2026 post says bus fares were frozen (at £1.75 then).
- No conflicting values found for caps, the Oyster fee (£10.50 on all three mentions), ETA or the black cab fare.
