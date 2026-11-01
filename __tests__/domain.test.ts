import {
  applyRecords,
  computeMonthTotals,
  emptyLedger,
  formatInr,
  istMonthKey,
  matchesQuery,
  normalize,
  parseRupeesToPaise,
} from '../src/domain';

const newRow = (o: Record<string, unknown> = {}) => ({
  id: 'txn_A',
  account_id: 'acc_4821',
  occurred_at: '2026-10-09T13:42:00Z',
  direction: 'debit',
  amount_minor: 34900,
  currency: 'INR',
  merchant: 'SWIGGY*BANGALORE',
  category: 'FOOD',
  status: 'POSTED',
  updated_at: '2026-10-09T13:51:00Z',
  ...o,
});

const oldRow = (o: Record<string, unknown> = {}) => ({
  id: '115509',
  account: '4821',
  txn_time: 1774981380,
  amount: '516.49',
  type: 'DR',
  merchant_name: 'BLINKIT',
  category: 'GROCERIES',
  status: 'POSTED',
  ...o,
});

const totalsOf = (rows: unknown[], opts?: Parameters<typeof computeMonthTotals>[1]) =>
  computeMonthTotals(applyRecords(emptyLedger(), rows).ledger.txns.values(), opts);

describe('money is exact', () => {
  it.each([
    ['0.29', 29],
    ['1.1', 110],
    ['516.49', 51649],
    ['1234567.89', 123456789],
    ['999999999999.99', 99999999999999],
  ])('parses %s to paise', (s, p) => expect(parseRupeesToPaise(s)).toBe(p));

  it('rejects things that are not rupee amounts', () => {
    for (const s of ['', 'abc', '1.234', '-5', '1e5', '1,000']) expect(parseRupeesToPaise(s)).toBeNull();
  });

  it('sums 4,686 rows to the same paise in any order', () => {
    const rows = Array.from({ length: 4686 }, (_, i) => oldRow({ id: String(i + 1), amount: `${(i * 37) % 997}.${String((i * 13) % 100).padStart(2, '0')}` }));
    const sum = (r: unknown[]) => [...totalsOf(r).values()].reduce((a, m) => a + m.spent, 0);
    const base = sum(rows);
    const shuffled = [...rows].sort((a, b) => ((a as { id: string }).id < (b as { id: string }).id ? 1 : -1));
    expect(sum(shuffled)).toBe(base);
    expect(Number.isInteger(base)).toBe(true);
  });
});

describe('reads like our users read it', () => {
  it.each([
    [99900, '₹999.00'],
    [100000, '₹1,000.00'],
    [9999900, '₹99,999.00'],
    [10000000, '₹1,00,000.00'],
    [123456789, '₹12,34,567.89'],
    [12345678900, '₹12,34,56,789.00'],
    [5, '₹0.05'],
  ])('formats %i paise', (p, s) => expect(formatInr(p)).toBe(s));
});

describe('our users are in India', () => {
  it('puts 18:29:59 UTC and 18:30:00 UTC on the last day of a month in different IST months', () => {
    expect(istMonthKey(Date.parse('2026-03-31T18:29:59Z'))).toBe('2026-03');
    expect(istMonthKey(Date.parse('2026-03-31T18:30:00Z'))).toBe('2026-04');
  });
});

describe('two record shapes, one list', () => {
  it('normalizes both to the same shape', () => {
    const a = normalize(newRow());
    const b = normalize(oldRow());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.txn.accountId).toBe('acc_4821');
      expect(b.txn.amountMinor).toBe(51649);
      expect(b.txn.occurredAt).toBe(1774981380000);
      expect(b.txn.updatedAt).toBeNull();
      expect(Object.keys(a.txn).sort()).toEqual(Object.keys(b.txn).sort());
    }
  });

  it.each([
    ['unknown shape', { id: 'x', foo: 1 }, 'unknown_shape'],
    ['two shapes in one row', newRow({ txn_time: 1, type: 'DR' }), 'unknown_shape'],
    ['no id', newRow({ id: undefined }), 'missing_id'],
    ['negative amount', newRow({ amount_minor: -5 }), 'negative_amount'],
    ['zero amount', newRow({ amount_minor: 0 }), 'bad_amount'],
    ['fractional paise', newRow({ amount_minor: 10.5 }), 'bad_amount'],
    ['negative old amount', oldRow({ amount: '-3.00' }), 'negative_amount'],
    ['bad old amount', oldRow({ amount: 'abc' }), 'bad_amount'],
    ['time without a time zone', newRow({ occurred_at: '2026-10-09T13:42:00' }), 'no_timezone'],
    ['garbage time', newRow({ occurred_at: 'yesterday' }), 'bad_time'],
    ['bad currency', newRow({ currency: 'rupees' }), 'bad_currency'],
    ['bad direction', newRow({ direction: 'sideways' }), 'bad_direction'],
  ])('rejects %s without throwing', (_n, raw, reason) => {
    const r = normalize(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected.reason).toBe(reason);
  });

  it('never throws on junk', () => {
    for (const j of [null, undefined, 5, 'x', [], {}, { id: {} }]) expect(() => normalize(j)).not.toThrow();
  });

  it('reports rejected rows and keeps the rest', () => {
    const { ledger, rejected } = applyRecords(emptyLedger(), [newRow(), { id: 'bad' }, oldRow()]);
    expect(ledger.txns.size).toBe(2);
    expect(rejected).toEqual([{ id: 'bad', reason: 'unknown_shape' }]);
  });
});

describe('every transaction appears once', () => {
  it('counts the same page twice, and a repeated boundary row, once', () => {
    const page1 = [newRow({ id: 't1' }), newRow({ id: 't2' })];
    const page2 = [newRow({ id: 't2' }), newRow({ id: 't3' })];
    let l = applyRecords(emptyLedger(), page1).ledger;
    l = applyRecords(l, page2).ledger;
    l = applyRecords(l, page2).ledger;
    expect(l.txns.size).toBe(3);
  });

  it('never merges by content: two identical chai purchases with different ids stay two', () => {
    const l = applyRecords(emptyLedger(), [newRow({ id: 'c1' }), newRow({ id: 'c2' })]).ledger;
    expect(l.txns.size).toBe(2);
  });
});

describe('own-account transfers are neither spending nor earning', () => {
  const own = newRow({ id: 'o1', amount_minor: 2500000, counterparty: { type: 'OWN_ACCOUNT', account_id: 'acc_9075' }, category: 'TRANSFER' });
  const linked = oldRow({ id: '9', amount: '21579.63', type: 'CR', linked_account: '9075', category: 'TRANSFER' });
  const person = newRow({ id: 'p1', amount_minor: 50000, merchant: 'UPI/RAHUL SHARMA', category: 'TRANSFERS_OUT' });

  it('excludes both marker spellings but still counts them', () => {
    const m = totalsOf([own, linked]);
    const oct = m.get('2026-10')!;
    expect(oct.spent + oct.earned).toBe(0);
    expect(oct.count + (m.get('2026-03')?.count ?? 0)).toBe(2);
  });

  it('treats a TRANSFERS_OUT UPI payment to a person as spending', () => {
    expect(totalsOf([person]).get('2026-10')!.spent).toBe(50000);
  });
});

describe('foreign currency', () => {
  const usd = newRow({ id: 'u1', currency: 'USD', amount_minor: 1000, fx: { inr_minor: 86661 } });
  it('uses the rupee value in totals and keeps the dollar amount', () => {
    expect(totalsOf([usd]).get('2026-10')!.spent).toBe(86661);
    const n = normalize(usd);
    expect(n.ok && n.txn.amountMinor).toBe(1000);
  });
  it('leaves a USD row with no conversion out of totals and counts it', () => {
    const m = totalsOf([newRow({ id: 'u2', currency: 'USD', amount_minor: 1000 })]).get('2026-10')!;
    expect(m.spent).toBe(0);
    expect(m.notConverted).toBe(1);
  });
});

describe('refunds and pending', () => {
  it('counts a refund as income, not negative spend', () => {
    const m = totalsOf([newRow({ id: 'r', direction: 'credit', merchant: 'AMAZON PAY REFUND', amount_minor: 9900 })]).get('2026-10')!;
    expect(m.earned).toBe(9900);
    expect(m.spent).toBe(0);
  });

  it('pending rows count by default and can be excluded by the setting', () => {
    const rows = [newRow({ id: 'p', status: 'PENDING', amount_minor: 700 })];
    expect(totalsOf(rows).get('2026-10')!.spent).toBe(700);
    expect(totalsOf(rows, { includePending: false }).get('2026-10')!.spent).toBe(0);
    expect(totalsOf(rows, { includePending: false }).get('2026-10')!.pending).toBe(1);
  });
});

describe('the latest truth wins', () => {
  const at = (u: string, amt: number) => newRow({ id: 'e1', amount_minor: amt, updated_at: u });

  it('a newer edit replaces an older row', () => {
    const l = applyRecords(applyRecords(emptyLedger(), [at('2026-10-09T10:00:00Z', 100)]).ledger, [at('2026-10-09T11:00:00Z', 200)]).ledger;
    expect(l.txns.get('e1')!.amountMinor).toBe(200);
  });

  it('a stale copy arriving later does not', () => {
    const l = applyRecords(applyRecords(emptyLedger(), [at('2026-10-09T11:00:00Z', 200)]).ledger, [at('2026-10-09T10:00:00Z', 100)]).ledger;
    expect(l.txns.get('e1')!.amountMinor).toBe(200);
  });

  it('any dated record beats an old-format row with no updated_at', () => {
    const l = applyRecords(applyRecords(emptyLedger(), [oldRow({ id: '77' })]).ledger, [newRow({ id: '77', amount_minor: 4200 })]).ledger;
    expect(l.txns.get('77')!.amountMinor).toBe(4200);
    const back = applyRecords(l, [oldRow({ id: '77' })]).ledger;
    expect(back.txns.get('77')!.amountMinor).toBe(4200);
  });

  it('a deleted id stays deleted, even if a stale copy shows up later', () => {
    const del = { id: 'e1', deleted: true, updated_at: '2026-10-10T00:00:00Z' };
    let l = applyRecords(emptyLedger(), [at('2026-10-09T10:00:00Z', 100)]).ledger;
    l = applyRecords(l, [del]).ledger;
    expect(l.txns.has('e1')).toBe(false);
    l = applyRecords(l, [at('2026-10-09T10:00:00Z', 100), oldRow({ id: 'e1' })]).ledger;
    expect(l.txns.has('e1')).toBe(false);
  });
});

describe('search', () => {
  const t = (o: Record<string, unknown>) => {
    const n = normalize(newRow(o));
    if (!n.ok) throw new Error('bad fixture');
    return n.txn;
  };
  it('finds all three merchant spellings for swiggy, ignoring case and punctuation', () => {
    for (const m of ['SWIGGY*BANGALORE', 'Swiggy Instamart', 'UPI/SWIGGY']) expect(matchesQuery(t({ merchant: m }), 'swiggy')).toBe(true);
  });
  it('ignores the UPI/ prefix and finds chai point', () => {
    expect(matchesQuery(t({ merchant: 'UPI/CHAI POINT' }), 'chai point')).toBe(true);
    expect(matchesQuery(t({ merchant: 'UPI/CHAI POINT' }), 'upi')).toBe(false);
  });
  it('matches category and amount text', () => {
    const x = t({ merchant: 'BLINKIT', category: 'GROCERIES', amount_minor: 51649 });
    expect(matchesQuery(x, 'groceries')).toBe(true);
    expect(matchesQuery(x, '516.49')).toBe(true);
    expect(matchesQuery(x, '516')).toBe(true);
    expect(matchesQuery(x, 'zomato')).toBe(false);
  });
});
