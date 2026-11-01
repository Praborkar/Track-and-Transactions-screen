# Do the tests catch real breakage?

For each rule I broke the code on purpose, ran the tests, and counted how many failed. Then I put the code back. These are the runs that were done, including the ones that did not catch the break.

## Unit tests (domain)

| Break | Tests that failed |
|---|---|
| Drop the IST offset (months by UTC) | 2 |
| Exclude transfers by category name instead of by marker | 2 |
| Newest `updated_at` no longer wins (arrival order wins) | 2 |
| Ignore tombstones (deleted rows come back) | 1 |
| Use the raw USD amount instead of `fx.inr_minor` | 3 |
| Accept a timestamp with no time zone | 2 |
| Western digit grouping (1,234,567) in `formatInr` | 3 |

## Sync tests (fake server, fake clock)

| Break | Tests that failed |
|---|---|
| Save the sync token on every page, not only the last | 1 (kill and resume) |
| Sweep unseen rows on every page, not only the last | 1 (rejected token) |
| Remove the single-sync lock | 1 (5 syncs at once) |
| Clear the rows in the error path | 4 |
| Ignore `Retry-After` | 2 |
| Remove the stale-run check | 1 (cancelled run cannot write) |

## Random datasets (12 seeds, 36 tests)

| Break | Tests that failed |
|---|---|
| Exclude by category `TRANSFERS_OUT` | 12 |
| Ignore tombstones | 12 |
| Arrival order wins over `updated_at` | 12 |
| Ignore the old-format transfer marker (`linked_account`) | 12 |
| UTC months | 24 |

## What did not work the first time

- The random-data test did not notice "arrival order wins" at first, because its generator never sent an older edit after a newer one. I added that case, and the break now fails 12 tests.
- My first "old-format marker" break edited the wrong branch of the code and failed nothing. I redid it on the right line.
- My first float-money break added an artificial error to force a failure, so I do not count it. In fact `Math.round(parseFloat(x) * 100)` gives the same paise as string parsing for every amount with two decimals, so no test of the parser can tell the two apart. Wrong grouping is caught (see above). Whether the tests catch float sums is untested: I did not run that break.
- A break that made the sync restart from page 1 never ended (the loop never reached the last page), so there is no test count for it. I killed that run.

## Run them

```
npm test                       # 104 unit, sync and random-data tests, no network
npm run integration            # real engine against the real mock server, failures off
npm run integration:hostile    # same, with the server's 500, 429, 503 and slow pages (about 45 s)
```
