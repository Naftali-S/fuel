Products sold in Canada, extracted monthly from the [Open Food Facts](https://world.openfoodfacts.org) database for use by the Fuel app.

**Licence:** this database is made available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Individual contents are under the [Database Contents License](https://opendatacommons.org/licenses/dbcl/1-0/).

Contains information from Open Food Facts, which is made available here under the Open Database License (ODbL). Data © Open Food Facts contributors.

**How it's made:** [`scripts/data/build-off-ca.ts`](../../blob/main/scripts/data/build-off-ca.ts)
- keeps products tagged "Canada" that have plausible nutrition data;
- converts nutrients to per-100 g (or per-100 mL) amounts;
- stores the result as SQLite with a full-text index.

Nothing is added beyond this. `off-ca.json` gives the build date, product count and SHA-256.

Open Food Facts data is contributed by volunteers and may contain errors. Always check the label. Fuel is not affiliated with or endorsed by Open Food Facts.
