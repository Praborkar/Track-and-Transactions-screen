# AI disclosure

## Tools and what each did

- Claude (Anthropic), chat: Read the assignment and the mock API, and wrote the plan: the list of data traps and API behaviours, the stack choices, the phases and the test plan.
- Claude Code (Anthropic, Sonnet 5.5) in VS Code: Wrote most of the code and the tests: the domain rules, the sync engine and API client, the SQLite store, the screens, the fake server for tests, the dev script and the build config. It ran the tests, committed to git and pushed. It also read the mock data to produce the counts in these documents.
- Me: I set the goals and scope, ran the app on my own Android phone (Expo Go, then the APK), reported what broke with screenshots and logs, asked for the month picker and filters, asked for the Simplify Money look, built the APK, and recorded the walkthrough.

These documents were first drafted by Claude Code from the data, the code and the test results, and then I read and edited them. The numbers in them were computed from the fixture files, not typed from memory.

No other AI tool was used for the code.

## What I did not trust the AI on

Every rule has a test, and I made the AI prove each test by breaking the rule on purpose and showing the test fail. The results are in [TEST_PROOF.md](TEST_PROOF.md). Two of the first attempts were not caught (the random-data test missed a stale edit arriving after a newer one, and one break was applied to the wrong branch of the code). We fixed the test, not the result.

## Where the AI was wrong

### The folder name that hid every screen

What the AI wrote: It put the non-screen code in `src/app/`: `src/app/runtime.ts` (the store) and `src/app/selectors.ts` (the list view), next to the real screens in the top-level `app/` folder.

What happened: On my phone the app opened to a red error: `Element type is invalid: expected a string … but got: undefined`. The Metro log said `Using src/app as the root directory for Expo Router` and warned that `./runtime.ts` and `./selectors.ts` "is missing the required default export". Expo Router treats a `src/app` folder as the folder of routes, and if it exists it ignores the top-level `app/`. So it was looking for screens in a folder that held no screens, and the real Track screen was never loaded.

Why nothing caught it: The AI had just reported 100 passing tests, a clean TypeScript check and a successful Android bundle export. All of that was true. None of it runs the router, so none of it could see the problem. It only showed up on a real phone.

The fix: I pasted the log back, and the code moved to `src/state/`. Same files, different folder name.

| Before | After |
|---|---|
| `src/app/runtime.ts`, `src/app/selectors.ts` | `src/state/runtime.ts`, `src/state/selectors.ts` |
| Expo Router uses `src/app` as the routes folder; the Track screen is never found | Expo Router uses the top-level `app/`; the Track screen loads |

### A test that was wrong, not the code

The AI wrote a test that said 123,456,789,056 paise should print as `₹12,34,56,789.56`. The code returned `₹1,23,45,67,890.56`. The code was right: that amount is ₹1,23,45,67,890.56, and the test had the digits of a smaller number. I checked it by hand. Had the AI changed the code to satisfy its own test, the money formatter would have been wrong for large amounts. The test now uses `12345678900` paise and `₹12,34,56,789.00`.

### Smaller ones

- Paise read as rupees: In the planning document the AI read "25,00,000 paise" as ₹25,00,000. It is ₹25,000. It caught this itself while rechecking figures. The self transfer of ₹25,000 is the figure that matters for the October spend check.
- A dev script that picked the wrong network address: `npm run dev` used the first network address it found, which can belong to a virtual adapter (WSL) or another network. The phone could not reach it and the app sat on "Sync paused". The script now skips virtual adapters and prefers Wi-Fi.
- A fresh `npm install` failed: The AI had installed two test helpers with `--legacy-peer-deps`, which hid a conflict: npm picked Babel 8 packages that need Babel core 8, while Expo uses Babel 7. A clean install on my machine failed with `ERESOLVE`. They are now pinned to 7.x, and the repo has an `.npmrc` with `legacy-peer-deps=true`, the usual setting for Expo.
- A navigation error in Settings: "Save and sync" called `router.back()`. After a reload, Settings can be the only screen, and the dev build logged `GO_BACK was not handled by any navigator`. It now goes to the main screen if there is nothing to go back to.

## What this tells me about using it

The tests and the type checker gave the AI a lot of false comfort. The two failures that hurt (the folder name, the network address) were found on the phone, from what I saw and pasted back. I would run the real app earlier next time, before declaring a phase done.
