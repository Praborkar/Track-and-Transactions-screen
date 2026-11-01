# What is unfinished

Things I did not build, did not measure, or only checked in part. Ran out of time is the honest reason for most of them.

## Not built

- Background sync: Sync runs at app start, when the app returns to the foreground, when the network comes back, on pull to refresh and on Retry. All of these go through one `requestSync` function. It does not run when the app is closed. I would register the same function with `expo-background-task`.
- Retry on a timer: After a failed sync the banner says "Sync paused" and stays until one of the triggers above fires or I tap Retry.
- A first-run prompt for the server address: The APK is built with the emulator address (`http://10.0.2.2:4010`) as its default. On a real phone, the first sync fails until the address is set in Settings. A prompt on first launch would be better.
- The "reconcile" row that compares my totals with `/v1/summary/months` and explains the difference. I only ignore that endpoint.
- Search highlighting, an account filter, sticky month headers, dark mode, iOS: The app is Android and light only, and I have not built or run it on iOS.

## Not measured

- Performance: I took no numbers. The list is a FlatList with fixed row heights and `getItemLayout`, and the view is memoised, but I never profiled it on a mid-range Android phone, and I never scrolled the whole history against a stopwatch. One thing I suspect: building the list sorts all 4,686 rows and recomputes every month's totals each time a page arrives (about 48 times during the first sync) and on every keystroke in search. If that is slow, I would debounce search and compute totals incrementally or in SQL.
- TalkBack: The rows, month headers, chips, banner and settings have accessibility labels and roles, and the sync banner is a live region. I have not used the app with a screen reader, so I cannot say what is broken.
- Memory: The full raw record of every row is parsed from SQLite into memory at launch. I did not check what that costs.

## Only partly checked

- The SQLite store: The automated tests use an in-memory store that follows the same commit rule (all or nothing). The SQL itself and the transaction behaviour were only exercised by running the app on my phone (Expo Go and the APK), not by a test.
- Kill and resume, and the 410 resync: These are proven with a fake server, a dropped connection and a simulated crash during a commit, not against the real mock server. The real-server integration test covers a full sync and a second sync with the saved token, with failures on (about 45 seconds) and off. It does not cover a rejected token.
- Checked by hand on my phone: the history loads page by page through the server's 500, 429 and 503; October 2026 shows ₹1,09,784.98 spent and ₹2,45,135.00 earned, as in the checkpoint; stopping the server mid-use leaves the rows on screen with a red banner and a Retry button; the APK installs and loads the history once the server address is set.

## Judgement calls that could be wrong

- Pending rows count in totals: The data cannot prove it. It is a setting.
- A zero amount is rejected: A genuine ₹0 row would be dropped and counted in "could not be read".
- A foreign row with no rate is left out of spent and earned and shown as "Not converted". Another reasonable choice is to ask the server.
- Tombstones never expire, so the list of deleted ids only grows.
- A resync sweeps rows the server no longer lists: Right for rows deleted while the app was away. Wrong if a server ever returned a partial list.
- Time is fixed to IST: Right for the users this assignment names. Wrong for anyone else.

## Housekeeping

- `mock/` is a copy of the company's mock server and fixtures (about 1.1 MB), kept so tests and `npm run dev` work from a clean clone.
- Task 0 (referrals), the Task 1 teardown and the CV are outside this repository.
