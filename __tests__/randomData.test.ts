import { applyRecords, computeMonthTotals, emptyLedger, istMonthKey } from '../src/domain';

/** Small deterministic PRNG so a failing seed can be replayed. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

interface Truth {
  id: string;
  ms: number;
  debit: boolean;
  /** paise in INR after conversion */
  inr: number;
  transfer: boolean;
  foreignNoFx: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoZ = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

/**
 * Build a random dataset with the same kinds of traps as the fixture, plus the ground truth
 * computed separately and simply, so the app's totals can be checked against a brute-force count.
 */
function generate(seed: number) {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const n = 300 + Math.floor(r() * 400);
  const start = Date.UTC(2025, 9, 1) - 5.5 * 3600e3;
  const span = 400 * 86400e3;
  const truths: Truth[] = [];
  const records: unknown[] = [];
  const later: unknown[] = []; // arrives in the changes feed

  for (let i = 0; i < n; i++) {
    // cluster some rows at month boundaries, where UTC and IST disagree
    let ms = start + Math.floor(r() * span);
    if (r() < 0.12) {
      const d = new Date(ms);
      ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - Math.floor(r() * 7 * 3600e3) - 1000;
    }
    ms = Math.floor(ms / 1000) * 1000;
    const debit = r() < 0.8;
    const kind = r();
    const minor = 1 + Math.floor(r() * 9_000_000);
    const isOld = r() < 0.5;
    const id = isOld ? String(100000 + i) : `txn_${i.toString(16).padStart(8, '0')}`;
    const t: Truth = { id, ms, debit, inr: minor, transfer: false, foreignNoFx: false };

    if (isOld) {
      const rec: Record<string, unknown> = {
        id,
        account: pick(['4821', '9075', '3310']),
        txn_time: ms / 1000,
        amount: `${Math.floor(minor / 100)}.${pad(minor % 100)}`,
        type: debit ? 'DR' : 'CR',
        merchant_name: pick(['BLINKIT', 'UPI/CHAI POINT', 'SWIGGY*BANGALORE', 'AMAZON PAY']),
        category: pick(['FOOD', 'TRANSFERS_OUT', 'GROCERIES']), // TRANSFERS_OUT here is a trap, not a marker
        status: 'POSTED',
      };
      if (kind < 0.07) {
        rec.linked_account = '9075';
        t.transfer = true;
      }
      records.push(rec);
    } else {
      const rec: Record<string, unknown> = {
        id,
        account_id: pick(['acc_4821', 'acc_9075', 'acc_3310']),
        occurred_at: isoZ(ms),
        direction: debit ? 'debit' : 'credit',
        amount_minor: minor,
        currency: 'INR',
        merchant: pick(['NETFLIX', 'UPI/RAHUL SHARMA', 'Swiggy Instamart', 'SALARY']),
        category: pick(['TRANSFERS_OUT', 'FOOD', 'SHOPPING']),
        status: r() < 0.05 ? 'PENDING' : 'POSTED',
        updated_at: isoZ(ms + 60_000),
      };
      if (kind < 0.07) {
        rec.counterparty = { type: 'OWN_ACCOUNT', account_id: 'acc_9075' };
        t.transfer = true;
      } else if (kind < 0.14) {
        rec.currency = 'USD';
        if (r() < 0.8) {
          const inr = 1 + Math.floor(r() * 500_000);
          rec.fx = { inr_minor: inr };
          t.inr = inr;
        } else t.foreignNoFx = true;
      }
      records.push(rec);
    }
    truths.push(t);
  }

  // edits: change the amount of some new-shape rows through the changes feed, in a newer version
  for (const rec of records as Array<Record<string, unknown>>) {
    if (typeof rec.amount_minor === 'number' && rec.currency === 'INR' && r() < 0.08) {
      const t = truths.find((x) => x.id === rec.id)!;
      const newMinor = 1 + Math.floor(r() * 9_000_000);
      later.push({ ...rec, amount_minor: newMinor, updated_at: isoZ(Date.parse(String(rec.updated_at)) + 3600e3) });
      t.inr = newMinor;
      // an older version of the same row shows up after the newer one and must not win
      later.push({ ...rec, amount_minor: newMinor + 777, updated_at: isoZ(Date.parse(String(rec.updated_at)) + 1800e3) });
    }
  }
  // deletes: drop some rows; a stale copy of one arrives after its delete
  const deleted = new Set<string>();
  for (const t of truths) {
    if (r() < 0.04) {
      deleted.add(t.id);
      later.push({ id: t.id, deleted: true, updated_at: isoZ(t.ms + 7200e3) });
    }
  }
  // duplicates: repeat boundary rows and whole pages, and a stale copy after a delete
  const dupes = records.filter(() => r() < 0.1);
  const staleAfterDelete = (records as Array<Record<string, unknown>>).filter((x) => deleted.has(String(x.id)) && r() < 0.5);
  const pages = [...records, ...dupes, ...records.slice(0, 50)];
  return { truths, pages, later: [...later, ...staleAfterDelete], deleted };
}

/** Slow, obvious count. Nothing here shares code with the app. */
function bruteForce(truths: Truth[], deleted: Set<string>, includePending = true, pendingIds = new Set<string>()) {
  const out = new Map<string, { spent: number; earned: number; count: number }>();
  for (const t of truths) {
    if (deleted.has(t.id)) continue;
    const d = new Date(t.ms + 5.5 * 3600e3);
    const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    const m = out.get(key) ?? { spent: 0, earned: 0, count: 0 };
    m.count++;
    out.set(key, m);
    if (t.transfer || t.foreignNoFx) continue;
    if (!includePending && pendingIds.has(t.id)) continue;
    if (t.debit) m.spent += t.inr;
    else m.earned += t.inr;
  }
  return out;
}

describe.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('random dataset, seed %i', (seed) => {
  const { truths, pages, later, deleted } = generate(seed);

  it('matches a brute-force count, whatever order pages and changes arrive in', () => {
    const a = applyRecords(emptyLedger(), pages);
    const b = applyRecords(a.ledger, later);
    expect(a.rejected).toEqual([]);
    expect(b.rejected).toEqual([]);

    const expected = bruteForce(truths, deleted);
    const got = computeMonthTotals(b.ledger.txns.values());
    expect([...got.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [m, e] of expected) {
      const g = got.get(m)!;
      expect({ m, spent: g.spent, earned: g.earned, count: g.count }).toEqual({ m, ...e });
    }
    expect(b.ledger.txns.size).toBe(truths.length - deleted.size);
  });

  it('gives the same totals when the same pages are delivered twice', () => {
    const once = applyRecords(applyRecords(emptyLedger(), pages).ledger, later).ledger;
    const twice = applyRecords(applyRecords(applyRecords(applyRecords(emptyLedger(), pages).ledger, pages).ledger, later).ledger, later).ledger;
    expect([...twice.txns.keys()].sort()).toEqual([...once.txns.keys()].sort());
    const sum = (l: typeof once) => [...computeMonthTotals(l.txns.values()).values()].map((m) => `${m.month}:${m.spent}:${m.earned}`).join(',');
    expect(sum(twice)).toBe(sum(once));
  });

  it('puts every row in the IST month a brute-force clock puts it in', () => {
    const l = applyRecords(applyRecords(emptyLedger(), pages).ledger, later).ledger;
    for (const t of l.txns.values()) {
      const d = new Date(t.occurredAt + 5.5 * 3600e3);
      expect(istMonthKey(t.occurredAt)).toBe(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
    }
  });
});
