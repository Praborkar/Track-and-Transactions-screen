import { computeMonthTotals, istMonthKey, matchesQuery, monthLabel, sortNewestFirst } from '../domain';
import type { Ledger, MonthTotals, Txn } from '../domain';

export type ListItem =
  | { type: 'header'; key: string; month: string; label: string; totals: MonthTotals; matches: number | null; loading: boolean }
  | { type: 'row'; key: string; txn: Txn; /** last row of its month, so the card can close */ last: boolean };

export type Kind = 'all' | 'spent' | 'earned' | 'transfers';

export interface ListView {
  items: ListItem[];
  /** every month we hold, newest first, for the month picker */
  months: Array<{ key: string; label: string }>;
  /** rows in the ledger, whatever the search says */
  total: number;
  /** rows matching the search (equals total when there is no search) */
  matching: number;
  searching: boolean;
}

export interface ViewOptions {
  query: string;
  /** only this month ("2026-10"), or null for all */
  month?: string | null;
  kind?: Kind;
  includePending: boolean;
  /** a full sync is part-way through, so the oldest month we hold may be missing rows */
  historyLoading: boolean;
}

function matchesKind(t: Txn, kind: Kind): boolean {
  if (kind === 'all') return true;
  if (kind === 'transfers') return t.isTransfer;
  if (t.isTransfer) return false;
  return kind === 'spent' ? t.direction === 'debit' : t.direction === 'credit';
}

/**
 * Month sections newest first, each with its own spent and earned. Totals always cover the whole
 * month; a search only chooses which rows are listed. The oldest month is marked "still loading"
 * until a row from an older month has arrived, so a partial total is never shown as final.
 */
export function buildListView(ledger: Ledger, o: ViewOptions): ListView {
  const all = [...ledger.txns.values()].sort(sortNewestFirst);
  const totals = computeMonthTotals(all, { includePending: o.includePending });
  const months = [...totals.keys()].sort().reverse();
  const oldest = months[months.length - 1];
  const q = o.query.trim();
  const kind = o.kind ?? 'all';
  const month = o.month ?? null;
  const searching = q !== '' || kind !== 'all';

  const byMonth = new Map<string, Txn[]>();
  let matching = 0;
  for (const t of all) {
    const m = istMonthKey(t.occurredAt);
    if (month && m !== month) continue;
    if (!matchesKind(t, kind)) continue;
    if (q !== '' && !matchesQuery(t, q)) continue;
    matching++;
    let arr = byMonth.get(m);
    if (!arr) byMonth.set(m, (arr = []));
    arr.push(t);
  }

  const items: ListItem[] = [];
  for (const m of months) {
    if (month && m !== month) continue;
    const rows = byMonth.get(m);
    if (searching && !rows) continue;
    items.push({
      type: 'header',
      key: `h-${m}`,
      month: m,
      label: monthLabel(m),
      totals: totals.get(m)!,
      matches: searching ? rows!.length : null,
      loading: o.historyLoading && m === oldest,
    });
    const list = rows ?? [];
    list.forEach((t, i) => items.push({ type: 'row', key: t.id, txn: t, last: i === list.length - 1 }));
  }
  return { items, months: months.map((key) => ({ key, label: monthLabel(key) })), total: all.length, matching, searching };
}
