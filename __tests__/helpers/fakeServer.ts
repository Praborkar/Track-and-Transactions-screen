import type { Deps } from '../../src/sync/api';

const fixtureList = require('../../mock/fixtures/transactions.json') as unknown[];
const fixtureChanges = require('../../mock/fixtures/changes.json') as unknown[];
const accounts = require('../../mock/fixtures/accounts.json') as unknown[];

const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const dec = (c: string) => JSON.parse(Buffer.from(c, 'base64url').toString());

export interface FakeOptions {
  list?: unknown[];
  changes?: unknown[];
  /** server.js behaviour: 500 on the 6th list call, 429 on the 11th, 503 on the first changes call */
  hostile?: boolean;
  /** list calls that fail with a dropped connection from this call number on */
  dropFromListCall?: number;
  /** extra scripted failures by list call number */
  listStatus?: Record<number, { status: number; retryAfter?: string }>;
  /** called at the start of every request; may return a promise to slow it down */
  onRequest?: (path: string) => Promise<void> | void;
}

/** Same paging quirks as server.js: the next cursor points one row back, tokens are checked. */
export function makeFakeServer(o: FakeOptions = {}) {
  const list = o.list ?? fixtureList;
  const changes = o.changes ?? fixtureChanges;
  const tokenFull = 'st_' + Buffer.from(String(list.length)).toString('base64url');
  const tokenAfter = 'st_' + Buffer.from(String(list.length + changes.length) + '.c').toString('base64url');
  const log: string[] = [];
  const counters = { list: 0, changes: 0 };

  const res = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
  });

  const fetchFn = (async (input: string, init?: { signal?: AbortSignal }) => {
    const url = new URL(input);
    const path = url.pathname;
    log.push(url.pathname + url.search);
    await o.onRequest?.(path);
    if (init?.signal?.aborted) throw new Error('aborted');

    if (path === '/v1/accounts') return res(200, { items: accounts });

    if (path === '/v1/transactions') {
      const n = ++counters.list;
      if (o.dropFromListCall && n >= o.dropFromListCall) throw new TypeError('Network request failed');
      const s = o.listStatus?.[n];
      if (s) return res(s.status, { error: 'scripted' }, s.retryAfter ? { 'Retry-After': s.retryAfter } : {});
      if (o.hostile && n === 6) return res(500, { error: 'internal_error' });
      if (o.hostile && n === 11) return res(429, { error: 'rate_limited' }, { 'Retry-After': '3' });
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const cur = url.searchParams.get('cursor');
      const offset = cur ? dec(cur).o : 0;
      const items = list.slice(offset, offset + limit);
      const end = offset + limit >= list.length;
      return res(200, { items, next_cursor: end ? null : enc({ o: offset + limit - 1, t: Date.now() % 1000 }), sync_token: tokenFull });
    }

    if (path === '/v1/transactions/changes') {
      const n = ++counters.changes;
      const since = url.searchParams.get('since');
      if (since !== tokenFull && since !== tokenAfter) return res(410, { error: 'sync_token_expired' });
      if (o.hostile && n === 1) return res(503, { error: 'unavailable' }, { 'Retry-After': '2' });
      const src = since === tokenAfter ? [] : changes;
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const cur = url.searchParams.get('cursor');
      const offset = cur ? dec(cur).o : 0;
      const items = src.slice(offset, offset + limit);
      const end = offset + limit >= src.length;
      return res(200, { items, next_cursor: end ? null : enc({ o: offset + limit }), sync_token: end ? tokenAfter : since });
    }
    return res(404, {});
  }) as unknown as typeof fetch;

  return { fetch: fetchFn, log, counters, tokenFull, tokenAfter };
}

export function makeDeps(server: { fetch: typeof fetch }, sleeps: number[] = []): Deps {
  return {
    fetch: server.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    baseUrl: () => 'http://fake.test',
  };
}
