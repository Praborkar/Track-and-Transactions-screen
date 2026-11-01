import { computeMonthTotals, paiseToPlain } from '../src/domain';
import { PausedError, getJson, isPage } from '../src/sync/api';
import { SyncEngine } from '../src/sync/engine';
import { MemoryStore } from '../src/sync/memoryStore';
import { makeDeps, makeFakeServer } from './helpers/fakeServer';

const checkpoint = require('../mock/fixtures/checkpoint.json');
const fixtureList = require('../mock/fixtures/transactions.json') as Array<{ id: string }>;

const engineFor = (store: MemoryStore, server: ReturnType<typeof makeFakeServer>, sleeps: number[] = []) =>
  new SyncEngine({ store, deps: makeDeps(server, sleeps), now: () => 1_700_000_000_000, newRunId: () => `run${Math.random()}` });

const totalsOf = (e: SyncEngine) => {
  const out: Record<string, { spend: string; income: string }> = {};
  for (const [m, t] of computeMonthTotals(e.getSnapshot().ledger.txns.values())) out[m] = { spend: paiseToPlain(t.spent), income: paiseToPlain(t.earned) };
  return out;
};

const idsOf = (s: MemoryStore) => [...s.txns.keys()].sort();

async function uninterrupted() {
  const store = new MemoryStore();
  const e = engineFor(store, makeFakeServer());
  await e.init();
  await e.requestSync('test');
  return { store, e };
}

describe('full sync', () => {
  it('reaches the checkpoint on a calm server', async () => {
    const { store, e } = await uninterrupted();
    expect(e.getSnapshot().status.kind).toBe('idle');
    expect(store.txns.size).toBe(checkpoint.transaction_count);
    expect(totalsOf(e)).toEqual(checkpoint.months);
    expect(store.state.token).not.toBeNull();
    expect(store.state.phase).toBe('idle');
  });

  it('survives the 500, the 429 and the 503 and still reaches the checkpoint', async () => {
    const sleeps: number[] = [];
    const store = new MemoryStore();
    const e = engineFor(store, makeFakeServer({ hostile: true }), sleeps);
    await e.init();
    await e.requestSync('test');
    expect(e.getSnapshot().status.kind).toBe('idle');
    expect(totalsOf(e)).toEqual(checkpoint.months);
    expect(sleeps.some((ms) => ms >= 3000)).toBe(true); // waited for Retry-After: 3
    expect(sleeps.some((ms) => ms >= 2000)).toBe(true); // and Retry-After: 2 on the changes feed
  });
});

describe('a failure never costs what was visible', () => {
  it.each([
    ['500', { status: 500 }],
    ['429', { status: 429, retryAfter: '1' }],
  ])('keeps rows and stored data when every list call returns %s', async (_n, fail) => {
    const { store } = await uninterrupted();
    const before = idsOf(store);
    // a second app launch against a server whose list endpoint is now down, with a token the server rejects
    const bad = makeFakeServer({ listStatus: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, fail])) });
    const stale = new MemoryStore();
    Object.assign(stale, { txns: new Map(store.txns), tombstones: new Map(store.tombstones), state: { ...store.state, token: 'st_old' } });
    const e = engineFor(stale, bad);
    await e.init();
    await e.requestSync('refresh');
    expect(e.getSnapshot().status.kind).toBe('paused');
    expect(e.getSnapshot().ledger.txns.size).toBe(before.length);
    expect(idsOf(stale)).toEqual(before);
  });

  it('keeps rows when the connection drops mid-page', async () => {
    const store = new MemoryStore();
    const e = engineFor(store, makeFakeServer({ dropFromListCall: 4 }));
    await e.init();
    await e.requestSync('start');
    expect(e.getSnapshot().status.kind).toBe('paused');
    expect(e.getSnapshot().ledger.txns.size).toBeGreaterThan(0); // pages 1-3 are shown
    expect(store.txns.size).toBe(e.getSnapshot().ledger.txns.size);
  });

  it('stops after 4 attempts per page and reports it', async () => {
    const calls: number[] = [];
    const deps = makeDeps({ fetch: (async () => ({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) })) as unknown as typeof fetch }, calls);
    await expect(getJson(deps, '/x', isPage)).rejects.toBeInstanceOf(PausedError);
    expect(calls).toHaveLength(3); // sleeps between 4 attempts
  });
});

describe('sync survives a kill', () => {
  it('stops after page 7, restarts, continues from the saved cursor to the same rows', async () => {
    const reference = await uninterrupted();

    const store = new MemoryStore();
    const a = engineFor(store, makeFakeServer({ dropFromListCall: 8 })); // the app is killed after 7 pages
    await a.init();
    await a.requestSync('start');
    expect(store.state.phase).toBe('full');
    expect(store.state.cursor).not.toBeNull();
    expect(store.state.token).toBeNull(); // never saved before the last page
    expect(store.txns.size).toBeLessThan(checkpoint.transaction_count);
    const savedCursor = store.state.cursor!;

    const server = makeFakeServer();
    const b = engineFor(store, server);
    await b.init();
    expect(b.getSnapshot().ledger.txns.size).toBe(store.txns.size); // rows from before the kill are visible at once
    await b.requestSync('relaunch');
    expect(server.log.find((l) => l.startsWith('/v1/transactions?'))).toContain(encodeURIComponent(savedCursor));
    expect(b.pagesFetched).toBeLessThan(reference.e.pagesFetched);
    expect(idsOf(store)).toEqual(idsOf(reference.store));
    expect(totalsOf(b)).toEqual(checkpoint.months);
  });

  it('a crash while writing page 5 leaves page 4 intact and resumes from it', async () => {
    const store = new MemoryStore();
    const a = engineFor(store, makeFakeServer());
    await a.init();
    store.failNextCommit = false;
    const orig = store.commit.bind(store);
    let n = 0;
    store.commit = async (c) => {
      if (++n === 6) throw new Error('simulated crash during commit'); // begin + 5 pages
      return orig(c);
    };
    await a.requestSync('start');
    expect(a.getSnapshot().status.kind).toBe('failed');
    const cursorAfterPage4 = store.state.cursor;
    const rowsAfterPage4 = store.txns.size;
    expect(rowsAfterPage4).toBeGreaterThan(0);

    store.commit = orig;
    const b = engineFor(store, makeFakeServer());
    await b.init();
    expect(store.state.cursor).toBe(cursorAfterPage4);
    await b.requestSync('relaunch');
    expect(store.txns.size).toBe(checkpoint.transaction_count);
  });
});

describe('the server rejects our token (410)', () => {
  it('keeps every cached row on screen while resyncing, deletes nothing if interrupted, then sweeps what the server dropped', async () => {
    const { store } = await uninterrupted();
    const before = idsOf(store);

    // the server no longer has one row that used to be there
    const touched = new Set((require('../mock/fixtures/changes.json') as Array<{ id: string }>).map((c) => c.id));
    const gone = fixtureList.slice(150).find((r) => !touched.has(r.id))!.id;
    const smaller = fixtureList.filter((r) => r.id !== gone);

    const seen: number[] = [];
    const flaky = makeFakeServer({ list: smaller, dropFromListCall: 3 });
    const e1 = engineFor(store, flaky);
    store.state = { ...store.state, token: 'st_expired' };
    await e1.init();
    e1.subscribe((s) => seen.push(s.ledger.txns.size));
    await e1.requestSync('refresh');
    expect(e1.getSnapshot().status.kind).toBe('paused');
    expect(Math.min(...seen)).toBe(before.length); // never fewer rows than before
    expect(idsOf(store)).toEqual(before); // an interrupted resync deleted nothing

    const e2 = engineFor(store, makeFakeServer({ list: smaller }));
    await e2.init();
    await e2.requestSync('refresh again');
    expect(e2.getSnapshot().status.kind).toBe('idle');
    expect(store.txns.has(gone)).toBe(false);
    expect(store.txns.size).toBe(before.length - 1);
  });
});

describe('two syncs at once', () => {
  it('5 simultaneous requests share one sync and make one sync worth of calls', async () => {
    const server = makeFakeServer();
    const store = new MemoryStore();
    const e = engineFor(store, server);
    await e.init();
    const ps = Array.from({ length: 5 }, (_, i) => e.requestSync(`r${i}`));
    expect(new Set(ps).size).toBe(1);
    await Promise.all(ps);
    const reference = makeFakeServer();
    await (async () => {
      const s2 = new MemoryStore();
      const e2 = engineFor(s2, reference);
      await e2.init();
      await e2.requestSync('one');
    })();
    expect(server.log.length).toBe(reference.log.length);
    expect(store.txns.size).toBe(checkpoint.transaction_count);
  });

  it('a cancelled run cannot write', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let held = false;
    const server = makeFakeServer({
      onRequest: async (p) => {
        if (p === '/v1/transactions' && !held) {
          held = true;
          await gate;
        }
      },
    });
    const store = new MemoryStore();
    const e = engineFor(store, server);
    await e.init();
    const p = e.requestSync('first');
    e.cancel();
    release();
    await p;
    expect(store.txns.size).toBe(0);
  });
});

describe('retry timing', () => {
  it('waits for Retry-After and not less', async () => {
    const sleeps: number[] = [];
    const server = makeFakeServer({ listStatus: { 1: { status: 429, retryAfter: '3' } } });
    const e = engineFor(new MemoryStore(), server, sleeps);
    await e.init();
    await e.requestSync('t');
    expect(sleeps[0]).toBeGreaterThanOrEqual(3000);
  });

  it('times out a request after 15 seconds and retries it', async () => {
    jest.useFakeTimers();
    try {
      let calls = 0;
      const hang = (async (_u: string, init?: { signal?: AbortSignal }) => {
        calls++;
        if (calls === 1) return new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ items: [], next_cursor: null, sync_token: 't' }) };
      }) as unknown as typeof fetch;
      const deps = makeDeps({ fetch: hang });
      const p = getJson(deps, '/v1/transactions', isPage);
      await jest.advanceTimersByTimeAsync(14999);
      expect(calls).toBe(1);
      await jest.advanceTimersByTimeAsync(2);
      await expect(p).resolves.toMatchObject({ next_cursor: null });
      expect(calls).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
