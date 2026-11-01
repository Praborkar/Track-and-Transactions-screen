import { applyRecords, emptyLedger } from '../domain';
import type { Ledger } from '../domain';
import { GoneError, PausedError, fetchAccounts, fetchChangesPage, fetchTransactionsPage } from './api';
import type { Deps } from './api';
import { addRejected, initialSyncState } from './types';
import type { Account, Store, SyncState } from './types';

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'syncing'; reason: string; pages: number; fullSync: boolean }
  | { kind: 'paused'; message: string }
  | { kind: 'failed'; message: string };

export interface EngineSnapshot {
  loaded: boolean;
  ledger: Ledger;
  accounts: Account[];
  state: SyncState;
  status: SyncStatus;
}

class Cancelled extends Error {}

export interface EngineOptions {
  store: Store;
  deps: Deps;
  now?: () => number;
  newRunId?: () => string;
}

/**
 * All network data goes through here into the store; screens only read the snapshot.
 * One sync at a time, and every write checks it still belongs to the current run.
 */
export class SyncEngine {
  private store: Store;
  private deps: Deps;
  private now: () => number;
  private newRunId: () => string;
  private epoch = 0;
  private inflight: Promise<void> | null = null;
  private listeners = new Set<(s: EngineSnapshot) => void>();
  private snap: EngineSnapshot = { loaded: false, ledger: emptyLedger(), accounts: [], state: initialSyncState(), status: { kind: 'idle' } };

  /** how many HTTP list/changes pages this engine has fetched (used by tests and the debug view) */
  pagesFetched = 0;

  constructor(o: EngineOptions) {
    this.store = o.store;
    this.deps = o.deps;
    this.now = o.now ?? Date.now;
    this.newRunId = o.newRunId ?? (() => `${this.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`);
  }

  getSnapshot = (): EngineSnapshot => this.snap;

  subscribe = (fn: (s: EngineSnapshot) => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private publish(patch: Partial<EngineSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l(this.snap));
  }

  /** Show what is already on the device. Call once at launch, before the first sync. */
  async init(): Promise<void> {
    const { ledger, state, accounts } = await this.store.load();
    this.publish({ loaded: true, ledger, state, accounts });
  }

  /** The one entry point: app start, pull to refresh, back online and returning to the foreground all call this. */
  requestSync(reason: string): Promise<void> {
    if (this.inflight) return this.inflight;
    const epoch = this.epoch;
    const p = this.run(reason, epoch).finally(() => {
      if (this.inflight === p) this.inflight = null;
    });
    this.inflight = p;
    return p;
  }

  /** Abandon the current sync; nothing it still has in flight can write. */
  cancel(): void {
    this.epoch++;
    this.inflight = null;
  }

  /**
   * The server address changed, so what we hold may belong to another dataset. Keep the rows on
   * screen, drop the token and do a full sync that sweeps whatever the new server does not have.
   */
  async switchServer(): Promise<void> {
    this.cancel();
    const state: SyncState = { ...this.snap.state, phase: 'full', cursor: null, token: null, runId: this.newRunId(), rejected: { total: 0, byReason: {} } };
    await this.store.commit({ upserts: [], removeIds: [], tombstones: [], stampIds: [], sweepUnstamped: false, state });
    this.publish({ state });
    return this.requestSync('server changed');
  }

  private assertCurrent(epoch: number) {
    if (epoch !== this.epoch) throw new Cancelled();
  }

  private async run(reason: string, epoch: number): Promise<void> {
    this.publish({ status: { kind: 'syncing', reason, pages: 0, fullSync: this.snap.state.phase === 'full' } });
    try {
      let { state } = this.snap;
      if (state.phase === 'full') {
        await this.fullSync(epoch);
      } else if (state.token) {
        try {
          await this.changesSync(epoch);
          this.publish({ status: { kind: 'idle' } });
          return;
        } catch (e) {
          if (!(e instanceof GoneError)) throw e;
          await this.beginFull(epoch);
          await this.fullSync(epoch);
        }
      } else {
        await this.beginFull(epoch);
        await this.fullSync(epoch);
      }
      await this.changesSync(epoch);
      this.refreshAccounts(epoch);
      this.publish({ status: { kind: 'idle' } });
    } catch (e) {
      if (e instanceof Cancelled) return;
      // the ledger and the stored rows are untouched: only the status changes
      if (e instanceof PausedError) this.publish({ status: { kind: 'paused', message: `Sync paused: ${e.cause}. Showing saved data.` } });
      else this.publish({ status: { kind: 'failed', message: e instanceof Error ? e.message : 'Sync failed' } });
    }
  }

  private async refreshAccounts(epoch: number) {
    try {
      const accounts = await fetchAccounts(this.deps);
      this.assertCurrent(epoch);
      await this.store.saveAccounts(accounts);
      this.publish({ accounts });
    } catch {
      // nicknames are cosmetic: keep whatever we had
    }
  }

  /** Start a full sync that keeps cached rows on screen until the last page arrives. */
  private async beginFull(epoch: number) {
    this.assertCurrent(epoch);
    const state: SyncState = { ...this.snap.state, phase: 'full', cursor: null, token: null, runId: this.newRunId(), rejected: { total: 0, byReason: {} } };
    await this.store.commit({ upserts: [], removeIds: [], tombstones: [], stampIds: [], sweepUnstamped: false, state });
    this.assertCurrent(epoch);
    this.publish({ state });
  }

  /** Continue (or run) the full sync from the saved cursor. Each page and its cursor are stored together. */
  private async fullSync(epoch: number) {
    for (;;) {
      const { state } = this.snap;
      const page = await fetchTransactionsPage(this.deps, state.cursor);
      this.assertCurrent(epoch);
      this.pagesFetched++;
      const r = applyRecords(this.snap.ledger, page.items);
      const last = page.next_cursor === null;
      const next: SyncState = {
        ...state,
        phase: last ? 'idle' : 'full',
        cursor: page.next_cursor,
        token: last ? page.sync_token : state.token, // saved only with the final page
        runId: last ? null : state.runId,
        rejected: addRejected(state.rejected, r.rejected),
        lastSyncedAt: last ? this.now() : state.lastSyncedAt,
      };
      if (last && !next.token) throw new PausedError('the server gave no sync token');
      const stampState = { ...next, runId: state.runId };
      const res = await this.store.commit({
        upserts: r.changed,
        removeIds: r.removed,
        tombstones: r.newTombstones,
        stampIds: r.seenIds,
        sweepUnstamped: last,
        state: stampState,
      });
      this.assertCurrent(epoch);
      let ledger = r.ledger;
      if (res.swept.length) {
        const txns = new Map(ledger.txns);
        for (const id of res.swept) txns.delete(id);
        ledger = { txns, tombstones: ledger.tombstones };
      }
      const pages = this.snap.status.kind === 'syncing' ? this.snap.status.pages + 1 : 1;
      this.publish({ ledger, state: next, status: { kind: 'syncing', reason: this.snap.status.kind === 'syncing' ? this.snap.status.reason : 'sync', pages, fullSync: !last } });
      if (last) return;
    }
  }

  /** Fetch every page of the changes feed first, then apply them and the new token in one commit. */
  private async changesSync(epoch: number) {
    const since = this.snap.state.token;
    if (!since) throw new GoneError();
    const records: unknown[] = [];
    let cursor: string | null = null;
    let newToken: string | null = null;
    for (;;) {
      const page = await fetchChangesPage(this.deps, since, cursor);
      this.assertCurrent(epoch);
      this.pagesFetched++;
      records.push(...page.items);
      if (page.next_cursor === null) {
        newToken = page.sync_token;
        break;
      }
      cursor = page.next_cursor;
    }
    if (!newToken) throw new PausedError('the server gave no sync token');
    const r = applyRecords(this.snap.ledger, records);
    const state: SyncState = { ...this.snap.state, token: newToken, rejected: addRejected(this.snap.state.rejected, r.rejected), lastSyncedAt: this.now() };
    await this.store.commit({ upserts: r.changed, removeIds: r.removed, tombstones: r.newTombstones, stampIds: [], sweepUnstamped: false, state });
    this.assertCurrent(epoch);
    this.publish({ ledger: r.ledger, state });
  }
}
