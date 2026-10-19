/*
  Kids Journal demand validation: interest function + retention (offline)
  =======================================================================
  MemoryStore with an atomic onlyIfNew, plus the real @netlify/blobs client against the local BlobsServer for API
  compatibility. No network, no secrets, no email, no worker, no payment.

    node docs/qa/journal-interest-test.mjs
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { handle, purgeInterest, storeNameFor, interestKey, FIELDS, WILLING, RETENTION_DAYS, OFFER_PRICE } from '../../netlify/functions/journal-interest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const tick = () => new Promise(r => setImmediate(r));
const LOGS = [];
for (const k of ['log', 'warn', 'error', 'info']) { const orig = console[k]; console[k] = (...a) => { LOGS.push(a.map(String).join(' ')); if (k !== 'log' || !String(a[0]).startsWith('FAIL')) return; orig(...a); }; }
const say = s => process.stdout.write(s + '\n');

class MemoryStore {
  constructor() { this.m = new Map(); }
  async get(k, o) { await tick(); if (!this.m.has(k)) return null; const v = this.m.get(k).v; return o && o.type === 'json' ? JSON.parse(v) : v; }
  async set(k, v, o) { await tick(); if (o && o.onlyIfNew && this.m.has(k)) return { modified: false }; this.m.set(k, { v: String(v), md: o && o.metadata }); return { modified: true, etag: '"x"' }; }
  async delete(k) { await tick(); this.m.delete(k); }
  async list(o) { await tick(); return { blobs: [...this.m.keys()].filter(k => !o || !o.prefix || k.startsWith(o.prefix)).map(key => ({ key })), directories: [] }; }
  keys(p) { return [...this.m.keys()].filter(k => k.startsWith(p)); }
  json(k) { return JSON.parse(this.m.get(k).v); }
}
const T0 = new Date('2026-10-19T10:00:00.000Z');
const at = ms => new Date(T0.getTime() + ms);
const DAY = 864e5;
const deps = (store, extra) => Object.assign({ store, enabled: true, now: () => T0 }, extra || {});
const post = (store, body, extra) => handle(new Request('http://x/.netlify/functions/journal-interest', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), deps(store, extra)).then(async r => ({ status: r.status, body: await r.json() }));
const get = (store, extra) => handle(new Request('http://x/', { method: 'GET' }), deps(store, extra)).then(async r => ({ status: r.status, body: await r.json() }));
const form = o => Object.assign({ email: 'Parent@Example.com', trip_month: '2026-12', child_age: 8, willing: 'yes', consent: true, website: '' }, o || {});

async function flows(makeStore, label) {
  { const s = makeStore();
    ok((await get(s, { enabled: false })).body.enabled === false && (await get(s)).body.enabled === true, label + 'switch: GET reports enabled only with JOURNAL_INTEREST_ENABLED');
    ok((await post(s, form(), { enabled: false })).status === 503 && s.keys('').length === 0, label + 'switch: POST while closed -> 503, nothing written');
    ok((await handle(new Request('http://x/', { method: 'PUT' }), deps(s))).status === 405, label + 'method: PUT -> 405'); }
  { const s = makeStore();
    const r = await post(s, form());
    const keys = s.keys('interest/');
    ok(r.status === 200 && r.body.status === 'received' && keys.length === 1 && keys[0] === interestKey('parent@example.com'), label + 'valid: received, one record keyed by the hash of the normalised email');
    const rec = s.json(keys[0]);
    ok(Object.keys(rec).sort().join() === 'child_age,consent_at,created_at,email,expires_at,price_shown,trip_month,willing', label + 'record: exactly the minimal fields ' + Object.keys(rec).join());
    ok(rec.price_shown === 14.9 && OFFER_PRICE === 14.9, label + 'record: the price shown (14.90 ₪) is stored with the answer');
    ok(rec.email === 'parent@example.com' && rec.trip_month === '2026-12' && rec.child_age === 8 && rec.willing === 'yes' && rec.consent_at === T0.toISOString() && rec.expires_at === at(RETENTION_DAYS * DAY).toISOString(), label + 'record: normalised email, month, age, answer, consent time, 90-day expiry');
    ok(!/\b(name|first_name|ip|address|route|route_code|token|order|payment|price)\b/.test(Object.keys(rec).join()), label + 'record: no name, IP, route, order or payment field');
    const again = await post(s, form({ email: ' PARENT@example.com ', willing: 'no', trip_month: null }));
    ok(again.status === 200 && again.body.status === 'already' && s.keys('interest/').length === 1 && s.json(keys[0]).willing === 'yes', label + 'duplicate: same email -> already, first answer kept, no second record');
    const r2 = await post(s, form({ email: 'other@example.com', trip_month: '', child_age: '' }));
    const rec2 = s.json(interestKey('other@example.com'));
    ok(r2.body.status === 'received' && rec2.trip_month === null && rec2.child_age === null, label + 'optional: empty month and age stored as null');
    ok((await post(s, form({ email: 'm@example.com', willing: 'maybe' }))).body.status === 'received' && s.json(interestKey('m@example.com')).willing === 'maybe', label + 'willing: maybe accepted'); }
  { const s = makeStore();
    const cases = [
      ['honeypot', form({ website: 'http://spam' }), 400, 'rejected'], ['unexpected field', Object.assign(form(), { name: 'x' }), 400, 'unexpected_field'],
      ['order-like field', Object.assign(form(), { route_code: 'AA' }), 400, 'unexpected_field'], ['bad json', '{', 400, 'bad_json'], ['array', '[]', 400, 'bad_json'],
      ['invalid email', form({ email: 'nope' }), 400, 'invalid_email'], ['missing email', form({ email: '' }), 400, 'invalid_email'],
      ['bad month', form({ trip_month: '2026-13' }), 400, 'invalid_month'], ['month text', form({ trip_month: 'december' }), 400, 'invalid_month'], ['old year', form({ trip_month: '2025-12' }), 400, 'invalid_month'],
      ['age too low', form({ child_age: 1 }), 400, 'invalid_age'], ['age too high', form({ child_age: 17 }), 400, 'invalid_age'], ['age string', form({ child_age: '8' }), 400, 'invalid_age'],
      ['willing missing', form({ willing: '' }), 400, 'invalid_willing'], ['willing other', form({ willing: 'later' }), 400, 'invalid_willing'],
      ['consent missing', form({ consent: false }), 400, 'consent_required'], ['consent string', form({ consent: 'true' }), 400, 'consent_required'],
      ['too large', JSON.stringify(form({ email: 'a'.repeat(3000) + '@example.com' })), 413, 'too_large']];
    for (const [name, body, st, code] of cases) { const r = await post(s, body); ok(r.status === st && r.body.code === code, label + 'reject ' + name + ' -> ' + st + ' ' + code + ' (got ' + r.status + ' ' + r.body.code + ')'); }
    ok(s.keys('').length === 0, label + 'rejects: nothing written'); }
  { const s = makeStore();
    const rs = await Promise.all(Array.from({ length: 12 }, () => post(s, form())));
    ok(rs.filter(r => r.body.status === 'received').length === 1 && rs.filter(r => r.body.status === 'already').length === 11 && s.keys('interest/').length === 1, label + 'concurrency: 12 simultaneous submits of one email -> one record'); }
  { const s = makeStore();
    await post(s, form());
    await post(s, form({ email: 'late@example.com' }), { now: () => at(DAY) });
    ok((await purgeInterest(s, at(RETENTION_DAYS * DAY - 1))) === 0 && s.keys('interest/').length === 2, label + 'retention: nothing purged before 90 days');
    ok((await purgeInterest(s, at(RETENTION_DAYS * DAY))) === 1 && s.keys('interest/').length === 1, label + 'retention: the first record goes at exactly 90 days, the later one stays');
    await s.set('interest/undated', '{}');
    ok((await purgeInterest(s, at(RETENTION_DAYS * DAY))) === 1 && s.keys('interest/').length === 1, label + 'retention: an undated record is removed'); }
}

await flows(() => new MemoryStore(), 'memory: ');

/* contract and isolation */
ok(FIELDS.join() === 'email,trip_month,child_age,willing,consent,website' && WILLING.join() === 'yes,maybe,no' && RETENTION_DAYS === 90, 'contract: fields, answers, retention');
ok(storeNameFor({ deploy: { context: 'production' } }) === 'journal-interest' && storeNameFor({ deploy: { context: 'deploy-preview' } }) === 'journal-interest-preview' && storeNameFor(undefined) === 'journal-interest-preview', 'isolation: production store only in the production context, preview otherwise');
{ const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/journal-interest.mjs'), 'utf8');
  ok(!/journal-beta-request|journal-automation|dispatch|github|worker|journal-delivery|sendEmail|ses|stripe|paypal|checkout|order/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'isolation: the interest function touches no Beta request, dispatch, worker, delivery store, email or payment code');
  ok(!/console\.(log|warn|error)\([^)]*(email|willing|month|age|key)/i.test(src), 'logs: no console call mentions a form field');
  const client = fs.readFileSync(path.join(ROOT, 'kids-journal-offer.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'kids-journal-offer.html'), 'utf8') + fs.readFileSync(path.join(ROOT, 'journal-offer-card.js'), 'utf8');
  ok(!/journal-beta-request|journal-worker|repository_dispatch|stripe|paypal|checkout|JOURNAL_[A-Z]|api\.github/.test(client), 'client: no Beta request endpoint, worker, dispatch, payment or configuration name in the offer files');
  ok(/עדיין לא זמינה לרכישה/.test(client) && /אין הזמנה ואין תשלום/.test(client) && /לא מתחייבים למועד השקה/.test(client), 'offer: the page says the product is not for sale, no order or payment, no launch promise');
  ok(/14\.90 ₪/.test(client) && !/\b34 ₪/.test(client) && /ב-14\.90 ₪\?/.test(client) && /המסלול שלכם בלונדון\. <span>ההרפתקה שלהם\.<\/span>/.test(client), 'offer: planned price 14.90 ₪ (old price gone), the question names it, the approved headline');
  ok(/OFFER_PRICE = 14\.9;/.test(fs.readFileSync(path.join(ROOT, 'kids-journal-offer.js'), 'utf8')) && /OFFER_PRICE = 14\.9;/.test(fs.readFileSync(path.join(ROOT, 'journal-offer-card.js'), 'utf8')), 'events: both scripts carry offer_price 14.9');
  ok(/samples\/kids-journal-sample-big-ben\.pdf/.test(client) && fs.existsSync(path.join(ROOT, 'samples/kids-journal-sample-big-ben.pdf')), 'sample: the download points at the extracted Big Ben pages');
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples/SOURCE.json'), 'utf8'));
  ok(meta.pages_taken.join() === '4,5' && /1-day-westminster-family/.test(meta.source_pdf) && /^[0-9a-f]{64}$/.test(meta.source_sha256), 'sample: provenance recorded (approved fixture book, pages 4 and 5)');
  const privacy = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
  ok(/id="journal-interest"/.test(privacy) && /מייל אחד בלבד/.test(privacy) && /90 יום/.test(privacy) && /לא טופס הזמנה/.test(privacy), 'privacy: interest section (one email, 90 days, not an order)');
  ok(/'kids-journal-offer\.html'/.test(fs.readFileSync(path.join(ROOT, 'build_search_index.py'), 'utf8')) && /kids-journal-offer\.html\s+\/kids-journal-offer\s+301!/.test(fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8')), 'offer: excluded from the search index, clean URL redirect');
  ok(!/kids-journal-offer/.test(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')) && !/kids-journal-offer/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')), 'offer: not in the sitemap, not on the home page');
  const purge = fs.readFileSync(path.join(ROOT, 'netlify/functions/journal-interest-purge.mjs'), 'utf8');
  ok(/purgeInterest/.test(purge) && /storeNameFor\(context\)/.test(purge) && /schedule: '@daily'/.test(purge), 'retention: a daily scheduled purge covers the interest store of the same context');
  const fns = fs.readdirSync(path.join(ROOT, 'netlify/functions')).join();
  ok(!/journal-beta|journal-worker|journal-download|reconcile/.test(fns) && !fs.existsSync(path.join(ROOT, 'netlify/journal-lib')) && !fs.existsSync(path.join(ROOT, 'netlify/edge-functions')) && !fs.existsSync(path.join(ROOT, 'kids-journal-beta.html')), 'isolation: no Beta request, worker callback, download, reconciliation, journal library or Beta page on this branch');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok(Object.keys(pkg.dependencies || {}).join() === '@netlify/blobs' && !pkg.devDependencies && !pkg.scripts, 'dependencies: only @netlify/blobs, no scripts'); }
{ const all = LOGS.join('\n');
  ok(!/example\.com|@/.test(all), 'logs: nothing printed contains an email (' + LOGS.length + ' lines)'); }

/* real client, sequentially */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jb-interest-'));
const server = new BlobsServer({ directory: dir, token: 'local-test-token', port: 0 });
const { port } = await server.start();
let n = 0;
const realStore = () => { const s = getStore({ name: 'journal-interest-test-' + (++n), siteID: 'local-site', token: 'local-test-token', edgeURL: 'http://localhost:' + port, uncachedEdgeURL: 'http://localhost:' + port, consistency: 'strong' });
  return { get: (k, o) => s.get(k, o), set: (k, v, o) => s.set(k, v, o), delete: k => s.delete(k), list: o => s.list(o),
    keys: async p => (await s.list({ prefix: p })).blobs.map(b => b.key) }; };
{ const s = realStore();
  const r = await post(s, form());
  const again = await post(s, form());
  ok(r.body.status === 'received' && again.body.status === 'already' && (await s.keys('interest/')).length === 1, 'real client: received then already, one record');
  const rec = await s.get(interestKey('parent@example.com'), { type: 'json' });
  ok(rec.willing === 'yes' && rec.expires_at === at(RETENTION_DAYS * DAY).toISOString(), 'real client: record readable with expiry');
  ok((await purgeInterest(s, at(RETENTION_DAYS * DAY))) === 1 && (await s.keys('interest/')).length === 0, 'real client: purge at 90 days'); }
await server.stop();
fs.rmSync(dir, { recursive: true, force: true });

say(pass + ' passed, ' + fail + ' failed');
say(fail ? 'FAILED' : 'ALL PASS');
process.exit(fail ? 1 : 0);
