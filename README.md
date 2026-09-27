# Fuel

A personal, local-first nutrition coach for iPhone. It is being built to:

- log food with barcode scanning and a Canadian-first food library (macros **and** micronutrients),
- estimate energy expenditure adaptively from food intake and body-weight trend,
- use lifting data from Hevy (via its official API) as a training signal,
- adjust calorie and macro targets weekly toward the user's goal.

> **Status:** Phase 0: build pipeline and on-device checks (barcode scanner, Apple Health).

Fuel is an independent personal project. It is not affiliated with or endorsed by
any other nutrition or fitness app, Hevy, Apple, Health Canada, Open Food Facts or
the USDA. It is **not medical advice**. See [DATA_LICENSES.md](DATA_LICENSES.md).

## Develop (Windows, no Mac)

Requirements: Node 22+, Git, a GitHub account, an iPhone with AltStore or SideStore.

```bash
npm install
npm run check      # typecheck + lint + unit tests
npm start          # Metro for the development client (phone and PC on the same Wi-Fi)
```

Native iOS builds run on GitHub Actions macOS runners. See
[docs/SIDELOADING.md](docs/SIDELOADING.md) for building and installing on the phone.

## Privacy

All personal data (food log, weights, workouts) stays on the device. API keys
(Hevy, USDA) are entered in the app and kept in the iOS Keychain; they are never
committed. CI scans every push for leaked secrets.

## License

Code: [MIT](LICENSE). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Data: see [DATA_LICENSES.md](DATA_LICENSES.md).
