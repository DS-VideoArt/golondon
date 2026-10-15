/*
  Kids Journal Beta automation: dispatch, signed callback, download, reconciliation, retention
  ===========================================================================================
  Offline only. No real GitHub dispatch (every dispatcher is a mock or a mocked fetch), no real secrets, no email.
  1. MemoryStore with atomic onlyIfNew / onlyIfMatch (check and write in one synchronous step), etags, metadata and
     stream reads, with an await between operations so concurrent calls interleave.
  2. The real @netlify/blobs client against the local BlobsServer, sequentially, for API compatibility of the calls
     the new code uses (getWithMetadata etag, onlyIfMatch, getMetadata, stream).
  Callback bodies are produced by python3 with the approved worker's exact serialization
  (json.dumps(result, ensure_ascii=False, sort_keys=True).encode('utf-8')) and HMAC, then verified here.

    node docs/qa/journal-automation-test.mjs
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { handle, CAP } from '../../netlify/functions/journal-beta-request.mjs';
import { purge } from '../../netlify/functions/journal-beta-purge.mjs';
import { STATES, canTransition, effectiveStatus, publicStatus, markDelivered } from '../../netlify/journal-lib/journal-state.mjs';
import * as A from '../../netlify/journal-lib/journal-automation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLACES = JSON.parse(fs.readFileSync(path.join(ROOT, 'planner-data.json'), 'utf8')).attractions;
const BY = {}; PLACES.forEach(a => { BY[a.id] = a; });
const C = id => BY[id].code;
const SECRET = 'test-beta-secret-not-real';
const CB_SECRET = 'test-callback-secret-not-real';
const GH_TOKEN = 'github_pat_TEST_NOT_REAL_0000000000';
const PREVIEW = 'journal-delivery-preview';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const tick = () => new Promise(r => setImmediate(r));

/* every console line any code under test prints, to prove no token, email or name reaches a log */
const LOGS = [];
for (const k of ['log', 'warn', 'error', 'info']) { const orig = console[k]; console[k] = (...a) => { LOGS.push(a.map(String).join(' ')); if (k !== 'log' || !String(a[0]).startsWith('FAIL')) return; orig(...a); }; }
const say = (...a) => process.stdout.write(a.join(' ') + '\n');

class MemoryStore {
  constructor() { this.m = new Map(); this.n = 0; this.failOn = null; }
  conv(e, type) {
    if (type === 'json') return JSON.parse(e.v.toString('utf8'));
    if (type === 'stream') return new Blob([e.v]).stream();
    if (type === 'arrayBuffer') return e.v.buffer.slice(e.v.byteOffset, e.v.byteOffset + e.v.length);
    return e.v.toString('utf8');
  }
  async get(k, o) { await tick(); const e = this.m.get(k); return e ? this.conv(e, o && o.type) : null; }
  async getWithMetadata(k, o) { await tick(); const e = this.m.get(k); return e ? { data: this.conv(e, o && o.type), etag: e.etag, metadata: e.md } : null; }
  async getMetadata(k) { await tick(); const e = this.m.get(k); return e ? { etag: e.etag, metadata: e.md } : null; }
  async set(k, v, o) {
    await tick();
    if (this.failOn && this.failOn(k)) throw new Error('injected');
    const e = this.m.get(k);                                            /* atomic: no await between check and write */
    if (o && o.onlyIfNew && e) return { modified: false };
    if (o && o.onlyIfMatch !== undefined && (!e || e.etag !== o.onlyIfMatch)) return { modified: false };
    const etag = '"' + (++this.n) + '"';
    this.m.set(k, { v: Buffer.isBuffer(v) ? v : Buffer.from(v instanceof Uint8Array ? v : String(v)), md: (o && o.metadata) || {}, etag });
    return { modified: true, etag };
  }
  async setJSON(k, v, o) { return this.set(k, JSON.stringify(v), o); }
  async delete(k) { await tick(); this.m.delete(k); }
  async list(o) { await tick(); return { blobs: [...this.m.keys()].filter(k => !o || !o.prefix || k.startsWith(o.prefix)).map(key => ({ key, etag: this.m.get(key).etag })), directories: [] }; }
  keys(p) { return [...this.m.keys()].filter(k => k.startsWith(p)); }
  json(k) { return JSON.parse(this.m.get(k).v.toString('utf8')); }
}

/* ---- fixtures ---- */
const T0 = new Date('2026-10-15T10:00:00.000Z');
const at = ms => new Date(T0.getTime() + ms);
const MIN = 60e3, DAY = 864e5;
const route2 = [C('big-ben') + C('westminster-abbey'), C('tate-modern') + C('chin-chin-labs')].join('.');
const form = o => Object.assign({ route_code: route2, family_route: true, planner_mode: 'auto', email: 'Parent@Example.com', first_name: 'נועה', beta_ack: true, website: '' }, o || {});

function mockDispatcher(plan) {
  const calls = [];
  const fn = async payload => { calls.push(JSON.parse(JSON.stringify(payload))); await tick(); const r = plan ? plan(calls.length) : true; return r === true ? { ok: true } : { ok: false, code: r }; };
  fn.calls = calls; return fn;
}
const post = (store, body, extra) => handle(new Request('http://x/.netlify/functions/journal-beta-request', { method: 'POST', body: JSON.stringify(body) }),
  Object.assign({ store, secret: SECRET, enabled: true, loadPlaces: async () => PLACES, now: () => T0 }, extra || {}))
  .then(async r => ({ status: r.status, body: await r.json() }));

const pdfBytes = Buffer.from('%PDF-1.7\n% test journal, not a real book\n' + 'x'.repeat(2048) + '\n%%EOF\n');
function readyResult(rid, token, o) {
  const created = at(10 * MIN);
  return Object.assign({ request_id: rid, status: 'ready', delivery_token: token, pdf_size: pdfBytes.length,
    pdf_sha256: crypto.createHash('sha256').update(pdfBytes).digest('hex'), page_count: 24,
    created_at: created.toISOString().replace(/\.\d+Z$/, 'Z'), expires_at: new Date(created.getTime() + 7 * DAY).toISOString().replace(/\.\d+Z$/, 'Z'),
    delivery_store: PREVIEW, worker_version: 'journal-worker-1.2.0', bridge_version: 'route-bridge-1.0.0' }, o || {});
}
async function deliver(dstore, result, md) {   /* what the worker's put-pdf and put-index write */
  await dstore.set('pdf/' + result.delivery_token, pdfBytes, { metadata: Object.assign({ request_id: result.request_id, created_at: result.created_at, expires_at: result.expires_at,
    pdf_sha256: result.pdf_sha256, pdf_size: result.pdf_size, page_count: result.page_count, content_type: 'application/pdf' }, md || {}) });
  await dstore.set('index/' + result.request_id, JSON.stringify(result));
}
const newTok = () => crypto.randomBytes(32).toString('hex');

/* the approved worker's serialization and signature, computed by python3 */
function pySign(result, secret) {
  const out = execFileSync('python3', ['-I', '-c', [
    'import sys, json, hmac, hashlib, base64',
    'd = json.loads(sys.stdin.read())',
    'body = json.dumps(d["result"], ensure_ascii=False, sort_keys=True).encode("utf-8")',
    'sig = hmac.new(d["secret"].encode("utf-8"), body, hashlib.sha256).hexdigest()',
    'print(json.dumps({"body": base64.b64encode(body).decode(), "sig": sig}))'].join('\n')], { input: JSON.stringify({ result, secret }) });
  const j = JSON.parse(out.toString());
  return { body: Buffer.from(j.body, 'base64'), sig: 'sha256=' + j.sig };
}
const cbReq = (body, headers) => new Request('https://x/.netlify/functions/journal-worker-callback', { method: 'POST', body,
  headers: Object.assign({ 'content-type': 'application/json' }, headers) });
async function callback(deps, result, o) {
  o = o || {};
  const signed = pySign(result, o.secret || CB_SECRET);
  const h = { 'x-journal-signature': o.sig !== undefined ? o.sig : signed.sig, 'x-journal-worker': o.worker !== undefined ? o.worker : 'journal-worker-1.2.0' };
  if (h['x-journal-signature'] === null) delete h['x-journal-signature'];
  if (h['x-journal-worker'] === null) delete h['x-journal-worker'];
  const r = await A.handleCallback(cbReq(o.body || signed.body, h), Object.assign({ secret: CB_SECRET, deliveryStoreName: PREVIEW, now: () => at(20 * MIN) }, deps));
  const text = await r.text();
  return { status: r.status, body: JSON.parse(text), text };
}
const dl = (deps, tok, o) => A.handleDownload(new Request('https://x/journal-download/' + tok, { method: (o && o.method) || 'GET' }),
  Object.assign({ deliveryStoreName: PREVIEW, now: () => at(30 * MIN) }, deps, o && o.deps));

/* one accepted and dispatched request in a fresh store, plus its delivery */
async function setup(o) {
  o = o || {};
  const store = o.store || new MemoryStore(), dstore = o.dstore || new MemoryStore();
  const disp = mockDispatcher();
  const r = await post(store, form(o.form), { dispatcher: disp });
  const rid = disp.calls[0] && disp.calls[0].request_id;
  const result = readyResult(rid, newTok());
  if (!o.noDelivery) await deliver(dstore, result);
  return { store, dstore, disp, r, rid, result, deps: { store, deliveryStore: dstore } };
}

/* ======================================================= 1. state machine */
ok(STATES.join() === 'accepted,dispatch_failed,dispatched,ready,delivered,failed,expired', 'state: the seven explicit states');
ok(canTransition('accepted', 'dispatched') && canTransition('received', 'dispatched') && canTransition('dispatch_failed', 'accepted') && canTransition('dispatched', 'ready') && canTransition('failed', 'ready') && canTransition('ready', 'delivered'), 'state: allowed transitions (received is the legacy name of accepted)');
ok(!canTransition('ready', 'failed') && !canTransition('ready', 'dispatched') && !canTransition('delivered', 'ready') && !canTransition('dispatched', 'accepted') && !canTransition('expired', 'ready') && !canTransition('ready', 'ready'), 'state: no downgrade, no re-entry into ready, expired is terminal');
ok(effectiveStatus({ status: 'ready', expires_at: at(DAY).toISOString() }, at(DAY)) === 'expired' && effectiveStatus({ status: 'ready', expires_at: at(DAY).toISOString() }, at(DAY - 1)) === 'ready', 'state: expired is derived from expires_at at the exact instant');

/* ======================================================= 2. dispatch contract */
{ const { store, disp, r, rid } = await setup();
  const p = disp.calls[0];
  ok(r.status === 200 && r.body.status === 'received' && disp.calls.length === 1, 'dispatch: accepted request dispatched once, page sees received');
  ok(Object.keys(p).sort().join() === 'created_at,family_route,first_name,planner_mode,request_id,route_code', 'dispatch: client_payload has exactly the six fields ' + Object.keys(p).join());
  ok(Object.keys(p).join() === A.PAYLOAD_FIELDS.join(), 'dispatch: field order as in the worker contract');
  const rec = store.json('requests/' + rid);
  ok(p.request_id === rid && /^r[0-9a-f]{24}$/.test(rid) && p.route_code === route2 && p.family_route === true && p.planner_mode === 'auto' && p.first_name === 'נועה' && p.created_at === rec.created_at, 'dispatch: values equal the stored request');
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.created_at), 'dispatch: created_at in the worker format 2026-10-12T16:52:15.053Z');
  const s = JSON.stringify(p);
  ok(!/email|example\.com|parent@/i.test(s) && !s.includes(SECRET) && !/journal-delivery|delivery|store|secret|token/i.test(s), 'dispatch: no email, no delivery store, no Beta secret, no token in the payload');
  ok(rec.status === 'dispatched' && rec.dispatch_attempts === 1 && rec.dispatched_at && rec.dispatch_claimed_at === null, 'dispatch: record moves accepted -> dispatched');
  ok(store.keys('slots/').length === 1 && store.keys('requests/').length === 1, 'dispatch: one slot, one request'); }
{ const { disp } = await setup({ form: { first_name: '' } });
  ok(disp.calls[0].first_name === null && 'first_name' in disp.calls[0], 'dispatch: empty first name sent as null, key still present'); }
/* the real HTTP shape, through githubDispatcher with a mocked fetch: no real network call */
{ const seen = [];
  const fetchMock = async (url, init) => { seen.push({ url, init }); return new Response(null, { status: 204 }); };
  const d = A.githubDispatcher({ token: GH_TOKEN, fetchImpl: fetchMock });
  const res = await d(A.dispatchPayload({ request_id: 'r' + 'a'.repeat(24), route_code: route2, family_route: true, planner_mode: 'manual', first_name: null, created_at: T0.toISOString(), email: 'x@example.com', status: 'accepted' }));
  const body = JSON.parse(seen[0].init.body);
  ok(res.ok === true && seen.length === 1, 'github: 204 -> ok');
  ok(seen[0].url === 'https://api.github.com/repos/DS-VideoArt/golondon-kids-journal/dispatches' && seen[0].init.method === 'POST', 'github: POST to the worker repo dispatches endpoint');
  ok(Object.keys(body).sort().join() === 'client_payload,event_type' && body.event_type === 'journal_generate', 'github: body is event_type journal_generate + client_payload only');
  ok(Object.keys(body.client_payload).sort().join() === 'created_at,family_route,first_name,planner_mode,request_id,route_code' && !JSON.stringify(body).includes('example.com'), 'github: dispatchPayload drops every non-contract field (email, status)');
  ok(seen[0].init.headers.authorization === 'Bearer ' + GH_TOKEN && seen[0].init.headers['x-github-api-version'] === '2022-11-28' && seen[0].init.headers.accept === 'application/vnd.github+json', 'github: bearer auth from the server token, API version header');
  ok(!JSON.stringify(res).includes(GH_TOKEN), 'github: the token is never in the returned value');
  ok(A.githubDispatcher({ token: '' }) === null && A.githubDispatcher({}) === null, 'github: no token -> no dispatcher (manual flow)');
  const codes = [];
  for (const [st, want] of [[401, 'auth'], [403, 'auth'], [404, 'not_found'], [422, 'invalid'], [429, 'unavailable'], [500, 'unavailable'], [302, 'http_302']]) {
    const r = await A.githubDispatcher({ token: GH_TOKEN, fetchImpl: async () => new Response('{"message":"x ' + GH_TOKEN + '"}', { status: st }) })({});
    codes.push(r.ok === false && r.code === want && !JSON.stringify(r).includes(GH_TOKEN));
  }
  ok(codes.every(Boolean), 'github: HTTP failures map to typed codes, response body never surfaced');
  const net = await A.githubDispatcher({ token: GH_TOKEN, fetchImpl: async () => { throw new TypeError('fetch failed ' + GH_TOKEN); } })({});
  const slow = await A.githubDispatcher({ token: GH_TOKEN, timeoutMs: 20, fetchImpl: (u, init) => new Promise((_, rej) => { const keep = setTimeout(() => {}, 2000); /* AbortSignal.timeout is unref'd */ init.signal.addEventListener('abort', () => { clearTimeout(keep); rej(init.signal.reason); }); }) })({});
  ok(net.code === 'network' && slow.code === 'timeout' && !JSON.stringify([net, slow]).includes(GH_TOKEN), 'github: network error and timeout -> typed codes, no message passthrough'); }

/* ======================================================= 3. dispatch failure and same-id retry */
{ const store = new MemoryStore();
  const disp = mockDispatcher(n => n === 1 ? 'unavailable' : true);
  const r1 = await post(store, form(), { dispatcher: disp });
  const rid = disp.calls[0].request_id;
  let rec = store.json('requests/' + rid);
  ok(r1.status === 502 && r1.body.ok === false && r1.body.code === 'dispatch_failed' && r1.body.retryable === true && r1.body.status === undefined, 'failure: dispatch failure is not reported as received (502 dispatch_failed)');
  ok(rec.status === 'dispatch_failed' && rec.dispatch_error === 'unavailable' && rec.dispatch_attempts === 1, 'failure: typed dispatch_failed state persisted');
  ok(store.keys('slots/').length === 1 && store.keys('requests/').length === 1 && store.keys('dedupe/').length === 1, 'failure: the request keeps its one slot');
  const r2 = await post(store, form({ email: ' PARENT@example.com ' }), { dispatcher: disp });
  rec = store.json('requests/' + rid);
  ok(r2.status === 200 && r2.body.status === 'received' && disp.calls.length === 2 && disp.calls[1].request_id === rid, 'retry: resubmitting the same form re-dispatches with the SAME request_id');
  ok(JSON.stringify(disp.calls[0]) === JSON.stringify(disp.calls[1]), 'retry: identical payload on retry');
  ok(rec.status === 'dispatched' && rec.dispatch_attempts === 2 && rec.dispatch_error === null, 'retry: dispatch_failed -> dispatched');
  ok(store.keys('slots/').length === 1 && store.keys('requests/').length === 1 && store.keys('dedupe/').length === 1, 'retry: no extra slot, no duplicate request');
  const r3 = await post(store, form(), { dispatcher: disp });
  ok(r3.body.status === 'already_received' && disp.calls.length === 2, 'retry: after success a resubmit is already_received, no third dispatch'); }
{ const store = new MemoryStore();
  const disp = mockDispatcher(n => n === 1 ? 'timeout' : true);
  await post(store, form(), { dispatcher: disp });
  const rs = await Promise.all(Array.from({ length: 8 }, () => post(store, form(), { dispatcher: disp })));
  ok(disp.calls.length === 2, 'retry concurrency: 8 simultaneous retries -> exactly one re-dispatch (' + disp.calls.length + ')');
  ok(rs.filter(r => r.body.status === 'received').length === 1 && rs.filter(r => r.body.status === 'already_received').length === 7, 'retry concurrency: one received, seven already_received');
  ok(store.keys('slots/').length === 1 && store.keys('requests/').length === 1, 'retry concurrency: still one slot, one request'); }
{ const store = new MemoryStore();
  const disp = mockDispatcher(() => 'auth');
  for (let i = 0; i < 7; i++) await post(store, form(), { dispatcher: disp });
  const rec = store.json('requests/' + disp.calls[0].request_id);
  ok(disp.calls.length === A.MAX_DISPATCH_ATTEMPTS && rec.dispatch_attempts === A.MAX_DISPATCH_ATTEMPTS && rec.status === 'dispatch_failed', 'retry: bounded at ' + A.MAX_DISPATCH_ATTEMPTS + ' attempts'); }
{ const store = new MemoryStore();
  const disp = mockDispatcher(() => { throw new Error('boom ' + GH_TOKEN); });
  const r = await post(store, form(), { dispatcher: disp });
  ok(r.status === 502 && store.json('requests/' + disp.calls[0].request_id).dispatch_error === 'network', 'failure: a throwing dispatcher becomes a typed failure'); }
/* manual flow (no token) and cap/dedupe behaviour with automation on */
{ const store = new MemoryStore();
  const r = await post(store, form());
  const rec = store.json(store.keys('requests/')[0]);
  ok(r.body.status === 'received' && rec.status === 'accepted' && !('dispatch_attempts' in rec), 'manual: without a dispatcher the approved manual flow is unchanged');
  ok(Object.keys(rec).sort().join() === 'created_at,email,expires_at,family_route,first_name,planner_mode,request_id,route_code,status', 'manual: record keeps exactly the minimal fields'); }
{ const store = new MemoryStore();
  const disp = mockDispatcher();
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => post(store, form({ email: 'family' + i + '@example.com' }), { dispatcher: disp })));
  ok(rs.filter(r => r.body.status === 'received').length === CAP && rs.filter(r => r.status === 409).length === 15, 'cap with automation: 40 simultaneous -> 25 received, 15 full');
  ok(disp.calls.length === CAP && new Set(disp.calls.map(c => c.request_id)).size === CAP, 'cap with automation: 25 dispatches, one per accepted request, none for refused'); }
{ const store = new MemoryStore();
  const disp = mockDispatcher();
  const r = await post(store, form({ family_route: false }), { dispatcher: disp });
  const r2 = await post(store, form({ route_code: C('big-ben') + 'Zz' }), { dispatcher: disp });
  const r3 = await post(store, form({ website: 'spam' }), { dispatcher: disp });
  ok(r.status === 422 && r2.status === 422 && r3.status === 400 && disp.calls.length === 0 && store.keys('').length === 0, 'route/family/honeypot rejections never dispatch and write nothing'); }

/* ======================================================= 4. signed callback */
{ const { deps, rid, result, store } = await setup();
  const signed = pySign(result, CB_SECRET);
  ok(!signed.body.toString('utf8').includes(' ,') && signed.body.toString('utf8').startsWith('{"bridge_version"'), 'callback fixture: python body is sort_keys serialized, as the worker sends it');
  const v = await callback(deps, result);
  const rec = store.json('requests/' + rid);
  ok(v.status === 200 && v.body.ok === true && v.body.status === 'ready' && v.body.created === true, 'callback: valid signed ready result -> 200 ready');
  ok(rec.status === 'ready' && A.DOWNLOAD_TOKEN.test(rec.download_token) && rec.download_token.length === 43, 'callback: READY with a new 256-bit website download token');
  ok(rec.download_token !== result.delivery_token && !JSON.stringify(rec).includes(result.delivery_token), 'callback: the request record never stores the worker delivery token');
  const map = store.json('downloads/' + rec.download_token);
  ok(map.request_id === rid && map.delivery_token === result.delivery_token && map.delivery_store === PREVIEW && Object.keys(map).sort().join() === 'created_at,delivery_store,delivery_token,expires_at,request_id', 'callback: mapping download_token -> request_id, delivery_token, expires_at');
  ok(map.expires_at === rec.expires_at && rec.download_expires_at === rec.expires_at && Date.parse(map.expires_at) <= Date.parse(result.expires_at), 'callback: download expiry = min(request 7-day expiry, PDF expiry)');
  ok(rec.pdf_size === result.pdf_size && rec.page_count === 24 && rec.worker_version === 'journal-worker-1.2.0' && rec.status !== 'delivered', 'callback: non-secret delivery facts kept; READY is not DELIVERED');
  ok(!v.text.includes(result.delivery_token) && !v.text.includes(rec.download_token) && !v.text.includes(rid), 'callback: response carries no token and no request id');
  /* repeat idempotency and no rotation */
  const again = await callback(deps, result);
  const again2 = await callback(deps, Object.assign({}, result, { reused: true }));
  const rec2 = store.json('requests/' + rid);
  ok(again.status === 200 && again.body.created === false && again2.status === 200 && again2.body.created === false, 'callback: repeat (and the worker reused:true repeat) -> 200, nothing created');
  ok(rec2.download_token === rec.download_token && store.keys('downloads/').length === 1, 'callback: no token rotation, one mapping');
  const other = readyResult(rid, newTok());
  await deliver(deps.deliveryStore, other);
  const forced = await callback(deps, other);
  ok(forced.status === 200 && store.json('requests/' + rid).download_token === rec.download_token && store.keys('downloads/').length === 1 && store.json('downloads/' + rec.download_token).delivery_token === result.delivery_token, 'callback: a later result with another delivery token does not rotate the capability');
  /* signatures */
  const bad = await callback(deps, result, { sig: 'sha256=' + '0'.repeat(64) });
  const missing = await callback(deps, result, { sig: null });
  const wrongKey = await callback(deps, result, { secret: 'another-secret' });
  const malformed = [];
  for (const s of ['sha256=', 'sha1=' + 'a'.repeat(40), 'sha256=' + 'A'.repeat(64), 'sha256=' + 'a'.repeat(63), 'a'.repeat(64), 'sha256=' + 'g'.repeat(64)]) malformed.push((await callback(deps, result, { sig: s })).status === 401);
  ok(bad.status === 401 && bad.body.code === 'bad_signature', 'callback: bad HMAC -> 401');
  ok(missing.status === 401 && missing.body.code === 'missing_signature', 'callback: missing signature -> 401');
  ok(wrongKey.status === 401 && wrongKey.body.code === 'bad_signature', 'callback: signed with another key -> 401');
  ok(malformed.every(Boolean), 'callback: malformed signature headers -> 401');
  ok((await callback(deps, result, { worker: null })).status === 400 && (await callback(deps, result, { worker: 'evil' })).status === 400, 'callback: X-Journal-Worker required in the worker format');
  /* raw-body verification: same JSON, other bytes -> rejected */
  const signed2 = pySign(result, CB_SECRET);
  const reser = Buffer.from(JSON.stringify(JSON.parse(signed2.body.toString('utf8'))));
  const spaced = Buffer.from(signed2.body.toString('utf8').replace(/, "/g, ',"'));   /* python uses ', ' and ': ' separators */
  ok(!reser.equals(signed2.body), 'raw body: JSON.stringify bytes differ from the python bytes');
  ok((await callback(deps, result, { body: reser, sig: signed2.sig })).status === 401 && (await callback(deps, result, { body: spaced, sig: signed2.sig })).status === 401, 'raw body: re-serialized or re-spaced bytes with the original signature -> 401');
  ok((await callback(deps, result, { body: Buffer.concat([signed2.body, Buffer.from('\n')]), sig: signed2.sig })).status === 401, 'raw body: one extra byte -> 401');
  /* non-ASCII: ensure_ascii=False UTF-8 bytes verify exactly */
  const heb = Object.assign({}, result, { note: 'יומן של נועה' });
  const sh = pySign(heb, CB_SECRET);
  ok(sh.body.includes(Buffer.from('נועה')) && A.verifySignature(new Uint8Array(sh.body), sh.sig, CB_SECRET) === null, 'raw body: UTF-8 (ensure_ascii=False) body verifies byte for byte');
  ok(A.verifySignature(new Uint8Array(sh.body), sh.sig, '') === 'not_configured', 'signature: empty secret never verifies');
  /* method, size, json */
  const g = await A.handleCallback(new Request('https://x/cb', { method: 'GET' }), Object.assign({ secret: CB_SECRET, deliveryStoreName: PREVIEW, now: () => at(20 * MIN) }, deps));
  ok(g.status === 405, 'callback: POST only');
  const big = Buffer.from('{"a":"' + 'x'.repeat(A.MAX_CALLBACK_BODY) + '"}');
  ok((await callback(deps, result, { body: big, sig: 'sha256=' + crypto.createHmac('sha256', CB_SECRET).update(big).digest('hex') })).status === 413, 'callback: oversized body -> 413');
  const nj = Buffer.from('not json');
  ok((await callback(deps, result, { body: nj, sig: 'sha256=' + crypto.createHmac('sha256', CB_SECRET).update(nj).digest('hex') })).status === 400, 'callback: signed but not JSON -> 400 (parsed only after verification)');
  const unsignedJunk = await callback(deps, result, { body: nj, sig: 'sha256=' + '1'.repeat(64) });
  ok(unsignedJunk.status === 401, 'callback: bad signature is rejected before parsing'); }
{ const { deps, store, rid, result } = await setup();
  const before = JSON.stringify(store.json('requests/' + rid));
  const cases = [
    ['unknown request', readyResult('r' + 'b'.repeat(24), result.delivery_token), 404, 'unknown_request'],
    ['malformed request id', Object.assign({}, result, { request_id: 'R123' }), 400, 'malformed_request_id'],
    ['production store', Object.assign({}, result, { delivery_store: 'journal-delivery' }), 422, 'wrong_store'],
    ['other store', Object.assign({}, result, { delivery_store: 'journal-beta' }), 422, 'wrong_store'],
    ['missing store', (() => { const x = Object.assign({}, result); delete x.delivery_store; return x; })(), 422, 'wrong_store'],
    ['token too short', Object.assign({}, result, { delivery_token: 'ab'.repeat(16) }), 422, 'malformed_token'],
    ['token uppercase', Object.assign({}, result, { delivery_token: result.delivery_token.toUpperCase() }), 422, 'malformed_token'],
    ['token path', Object.assign({}, result, { delivery_token: '../' + result.delivery_token.slice(3) }), 422, 'malformed_token'],
    ['token missing', (() => { const x = Object.assign({}, result); delete x.delivery_token; return x; })(), 422, 'malformed_token'],
    ['delivery already expired', Object.assign({}, result, { expires_at: '2026-10-15T10:05:00Z' }), 422, 'delivery_expired'],
    ['bad expires_at', Object.assign({}, result, { expires_at: 'soon' }), 400, 'malformed_result'],
    ['bad pdf_size', Object.assign({}, result, { pdf_size: -1 }), 400, 'malformed_result'],
    ['token without a file', readyResult(rid, newTok()), 409, 'delivery_missing'],
    ['array body', [], 400, 'malformed_result']];
  for (const [name, body, st, code] of cases) { const r = await callback(deps, body); ok(r.status === st && r.body.code === code, 'callback reject: ' + name + ' -> ' + st + ' ' + code + ' (got ' + r.status + ' ' + r.body.code + ')'); }
  ok(JSON.stringify(store.json('requests/' + rid)) === before && store.keys('downloads/').length === 0, 'callback reject: nothing changed, no capability created');
  /* a file that belongs to another request */
  const foreign = readyResult(rid, newTok());
  await deps.deliveryStore.set('pdf/' + foreign.delivery_token, pdfBytes, { metadata: { request_id: 'r' + 'c'.repeat(24), expires_at: foreign.expires_at } });
  ok((await callback(deps, foreign)).body.code === 'delivery_missing' && store.keys('downloads/').length === 0, 'callback reject: a token whose file belongs to another request');
  /* non-ready results: rejected for finalization, typed failure recorded */
  const nr = await callback(deps, { request_id: rid, status: 'gate_failed', code: 'final_render_gate', detail: 'x', failed_checks: ['a'] });
  const recF = store.json('requests/' + rid);
  ok(nr.status === 422 && nr.body.code === 'not_ready' && recF.status === 'failed' && recF.worker_status === 'gate_failed' && !recF.download_token, 'callback: non-ready result -> 422, failed state, no capability');
  ok(!('detail' in recF) && !('failed_checks' in recF), 'callback: worker failure detail is not copied into the record');
  const odd = await callback(deps, { request_id: rid, status: 'weird' });
  ok(odd.status === 422 && store.json('requests/' + rid).worker_status === 'gate_failed', 'callback: unknown status rejected, state untouched');
  const late = await callback(deps, result);
  ok(late.status === 200 && store.json('requests/' + rid).status === 'ready', 'callback: an operator re-run that succeeds moves failed -> ready'); }
{ const { deps, store, rid, result } = await setup();
  const exp = await A.handleCallback(cbReq(pySign(result, CB_SECRET).body, { 'x-journal-signature': pySign(result, CB_SECRET).sig, 'x-journal-worker': 'journal-worker-1.2.0' }),
    Object.assign({ secret: CB_SECRET, deliveryStoreName: PREVIEW, now: () => at(7 * DAY) }, deps));
  ok(exp.status === 410 && (await exp.json()).code === 'expired' && store.json('requests/' + rid).status === 'dispatched', 'callback: request past its 7-day expiry -> 410, unchanged');
  const ready = await callback(deps, result);
  const notReadyAfter = await callback(deps, { request_id: rid, status: 'generation_failed', code: 'x', detail: 'y' });
  ok(ready.status === 200 && notReadyAfter.status === 422 && store.json('requests/' + rid).status === 'ready', 'callback: a failure after READY never downgrades it'); }
{ const { deps, store } = await setup();
  ok((await callback(Object.assign({}, deps, { secret: '' }), readyResult('r' + 'a'.repeat(24), newTok()))).status === 503, 'callback: no JOURNAL_CALLBACK_SECRET -> 503, fails closed');
  const prod = await callback(Object.assign({}, deps, { deliveryStore: null, deliveryStoreName: null }), readyResult('r' + 'a'.repeat(24), newTok()));
  ok(prod.status === 503 && prod.body.code === 'delivery_not_configured', 'callback: production context (no delivery store) -> 503');
  const wrongCfg = await callback(Object.assign({}, deps, { deliveryStoreName: 'journal-delivery' }), readyResult('r' + 'a'.repeat(24), newTok(), { delivery_store: 'journal-delivery' }));
  ok(wrongCfg.status === 503 && store.keys('downloads/').length === 0, 'callback: journal-delivery is never accepted, even if wired by mistake'); }
/* concurrent finalization: exactly one capability */
{ const { deps, store, rid, result } = await setup();
  const rs = await Promise.all(Array.from({ length: 10 }, () => callback(deps, result)));
  ok(rs.every(r => r.status === 200) && rs.filter(r => r.body.created).length === 1, 'finalize concurrency: 10 simultaneous valid callbacks -> one created');
  ok(store.keys('downloads/').length === 1 && store.keys('downloads/')[0] === 'downloads/' + store.json('requests/' + rid).download_token, 'finalize concurrency: exactly one mapping, the one in the record'); }

/* ======================================================= 5. private download */
{ const { deps, store, rid, result } = await setup();
  await callback(deps, result);
  const tok = store.json('requests/' + rid).download_token;
  const r = await dl(deps, tok);
  const body = Buffer.from(await r.arrayBuffer());
  const hs = JSON.stringify([...r.headers]);
  ok(r.status === 200 && body.equals(pdfBytes), 'download: valid token streams the exact PDF bytes');
  ok(r.headers.get('content-type') === 'application/pdf' && r.headers.get('content-disposition') === 'attachment; filename="golondon-kids-journal.pdf"', 'download: application/pdf, attachment, generic filename');
  ok(r.headers.get('cache-control') === 'no-store, private' && r.headers.get('x-robots-tag') === 'noindex, nofollow' && r.headers.get('referrer-policy') === 'no-referrer' && r.headers.get('content-length') === String(pdfBytes.length), 'download: no-store, noindex, no-referrer, exact length');
  ok(!hs.includes(tok) && !hs.includes(result.delivery_token) && !hs.includes(rid) && !/nou|נועה|example/i.test(hs) && !/blob|netlify/i.test(hs), 'download: no token, request id, name or Blob URL in any header');
  ok(r.status !== 302 && !r.headers.get('location'), 'download: streamed, never a redirect to a raw Blob URL');
  ok(store.json('requests/' + rid).status === 'ready', 'download: READY does not become DELIVERED by downloading');
  const r2 = await dl(deps, tok);
  ok(r2.status === 200, 'download: works again until expiry');
  const exp = await dl(deps, tok, { deps: { now: () => at(7 * DAY) } });
  ok(exp.status === 410, 'download: at the capability expiry -> 410');
  ok((await dl(deps, tok, { deps: { now: () => at(7 * DAY - 1) } })).status === 200, 'download: one millisecond before expiry still served');
  const miss = await dl(deps, crypto.randomBytes(32).toString('base64url'));
  ok(miss.status === 404, 'download: unknown token -> 404');
  for (const t of ['', 'abc', tok + 'x', tok.slice(1), result.delivery_token, '..%2F' + tok.slice(5), '%E0%A4%A' + tok.slice(9), encodeURIComponent(tok.slice(0, 42) + '='), rid]) ok((await dl(deps, t)).status === 404, 'download: malformed or foreign token ' + JSON.stringify(t.slice(0, 12)) + ' -> 404');
  ok((await dl(deps, tok, { method: 'POST' })).status === 405, 'download: GET only');
  const prod = await dl(Object.assign({}, deps, { deliveryStore: null }), tok, { deps: { deliveryStoreName: null } });
  ok(prod.status === 404, 'download: production context (no delivery store) -> 404');
  const wrongStore = await dl(deps, tok, { deps: { deliveryStoreName: 'journal-delivery' } });
  ok(wrongStore.status === 404, 'download: journal-delivery never served');
  const errBody = await miss.text();
  ok(miss.headers.get('content-type').startsWith('text/plain') && !errBody.includes(tok) && miss.headers.get('cache-control') === 'no-store, private', 'download: errors are plain, uncached, tokenless');
  /* the file disappears, or belongs to someone else */
  const md = (await deps.deliveryStore.getMetadata('pdf/' + result.delivery_token)).metadata;
  await deps.deliveryStore.set('pdf/' + result.delivery_token, pdfBytes, { metadata: Object.assign({}, md, { request_id: 'r' + 'd'.repeat(24) }) });
  ok((await dl(deps, tok)).status === 404, 'download: file metadata for another request -> 404');
  await deps.deliveryStore.set('pdf/' + result.delivery_token, pdfBytes, { metadata: Object.assign({}, md, { pdf_size: A.MAX_STREAM_BYTES + 1 }) });
  ok((await dl(deps, tok)).status === 503, 'download: a file above the 20 MB streamed-response limit fails closed (503), never truncated');
  await deps.deliveryStore.delete('pdf/' + result.delivery_token);
  ok((await dl(deps, tok)).status === 404, 'download: missing file -> 404');
  /* mapping without a matching record */
  await store.delete('requests/' + rid);
  ok((await dl(deps, tok)).status === 404, 'download: mapping without its request -> 404'); }
{ const { deps, store, rid, result } = await setup();
  await callback(deps, result);
  const rec = store.json('requests/' + rid);
  await store.set('downloads/forged' + 'x'.repeat(37), JSON.stringify({ request_id: rid, delivery_store: PREVIEW, delivery_token: result.delivery_token, expires_at: rec.expires_at }));
  ok((await dl(deps, 'forged' + 'x'.repeat(37))).status === 404, 'download: a mapping that is not the record\'s own token -> 404'); }

/* ======================================================= 6. reconciliation */
{ const { deps, store, dstore, rid, result } = await setup();
  const rdeps = Object.assign({ deliveryStoreName: PREVIEW, dispatcher: mockDispatcher(), now: () => at(40 * MIN) }, deps);
  const c1 = await A.reconcile(rdeps);
  const rec = store.json('requests/' + rid);
  ok(c1.checked === 1 && c1.finalized === 1 && rec.status === 'ready' && A.DOWNLOAD_TOKEN.test(rec.download_token), 'reconcile: dispatched request with a ready index -> READY ' + JSON.stringify(c1));
  ok(store.json('downloads/' + rec.download_token).delivery_token === result.delivery_token, 'reconcile: same mapping shape as the callback');
  const c2 = await A.reconcile(rdeps);
  ok(c2.checked === 0 && store.keys('downloads/').length === 1 && store.json('requests/' + rid).download_token === rec.download_token, 'reconcile: second run touches nothing (ready is not awaiting)');
  const late = await callback(deps, result);
  ok(late.status === 200 && late.body.created === false && store.keys('downloads/').length === 1, 'reconcile then late callback: idempotent, one capability');
  ok(rdeps.dispatcher.calls.length === 0, 'reconcile: no dispatch for a request that has a result'); }
{ /* callback first, reconcile afterwards */
  const { deps, store, rid, result } = await setup();
  await callback(deps, result);
  const tok = store.json('requests/' + rid).download_token;
  await A.reconcile(Object.assign({ deliveryStoreName: PREVIEW, now: () => at(40 * MIN) }, deps));
  ok(store.json('requests/' + rid).download_token === tok && store.keys('downloads/').length === 1, 'reconcile after callback: no second token'); }
{ /* concurrent callback and reconcile */
  const { deps, store, result } = await setup();
  await Promise.all([callback(deps, result), A.reconcile(Object.assign({ deliveryStoreName: PREVIEW, now: () => at(20 * MIN) }, deps)), callback(deps, result)]);
  ok(store.keys('downloads/').length === 1, 'reconcile + callbacks racing: exactly one capability'); }
{ const store = new MemoryStore(), dstore = new MemoryStore();
  const manual = await post(store, form({ email: 'manual@example.com' }));
  const failD = mockDispatcher(() => 'unavailable');
  await post(store, form({ email: 'failed@example.com' }), { dispatcher: failD });
  const okD = mockDispatcher();
  await post(store, form({ email: 'waiting@example.com' }), { dispatcher: okD });
  const failedRid = failD.calls[0].request_id, waitingRid = okD.calls[0].request_id;
  const manualRid = store.keys('requests/').map(k => k.slice(9)).find(r => r !== failedRid && r !== waitingRid);
  await deliver(dstore, readyResult(manualRid, newTok()));    /* even with an index, a manual request is not touched */
  const redisp = mockDispatcher();
  const c = await A.reconcile({ store, deliveryStore: dstore, deliveryStoreName: PREVIEW, dispatcher: redisp, now: () => at(5 * MIN) });
  ok(manual.body.status === 'received' && store.json('requests/' + manualRid).status === 'accepted' && !store.json('requests/' + manualRid).download_token, 'reconcile: manual (never dispatched) requests untouched');
  ok(c.checked === 2 && c.redispatched === 1 && c.waiting === 1 && redisp.calls.length === 1 && redisp.calls[0].request_id === failedRid, 'reconcile: dispatch_failed re-dispatched with the same id, dispatched-without-result waits ' + JSON.stringify(c));
  ok(store.json('requests/' + failedRid).status === 'dispatched' && store.keys('slots/').length === 3 && store.keys('requests/').length === 3, 'reconcile: retry consumed no slot, created no request');
  /* an index that names another store, or another request, is not finalized */
  await deliver(dstore, readyResult(waitingRid, newTok(), { delivery_store: 'journal-delivery' }));
  const c3 = await A.reconcile({ store, deliveryStore: dstore, deliveryStoreName: PREVIEW, dispatcher: null, now: () => at(6 * MIN) });
  ok(store.json('requests/' + waitingRid).status === 'dispatched' && c3.errors >= 1, 'reconcile: index naming journal-delivery is rejected by the same validation');
  await dstore.set('index/' + waitingRid, JSON.stringify(readyResult(failedRid, newTok())));
  const c4 = await A.reconcile({ store, deliveryStore: dstore, deliveryStoreName: PREVIEW, dispatcher: null, now: () => at(6 * MIN) });
  ok(store.json('requests/' + waitingRid).status === 'dispatched' && store.json('requests/' + failedRid).status === 'dispatched' && c4.errors >= 1, 'reconcile: index whose request_id differs from its key is rejected');
  ok((await A.reconcile({ store, deliveryStore: null, deliveryStoreName: null, now: () => at(6 * MIN) })).skipped === 'no_delivery_store', 'reconcile: production context (no delivery store) does nothing');
  ok((await A.reconcile({ store, deliveryStore: dstore, deliveryStoreName: 'journal-delivery', now: () => at(6 * MIN) })).skipped === 'no_delivery_store', 'reconcile: journal-delivery never scanned');
  const listed = [];
  const spy = Object.assign(Object.create(Object.getPrototypeOf(dstore)), dstore, { list: async o => { listed.push(o && o.prefix); return dstore.list(o); } });
  await A.reconcile({ store, deliveryStore: spy, deliveryStoreName: PREVIEW, now: () => at(6 * MIN) });
  ok(listed.length === 0, 'reconcile: reads index/<request_id> directly, never lists or scans the delivery store'); }

/* ======================================================= 7. retention */
{ const { deps, store, dstore, rid, result } = await setup();
  await callback(deps, result);
  const rec = store.json('requests/' + rid);
  const p1 = await purge(store, at(7 * DAY - 1));
  ok(p1.requests === 0 && p1.downloads === 0 && store.keys('downloads/').length === 1, 'retention: before 7 days nothing is purged');
  const d1 = await A.purgeDelivery(dstore, PREVIEW, new Date(Date.parse(rec.download_expires_at) - 1));
  ok(d1.pdf === 0 && d1.index === 0 && (await dl(deps, rec.download_token, { deps: { now: () => new Date(Date.parse(rec.download_expires_at) - 1) } })).status === 200, 'retention: a file is never deleted before its download expiry');
  const p2 = await purge(store, at(7 * DAY));
  ok(p2.requests === 1 && p2.dedupe === 1 && p2.downloads === 1, 'retention: at 7 days the request (email, first name, route), dedupe key and download mapping go ' + JSON.stringify(p2));
  ok(store.keys('requests/').length === 0 && store.keys('downloads/').length === 0 && store.keys('slots/').length === 1, 'retention: no PII left, slot kept as the count');
  const d2 = await A.purgeDelivery(dstore, PREVIEW, new Date(Date.parse(result.expires_at)));
  ok(d2.pdf === 1 && d2.index === 1 && dstore.keys('').length === 0, 'retention: worker PDF and index deleted at their expiry ' + JSON.stringify(d2)); }
{ const dstore = new MemoryStore();
  await dstore.set('pdf/' + newTok(), pdfBytes);                             /* no metadata: can never be downloaded */
  const keep = readyResult('r' + 'e'.repeat(24), newTok());
  await deliver(dstore, keep);
  await dstore.set('index/r' + 'f'.repeat(24), '{"status":"ready"}');
  const d = await A.purgeDelivery(dstore, PREVIEW, at(DAY));
  ok(d.pdf === 1 && d.index === 1 && dstore.keys('pdf/').length === 1 && dstore.keys('index/').length === 1, 'retention: undated delivery items removed, valid ones kept');
  ok((await A.purgeDelivery(dstore, 'journal-delivery', at(30 * DAY))).skipped === 'no_delivery_store' && (await A.purgeDelivery(null, null, at(30 * DAY))).skipped === 'no_delivery_store' && dstore.keys('').length === 2, 'retention: production / journal-delivery never purged from here'); }
{ const store = new MemoryStore();
  await store.set('downloads/' + 'z'.repeat(43), JSON.stringify({ request_id: 'r' + 'a'.repeat(24), expires_at: at(DAY).toISOString() }));
  await store.set('downloads/' + 'y'.repeat(43), '{}');
  const p = await purge(store, at(DAY - 1));
  ok(p.downloads === 1 && store.keys('downloads/').length === 1, 'retention: undated mapping removed, valid mapping kept until expiry'); }

/* ======================================================= 8. isolation, public status, delivered */
ok(A.deliveryStoreFor({ deploy: { context: 'production' } }) === null, 'isolation: production -> no delivery store (fails closed)');
for (const c of ['deploy-preview', 'branch-deploy', 'dev', undefined]) ok(A.deliveryStoreFor(c === undefined ? undefined : { deploy: { context: c } }) === PREVIEW, 'isolation: ' + c + ' -> journal-delivery-preview');
ok(A.ACCEPTED_DELIVERY_STORES.join() === PREVIEW && !A.deliveryAllowed('journal-delivery') && !A.deliveryAllowed('journal-beta'), 'isolation: only journal-delivery-preview is accepted');
ok(A.dispatcherFor({ deploy: { context: 'production' } }, GH_TOKEN) === null, 'isolation: production never dispatches, even with a token set');
ok(A.dispatcherFor({ deploy: { context: 'deploy-preview' } }, '') === null && typeof A.dispatcherFor({ deploy: { context: 'deploy-preview' } }, GH_TOKEN) === 'function', 'isolation: preview dispatches only with the server token');
{ const { deps, store, rid, result } = await setup();
  await callback(deps, result);
  const rec = store.json('requests/' + rid);
  const ps = publicStatus(rec, at(HOUR()));
  ok(Object.keys(ps).sort().join() === 'download_ready,status' && ps.status === 'ready' && ps.download_ready === true, 'public status: only status and download_ready');
  const pss = JSON.stringify(ps);
  ok(!pss.includes(rec.download_token) && !pss.includes(result.delivery_token) && !pss.includes(rid) && !/example|נועה|route/.test(pss), 'public status: no token, id, email, name or route');
  const d = await markDelivered(store, rid, at(HOUR()));
  ok(d.changed && store.json('requests/' + rid).status === 'delivered', 'delivered: only through the explicit step (not called anywhere yet)');
  ok((await dl(deps, rec.download_token)).status === 200, 'delivered: the download keeps working until expiry'); }
function HOUR() { return 60 * MIN; }
{ const src = ['netlify/functions/journal-beta-request.mjs', 'netlify/functions/journal-worker-callback.mjs', 'netlify/functions/journal-download.mjs', 'netlify/functions/journal-beta-reconcile.mjs', 'netlify/functions/journal-beta-purge.mjs', 'netlify/journal-lib/journal-automation.mjs', 'netlify/journal-lib/journal-state.mjs']
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  ok(!/markDelivered\(/.test(src.replace(/export async function markDelivered\(/, '')), 'delivered: no code path calls markDelivered');
  ok(!/ghp_|github_pat_[A-Za-z0-9]|BEGIN [A-Z ]*PRIVATE KEY/.test(src), 'secrets: no token literal in the function sources');
  ok(!/console\.(log|warn|error)\([^)]*(token|email|first_name|route_code|request_id)/i.test(src), 'logs: no console call mentions a token, email, name, route or request id');
  ok(!/['"]journal-delivery['"]/.test(src), 'isolation: the production store name journal-delivery is not wired anywhere in the website code');
  const client = ['journal-beta.js', 'kids-journal-beta.html', 'planner.html'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  ok(!/JOURNAL_GITHUB_DISPATCH_TOKEN|JOURNAL_CALLBACK_SECRET|api\.github\.com|repository_dispatch|journal-delivery|download_token|delivery_token/.test(client), 'client: no dispatch token, callback secret, GitHub API, delivery store or token in browser files'); }

/* ======================================================= 9. no token / PII in any log */
{ const all = LOGS.join('\n');
  ok(!all.includes(GH_TOKEN) && !all.includes(CB_SECRET) && !/example\.com|נועה/.test(all) && !/[0-9a-f]{64}/.test(all) && !/[A-Za-z0-9_-]{43}/.test(all.replace(/journal|reconcile|callback/g, '')), 'logs: nothing printed contains a token, secret, email or name (' + LOGS.length + ' lines)'); }

/* ======================================================= 10. real @netlify/blobs client (API compatibility) */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jb-auto-blobs-'));
const server = new BlobsServer({ directory: dir, token: 'local-test-token', port: 0 });
const { port } = await server.start();
let n = 0;
const rawStore = name => getStore({ name: (name || 'jb-auto-test') + '-' + (++n), siteID: 'local-site', token: 'local-test-token',
  edgeURL: 'http://localhost:' + port, uncachedEdgeURL: 'http://localhost:' + port, consistency: 'strong' });
/*
  The local BlobsServer does not send an ETag header on GET (the hosted API does: getWithMetadata documents data +
  metadata + etag), but its list() returns each entry's etag and its PUT honours If-Match with the same value. The
  adapter fills the missing read etag from list(), so the real If-Match path of the server is exercised.
*/
const realStore = name => {
  const s = rawStore(name);
  const etagOf = async k => ((await s.list({ prefix: k })).blobs.find(b => b.key === k) || {}).etag;
  return { set: (k, v, o) => s.set(k, v, o), get: (k, o) => s.get(k, o), delete: k => s.delete(k), list: o => s.list(o),
    getMetadata: async k => { const r = await s.getMetadata(k); return r && Object.assign(r, { etag: r.etag || await etagOf(k) }); },
    getWithMetadata: async (k, o) => { const r = await s.getWithMetadata(k, o); return r && Object.assign(r, { etag: r.etag || await etagOf(k) }); } };
};
{ const raw = rawStore();
  await raw.set('k', '{}');
  const rg = await raw.getWithMetadata('k', { type: 'json' });
  const rec = await (await import('../../netlify/journal-lib/journal-state.mjs')).updateRecord(raw, 'k'.replace('k', 'x'), () => ({}));
  await raw.set('requests/rx', JSON.stringify({ status: 'accepted', expires_at: at(DAY).toISOString() }));
  const noEtag = await (await import('../../netlify/journal-lib/journal-state.mjs')).updateRecord(raw, 'rx', r => Object.assign({}, r, { status: 'dispatched' }));
  ok(rg.etag === undefined && rec.code === 'unknown_request' && noEtag.code === 'conflict' && (await raw.get('requests/rx', { type: 'json' })).status === 'accepted', 'fail closed: a read without an etag never leads to an unconditional write'); }
{ const s = realStore();
  await s.set('k', JSON.stringify({ a: 1 }), { metadata: { expires_at: 'x' } });
  const g = await s.getWithMetadata('k', { type: 'json' });
  const stale = await s.set('k', '{"a":2}', { onlyIfMatch: '"not-the-etag"' });
  const fresh = await s.set('k', '{"a":3}', { onlyIfMatch: g.etag, metadata: { expires_at: 'y' } });
  const m = await s.getMetadata('k');
  ok(g.data.a === 1 && typeof g.etag === 'string' && g.metadata.expires_at === 'x', 'real client: getWithMetadata json returns data, etag, metadata');
  ok(stale.modified === false && fresh.modified === true && (await s.get('k', { type: 'json' })).a === 3 && m.metadata.expires_at === 'y', 'real client: onlyIfMatch refuses a stale etag, accepts the current one');
  ok((await s.getWithMetadata('nope', { type: 'json' })) === null && (await s.getMetadata('nope')) === null, 'real client: missing keys -> null'); }
{ const store = realStore('jb-beta'), dstore = realStore('jb-delivery');
  const { rid, result, deps } = await setup({ store, dstore });
  const v = await callback(deps, result);
  const rec = await store.get('requests/' + rid, { type: 'json' });
  ok(v.status === 200 && rec.status === 'ready' && A.DOWNLOAD_TOKEN.test(rec.download_token), 'real client: dispatch -> signed callback -> READY');
  ok((await callback(deps, result)).body.created === false && (await store.list({ prefix: 'downloads/' })).blobs.length === 1, 'real client: repeat callback idempotent');
  const r = await dl(deps, rec.download_token);
  ok(r.status === 200 && Buffer.from(await r.arrayBuffer()).equals(pdfBytes), 'real client: download streams the PDF from the delivery store');
  const p = await purge(store, at(7 * DAY));
  const d = await A.purgeDelivery(dstore, PREVIEW, new Date(Date.parse(result.expires_at)));
  ok(p.requests === 1 && p.downloads === 1 && d.pdf === 1 && d.index === 1, 'real client: retention purge on both stores'); }
{ const store = realStore('jb-beta'), dstore = realStore('jb-delivery');
  const { rid, deps } = await setup({ store, dstore });
  const c = await A.reconcile(Object.assign({ deliveryStoreName: PREVIEW, now: () => at(40 * MIN) }, deps));
  ok(c.finalized === 1 && (await store.get('requests/' + rid, { type: 'json' })).status === 'ready', 'real client: reconciliation finalizes from index/<request_id>'); }
await server.stop();
fs.rmSync(dir, { recursive: true, force: true });

say(pass + ' passed, ' + fail + ' failed');
say(fail ? 'FAILED' : 'ALL PASS');
process.exit(fail ? 1 : 0);
