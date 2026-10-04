# Planner places: content audit and standard (4 Oct 2026)

Branch `planner-content-2026-10-04`, from production 73a7450. Source of truth: `planner-data.json`.
Each place was checked against its official website where one could be read (several official sites block automated reads; those facts come from the official domain's search results and are listed as unresolved).

## Audit totals (before editing)

| Class | Meaning | Places |
|---|---|---|
| A | GOOD, already useful and accurate | 7 |
| B | NEEDS IMPROVEMENT, vague, short or no useful tip | 70 |
| C | NEEDS VERIFICATION, a factual or dated claim was wrong or unconfirmed | 57 |
| D | MISSING, important content absent | 27 |
| | total | 161 |

## Content standard

- **Description**: 2 to 4 sentences (about 150 to 380 characters): what the place is, why a visitor would care, what kind of experience to expect. Family context where it genuinely matters (interactive, big park, animals, long visit, steep stairs, less suited to small children), no unsupported age advice.
- **Tip**: one practical tip: best entrance or time, booking, what combines nearby, viewpoint, realistic visit length, what to skip.
- **Product neutral**: no wording about a product (חוברת, מסלול, לחצו).
- **Evergreen**: no dates of temporary events, no 'this year' or 'currently', no named temporary exhibitions, no prices. Seasonal facts in general terms. Exact hours only when stable and verified, otherwise 'check the official site'.
- **Verified or softened**: a claim stays only if an official or clearly reliable source supports it.
- **Hebrew**: natural, no long dash or spaced hyphen, no brochure words (כמובן, בהחלט, מרתק, מדהים, חובה ...).
- **Structured fields**: `source` is the official http(s) URL only; coordinate provenance is `coordSource`. Entry cost is `access` (free, paid, partly_paid). Food, drink, nightlife and shop places have no entry fee: `access: free` plus `spend` (low, mid, high). The legacy `free` boolean is unchanged (the Planner's budget logic uses it).
- Checked mechanically by `docs/qa/place-data-check.js`.

## Per place

| Place | Class | Main issues (before) | Changed |
|---|---|---|---|
| british-museum | B | desc slightly short (140 chars); tip generic, missing free timed-ticket advice and second entrance; official site recommends advance (free) booking; walk-in depends on capacity | desc, tip |
| national-gallery | B | tip only repeats location, no practical value; missing: free fast-track ticket, Friday late opening, rooms closed for building work | tip |
| westminster-abbey | B | tip vague; missing Sunday closure for sightseeing and free services option | tip |
| big-ben | A | accurate; source loads (via browser; blocks bots) | no |
| buckingham | C | desc contains dated season dates for 2026 (evergreen violation); 'cancelled in rain' stated as certain; official sources only say schedule can change; missing: outside summer the p | desc, tip, access |
| churchill-rooms | B | tip repeats desc, no practical value; bookAhead not explained (mechanical flag) | tip |
| st-james-park | A | accurate; optional extra: pelicans usually fed around 14:30 | no |
| covent-garden | C | tip claims each street show lasts ~30 min and best view is the church portico steps: not confirmed by official site; portico is the performers' backdrop, not audience space | tip |
| tower-of-london | C | Tip says Yeoman Warder tour leaves every 30 minutes; official schedule varies (listings show 30 and 45 minute intervals) and places cannot be booked; bookAhead not explained in tex | desc, tip |
| tower-bridge | B | Mechanical flags are false positives: 'לחצו' matched inside 'לחצות', 'יוני' inside 'העליונים'; tip rephrased anyway to avoid the trigger; Tip repeated the free-crossing point from  | tip, access |
| st-pauls | B | bookAhead not explained; Tip missing that regular sightseeing is Monday to Saturday only (Sunday is for worship) | tip |
| sky-garden | C | Desc uses banned word 'חובה'; Booking is strongly advised but limited walk-ins are accepted, so 'must book' is overstated; 'Tropical garden' not how the venue describes it; garden  | desc, tip |
| borough-market | B | tip misses that the market is closed on Mondays; desc short (137 chars), does not describe the market areas | desc, tip |
| tate-modern | C | tip says the top-floor open terrace is open to all: official page now points to the Level 10 cafe for the free view; the outdoor Viewing Level has been reported closed; desc short  | desc, tip |
| london-eye | B | desc short (108 chars); tip repeats 30-minute fact; bookAhead not explained (mechanical flag); claim that sunset is the most expensive time not verified | desc, tip |
| southbank-walk | B | tip repeats desc; source is the Southbank Centre arts venue, not the riverside walk; no official site exists for the walk itself (southbanklondon.com no longer resolves); /visit/ r | tip, source |
| shard | B | desc short (110 chars); tip repeats 'tallest building' and suggests a generic hotel-bar alternative; misses stay-until-closing and view guarantee | desc, tip |
| natural-history | B | Tip is a generic superlative ('best museum in London for kids') and repeats desc; replaced with practical queue and meeting-point advice | tip |
| science-museum | B | Desc short (~130 chars) and does not mention that Wonderlab is paid separately; Tip repeats desc (next to NHM) | desc, tip |
| va-museum | C | 'Largest museum of design and applied art in the world' not stated on official site; softened; Tip repeats desc | desc, tip, source |
| hyde-park | C | 'The largest park in central London' is wrong: Hyde Park is 350 acres, Regent's Park about 410; combined with Kensington Gardens (265 acres) the green space is largest; Tip says bo | desc, tip |
| kensington-palace | C | 'Royal fashion displays' could not be confirmed as a standing display; softened; State apartments rotate closures (Queen's State Apartments closed for re-presentation), desc alread | desc, tip |
| notting-hill | B | Desc too long (~495 chars) with hour-level detail; shortened; Exact antiques hours (7am to 4pm) not on an official source; removed; Tip too long (4 sentences); trimmed to 2; Source | desc, tip, source |
| notting-hill-pastel-streets | A | Content good; street names consistent with reliable guides; Source URL (RBKC Portobello page) is broken; no official page exists for residential streets | source |
| museum-of-brands | B | Desc slightly long and contains exact opening hours; moved focus to the content; Tip gives an unsupported age recommendation ('from age 7') and an unverified claim about free timed | desc, tip |
| golborne-road | A | Content accurate and useful; Trellick Tower 1972 and listed status confirmed; Friday/Saturday second-hand stalls confirmed by guides | no |
| electric-cinema | C | Opening year wrong: official history says opened 27 February 1911, not 1910; 'Shows new films, not classics' contradicted: programme includes classics and special seasons; Blanket  | desc, tip, priceBand |
| camden-market | B | desc slightly short, does not name the three market areas; tip is generic praise ('reasonable prices' unverified), no practical advice | desc, tip |
| regents-park | C | tip claim 'almost no tourists reach the rose garden' is unverifiable and exaggerated; Primrose Hill is across Prince Albert Road north of the park, not inside its northern edge; so | desc, tip, source, coordSource |
| london-zoo | B | desc lacks what the visitor actually sees and visit length; bookAhead=true not explained: all tickets must be booked in advance online; source is not a URL | desc, tip, source, coordSource |
| shoreditch-art | B | tip only restates the description, not practical; desc slightly short and does not say what kind of experience to expect; source is the generic Tower Hamlets homepage (loads, but n | desc, tip |
| brick-lane | C | tip says outside Sunday it is mainly a restaurant street; Truman Brewery's Vintage Market and Upmarket are open 7 days a week | tip |
| greenwich | B | tip uses banned word 'מדהים'; tip is vague ('half the experience') with no concrete practical value | tip, access |
| maritime-museum | C | 'largest maritime museum in the world' not stated on the official site (only the Caird Library is 'world's largest maritime library'); softened; desc too short (113 chars), no fami | desc, tip |
| kew-gardens | C | tip claims Kew is 'the largest botanic garden in the world', not supported by official sources; removed; tip ties advice to trip length (product-ish), replaced with practical entra | tip |
| harry-potter | B | desc uses banned word 'חובה'; tip repeats desc (outside London) and lacks transport details | desc, tip |
| hampton-court | B | tip repeats desc (Henry VIII, maze); bookAhead not explained; hrp.org.uk returns 403 to automated fetch; facts checked via HRP search snippets and secondary sources | tip |
| national-portrait-gallery | B | 'reopened after renovation' is dated wording; tip claim 'less crowded than National Gallery' unverifiable; missing: new main entrance on Ross Place, late opening Fri/Sat | desc, tip |
| tate-britain | B | desc short (134 chars); 'largest collection of British art in the world' not stated on official page; official says 500 years of British art and world's largest Turner collection | desc |
| wallace-collection | B | tip is brochure-like ('one of the biggest surprises') and 'no queues' unverifiable; exhibitions may be ticketed (permanent collection free) | tip |
| soane-museum | C | missing: closed Monday and Tuesday; tip suggests booking a place: official says no need to pre-book general entry (free, walk-in, possible queue); source /visit redirects to /your- | desc, tip, source |
| transport-museum | B | desc short (126 chars); tip misses key family facts: under-18s free, adult ticket is a 12-month pass, free timed ticket | desc, tip |
| trafalgar-square | B | 'most demonstrations and celebrations' is an overclaim; tip generic; source page (programmes-strategies/...) could not be confirmed (403 bot block); GLA page under who-we-are confi | desc, tip, source |
| chinatown-soho | A | acceptable; source redirects to chinatown.co.uk/en/ and loads (homepage still shows an old COVID notice) | no |
| piccadilly-circus | D | source URL is broken (visitlondon 'Page not found'); desc short (114 chars), 'Times Square of London' cliché; tip is an opinion without practical detail | desc, tip, source |
| dickens-museum | B | tip only repeats proximity to British Museum; missing: open Wednesday to Sunday only; desc can be more specific (Oliver Twist written here) | desc, tip |
| neals-yard | B | desc short (127 chars), Seven Dials not described; source is the Covent Garden homepage; a dedicated Neal's Yard page exists; 'one of the most photographed corners' unverifiable | desc, tip, source |
| royal-opera-house | C | free Friday lunchtime show 'roughly every two weeks' and tokens from 12:30 are time-sensitive; current Live at Lunch series runs on specific dates and page mentions allocated seati | desc, tip, access |
| somerset-house | C | tip contains exact 2026/27 skating dates and prices (evergreen violation); fountains described as warm-season only; official page shows them running daily in October | desc, tip, access |
| st-pauls-church | C | tip says entrance is not from the piazza: official lists two grounds entrances on the piazza plus King St, Henrietta St, Bedford St; main church entrance is via the gardens from Be | desc, tip |
| leadenhall-market | B | Desc uses banned word 'קסומה'; Desc short; Harry Potter reference made specific (Philosopher's Stone, way to the Leaky Cauldron) | desc |
| monument | C | Desc says it stands exactly where the fire broke out; it stands near Pudding Lane, at a distance equal to its height; Desc short | desc |
| st-dunstan | B | Desc short; Tip generic ('one of the quietest and prettiest corners'); replaced with visit length and combination advice | desc, tip |
| bank-museum | C | Tip says 'open mainly on weekdays'; it is open Monday to Friday only, closed weekends and bank holidays; Desc short | desc, tip |
| guildhall | C | Great Hall tours described as paid; official page says tours are monthly and booked in advance but gives no price; softened; Source thecityofldn.com now redirects to onecitylondon. | desc, tip, source |
| barbican | B | Tip repeats desc; replaced with Conservatory booking advice and free highwalks/lakeside terrace | tip |
| st-katharine-docks | B | Desc short; Tip 'almost no tourists' overstated; softened | desc, tip |
| postal-museum | B | Desc short; Tip lacks family-relevant warning: official guidance says Mail Rail may be unsuitable for small children and people sensitive to confined spaces | desc, tip |
| imperial-war-museum | B | Holocaust Galleries: official recommends not under 14; tip says 'young children' and claims rest suits all ages (overclaim); desc short (131 chars) | desc, tip |
| hms-belfast | B | hours field 2 but official recommends at least three hours; desc short (127 chars) | desc, tip |
| globe-theatre | B | 'about 200 metres from the original site' not stated on official site (official: as close as possible); softened; missing: open-air, tours and shows go ahead in all weather; indoor | desc, tip |
| southwark-cathedral | B | desc short (110 chars), generic; tip generic; missing free entry and Shakespeare memorial | desc, tip |
| leake-street | B | desc misses the restaurants/bars in the arches and workshops; tip 'usually artists painting' softened | desc, tip |
| old-operating-theatre | C | tip says 'no other way up', contradicting desc and official (small lift may be used occasionally on request); missing: open Thursday to Sunday only, no toilets, no pushchairs; huma | desc, tip, source |
| sea-life | B | tip claims 'one of the most expensive attractions' (unverified price claim); English name County Hall inside Hebrew desc; online booking always cheaper than door price, timed slots | desc, tip |
| design-museum | B | Tip repeats desc (free permanent display, building worth seeing); replaced with booking and Holland Park combination | tip |
| holland-park | B | Desc short; added verified Kyoto Garden details and playgrounds | desc, source |
| harrods | C | 'Egyptian staircase' could not be verified on official site (harrods.com blocks fetch); removed; Desc short; Tip framed a shop as 'free entry'; reworded | desc, tip |
| royal-albert-hall | C | Desc places it at the south end of Hyde Park; the Albert Memorial and the Hall face Kensington Gardens; Tip price comparison (tour much cheaper than a concert) not verifiable and n | desc, tip |
| british-library | B | desc vague ('ancient scrolls'), does not name highlights or mention rotation of items; source is not a URL | desc, tip, source, coordSource |
| wellcome-collection | B | desc short (~100 chars); tip misses that galleries are closed on Mondays; source is not a URL | desc, tip, source, coordSource |
| sherlock-museum | B | desc short and repeats location; tip is fine; mechanical flag time_sensitive:יוני looks like a false positive (no month in text) | desc |
| madame-tussauds | C | wrong location: it is on Marylebone Road, not Baker Street (near Baker Street station); 'oldest wax museum in the world' not verifiable; it is the original Madame Tussauds, in Lond | desc |
| hampstead-heath | C | 'swimming ponds open all year' oversimplified: Men's and Ladies' ponds open year-round, Mixed pond only in the warm season, all paid; Parliament Hill is in the south-east corner; t | desc, tip, source, coordSource |
| kenwood-house | C | Renoir is not part of the Kenwood (Iveagh Bequest) collection; Vermeer, Gainsborough, Turner are; tip claim 'most visitors are locals' unverifiable; source is not a URL | desc, tip, source, coordSource |
| highgate-cemetery | C | tip is outdated: the West Cemetery no longer requires a guided tour; one ticket covers both sides all day; tip uses forbidden word 'חובה'; 'near Hampstead Heath' imprecise: it is i | desc, tip, source, coordSource |
| coal-drops-yard | C | tip overstates the canal walk to Camden ('about an hour'); it is roughly 2 km, about half an hour; source is not a URL | tip, source, coordSource |
| little-venice | B | tip lacks walk length; boat alternative useful | tip |
| spitalfields-market | B | tip is generic ('check what is on'); the weekly Thursday antiques and vintage market is the concrete useful fact | tip |
| columbia-road | B | tip repeats 'Sunday only' already stated in desc; 'prices drop at the end of the day' not on official site; softened | tip |
| museum-of-home | B | desc too short (under 150 chars); tip could add the useful closed-Monday fact | desc, tip |
| whitechapel-gallery | B | tip generic; desc claim about showing great artists before they were famous is vague; replaced with verified Guernica 1939 fact; galleries close between seasons for installation (e | desc, tip |
| dennis-severs | C | desc says visit is always in total silence; official site also offers a Relaxed Day Visit where discreet conversation is allowed; tip uses banned word 'חובה'; walk-up tickets exist | desc, tip |
| royal-observatory | C | time-sensitive planetarium closure stated as current fact; rewritten as 'check whether it reopened'; official site says planetarium closed for renovation (reopening reportedly 2028 | desc |
| cutty-sark | B | desc slightly short (135 chars); '19th century' can be the exact build year 1869 | desc |
| queens-house | B | desc short (120 chars) and vague ('maritime paintings'); collection is broader (Armada Portrait); added completion year and Tulip Stairs detail from official page | desc |
| greenwich-market | B | desc slightly short (138 chars); added stall count and weekend character | desc |
| greenwich-foot-tunnel | B | desc short (135 chars); added opening year, lifts/stairs and 24h access | desc |
| richmond-park | B | desc is almost entirely deer rules, does not say what the visit is like; tip duplicates desc (keep distance); official page now gives herd size (600) and area (5,000+ acres) | desc, tip |
| windsor-castle | B | desc short (138 chars); tip misses the key fact that the castle is usually closed Tuesdays and Wednesdays; rct.uk returns 403 to automated fetch; checked via rct.uk search snippets | desc, tip |
| wembley-tour | B | tip uses banned word 'חובה'; desc short (113 chars); source URL redirects to bookings.wembleytours.com (still official) | desc, tip |
| cable-car | B | desc slightly short (134 chars); added journey time and payment method | desc |
| docklands-museum | B | desc contains meta sentence about name change with English inside Hebrew; source URL redirects to londonmuseum.org.uk (old museumoflondon.org.uk domain); tip claim 'usually relativ | desc, tip, source |
| battersea-power-station | B | tip repeats desc almost word for word (free entry, paid chimney lift) | tip |
| raf-museum | B | desc has broken Hebrew ('בתוך האנגרים מקוריים') and overstates 'original hangars'; desc short (114 chars); tip says 'completely free' though there are paid extras (simulators); boo | desc, tip |
| rivington-street-art | D | source https://www.hackney.gov.uk/street-art returns 404; 'tunnel and car park' unclear; the car park could not be verified, reworded to the passage under the railway bridge; tip i | desc, tip, source |
| hanbury-street-art | B | desc phrasing awkward ('quiet alley off Brick Lane'); it is a street, and the notable long-lived work (ROA crane, 2010) can be named generically | desc, tip |
| redchurch-street | B | desc one sentence, short; tip generic; mechanical flag time_sensitive:מאי appears to be a false positive (no month in text) | desc, tip |
| brick-lane-mosque | C | desc says Methodist chapel in 1809; in 1809 it became a Wesleyan mission chapel to Jews ('Jews' Chapel'), Methodist from 1819; sundial is on the south elevation facing Fournier Str | desc, tip |
| christ-church-spitalfields | B | tip weak; opening for visitors (weekdays, Sunday afternoon) is the useful fact | tip |
| old-truman-brewery | A | chimney landmark claim widely documented but not on official site; acceptable | no |
| fournier-street | C | source URL is wrong: Historic England list entry 1065280 is 6-90 Bromley Street E1, not Fournier Street; tip about not photographing residents is odd; replaced with a practical wal | tip, source |
| arnold-circus | D | source https://www.arnoldcircus.info/ does not resolve (DNS failure); Friends of Arnold Circus site is arnoldcircus.co.uk; desc short; 'wooden pavilion' imprecise; it is an octagon | desc, tip, source |
| st-leonards-shoreditch | C | desc says actors buried in the churchyard; burials (incl. Burbage family) are in/under the church; desc short; tip weak; official site behind a bot-verification page, so visitor ho | desc, tip, source |
| bunhill-fields | C | Tip opening hours wrong: official page says open daily from 7:30 until dusk with monthly closing times; Burial count is about 123,000 per City of London; dates of use softened; Pla | desc, tip |
| curtain-theatre | C | desc implies Shakespeare's company played there decades before the Globe; they used it 1597-1599, just before the Globe; remains are 3 m underground beneath The Stage development;  | desc, tip |
| beigel-bake | C | desc says operating since 1974; official site says 'since 1979'; desc short | desc, access, spend |
| beigel-shop | D | source thebeigelshop.com now serves a gambling spam site (non-Gamstop casino reviews) copying the bakery's text; must not be linked; real official site is yellowbeigelshop.com (Bei | source, access, spend |
| dishoom-shoreditch | C | 'renovated warehouse with courtyard' not verified; official site describes an outdoor verandah; booking: any group size can book before 6pm; after 6pm only groups of 6+, most table | desc, tip, bookAhead, access, spend |
| gunpowder-spitalfields | D | source gunpowderlondon.com does not resolve; official page now gunpowderrestaurants.com; 'deliberately cramped' unverified, softened; closed Sundays is a useful planning fact | desc, tip, source, access, spend |
| st-john-bread-wine | C | Tip claims breakfast service; official page lists no breakfast (lunch daily, bar menu afternoon, supper). Breakfast returned only at St John Neal's Yard (Time Out, 7 Jul 2026); 'br | desc, tip, source, access, spend |
| poppies-spitalfields | B | Tip generic | desc, tip, access, spend |
| boiler-house-food-hall | C | CLOSED (decision pending). Boiler House Food Hall closed in March 2020; the space is now mainly an events venue; Not listed among current Truman Brewery markets; Recommend removing the place or replacing it  | access, spend |
| city-spice | C | Source domain cityspicebricklane.co.uk does not resolve (DNS failure); Official site is cityspice.co (behind bot check, loads HTTP 200); 'won awards' only self-described ('award-wi | desc, source, access, spend |
| ottolenghi-spitalfields | C | Source URL returns 404; correct page is /pages/restaurants/spitalfields; desc short | desc, tip, source, access, spend |
| smoking-goat | C | 'evening not lunch' is wrong: open daily from 12:00 with kitchen through lunch and dinner; 'short changing menu' not confirmed; site shows feasting menus and a la carte; tip short | desc, tip, access, spend |
| ozone-coffee | C | 'roasting on site' is wrong: official page says no on-site roastery (roastery in Stafford); Tip is a vague superlative | desc, tip, access, spend |
| allpress-espresso | C | 'coffee roasted on site' is wrong: Allpress London roastery is in Dalston; Source uk.allpressespresso.com redirects to allpress.com/en-gb; no dedicated Shoreditch page found; desc  | desc, tip, source, access, spend |
| shoreditch-grind | C | 'open late' overstated: Tue-Sat into the evening (to 21:00/22:00), Sun and Mon close at 17:00; 'one of the first places that defined the area' unverifiable; official page says it i | desc, tip, access, spend |
| rough-trade-east | C | 'largest independent record store in London' not confirmed; sources say it is Rough Trade's largest/flagship store; mechanical flag time_sensitive:מאי is a false positive (substrin | desc, tip |
| blitz-london | C | CLOSED (decision pending). Blitz at 55-59 Hanbury Street is permanently closed (Yelp and Foursquare mark it closed); blitzlondon.co.uk now redirects to unrelated sites; Recommend removing this place from the | source |
| labour-and-wait | B | tip short; desc can carry verified building history | desc, tip, source |
| beyond-retro | C | CLOSED (decision pending). Beyond Retro Cheshire Street store has closed (Time Out, March 2024); not in the official UK store list (Coal Drops Yard, Dalston, Soho, Brighton); Recommend removing, or re-pointi | no |
| village-underground | C | 'inside a railway arch' not supported: venue is a converted Victorian warehouse; Carriages are Jubilee line trains used as artist studios | desc, access, spend |
| xoyo | C | Desc contains a dated reopening (January 2026), not evergreen; 'artist residencies' format not confirmed under new ownership; desc short | desc, access, spend |
| nightjar | C | 'requires booking' is wrong: walk-ins welcome, booking recommended; 'no screens' not confirmed | desc, tip, access, spend |
| old-blue-last | B | desc short; can name verified alumni and nightly gigs | desc, tip, access, spend |
| spitalfields-city-farm | B | desc short; entry is on a donation basis; tube: official site lists Shoreditch High Street (8 min) as closest, Whitechapel 10 min; There is a tea hut, not a café | desc, tip, tube |
| young-va | B | Tip vague ('two stations from the area'); Bethnal Green station is next to the museum | tip |
| hackney-city-farm | B | desc short; tip relies on subjective comparison; tube: Cambridge Heath is closer than Hoxton per coordinates; official site lists Cambridge Heath, Hoxton, Bethnal Green | desc, tip, tube |
| petticoat-lane | C | Source council URL returns 404; Desc lacks the key fact that the main market is Sunday only (closed Saturday); weekday Wentworth Street is lunch food stalls; 'less touristy' is sub | desc, tip, source |
| primrose-hill | A | source URL returns 404; replaced | source |
| temple-of-mithras | C | Tip says booking is required and sells out; official site says free, booking not required but guarantees entry; 'Seven metres below street' not confirmed on official pages; softene | desc, tip, bookAhead |
| stables-market | D | no tip; desc could explain the horse heritage and what is sold; source is not a URL | desc, tip, source, coordSource |
| hawley-wharf | D | desc too short; no tip; fire link imprecise: built on the site of the Canal Market, damaged by the 2008 fire | desc, tip |
| inverness-street-market | D | desc too short; no tip; source is not a URL | desc, tip, source, coordSource |
| roundhouse | D | desc short; no tip; bookAhead null | desc, tip, bookAhead |
| electric-ballroom | D | desc short; no tip; source is not a URL | desc, tip, source, coordSource |
| jazz-cafe | D | desc short; no tip; venue is strictly 18+ so kids should be false; source is not a URL | desc, tip, source, kids, coordSource |
| koko-camden | D | desc short; no tip; 2022 reopening is a permanent historical fact, flag is not a problem | desc, tip |
| dublin-castle | D | Description too short; No tip; Source is nominatim/osm, not an official URL | desc, tip, source, access, spend, coordSource |
| poppies-camden | C | Decor is 1940s post-war style per official site, not 1950s; 'Branch of the Spitalfields place' imprecise: one of four Poppies restaurants (Camden, Soho, Spitalfields, Portobello);  | desc, tip, source, access, spend, coordSource |
| chin-chin-labs | C | CLOSED (decision pending). Camden Lock shop (49-50 Camden Lock Place) is permanently closed; Official site lists only Seven Dials Market and Soho (54 Greek Street), no Camden location; Recommend removing thi | source, access, spend, coordSource |
| the-lock-tavern | D | Description too short; No tip; No official URL (lock-tavern.com redirects to McMullen's page); 'Open roof' imprecise: it is an all-weather rooftop terrace | desc, tip, source, access, spend, coordSource |
| the-good-mixer | D | Description short; No tip; No official URL; 'Side alley' imprecise: Inverness Street is a side street off Camden High Street | desc, tip, source, access, spend, coordSource |
| edinboro-castle | D | Description short; No tip; No official URL | desc, tip, source, access, spend, coordSource |
| cyberdog | D | Description short; misspelling 'קיברפאנק'; No tip; No official URL; Family note missing: brand also sells an 18+ line (Futurelovers) | desc, tip, source, coordSource |
| regents-canal-towpath | D | Description short; No tip; No official URL | desc, tip, source, coordSource |
| camden-lock-bridge | C | 'Most photographed landmark' unverified; the famous painted 'Camden Lock' lettering is on the nearby railway bridge over Chalk Farm Road, not on this bridge; Coordinates match the  | desc, tip, source, coordSource |
| camden-high-street | D | Description short; No tip; No official URL | desc, tip, source, coordSource |
| amy-winehouse-statue | D | Description short; 'Stables square' imprecise: statue stands inside Stables Market; No tip; No official URL | desc, tip, source, coordSource |
| coffee-jar-camden | D | Description short and generic; No tip; No working official site (coffeejar.co.uk does not resolve; thecoffeejar.co.uk/.com are parked); mechanical flag time_sensitive:'מאי' is a fa | desc, tip, source, access, spend, coordSource |
| greenberry-cafe | B | Typo in desc: 'פריטרוז היל' should be 'פרימרוז היל'; Description short; No tip; No official URL | desc, tip, source, access, spend, coordSource |
| lemonia | D | Description short; No tip; No official URL | desc, tip, source, access, spend, coordSource |
| granary-square | D | Description short; No tip; No official URL; kids could be true (fountains, official page invites families) | desc, tip, source, kids, coordSource |
| gasholder-park | D | Description short; No tip; No official URL | desc, tip, source, coordSource |
| camley-street-park | D | Description short; No tip; No official URL; kids could be true (London Wildlife Trust promotes it as a family day out) | desc, tip, source, kids, coordSource |
| st-pancras-station | D | Description short; No tip; No official URL; Eurostar also serves Amsterdam (and Lille) | desc, tip, source, coordSource |
| dishoom-kings-cross | C | Building is a former Victorian railway transit shed ('godown'), not a grain warehouse; 'Largest branch of the chain' not confirmed on official site, removed; No tip | desc, tip, access, spend |
| boxpark-camden | B | No tip; Description could say more (three floors, events) | desc, tip |
| horizon-22 | D | No tip; Desc hedges ('as far as we know'); official site states it is London's highest free viewing platform; kids null although official site welcomes families; interests and audi | desc, tip, source, kids |

## Closed places, decision pending

Confirmed closed on 4 Oct 2026. Left untouched (ids and codes are permanent; old shared links decode by code).

- boiler-house-food-hall: the food hall no longer operates; the Boiler House is an events space.
- blitz-london: vintage department store closed; its domain now redirects to an unrelated site (link removed).
- beyond-retro: the Cheshire Street store closed; not in the official UK store list.
- chin-chin-labs: the Camden shop closed; the official site lists Seven Dials and Soho only.
