import { paiseToPlain } from './money';
import type { Txn } from './types';

/** Lower-case, drop the UPI/ prefix, turn punctuation into spaces: "SWIGGY*BANGALORE" -> "swiggy bangalore". */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/^\s*upi\//, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Every query word must match the merchant or category text, or the amount ("516", "516.49", "21,579"). */
export function matchesQuery(t: Txn, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const text = normalizeText(`${t.merchant} ${t.category}`);
  const amounts = [paiseToPlain(t.amountMinor), t.inrMinor !== null ? paiseToPlain(t.inrMinor) : ''];
  return q.split(/\s+/).every((word) => {
    const w = normalizeText(word);
    if (w && text.includes(w)) return true;
    const digits = word.replace(/[,₹$]/g, '');
    return /^\d+(\.\d+)?$/.test(digits) && amounts.some((a) => a.includes(digits));
  });
}
