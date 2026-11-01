import type { Ledger, Txn } from '../domain';
import { initialSyncState } from './types';
import type { Account, Commit, CommitResult, Store, SyncState } from './types';

/**
 * A Store that lives in memory with the same all-or-nothing commit as the SQLite one.
 * Used by the tests, where `failNextCommit` simulates the app dying mid-write.
 */
export class MemoryStore implements Store {
  txns = new Map<string, Txn>();
  seenRun = new Map<string, string>();
  tombstones = new Map<string, number>();
  state: SyncState = initialSyncState();
  accounts: Account[] = [];
  settings = new Map<string, string>();
  commits = 0;
  failNextCommit = false;

  async load(): Promise<{ ledger: Ledger; state: SyncState; accounts: Account[] }> {
    return { ledger: { txns: new Map(this.txns), tombstones: new Map(this.tombstones) }, state: structuredClone(this.state), accounts: this.accounts };
  }

  async commit(c: Commit): Promise<CommitResult> {
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error('simulated crash during commit');
    }
    // build the whole result first so a throw leaves nothing half-written
    const txns = new Map(this.txns);
    const seen = new Map(this.seenRun);
    const tombs = new Map(this.tombstones);
    const run = c.state.runId;
    for (const t of c.upserts) txns.set(t.id, t);
    for (const id of c.removeIds) {
      txns.delete(id);
      seen.delete(id);
    }
    for (const [id, ts] of c.tombstones) tombs.set(id, ts);
    if (run) for (const id of c.stampIds) if (txns.has(id)) seen.set(id, run);
    const swept: string[] = [];
    if (c.sweepUnstamped && run) {
      for (const id of [...txns.keys()]) {
        if (seen.get(id) !== run) {
          txns.delete(id);
          seen.delete(id);
          swept.push(id);
        }
      }
    }
    this.txns = txns;
    this.seenRun = seen;
    this.tombstones = tombs;
    this.state = structuredClone(c.state);
    this.commits++;
    return { swept };
  }

  async saveAccounts(a: Account[]): Promise<void> {
    this.accounts = a;
  }

  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }
}
