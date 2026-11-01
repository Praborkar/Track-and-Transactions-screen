import { applyRecords, computeMonthTotals, emptyLedger, paiseToPlain } from '../src/domain';

const list = require('../mock/fixtures/transactions.json');
const changes = require('../mock/fixtures/changes.json');
const checkpoint = require('../mock/fixtures/checkpoint.json');

function synced() {
  const a = applyRecords(emptyLedger(), list);
  const b = applyRecords(a.ledger, changes);
  return { ledger: b.ledger, rejected: [...a.rejected, ...b.rejected] };
}

describe('fixture against checkpoint.json', () => {
  const { ledger, rejected } = synced();

  it('has the checkpoint transaction count and rejects nothing', () => {
    expect(rejected).toEqual([]);
    expect(ledger.txns.size).toBe(checkpoint.transaction_count);
  });

  it('matches spend and income for every month', () => {
    const totals = computeMonthTotals(ledger.txns.values());
    const got: Record<string, { spend: string; income: string }> = {};
    for (const [m, t] of totals) got[m] = { spend: paiseToPlain(t.spent), income: paiseToPlain(t.earned) };
    expect(got).toEqual(checkpoint.months);
  });
});
