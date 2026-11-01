import { istMonthKey } from './time';
import type { Txn } from './types';

export interface TotalsOptions {
  /**
   * Do PENDING rows count toward spent/earned? Default true: the money has left the
   * account even if the bank has not settled it. Documented in the decision log.
   */
  includePending?: boolean;
}

export interface MonthTotals {
  month: string;
  /** paise */
  spent: number;
  earned: number;
  /** all rows in the month, transfers included */
  count: number;
  transfers: number;
  /** foreign rows with no conversion: left out of spent and earned */
  notConverted: number;
  pending: number;
}

export function computeMonthTotals(txns: Iterable<Txn>, opts: TotalsOptions = {}): Map<string, MonthTotals> {
  const includePending = opts.includePending ?? true;
  const out = new Map<string, MonthTotals>();
  for (const t of txns) {
    const month = istMonthKey(t.occurredAt);
    let m = out.get(month);
    if (!m) out.set(month, (m = { month, spent: 0, earned: 0, count: 0, transfers: 0, notConverted: 0, pending: 0 }));
    m.count++;
    if (t.status === 'PENDING') m.pending++;
    if (t.isTransfer) {
      m.transfers++;
      continue;
    }
    if (t.inrMinor === null) {
      m.notConverted++;
      continue;
    }
    if (t.status === 'PENDING' && !includePending) continue;
    if (t.direction === 'debit') m.spent += t.inrMinor;
    else m.earned += t.inrMinor;
  }
  return out;
}

/** Newest first by time, then id so the order is stable. */
export function sortNewestFirst(a: Txn, b: Txn): number {
  return b.occurredAt - a.occurredAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
