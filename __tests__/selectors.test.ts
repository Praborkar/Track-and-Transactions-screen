import { applyRecords, emptyLedger } from '../src/domain';
import { buildListView } from '../src/app/selectors';

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
