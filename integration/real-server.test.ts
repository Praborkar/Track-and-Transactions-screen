/**
 * @jest-environment node
 *
 * Runs the real mock server (mock/server.js) and the real engine over real HTTP.
 * SM_CALM=1 turns the deliberate failures and delays off so the run takes a second or two.
 * The same engine against the hostile server takes 20-40 s: `npm run integration:hostile`.
 */
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import path from 'path';
import { computeMonthTotals, paiseToPlain } from '../src/domain';
import { defaultDeps } from '../src/sync/api';
import { SyncEngine } from '../src/sync/engine';
import { MemoryStore } from '../src/sync/memoryStore';

const checkpoint = require('../mock/fixtures/checkpoint.json');
const PORT = 4091;
let server: ChildProcess;

beforeAll(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '../mock/server.js')], { env: { ...process.env, PORT: String(PORT), SM_CALM: process.env.SM_HOSTILE ? '0' : '1' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/v1/health`)).ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('mock server did not start');
});

afterAll(() => {
  server.kill();
});

it('syncs the real server to the checkpoint', async () => {
  const store = new MemoryStore();
  const e = new SyncEngine({ store, deps: defaultDeps(() => `http://127.0.0.1:${PORT}`) });
  await e.init();
  await e.requestSync('integration');
  expect(e.getSnapshot().status.kind).toBe('idle');
  expect(store.txns.size).toBe(checkpoint.transaction_count);
  const got: Record<string, { spend: string; income: string }> = {};
  for (const [m, t] of computeMonthTotals(e.getSnapshot().ledger.txns.values())) got[m] = { spend: paiseToPlain(t.spent), income: paiseToPlain(t.earned) };
  expect(got).toEqual(checkpoint.months);

  // a second sync with the saved token finds nothing new and changes nothing
  const before = store.txns.size;
  await e.requestSync('again');
  expect(store.txns.size).toBe(before);
}, 120000);
