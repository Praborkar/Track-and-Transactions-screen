import { parseRupeesToPaise } from './money';
import { parseIsoWithZone } from './time';
import type { Deletion, Normalized, RejectReason } from './types';

type Rec = Record<string, unknown>;

const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

function reject(id: string | null, reason: RejectReason): Normalized {
  return { ok: false, rejected: { id, reason } };
}

export function isDeletion(raw: unknown): raw is Rec & { id: string; deleted: true } {
  return isObj(raw) && raw.deleted === true && typeof raw.id === 'string' && raw.id !== '';
}

export function toDeletion(raw: Rec & { id: string }): Deletion {
  const t = typeof raw.updated_at === 'string' ? parseIsoWithZone(raw.updated_at) : null;
  return { id: raw.id, deleted: true, updatedAt: t && 'ms' in t ? t.ms : null };
}

/** The old shape names an account "4821"; the new shape says "acc_4821". */
const accountKey = (v: unknown): string | null => {
  const s = str(typeof v === 'number' ? String(v) : v);
  if (!s) return null;
  return s.startsWith('acc_') ? s : `acc_${s}`;
};

/** One record in, one shape out. Never throws; unknown or invalid input comes back as a rejection. */
export function normalize(raw: unknown): Normalized {
  if (!isObj(raw)) return reject(null, 'unknown_shape');
  const id = str(typeof raw.id === 'number' ? String(raw.id) : raw.id);
  if (!id) return reject(null, 'missing_id');

  const isNew = 'amount_minor' in raw || 'occurred_at' in raw || 'direction' in raw;
  const isOld = 'txn_time' in raw || 'type' in raw || typeof raw.amount === 'string';
  if (isNew === isOld) return reject(id, 'unknown_shape'); // neither shape, or a mix of both

  const linked = raw.linked_account !== undefined && raw.linked_account !== null;

  if (isNew) {
    const accountId = accountKey(raw.account_id);
    if (!accountId) return reject(id, 'unknown_shape');
    if (raw.direction !== 'debit' && raw.direction !== 'credit') return reject(id, 'bad_direction');
    const amt = raw.amount_minor;
    if (typeof amt !== 'number' || !Number.isSafeInteger(amt)) return reject(id, 'bad_amount');
    if (amt < 0) return reject(id, 'negative_amount');
    if (amt === 0) return reject(id, 'bad_amount');
    const currency = raw.currency === undefined ? 'INR' : raw.currency;
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return reject(id, 'bad_currency');
    if (typeof raw.occurred_at !== 'string') return reject(id, 'bad_time');
    const t = parseIsoWithZone(raw.occurred_at);
    if ('error' in t) return reject(id, t.error);
    let updatedAt: number | null = null;
    if (raw.updated_at !== undefined && raw.updated_at !== null) {
      const u = typeof raw.updated_at === 'string' ? parseIsoWithZone(raw.updated_at) : { error: 'bad_time' as const };
      if ('error' in u) return reject(id, u.error);
      updatedAt = u.ms;
    }
    const fxRaw = isObj(raw.fx) ? raw.fx.inr_minor : undefined;
    const fx = typeof fxRaw === 'number' && Number.isSafeInteger(fxRaw) && fxRaw > 0 ? fxRaw : null;
    const cp = isObj(raw.counterparty) ? raw.counterparty : null;
    return {
      ok: true,
      txn: {
        id,
        accountId,
        occurredAt: t.ms,
        direction: raw.direction,
        amountMinor: amt,
        currency,
        inrMinor: currency === 'INR' ? amt : fx,
        merchant: str(raw.merchant) ?? '',
        category: str(raw.category) ?? 'UNCATEGORISED',
        status: str(raw.status) ?? 'POSTED',
        updatedAt,
        isTransfer: (cp !== null && cp.type === 'OWN_ACCOUNT') || linked,
        counterAccountId: accountKey(cp?.account_id) ?? accountKey(raw.linked_account),
        raw,
      },
    };
  }

  // old shape
  const accountId = accountKey(raw.account);
  if (!accountId) return reject(id, 'unknown_shape');
  const direction = raw.type === 'DR' ? 'debit' : raw.type === 'CR' ? 'credit' : null;
  if (!direction) return reject(id, 'bad_direction');
  if (typeof raw.amount !== 'string') return reject(id, 'bad_amount');
  if (raw.amount.trim().startsWith('-')) return reject(id, 'negative_amount');
  const paise = parseRupeesToPaise(raw.amount);
  if (paise === null || paise <= 0) return reject(id, 'bad_amount');
  if (typeof raw.txn_time !== 'number' || !Number.isFinite(raw.txn_time) || raw.txn_time <= 0) return reject(id, 'bad_time');
  return {
    ok: true,
    txn: {
      id,
      accountId,
      occurredAt: Math.round(raw.txn_time * 1000),
      direction,
      amountMinor: paise,
      currency: 'INR',
      inrMinor: paise,
      merchant: str(raw.merchant_name) ?? '',
      category: str(raw.category) ?? 'UNCATEGORISED',
      status: str(raw.status) ?? 'POSTED',
      updatedAt: null,
      isTransfer: linked,
      counterAccountId: accountKey(raw.linked_account),
      raw,
    },
  };
}
