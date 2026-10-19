# TDD evidence: code-review fixes (2026-10-19)

**Source:** whole-codebase review of `3881e31`. The user asked to fix every High
and Medium finding, plus the cheap Low ones. No plan file was used; the journeys
below come from the review findings.

## User journeys

- As a user, when I pick a food I've saved before, my edits and filled-in estimates are kept.
- As a user, editing my own food never turns estimated values into "label" values.
- As a user, a day where I only logged a snack doesn't count as a complete day in my energy estimate.
- As a user, I'm told when a newer Canadian products file is available, and a damaged download is never installed.
- As a user, saving data while other screens read or write never mixes up database transactions.
- As a user, the Today screen moves to the new day after midnight.

## Task report

| # | Finding | Fix | Validation |
|---|---|---|---|
| 1 | HIGH: duplicate search rows; reference pick overwrote saved food | `searchFoods` skips reference hits already saved; `ensureSaved` returns the stored copy (`findFoodId`) | `src/food/catalog.test.ts` |
| 2 | Editor exposed estimates as label values | `labelValues` omits estimates; `keepEstimates` carries them over; editor explains | `src/food/food-logic.test.ts` |
| 3 | Any logged past day counted complete | `defaultStatus` needs ≥ `MIN_COMPLETE_KCAL` (1000) | `src/log/log-store.test.ts` |
| 4 | OFF Canada never updated | Weekly manifest check (`shouldCheckForUpdate`, `isNewerVersion`) + "Update" button | `src/food/reference-updates.test.ts` |
| 5 | Download checked by size only | Manifest gains `md5`; `verifyDownload` checks size + MD5 | `src/food/reference-updates.test.ts` |
| 6 | Overlapping expo-sqlite transactions | `createSerialQueue` per connection in `wrapExpoDatabase` | `src/db/serial.test.ts` |
| 7 | Screen logic untested | Extracted `dayTitle`, `entryAmount`, `lineNotes` | `src/log/format.test.ts`, `src/nutrition/nutrition.test.ts` |
| 8 | Sat fat %DV ignored trans | `DV_INCLUDES` adds trans fat to the sat-fat %DV | `src/nutrition/nutrition.test.ts` |
| 9 | Today stale after midnight | `useToday` hook (focus + foreground) | typecheck/lint (UI) |
| 10 | Migration v3 read a mutable constant | Frozen `MIGRATION_V3_DAILY_VALUES` + equality test | `src/nutrition/nutrition.test.ts` |
| 11 | Unused Face ID permission string | `faceIDPermission: false` | `expo config --type introspect`: key absent |
| 12 | Progress bars not accessible | `accessibilityRole="progressbar"` + value/label | lint (UI) |
| 13 | Dev-tooling advisories | `shell-quote` override `^1.11.0`; SDK 57 patch updates via `expo install --fix` | `npm audit`: critical 1 → 0, high 30 → 26; `expo-doctor` 21/21 |

## RED → GREEN evidence

- **RED** (commit `2ead88d`, `npx jest`): `Tests: 10 failed, 153 passed, 163 total`; 7 suites failed.
  Each failure was the intended one: modules not found (`./format`, `./reference-updates`,
  `./serial`), `keepEstimates` / `lineNotes` not functions, catalog duplicate and overwrite
  assertions, the 156 kcal day shown as `complete`, sat-fat %DV `0.5` instead of `0.6`, and
  `MIGRATION_V3_DAILY_VALUES` missing.
- **GREEN** (`npx jest --ci`): `Tests: 175 passed, 175 total`; `Test Suites: 19 passed`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A saved food appears once in search, as yours | catalog.test.ts: lists a food you have saved once | integration (SQLite) | PASS |
| 2 | Picking a reference copy never overwrites saved nutrients/estimates | catalog.test.ts: never overwrites a saved food | integration | PASS |
| 3 | Editor values exclude estimates | food-logic.test.ts: shows only label values | unit | PASS |
| 4 | Unreplaced estimates survive an edit; entered ones replace them | food-logic.test.ts: keeps estimates… | unit | PASS |
| 5 | A < 1000 kcal past day defaults to partial; explicit "complete" wins | log-store.test.ts: treats a past day with too little logged… | integration | PASS |
| 6 | Engine day series uses the new rule | log-store.test.ts: feeds the engine one row per day | integration | PASS |
| 7 | Update check at most weekly; only newer dated builds count | reference-updates.test.ts | unit | PASS |
| 8 | Downloads must match size and MD5 (size only for old manifests) | reference-updates.test.ts: verifyDownload | unit | PASS |
| 9 | Queued tasks run in order without overlap; failures don't block | serial.test.ts | unit | PASS |
| 10 | Day titles and entry amounts render correctly | format.test.ts | unit | PASS |
| 11 | Row notes describe %DV, coverage, limits | nutrition.test.ts: describes a row in plain words | unit | PASS |
| 12 | Sat fat %DV = (sat + trans) / 20 g | nutrition.test.ts: uses saturated + trans fat… | unit | PASS |
| 13 | Migration v3 values equal the current reference table | nutrition.test.ts: match the values frozen into migration v3 | unit | PASS |

## Addendum: Open Food Facts export format change

Re-running the data build after #5 exposed a new upstream problem.
- The export dropped the `brands` column ("Export is missing column brands").
- Text fields now contain unquoted line breaks, so rows span lines.

| Stage | Evidence |
|---|---|
| RED (`8460361`) | `scripts/data/off-export.test.ts`: `Cannot find module './off-export'` |
| GREEN (`de18133`) | `off-export.test.ts` 6 passed; full suite 181 passed |
| Live check | Local build against today's export read 136,923 rows; 0.8% of fragments unrecoverable |
| Published | `off-ca` release, 2026-10-19: 109,047 products, 40.96 MB, manifest includes `md5` |

Guarantees:
- split rows are rejoined;
- fragments that overshoot the column count are dropped, and the next record still reads;
- the brand comes from `brands`, then `brand_owner`, then the slug ("president-s-choice" → "President's Choice");
- the build fails loudly if it reads zero rows.

## Coverage and known gaps

- Screens (#9, #12 and the wiring for #4–#6) are checked by typecheck and lint, not by
  component tests. The project has no React Native rendering test setup yet; the logic
  they call is unit-tested.
- The MD5 check takes effect once the monthly data build publishes a manifest with `md5`.
  Until then, downloads fall back to the size check.
- The remaining audit advisories are in Expo/Metro/Jest build tooling that isn't shipped in
  the app. They're tracked through Expo patch releases.
