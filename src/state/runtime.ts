import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { defaultDeps } from '../sync/api';
import { SyncEngine } from '../sync/engine';
import type { EngineSnapshot } from '../sync/engine';
import { SqliteStore } from '../sync/sqliteStore';

export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4010';

const KEY_URL = 'api_url';
const KEY_PENDING = 'include_pending';

interface TrackState {
  ready: boolean;
  snapshot: EngineSnapshot | null;
  query: string;
  apiUrl: string;
  includePending: boolean;
  setQuery: (q: string) => void;
  refresh: (reason?: string) => Promise<void>;
  saveApiUrl: (url: string) => Promise<void>;
  setIncludePending: (v: boolean) => Promise<void>;
}

let engine: SyncEngine | null = null;
let store: SqliteStore | null = null;
let booted: Promise<void> | null = null;

export const useTrack = create<TrackState>((set, get) => ({
  ready: false,
  snapshot: null,
  query: '',
  apiUrl: DEFAULT_API_URL,
  includePending: true,
  setQuery: (query) => set({ query }),
  refresh: async (reason = 'pull to refresh') => {
    await engine?.requestSync(reason);
  },
  saveApiUrl: async (url) => {
    const clean = url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/.+/i.test(clean)) throw new Error('Enter an address like http://192.168.1.20:4010');
    await store?.setSetting(KEY_URL, clean);
    const changed = clean !== get().apiUrl;
    set({ apiUrl: clean });
    if (changed) await engine?.switchServer();
  },
  setIncludePending: async (v) => {
    set({ includePending: v });
    await store?.setSetting(KEY_PENDING, v ? '1' : '0');
  },
}));

/** Open the database, show what is stored, then sync. Safe to call more than once. */
export function boot(): Promise<void> {
  if (booted) return booted;
  booted = (async () => {
    store = await SqliteStore.open();
    const savedUrl = await store.getSetting(KEY_URL);
    const savedPending = await store.getSetting(KEY_PENDING);
    useTrack.setState({ apiUrl: savedUrl ?? DEFAULT_API_URL, includePending: savedPending !== '0' });

    engine = new SyncEngine({ store, deps: defaultDeps(() => useTrack.getState().apiUrl) });
    engine.subscribe((snapshot) => useTrack.setState({ snapshot }));
    await engine.init();
    useTrack.setState({ ready: true, snapshot: engine.getSnapshot() });

    // every trigger goes through the same single-flight entry point
    AppState.addEventListener('change', (s) => {
      if (s === 'active') void engine?.requestSync('back in the app');
    });
    let wasOnline: boolean | null = null;
    NetInfo.addEventListener((n) => {
      const online = n.isConnected === true && n.isInternetReachable !== false;
      if (online && wasOnline === false) void engine?.requestSync('back online');
      wasOnline = online;
    });
    void engine.requestSync('app start');
  })();
  return booted;
}
