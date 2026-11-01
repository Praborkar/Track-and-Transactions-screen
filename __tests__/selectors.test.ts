import { applyRecords, emptyLedger } from '../src/domain';
import { buildListView } from '../src/state/selectors';

const list = require('../mock/fixtures/transactions.json');
const changes = require('../mock/fixtures/changes.json');
const checkpoint = require('../mock/fixtures/checkpoint.json');

const full = applyRecords(applyRecords(emptyLedger(), list).ledger, changes).ledger;
const opts = { query: '', includePending: true, historyLoading: false };

describe('month sections', () => {
  const v = buildListView(full, opts);
  const headers = v.items.filter((i) => i.type === 'header');

  it('lists every transaction once, under its month, newest month first', () => {
    expect(v.items.filter((i) => i.type === 'row')).toHaveLength(checkpoint.transaction_count);
    const months = headers.map((h) => (h.type === 'header' ? h.month : ''));
    expect(months).toEqual([...months].sort().reverse());
    expect(new Set(v.items.map((i) => i.key)).size).toBe(v.items.length);
  });

  it('marks only the oldest month as still loading while history is loading', () => {
    const loading = buildListView(full, { ...opts, historyLoading: true }).items.filter((i) => i.type === 'header' && i.loading);
    expect(loading).toHaveLength(1);
    expect(loading[0].type === 'header' && loading[0].month).toBe('2025-10');
    expect(headers.some((h) => h.type === 'header' && h.loading)).toBe(false);
  });

  it('keeps full month totals while searching and counts matches', () => {
    const s = buildListView(full, { ...opts, query: 'swiggy' });
    expect(s.searching).toBe(true);
    expect(s.matching).toBeGreaterThan(0);
    expect(s.matching).toBeLessThan(s.total);
    const oct = s.items.find((i) => i.type === 'header' && i.month === '2026-10');
    const octAll = headers.find((h) => h.type === 'header' && h.month === '2026-10');
    expect(oct?.type === 'header' && octAll?.type === 'header' && oct.totals.spent === octAll.totals.spent).toBe(true);
  });

  it('finds swiggy under all its spellings', () => {
    const s = buildListView(full, { ...opts, query: 'swiggy' });
    const names = new Set(s.items.flatMap((i) => (i.type === 'row' ? [i.txn.merchant] : [])));
    expect(names.size).toBeGreaterThan(1);
    for (const n of names) expect(n.toLowerCase()).toContain('swiggy');
  });
});

describe('month and type filters', () => {
  it('lists the months we hold, newest first, for the picker', () => {
    const v = buildListView(full, opts);
    expect(v.months).toHaveLength(13);
    expect(v.months[0]).toEqual({ key: '2026-10', label: 'October 2026' });
    expect(v.months[12].key).toBe('2025-10');
  });

  it('shows only the chosen month, with the full totals for that month', () => {
    const all = buildListView(full, opts);
    const feb = buildListView(full, { ...opts, month: '2026-02' });
    const headers = feb.items.filter((i) => i.type === 'header');
    expect(headers).toHaveLength(1);
    const h = headers[0];
    expect(h.type === 'header' && h.totals.spent).toBe(44334140);
    const rows = feb.items.filter((i) => i.type === 'row');
    expect(rows.length).toBe(h.type === 'header' ? h.totals.count : -1);
    expect(rows.length).toBeLessThan(all.items.length);
  });

  it('Transfers lists only own-account transfers; Spent and Earned leave them out', () => {
    const rowsOf = (kind: 'spent' | 'earned' | 'transfers') => buildListView(full, { ...opts, kind }).items.flatMap((i) => (i.type === 'row' ? [i.txn] : []));
    const tr = rowsOf('transfers');
    expect(tr.length).toBeGreaterThan(0);
    expect(tr.every((t) => t.isTransfer)).toBe(true);
    expect(rowsOf('spent').every((t) => !t.isTransfer && t.direction === 'debit')).toBe(true);
    expect(rowsOf('earned').every((t) => !t.isTransfer && t.direction === 'credit')).toBe(true);
    expect(rowsOf('spent').length + rowsOf('earned').length + tr.length).toBe(4686);
  });

  it('finds the Notion USD row and the 3 Oct self transfer', () => {
    const notion = buildListView(full, { ...opts, query: 'notion' }).items.flatMap((i) => (i.type === 'row' ? [i.txn] : []));
    expect(notion.some((t) => t.currency === 'USD' && t.inrMinor === 86661)).toBe(true);
    const self = buildListView(full, { ...opts, month: '2026-10', kind: 'transfers' }).items.flatMap((i) => (i.type === 'row' ? [i.txn] : []));
    expect(self.some((t) => t.amountMinor === 2500000)).toBe(true);
  });
});
