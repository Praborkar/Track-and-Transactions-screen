/**
 * Parse a rupee string such as "516.49" into paise using string maths only.
 * Returns null for anything that is not a plain non-negative decimal with at most 2 places.
 */
export function parseRupeesToPaise(input: string): number | null {
  const m = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const paise = (m[2] ?? '').padEnd(2, '0');
  return Number(m[1]) * 100 + Number(paise);
}

/** Indian digit grouping: 12,34,567. */
export function groupIndian(integerDigits: string): string {
  if (integerDigits.length <= 3) return integerDigits;
  const last3 = integerDigits.slice(-3);
  const rest = integerDigits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** Plain "1234567.89" text (no symbol, no grouping), used for search. */
export function paiseToPlain(paise: number): string {
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${paise < 0 ? '-' : ''}${rupees}.${frac}`;
}

/** ₹12,34,567.89 for 123456789 paise. Same output on every device. */
export function formatInr(paise: number): string {
  const abs = Math.abs(Math.trunc(paise));
  const rupees = groupIndian(String(Math.floor(abs / 100)));
  const frac = String(abs % 100).padStart(2, '0');
  return `${paise < 0 ? '-' : ''}₹${rupees}.${frac}`;
}

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

/** "$10.00" for foreign amounts, "₹…" for INR. */
export function formatMoney(minor: number, currency: string): string {
  if (currency === 'INR') return formatInr(minor);
  const abs = Math.abs(Math.trunc(minor));
  const sym = SYMBOLS[currency] ?? `${currency} `;
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${minor < 0 ? '-' : ''}${sym}${whole}.${String(abs % 100).padStart(2, '0')}`;
}
