#!/usr/bin/env node
// Simplify Money — Track API (mock)
// Zero dependencies. Node 18+.   node server.js   ->  http://0.0.0.0:4010
//
// This server behaves the way our production API does. That includes the parts
// nobody likes about it.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 4010);
const FIX = process.env.FIXTURES || path.join(__dirname, 'fixtures');
const CALM = process.env.SM_CALM === '1';

const load = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const accounts = load('accounts.json');
const transactions = load('transactions.json');
const changes = load('changes.json');
const summary = load('summary_months.json');

const PAGE_DEFAULT = 50;
const PAGE_MAX = 100;
const TOKEN_FULL = 'st_' + Buffer.from(String(transactions.length)).toString('base64url');
const TOKEN_AFTER = 'st_' + Buffer.from(String(transactions.length + changes.length) + '.c').toString('base64url');

// deterministic "randomness" so every run of the server behaves the same way
let s = 0x2f6b7a;
const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const counters = { list: 0, changes: 0 };

const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const dec = (c) => { try { return JSON.parse(Buffer.from(c, 'base64url').toString()); } catch { return null; } };

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Retry-After, X-Request-Id',
    'X-Request-Id': Math.floor(rnd() * 1e12).toString(36),
    ...headers,
  });
  res.end(payload);
}

function later(ms, fn) { setTimeout(fn, CALM ? 0 : ms); }

function latency() { return 120 + Math.floor(rnd() * 580); }

function page(list, cursor, limit, extra) {
  let offset = 0;
  if (cursor) {
    const c = dec(cursor);
    if (!c || typeof c.o !== 'number') return { error: 400 };
    offset = c.o;
  }
  const items = list.slice(offset, offset + limit);
  const end = offset + limit >= list.length;
  // cursors are position-based and the server re-sends the boundary record
  const next = end ? null : enc({ o: offset + limit - 1, t: Date.now() % 1000 });
  return { items, next_cursor: next, ...extra };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname.replace(/\/+$/, '');
  if (req.method === 'OPTIONS') return send(res, 204);
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });

  const log = (status, note = '') => console.log(`${new Date().toISOString()} ${status} ${req.method} ${url.pathname}${url.search}${note ? '  ' + note : ''}`);

  if (p === '/v1/health') { log(200); return send(res, 200, { ok: true }); }

  if (p === '/v1/accounts') {
    return later(latency(), () => { log(200); send(res, 200, { items: accounts }); });
  }

  if (p === '/v1/transactions') {
    const n = ++counters.list;
    const limit = Number(url.searchParams.get('limit') || PAGE_DEFAULT);
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) {
      log(400); return send(res, 400, { error: 'invalid_limit', max: PAGE_MAX });
    }
    if (!CALM && n === 6) return later(latency(), () => { log(500, 'boom'); send(res, 500, { error: 'internal_error' }); });
    if (!CALM && n === 11) return later(latency(), () => { log(429); send(res, 429, { error: 'rate_limited' }, { 'Retry-After': '3' }); });
    const body = page(transactions, url.searchParams.get('cursor'), limit, { sync_token: TOKEN_FULL });
    if (body.error) { log(400); return send(res, 400, { error: 'invalid_cursor' }); }
    let delay = latency();
    if (!CALM && n === 3) delay = 4200;                 // a slow page
    if (!CALM && n > 20 && n % 7 === 0) delay = 2600;   // some requests are just slow
    return later(delay, () => { log(200, `${body.items.length} items`); send(res, 200, body); });
  }

  if (p === '/v1/transactions/changes') {
    const n = ++counters.changes;
    const since = url.searchParams.get('since');
    if (!since) { log(400); return send(res, 400, { error: 'since_required' }); }
    if (since !== TOKEN_FULL && since !== TOKEN_AFTER) {
      log(410); return send(res, 410, { error: 'sync_token_expired', detail: 'Do a full sync.' });
    }
    if (!CALM && n === 1) return later(latency(), () => { log(503); send(res, 503, { error: 'unavailable' }, { 'Retry-After': '2' }); });
    const list = since === TOKEN_AFTER ? [] : changes;
    const limit = Number(url.searchParams.get('limit') || PAGE_DEFAULT);
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) { log(400); return send(res, 400, { error: 'invalid_limit', max: PAGE_MAX }); }
    const cursor = url.searchParams.get('cursor');
    let offset = 0;
    if (cursor) { const c = dec(cursor); if (!c) { log(400); return send(res, 400, { error: 'invalid_cursor' }); } offset = c.o; }
    const items = list.slice(offset, offset + limit);
    const end = offset + limit >= list.length;
    const body = { items, next_cursor: end ? null : enc({ o: offset + limit }), sync_token: end ? TOKEN_AFTER : since };
    return later(latency(), () => { log(200, `${items.length} changes`); send(res, 200, body); });
  }

  if (p === '/v1/summary/months') {
    return later(latency(), () => { log(200); send(res, 200, summary); });
  }

  log(404);
  send(res, 404, { error: 'not_found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Track API mock on http://0.0.0.0:${PORT}  (${transactions.length} transactions, ${accounts.length} accounts)`);
  console.log('Reach it from a phone on the same Wi-Fi via your computer\'s LAN IP, e.g. http://192.168.1.20:' + PORT);
});
