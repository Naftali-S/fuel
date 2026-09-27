This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building (this project)

The owner develops on Windows with no Mac. iOS binaries are built unsigned by `.github/workflows/ios-build.yml` on GitHub macOS runners and sideloaded with AltStore/SideStore (free Apple ID). See `docs/SIDELOADING.md`. EAS/TestFlight may be added later under a collaborator's Apple Developer team.

## Project rules

- **Legal first.** Never use another nutrition app's name, UI, copy, icons or assets. Write our own algorithms from published science. Only permissively licensed dependencies (CI enforces this). Attribute data per `DATA_LICENSES.md`.
- **Canada first.** Food data order: Canadian Nutrient File, Open Food Facts (Canada), then USDA (flagged as US data).
- **Macros and micronutrients.** Food data stays nutrient-agnostic. Never hard-code a macro-only schema.
- **Privacy.** Personal data stays on the device. Never commit keys, tokens, real user data or exported backups. Keys live in `expo-secure-store`.
- **Pure engine.** Calculation code (trend weight, expenditure, targets, barcode handling) stays free of React Native imports and is unit-tested with Jest.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
