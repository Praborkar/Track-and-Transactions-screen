export type Direction = 'debit' | 'credit';
export type Status = 'POSTED' | 'PENDING' | string;

/** The single shape every record is converted into. Money is integer minor units. */
export interface Txn {
  id: string;
  accountId: string;
  /** epoch milliseconds */
  occurredAt: number;
  direction: Direction;
  /** minor units of `currency` */
  amountMinor: number;
  currency: string;
  /** paise; for foreign rows only when the server supplied a conversion */
  inrMinor: number | null;
  merchant: string;
  category: string;
  status: Status;
  /** epoch milliseconds; null for old-format rows, which carry no updated_at */
  updatedAt: number | null;
  /** moving money between the user's own accounts */
  isTransfer: boolean;
  counterAccountId: string | null;
  raw: unknown;
}

export type RejectReason =
  | 'missing_id'
  | 'unknown_shape'
  | 'bad_amount'
  | 'negative_amount'
  | 'bad_direction'
  | 'bad_time'
  | 'no_timezone'
  | 'bad_currency';

export interface Rejected {
  id: string | null;
  reason: RejectReason;
}

export type Normalized = { ok: true; txn: Txn } | { ok: false; rejected: Rejected };

export interface Deletion {
  id: string;
  deleted: true;
  updatedAt: number | null;
}

export interface Ledger {
  txns: ReadonlyMap<string, Txn>;
  /** id -> updatedAt of the delete (0 when unknown) */
  tombstones: ReadonlyMap<string, number>;
}
