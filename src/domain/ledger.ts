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

/**
 * Merge raw records (a list page or the changes feed) into the ledger by id.
 * Handles deletes with tombstones and both record shapes, and rejects bad rows without throwing.
 */
export function applyRecords(ledger: Ledger, records: readonly unknown[]): { ledger: Ledger; rejected: Rejected[] } {
  const txns = new Map(ledger.txns);
  const tombstones = new Map(ledger.tombstones);
  const rejected: Rejected[] = [];

  for (const raw of records) {
    if (isDeletion(raw)) {
      const d = toDeletion(raw);
      tombstones.set(d.id, Math.max(tombstones.get(d.id) ?? 0, d.updatedAt ?? 0));
      txns.delete(d.id);
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
    if (!cur || supersedes(t, cur)) txns.set(t.id, t);
  }
  return { ledger: { txns, tombstones }, rejected };
}
