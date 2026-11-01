# Track and Transactions screen

A React Native (Expo) rebuild of the Simplify Money **Track** screen: every transaction across three
accounts, month by month, with what was spent and earned, search, a detail view, and a cache that keeps
working when the network does not.

## Run it in under five minutes

Needs Node 18 or newer, and the Expo Go app on an Android phone on the same Wi-Fi as your computer.

```bash
npm install
npm run dev
```

`npm run dev` starts the mock API (`mock/server.js`, port 4010) and the Expo dev server together, and points
the app at your computer's Wi-Fi address. Scan the QR code with Expo Go.

- It uses the real, hostile server behaviour (a 500, a 429, a 503, slow pages). Add `SM_CALM=1` to switch that off.
- If your phone cannot reach the server, open **Settings** in the app and type the address. Allow Node through your firewall for port 4010.
- Android emulator: `http://10.0.2.2:4010`. The default comes from `EXPO_PUBLIC_API_URL` (see `.env.example`).
- Your own server or different data: `FIXTURES=/path/to/dir node mock/server.js`, then set the address in Settings. The app keeps what it has on screen and replaces it only when the new server has sent everything.

## Tests

```bash
npm test                  # unit and sync tests (fake server, fake clock), no network
npm run integration       # the real engine against the real mock server, failures off
npm run integration:hostile   # same, with the server's real failures and delays (about 45 s)
```

Every rule has a test that fails when the rule is removed. `__tests__/randomData.test.ts` builds random
datasets in both record shapes (transfers, USD rows, duplicates, edits, deletes, stale copies, month-boundary
times) and compares the app's totals with a brute-force count, for 12 seeds.

## How it is put together

```
src/domain   pure rules, no React, no network: normalize both record shapes, merge by id, month totals, search, money
src/sync     API client (timeout, retry, Retry-After), the sync engine, and the SQLite store
src/state    the store the screens read, and the list view built from it
app/         screens (expo-router): Track, transaction detail, settings
mock/        the mock API and its data, copied unchanged
```

Network data goes through the domain rules into SQLite; the screens read only from there. A failed or killed
sync cannot change what the user already sees.

## Write-up

- [Decision log](docs/DECISION_LOG.md): ten decisions, what I rejected and why
- [What the data made me decide](docs/DATA_DECISIONS.md): what I saw in the data and the API, what I chose, what I would do with more time
- [Review of PR #412](docs/PR_412_REVIEW.md): ten comments, nine of them blocking
- [AI disclosure](docs/AI_DISCLOSURE.md): tools used, and where the AI was wrong
- [What is unfinished](docs/UNFINISHED.md)
- [Do the tests catch real breakage?](docs/TEST_PROOF.md): every rule broken on purpose, with the results

## Building an APK

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

Cleartext HTTP is enabled in `app.json` (the mock server is plain HTTP). The server address can be changed inside
the app.
