import * as SQLite from 'expo-sqlite';
import type { Ledger, Txn } from '../domain';
import { initialSyncState } from './types';
import type { Account, Commit, CommitResult, Store, SyncState } from './types';

const SCHEMA_VERSION = 1;

interface Row {
  id: string;
  account_id: string;
  occurred_at: number;
  direction: 'debit' | 'credit';
  amount_minor: number;
  currency: string;
  inr_minor: number | null;
  merchant: string;
  category: string;
  status: string;
  updated_at: number | null;
  is_transfer: number;
  counter_account: string | null;
  raw: string;
}

const toTxn = (r: Row): Txn => ({
  id: r.id,
  accountId: r.account_id,
  occurredAt: r.occurred_at,
  direction: r.direction,
  amountMinor: r.amount_minor,
  currency: r.currency,
  inrMinor: r.inr_minor,
  merchant: r.merchant,
  category: r.category,
  status: r.status,
  updatedAt: r.updated_at,
  isTransfer: r.is_transfer === 1,
  counterAccountId: r.counter_account,
  raw: safeParse(r.raw),
});

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Rows, tombstones and sync state live in one database; a page and its cursor are written in one transaction. */
export class SqliteStore implements Store {
  private constructor(private db: SQLite.SQLiteDatabase) {}

  static async open(name = 'track.db'): Promise<SqliteStore> {
    const db = await SQLite.openDatabaseAsync(name);
    await db.execAsync('PRAGMA journal_mode = WAL;');
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((row?.user_version ?? 0) < SCHEMA_VERSION) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY NOT NULL,
          account_id TEXT NOT NULL,
          occurred_at INTEGER NOT NULL,
          direction TEXT NOT NULL,
          amount_minor INTEGER NOT NULL,
          currency TEXT NOT NULL,
          inr_minor INTEGER,
          merchant TEXT NOT NULL,
          category TEXT NOT NULL,
          status TEXT NOT NULL,
          updated_at INTEGER,
          is_transfer INTEGER NOT NULL,
          counter_account TEXT,
          raw TEXT NOT NULL,
          seen_run TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_txn_time ON transactions(occurred_at DESC);
        CREATE TABLE IF NOT EXISTS tombstones (id TEXT PRIMARY KEY NOT NULL, deleted_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sync_state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        PRAGMA user_version = ${SCHEMA_VERSION};
      `);
    }
    return new SqliteStore(db);
  }

  async load(): Promise<{ ledger: Ledger; state: SyncState; accounts: Account[] }> {
    const rows = await this.db.getAllAsync<Row>('SELECT * FROM transactions');
    const txns = new Map<string, Txn>();
    for (const r of rows) txns.set(r.id, toTxn(r));
    const tombs = await this.db.getAllAsync<{ id: string; deleted_at: number }>('SELECT id, deleted_at FROM tombstones');
    const tombstones = new Map(tombs.map((t) => [t.id, t.deleted_at] as [string, number]));
    const s = await this.db.getFirstAsync<{ json: string }>('SELECT json FROM sync_state WHERE id = 1');
    const parsed = s ? (safeParse(s.json) as Partial<SyncState> | null) : null;
    const state: SyncState = { ...initialSyncState(), ...(parsed ?? {}) };
    const accRows = await this.db.getAllAsync<{ json: string }>('SELECT json FROM accounts');
    const accounts = accRows.map((a) => safeParse(a.json) as Account).filter(Boolean);
    return { ledger: { txns, tombstones }, state, accounts };
  }

  async commit(c: Commit): Promise<CommitResult> {
    const swept: string[] = [];
    const run = c.state.runId;
    await this.db.withTransactionAsync(async () => {
      for (const t of c.upserts) {
        await this.db.runAsync(
          `INSERT OR REPLACE INTO transactions
            (id, account_id, occurred_at, direction, amount_minor, currency, inr_minor, merchant, category, status, updated_at, is_transfer, counter_account, raw, seen_run)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT seen_run FROM transactions WHERE id = ?))`,
          [t.id, t.accountId, t.occurredAt, t.direction, t.amountMinor, t.currency, t.inrMinor, t.merchant, t.category, t.status, t.updatedAt, t.isTransfer ? 1 : 0, t.counterAccountId, JSON.stringify(t.raw ?? null), t.id],
        );
      }
      for (const id of c.removeIds) await this.db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
      for (const [id, ts] of c.tombstones) await this.db.runAsync('INSERT OR REPLACE INTO tombstones (id, deleted_at) VALUES (?, ?)', [id, ts]);
      if (run) for (const id of c.stampIds) await this.db.runAsync('UPDATE transactions SET seen_run = ? WHERE id = ?', [run, id]);
      if (c.sweepUnstamped && run) {
        const gone = await this.db.getAllAsync<{ id: string }>('SELECT id FROM transactions WHERE seen_run IS NOT ?', [run]);
        for (const g of gone) swept.push(g.id);
        await this.db.runAsync('DELETE FROM transactions WHERE seen_run IS NOT ?', [run]);
      }
      await this.db.runAsync('INSERT OR REPLACE INTO sync_state (id, json) VALUES (1, ?)', [JSON.stringify(c.state)]);
    });
    return { swept };
  }

  async saveAccounts(a: Account[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      for (const acc of a) await this.db.runAsync('INSERT OR REPLACE INTO accounts (id, json) VALUES (?, ?)', [acc.id, JSON.stringify(acc)]);
    });
  }

  async getSetting(key: string): Promise<string | null> {
    const r = await this.db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return r?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
}
