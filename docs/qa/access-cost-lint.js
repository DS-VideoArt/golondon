/*
  Access-cost data check (access-cost.js + planner-data.json)
  ===========================================================
  access-cost.js reads only data fields (access, free), never Hebrew text. This check is where the text is
  compared with the data, so a place cannot drift silently:

    - access, when present, is one of free / partly_paid / paid
    - free=true and the price text says part is paid ("בתשלום")   ->  must have access: "partly_paid"
    - access: "partly_paid"                                        ->  price text must say what is paid
    - free=false and the price text says entry is free ("חינם") without a paid part -> flagged

  Also prints the places that are deliberately left for review (spend venues, qualified free wording).

    node docs/qa/access-cost-lint.js
*/
const fs = require('fs'), path = require('path');
const AC = require('../../access-cost.js');
const A = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'planner-data.json'), 'utf8')).attractions;
let fail = 0; const bad = (id, msg) => { fail++; console.log('FAIL ' + id + ': ' + msg); };

A.forEach(a => {
  const text = a.priceBand || '';
  if ('access' in a && AC.STATES.indexOf(a.access) === -1) bad(a.id, 'unknown access "' + a.access + '"');
  if (a.free && /בתשלום/.test(text) && a.access !== 'partly_paid') bad(a.id, 'price text has a paid part but access is not partly_paid: ' + text);
  if (a.access === 'partly_paid' && !/בתשלום/.test(text)) bad(a.id, 'access partly_paid but the price text does not say what is paid: ' + text);
  if (!a.free && /חינם/.test(text) && !/בתשלום/.test(text)) bad(a.id, 'free=false but the price text says free: ' + text);
});

const n = AC.count(A);
console.log(`${A.length} places: free ${n.free}, partly_paid ${n.partly_paid}, paid ${n.paid}`);
console.log('partly_paid:', A.filter(a => AC.status(a) === 'partly_paid').map(a => a.id).join(', '));
const spend = A.filter(a => !a.free && /^(זול|טווח ביניים|יקר)$/.test(a.priceBand || ''));
console.log(`review, paid by spend level not a ticket (${spend.length}):`, spend.map(a => a.id).join(', '));
console.log('review, free with qualified wording:', A.filter(a => a.free && !a.access && (a.priceBand || '') !== 'כניסה חינם').map(a => a.id + ' (' + a.priceBand + ')').join(', '));
console.log(fail ? fail + ' FAILED' : 'ALL PASS');
process.exit(fail ? 1 : 0);
