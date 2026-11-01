import { computeMonthTotals, istMonthKey, matchesQuery, monthLabel, sortNewestFirst } from '../domain';
import type { Ledger, MonthTotals, Txn } from '../domain';

export type ListItem =
  | { type: 'header'; key: string; month: string; label: string; totals: MonthTotals; matches: number | null; loading: boolean }
  | { type: 'row'; key: string; txn: Txn; /** last row of its month, so the card can close */ last: boolean };

export interface ListView {
  items: ListItem[];
  /** rows in the ledger, whatever the search says */
  total: number;
  /** rows matching the search (equals total when there is no search) */
  matching: number;
  searching: boolean;
}

export interface ViewOptions {
  query: string;
  includePending: boolean;
  /** a full sync is part-way through, so the oldest month we hold may be missing rows */
  historyLoading: boolean;
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
  const searching = q !== '';

  const byMonth = new Map<string, Txn[]>();
  let matching = 0;
  for (const t of all) {
    if (searching && !matchesQuery(t, q)) continue;
    matching++;
    const m = istMonthKey(t.occurredAt);
    let arr = byMonth.get(m);
    if (!arr) byMonth.set(m, (arr = []));
    arr.push(t);
  }

  const items: ListItem[] = [];
  for (const m of months) {
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
  return { items, total: all.length, matching, searching };
}
