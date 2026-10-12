/*
  Kids Journal Beta backend: request function + daily purge
  =========================================================
  Two layers, both offline:
  1. MemoryStore, with an atomic onlyIfNew (check and write in one synchronous step) and an await between every
     store operation, so concurrent requests really interleave. This tests the function's own logic: validation,
     honeypot, duplicates, the 25-slot cap under concurrency, rollback, purge. Production atomicity itself is the
     documented Netlify Blobs guarantee for onlyIfNew; the local BlobsServer cannot prove it (its check and write
     are separate awaits), so it is not used for the concurrency cases.
  2. The real @netlify/blobs client against the local BlobsServer, sequentially: API compatibility (list, get
     type json, set onlyIfNew -> modified, metadata, delete) for the same flows.

    node docs/qa/journal-beta-backend-test.mjs
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { handle, CAP, dedupeKey } from '../../netlify/functions/journal-beta-request.mjs';
import { purge } from '../../netlify/functions/journal-beta-purge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLACES = JSON.parse(fs.readFileSync(path.join(ROOT, 'planner-data.json'), 'utf8')).attractions;
const BY = {}; PLACES.forEach(a => { BY[a.id] = a; });
const C = id => BY[id].code;
const OPEN = PLACES.filter(a => !a.closed);
const SECRET = 'test-secret-not-a-real-one';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const tick = () => new Promise(r => setImmediate(r));

class MemoryStore {
  constructor() { this.m = new Map(); this.failOn = null; }
  async get(k, o) { await tick(); if (!this.m.has(k)) return null; const v = this.m.get(k).v; return o && o.type === 'json' ? JSON.parse(v) : v; }
  async set(k, v, o) {
    await tick();
    if (this.failOn && this.failOn(k)) throw new Error('injected');
    if (o && o.onlyIfNew && this.m.has(k)) return { modified: false };   /* atomic: check and write, no await between */
    this.m.set(k, { v: String(v), md: o && o.metadata }); return { modified: true, etag: '"' + k + '"' };
  }
  async delete(k) { await tick(); this.m.delete(k); }
  async list(o) { await tick(); return { blobs: [...this.m.keys()].filter(k => !o || !o.prefix || k.startsWith(o.prefix)).map(key => ({ key, etag: 'x' })), directories: [] }; }
  keys(p) { return [...this.m.keys()].filter(k => k.startsWith(p)); }
}

const deps = (store, extra) => Object.assign({ store, secret: SECRET, enabled: true, loadPlaces: async () => PLACES }, extra || {});
const post = (store, body, extra) => handle(new Request('http://x/.netlify/functions/journal-beta-request', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), deps(store, extra))
  .then(async r => ({ status: r.status, body: await r.json() }));
const get = (store, extra) => handle(new Request('http://x/', { method: 'GET' }), deps(store, extra)).then(async r => ({ status: r.status, body: await r.json() }));
const route2 = [C('big-ben') + C('westminster-abbey'), C('tate-modern') + C('chin-chin-labs')].join('.');
const req = (o) => Object.assign({ route_code: route2, family_route: true, planner_mode: 'auto', email: 'Parent@Example.com', first_name: 'נועה', beta_ack: true, website: '' }, o || {});
const distinct = i => req({ email: 'family' + i + '@example.com' });

async function flows(makeStore, label) {
  /* enabled switch and configuration */
  { const s = makeStore();
    ok((await get(s, { enabled: false })).body.enabled === false, label + 'disabled: GET enabled false');
    ok((await post(s, req(), { enabled: false })).status === 503, label + 'disabled: POST 503');
    ok((await post(s, req(), { secret: '' })).status === 503, label + 'no secret: POST 503 not_configured');
    ok((await s.list({ prefix: '' })).blobs.length === 0, label + 'disabled/unconfigured: nothing written'); }
  /* valid, optional name, stored record */
  { const s = makeStore();
    const r = await post(s, req());
    ok(r.status === 200 && r.body.status === 'received', label + 'valid request accepted ' + JSON.stringify(r));
    const keys = (await s.list({ prefix: 'requests/' })).blobs.map(b => b.key);
    const rec = await s.get(keys[0], { type: 'json' });
    ok(keys.length === 1 && Object.keys(rec).sort().join() === 'created_at,email,expires_at,family_route,first_name,planner_mode,request_id,route_code,status', label + 'record has exactly the minimal fields ' + Object.keys(rec).join());
    ok(rec.email === 'parent@example.com' && rec.route_code === route2 && rec.first_name === 'נועה', label + 'email normalized, route code exact, first name kept');
    ok(!/ip|address|surname|birth|school|hotel|photo/i.test(JSON.stringify(Object.keys(rec))), label + 'no IP or forbidden fields');
    ok(/^r[0-9a-f]{24}$/.test(rec.request_id) && keys[0] === 'requests/' + rec.request_id, label + 'opaque random request id');
    ok(new Date(rec.expires_at) - new Date(rec.created_at) === 7 * 864e5, label + 'expires_at = created_at + 7 days');
    const r2 = await post(s, req({ email: 'other@example.com', first_name: '' }));
    const recs = await Promise.all((await s.list({ prefix: 'requests/' })).blobs.map(b => s.get(b.key, { type: 'json' })));
    ok(r2.body.status === 'received' && recs.some(x => x.email === 'other@example.com' && x.first_name === null), label + 'child name optional');
    const dk = (await s.list({ prefix: 'dedupe/' })).blobs.map(b => b.key);
    ok(dk.length === 2 && dk.every(k => /^dedupe\/[0-9a-f]{64}$/.test(k)) && !dk.some(k => /example|parent/.test(k)), label + 'dedupe keys are HMACs, no email in any key');
    ok(dk.includes(dedupeKey(SECRET, ' PARENT@example.com ', route2)), label + 'dedupe key uses the normalized email'); }
  /* honeypot and invalid input: nothing written */
  { const s = makeStore();
    const cases = [
      ['honeypot', req({ website: 'http://spam' }), 400], ['unexpected field', Object.assign(req(), { surname: 'x' }), 400],
      ['bad json', '{', 400], ['invalid email', req({ email: 'nope' }), 400], ['name with digits', req({ first_name: 'Noa1' }), 400],
      ['name too long', req({ first_name: 'א'.repeat(25) }), 400], ['ack missing', req({ beta_ack: false }), 400],
      ['adult route', req({ family_route: false }), 422], ['bad mode', req({ planner_mode: 'x' }), 400],
      ['unknown code', req({ route_code: C('big-ben') + 'Zz' }), 422], ['truncated', req({ route_code: C('big-ben') + 'A' }), 422],
      ['malformed', req({ route_code: C('big-ben') + '..' + C('tate-modern') }), 422], ['bad chars', req({ route_code: C('big-ben') + '-' + C('tate-modern') }), 422],
      ['8 days', req({ route_code: OPEN.slice(0, 8).map(a => a.code).join('.') }), 422],
      ['13 stops', req({ route_code: OPEN.slice(0, 13).map(a => a.code).join('') }), 422],
      ['same place twice in a day', req({ route_code: C('big-ben') + C('big-ben') }), 422],
      ['only closed', req({ route_code: C('chin-chin-labs') + C('beyond-retro') }), 422],
      ['empty', req({ route_code: '' }), 422]];
    for (const [name, body, st] of cases) { const r = await post(s, body); ok(r.status === st, label + name + ' -> ' + st + ' (got ' + r.status + ' ' + JSON.stringify(r.body) + ')'); }
    ok((await s.list({ prefix: '' })).blobs.length === 0, label + 'rejected requests wrote nothing and claimed no slot'); }
  /* duplicates */
  { const s = makeStore();
    await post(s, req());
    const d = await post(s, req({ email: '  PARENT@example.COM ', first_name: 'אחר' }));
    ok(d.status === 200 && d.body.status === 'already_received', label + 'same normalized email + same route: already_received');
    ok((await s.list({ prefix: 'slots/' })).blobs.length === 1, label + 'duplicate did not claim a second slot');
    const other = await post(s, req({ route_code: C('tower-of-london') }));
    ok(other.body.status === 'received' && (await s.list({ prefix: 'slots/' })).blobs.length === 2, label + 'same email, different route: a new request'); }
  /* cap: 25 sequential, the 26th distinct is full */
  { const s = makeStore();
    let acc = 0; for (let i = 1; i <= CAP; i++) { const r = await post(s, distinct(i)); if (r.body.status === 'received') acc++; }
    ok(acc === 25, label + 'slots 1..25 accepted (' + acc + ')');
    const r26 = await post(s, distinct(26));
    ok(r26.status === 409 && r26.body.full === true, label + 'distinct request 26 -> 409 full');
    ok((await s.list({ prefix: 'slots/' })).blobs.length === 25 && (await s.list({ prefix: 'requests/' })).blobs.length === 25, label + 'exactly 25 slots and 25 requests');
    ok((await s.list({ prefix: 'dedupe/' })).blobs.length === 25, label + 'the refused 26th left no dedupe key');
    ok((await get(s)).body.open === false, label + 'GET: open false when full');
    ok((await post(s, distinct(5))).body.status === 'already_received', label + 'a family already in can still resubmit when full'); }
  /* purge */
  { const s = makeStore();
    const t0 = new Date('2026-10-01T10:00:00Z');
    await post(s, distinct(1), { now: () => t0 });
    await post(s, distinct(2), { now: () => new Date('2026-10-06T10:00:00Z') });
    const res = await purge(s, new Date('2026-10-08T10:00:01Z'));
    ok(res.requests === 1 && res.dedupe === 1, label + 'purge: the 7-day-old request and its dedupe key deleted ' + JSON.stringify(res));
    ok((await s.list({ prefix: 'requests/' })).blobs.length === 1 && (await s.list({ prefix: 'slots/' })).blobs.length === 2, label + 'purge: newer request kept, slots kept (no personal data)'); }
}

/* ---- layer 1: memory store, including concurrency ---- */
await flows(() => new MemoryStore(), 'memory: ');
{ const s = new MemoryStore();
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => post(s, distinct(i))));
  const acc = rs.filter(r => r.body.status === 'received').length, full = rs.filter(r => r.status === 409).length;
  ok(acc === 25 && full === 15, 'concurrency: 40 simultaneous distinct requests -> 25 accepted, 15 full (' + acc + '/' + full + ')');
  ok(s.keys('slots/').length === 25 && s.keys('requests/').length === 25 && s.keys('dedupe/').length === 25, 'concurrency: 25 slots, 25 requests, 25 dedupe keys');
  const ids = s.keys('slots/').map(k => JSON.parse(s.m.get(k).v).request_id);
  ok(new Set(ids).size === 25 && ids.every(id => s.m.has('requests/' + id)), 'concurrency: every slot belongs to exactly one stored request'); }
{ const s = new MemoryStore();
  const rs = await Promise.all(Array.from({ length: 10 }, () => post(s, req())));
  ok(rs.filter(r => r.body.status === 'received').length === 1 && rs.filter(r => r.body.status === 'already_received').length === 9, 'concurrency: 10 simultaneous identical requests -> 1 received, 9 already_received');
  ok(s.keys('slots/').length === 1, 'concurrency: identical requests claimed one slot'); }
{ const s = new MemoryStore();
  s.failOn = k => k.startsWith('requests/');
  const r = await post(s, req());
  ok(r.status === 500 && s.keys('slots/').length === 0 && s.keys('dedupe/').length === 0, 'store failure: slot and dedupe claim rolled back'); }
{ const s = new MemoryStore();
  await s.set(dedupeKey(SECRET, 'parent@example.com', route2), JSON.stringify({ request_id: 'rdead', created_at: '2026-01-01T00:00:00Z' }));
  const r = await post(s, req());
  ok(r.body.status === 'received' && s.keys('requests/').length === 1, 'stale half-finished claim is recovered, not counted as a duplicate'); }

/* ---- layer 2: real @netlify/blobs client against the local BlobsServer ---- */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jb-blobs-'));
const server = new BlobsServer({ directory: dir, token: 'local-test-token', port: 0 });
const { port } = await server.start();
let n = 0;
const realStore = () => getStore({ name: 'journal-beta-test-' + (++n), siteID: 'local-site', token: 'local-test-token',
  edgeURL: 'http://localhost:' + port, uncachedEdgeURL: 'http://localhost:' + port, consistency: 'strong' });
{ const s = realStore(); const a = await s.set('probe', 'x', { onlyIfNew: true }); const b = await s.set('probe', 'y', { onlyIfNew: true });
  ok(a.modified === true && b.modified === false && (await s.get('probe')) === 'x', 'real client: onlyIfNew returns modified true then false, value kept'); }
await flows(realStore, 'real blobs: ');
await server.stop();
fs.rmSync(dir, { recursive: true, force: true });

console.log(pass + ' passed, ' + fail + ' failed');
console.log(fail ? 'FAILED' : 'ALL PASS');
process.exit(fail ? 1 : 0);
