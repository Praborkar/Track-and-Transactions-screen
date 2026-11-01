import type { Account } from './types';

export interface Deps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  baseUrl: () => string;
}

export const defaultDeps = (baseUrl: () => string): Deps => ({
  fetch: (...a) => fetch(...a),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: Math.random,
  baseUrl,
});

export const TIMEOUT_MS = 15000;
export const MAX_ATTEMPTS = 4;
export const PAGE_LIMIT = 100;

/** The server no longer accepts our sync token: drop it and do a full sync. */
export class GoneError extends Error {
  constructor() {
    super('sync token expired');
    this.name = 'GoneError';
  }
}

/** A page kept failing after every retry. Cached data stays; the sync stops and says so. */
export class PausedError extends Error {
  constructor(public readonly cause: string) {
    super(`sync paused: ${cause}`);
    this.name = 'PausedError';
  }
}

/** The server said no and retrying will not change that (a 4xx other than 429 and 410). */
export class FatalError extends Error {
  constructor(public readonly status: number) {
    super(`request rejected (${status})`);
    this.name = 'FatalError';
  }
}

export interface Page {
  items: unknown[];
  next_cursor: string | null;
  sync_token: string | null;
}

const isRetryable = (s: number) => s === 429 || s >= 500;

/** Seconds from a Retry-After header, or null. Dates are not used by this server. */
export function retryAfterMs(h: string | null): number | null {
  if (!h) return null;
  const n = Number(h);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 60) * 1000 : null;
}

/** Exponential backoff with jitter: ~0.5s, 1s, 2s, never under the server's Retry-After. */
export function backoffMs(attempt: number, retryAfter: number | null, random: () => number): number {
  const exp = Math.min(8000, 500 * 2 ** (attempt - 1));
  const jittered = exp * (0.5 + random() * 0.5);
  return Math.max(jittered, retryAfter ?? 0);
}

/**
 * GET json with a 15 s timeout and up to 4 attempts. 429 and 5xx, timeouts, dropped connections
 * and bodies that are not the expected shape are retried; 410 and other 4xx are not.
 */
export async function getJson<T>(deps: Deps, path: string, valid: (b: unknown) => b is T): Promise<T> {
  let last = 'unknown';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let retryAfter: number | null = null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await deps.fetch(`${deps.baseUrl()}${path}`, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (res.status === 410) throw new GoneError();
      if (!res.ok) {
        if (!isRetryable(res.status)) throw new FatalError(res.status);
        retryAfter = retryAfterMs(res.headers.get('Retry-After'));
        last = `server returned ${res.status}`;
      } else {
        const body: unknown = await res.json();
        if (valid(body)) return body;
        last = 'unexpected response';
      }
    } catch (e) {
      if (e instanceof GoneError || e instanceof FatalError) throw e;
      last = ctl.signal.aborted ? 'timed out' : 'could not reach the server';
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_ATTEMPTS) await deps.sleep(backoffMs(attempt, retryAfter, deps.random));
  }
  throw new PausedError(last);
}

const isObj = (b: unknown): b is Record<string, unknown> => typeof b === 'object' && b !== null;

export const isPage = (b: unknown): b is Page =>
  isObj(b) && Array.isArray(b.items) && (b.next_cursor === null || typeof b.next_cursor === 'string') && (b.sync_token === undefined || b.sync_token === null || typeof b.sync_token === 'string');

const q = (o: Record<string, string | number | null>) =>
  Object.entries(o)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

export function fetchTransactionsPage(deps: Deps, cursor: string | null): Promise<Page> {
  return getJson(deps, `/v1/transactions?${q({ limit: PAGE_LIMIT, cursor })}`, isPage);
}

export function fetchChangesPage(deps: Deps, since: string, cursor: string | null): Promise<Page> {
  return getJson(deps, `/v1/transactions/changes?${q({ since, limit: PAGE_LIMIT, cursor })}`, isPage);
}

export async function fetchAccounts(deps: Deps): Promise<Account[]> {
  const body = await getJson(deps, '/v1/accounts', (b): b is { items: Account[] } => isObj(b) && Array.isArray(b.items));
  return body.items.filter((a) => a && typeof a.id === 'string');
}
