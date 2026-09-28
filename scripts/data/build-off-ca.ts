/**
 * Builds off-ca.db: products sold in Canada from the Open Food Facts export.
 * The output is a Derivative Database under the Open Database License
 * (ODbL 1.0) and is published as such (see .github/workflows/off-data.yml).
 * Contains information from Open Food Facts, which is made available here
 * under the Open Database License (ODbL).
 *
 *   npm run data:off-ca                           # streams the official export
 *   npm run data:off-ca -- --input products.csv.gz --limit 500
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { parseArgs } from 'node:util';
import { createGunzip } from 'node:zlib';

import { openNodeDriver } from '../../src/db/testing/node-sqlite-driver';
import { OFF_NUTRIENTS } from '../../src/food/nutrient-mapping';
import { offToFoodRecord } from '../../src/food/off-product';
import { createReferenceSchema, finalizeReference, insertReferenceFood } from '../../src/food/reference-db';

const EXPORT_URL = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';
const USER_AGENT = 'Fuel-data-build/1.0 (https://github.com/Naftali-S/fuel)';
const BATCH = 5000;

const { values: args } = parseArgs({
  options: {
    input: { type: 'string' },
    out: { type: 'string', default: 'build/off-ca.db' },
    manifest: { type: 'string', default: 'build/off-ca.json' },
    limit: { type: 'string' },
  },
});

const TEXT_COLUMNS = ['code', 'product_name', 'brands', 'countries_tags', 'serving_size', 'serving_quantity', 'unique_scans_n'];
const NUTRIENT_COLUMNS = [
  'energy-kcal_100g',
  'energy-kj_100g',
  'energy_100g',
  'salt_100g',
  'folates_100g',
  ...Object.keys(OFF_NUTRIENTS).map((k) => `${k}_100g`),
];

async function openInput(): Promise<NodeJS.ReadableStream> {
  if (args.input) return createReadStream(args.input).pipe(createGunzip());
  console.log(`Streaming ${EXPORT_URL}`);
  const res = await fetch(EXPORT_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  return Readable.fromWeb(res.body as import('node:stream/web').ReadableStream).pipe(createGunzip());
}

async function main() {
  const limit = args.limit ? Number(args.limit) : Infinity;
  const out = resolve(args.out!);
  mkdirSync(dirname(out), { recursive: true });
  if (existsSync(out)) rmSync(out);
  const db = openNodeDriver(out);
  await createReferenceSchema(db);

  const lines = createInterface({ input: await openInput(), crlfDelay: Infinity });
  let width = 0; // header column count; 0 until the header is read
  let col: Record<string, number> = {};
  const stats = { rows: 0, canadian: 0, kept: 0, malformed: 0, rejected: 0, duplicates: 0 };
  let batch: Parameters<typeof insertReferenceFood>[1][] = [];
  let boosts: number[] = [];

  const flush = async () => {
    await db.transaction(async (tx) => {
      for (const [i, food] of batch.entries()) {
        try {
          await insertReferenceFood(tx, food, boosts[i]);
          stats.kept++;
        } catch {
          stats.duplicates++;
        }
      }
    });
    batch = [];
    boosts = [];
  };

  for await (const line of lines) {
    if (width === 0) {
      const header = line.split('\t');
      width = header.length;
      col = Object.fromEntries(header.map((h, i) => [h, i]));
      for (const c of TEXT_COLUMNS) if (col[c] === undefined) throw new Error(`Export is missing column ${c}`);
      continue;
    }
    stats.rows++;
    if (!line.includes('en:canada')) continue;
    const f = line.split('\t');
    if (f.length !== width) {
      stats.malformed++;
      continue;
    }
    if (!f[col.countries_tags].split(',').includes('en:canada')) continue;
    stats.canadian++;

    const nutriments: Record<string, string> = {};
    for (const c of NUTRIENT_COLUMNS) if (col[c] !== undefined) nutriments[c] = f[col[c]];
    const food = offToFoodRecord({
      code: f[col.code],
      product_name: f[col.product_name],
      brands: f[col.brands],
      countries_tags: f[col.countries_tags],
      serving_size: f[col.serving_size],
      serving_quantity: f[col.serving_quantity],
      nutriments,
    });
    if (!food) {
      stats.rejected++;
      continue;
    }
    const scans = Number(f[col.unique_scans_n]) || 0;
    batch.push(food);
    boosts.push(0.5 * Math.log10(1 + scans));
    if (batch.length >= BATCH) await flush();
    if (stats.kept + batch.length >= limit) break;
  }
  if (batch.length) await flush();

  const version = new Date().toISOString().slice(0, 10);
  await finalizeReference(db, {
    source: 'off',
    region: 'CA',
    title: 'Open Food Facts – products sold in Canada',
    version,
    license: 'Open Database License (ODbL) 1.0',
    license_url: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution:
      'Contains information from Open Food Facts (https://world.openfoodfacts.org), which is made available here under the Open Database License (ODbL).',
    foods: String(stats.kept),
  });
  await db.exec('VACUUM');
  db.close();

  const bytes = statSync(out).size;
  const sha256 = createHash('sha256').update(readFileSync(out)).digest('hex');
  const manifest = { source: 'off', region: 'CA', version, foods: stats.kept, bytes, sha256, license: 'ODbL-1.0' };
  writeFileSync(resolve(args.manifest!), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ ...stats, bytes }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
