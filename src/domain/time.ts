const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-04" for the IST calendar month an instant falls in. IST has no daylight saving. */
export function istMonthKey(epochMs: number): string {
  const d = new Date(epochMs + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "10 Oct 2026, 7:12 pm" in IST. */
export function formatIst(epochMs: number): string {
  const d = new Date(epochMs + IST_OFFSET_MS);
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}

/** "10 Oct, 7:12 pm": the month card already says the year. */
export function formatIstShort(epochMs: number): string {
  return formatIst(epochMs).replace(/ \d{4},/, ',');
}

export function formatUtc(epochMs: number): string {
  return new Date(epochMs).toISOString().replace('T', ' ').replace(/:\d\d\.\d{3}Z$/, ' UTC');
}

/** "October 2025" for "2025-10". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

const WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i;
const NO_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Parse an ISO-8601 timestamp that carries an explicit offset ("Z" or "+05:30").
 * One without an offset is refused: Date.parse would read it as the phone's local time.
 */
export function parseIsoWithZone(s: string): { ms: number } | { error: 'bad_time' | 'no_timezone' } {
  if (!WITH_ZONE.test(s)) return { error: NO_ZONE.test(s) ? 'no_timezone' : 'bad_time' };
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? { error: 'bad_time' } : { ms };
}
