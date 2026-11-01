import { isDeletion, normalize, toDeletion } from './normalize';
import type { Ledger, Rejected, Txn } from './types';

export const emptyLedger = (): Ledger => ({ txns: new Map(), tombstones: new Map() });

/**
 * Does `incoming` replace `existing`? The newer updated_at wins; a row with no updated_at
 * (old format) loses to any dated row; on a tie the later arrival wins.
 */
export function supersedes(incoming: Txn, existing: Txn): boolean {
  if (incoming.updatedAt === null) return existing.updatedAt === null;
  if (existing.updatedAt === null) return true;
  return incoming.updatedAt >= existing.updatedAt;
}

export interface ApplyResult {
  ledger: Ledger;
  rejected: Rejected[];
  /** rows written (new or replaced); persist these */
  changed: Txn[];
  /** ids deleted by a delete record; remove these from storage */
  removed: string[];
  /** tombstones recorded by this call; persist these */
  newTombstones: Array<[string, number]>;
  /** ids of valid, live records in the input, whether or not they changed anything */
  seenIds: string[];
}

/**
 * Merge raw records (a list page or the changes feed) into the ledger by id.
 * Handles deletes with tombstones and both record shapes, and rejects bad rows without throwing.
 */
export function applyRecords(ledger: Ledger, records: readonly unknown[]): ApplyResult {
  const txns = new Map(ledger.txns);
  const tombstones = new Map(ledger.tombstones);
  const rejected: Rejected[] = [];
  const changed = new Map<string, Txn>();
  const removed = new Set<string>();
  const newTombstones = new Map<string, number>();
  const seen = new Set<string>();

  for (const raw of records) {
    if (isDeletion(raw)) {
      const d = toDeletion(raw);
      const ts = Math.max(tombstones.get(d.id) ?? 0, d.updatedAt ?? 0);
      tombstones.set(d.id, ts);
      newTombstones.set(d.id, ts);
      txns.delete(d.id);
      changed.delete(d.id);
      seen.delete(d.id);
      removed.add(d.id);
      continue;
    }
    const n = normalize(raw);
    if (!n.ok) {
      rejected.push(n.rejected);
      continue;
    }
    const t = n.txn;
    const tomb = tombstones.get(t.id);
    // a copy no newer than the delete is a stale copy and stays deleted
    if (tomb !== undefined && (t.updatedAt === null || t.updatedAt <= tomb)) continue;
    const cur = txns.get(t.id);
    if (!cur || supersedes(t, cur)) {
      txns.set(t.id, t);
      changed.set(t.id, t);
      removed.delete(t.id);
    }
    seen.add(t.id);
  }
  return {
    ledger: { txns, tombstones },
    rejected,
    changed: [...changed.values()],
    removed: [...removed],
    newTombstones: [...newTombstones],
    seenIds: [...seen],
  };
}
