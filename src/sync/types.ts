import type { Ledger, Rejected, Txn } from '../domain';

export interface RejectedSummary {
  total: number;
  byReason: Record<string, number>;
}

export interface SyncState {
  /** 'full' = a full sync is part-way through and `cursor` says where to continue */
  phase: 'idle' | 'full';
  cursor: string | null;
  /** the token the changes feed accepts; only ever saved together with the final page */
  token: string | null;
  /** identifies one full sync, so rows it saw can be told from rows it did not */
  runId: string | null;
  rejected: RejectedSummary;
  lastSyncedAt: number | null;
}

export const initialSyncState = (): SyncState => ({
  phase: 'idle',
  cursor: null,
  token: null,
  runId: null,
  rejected: { total: 0, byReason: {} },
  lastSyncedAt: null,
});

export interface Account {
  id: string;
  bank: string;
  type: string;
  last4: string;
  nickname: string;
}

/** Everything one page of work writes. A store applies it all or none of it. */
export interface Commit {
  upserts: Txn[];
  removeIds: string[];
  tombstones: Array<[string, number]>;
  /** mark these rows as seen by `state.runId` */
  stampIds: string[];
  /** delete every row `state.runId` did not stamp, and report which ones went */
  sweepUnstamped: boolean;
  state: SyncState;
}

export interface CommitResult {
  swept: string[];
}

export interface Store {
  load(): Promise<{ ledger: Ledger; state: SyncState; accounts: Account[] }>;
  commit(c: Commit): Promise<CommitResult>;
  saveAccounts(a: Account[]): Promise<void>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

export const addRejected = (s: RejectedSummary, rows: Rejected[]): RejectedSummary => {
  const byReason = { ...s.byReason };
  for (const r of rows) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
  return { total: s.total + rows.length, byReason };
};
