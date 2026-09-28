/**
 * Builds assets/data/cnf.db from Health Canada's Canadian Nutrient File 2015.
 * Contains information licensed under the Open Government Licence – Canada.
 *
 *   npm run data:cnf                  # downloads the official CSV zip
 *   npm run data:cnf -- --zip cnf.zip # or uses a local copy
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { unzipSync } from 'fflate';

import { openNodeDriver } from '../../src/db/testing/node-sqlite-driver';
import { CNF_NUTRIENTS, microCompleteness } from '../../src/food/nutrient-mapping';
import { createReferenceSchema, finalizeReference, insertReferenceFood } from '../../src/food/reference-db';
import type { FoodRecord, Serving } from '../../src/food/types';
import { parseCsvRecords } from './csv';

const CNF_URL =
  'https://www.canada.ca/content/dam/hc-sc/migration/hc-sc/fn-an/alt_formats/zip/nutrition/fiche-nutri-data/cnf-fcen-csv.zip';
const MAX_SERVINGS = 12;

const { values: args } = parseArgs({
  options: {
    zip: { type: 'string' },
    out: { type: 'string', default: 'assets/data/cnf.db' },
    manifest: { type: 'string', default: 'src/food/cnf-manifest.json' },
  },
});

async function loadZip(): Promise<Uint8Array> {
  if (args.zip) return new Uint8Array(readFileSync(args.zip));
  console.log(`Downloading ${CNF_URL}`);
  const res = await fetch(CNF_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function table(files: Record<string, Uint8Array>, name: string): Record<string, string>[] {
  const entry = Object.keys(files).find((k) => k.split('/').pop()?.toUpperCase() === `${name}.CSV`);
  if (!entry) throw new Error(`Missing ${name}.csv in the CNF archive`);
  // CNF files are Windows-1252 encoded.
  return parseCsvRecords(new TextDecoder('windows-1252').decode(files[entry]));
}

const round = (x: number, digits: number) => Number(x.toFixed(digits));

async function main() {
  const files = unzipSync(await loadZip());
  const groups = new Map(table(files, 'FOOD GROUP').map((r) => [r.FoodGroupID, r.FoodGroupName]));
  const measures = new Map(table(files, 'MEASURE NAME').map((r) => [r.MeasureID, r.MeasureDescription]));

  const nutrients = new Map<string, Record<string, number>>();
  for (const r of table(files, 'NUTRIENT AMOUNT')) {
    const id = CNF_NUTRIENTS[Number(r.NutrientID)];
    const value = Number(r.NutrientValue);
    if (!id || r.NutrientValue === '' || !Number.isFinite(value) || value < 0) continue;
    const n = nutrients.get(r.FoodID) ?? {};
    n[id] = value;
    nutrients.set(r.FoodID, n);
  }

  const servings = new Map<string, Serving[]>();
  for (const r of table(files, 'CONVERSION FACTOR')) {
    const label = measures.get(r.MeasureID)?.trim();
    const factor = Number(r.ConversionFactorValue);
    if (!label || !(factor > 0) || /^100\s*(g|ml)$/i.test(label)) continue;
    const list = servings.get(r.FoodID) ?? [];
    if (!list.some((s) => s.label === label)) list.push({ label, amount: round(factor * 100, 1) });
    servings.set(r.FoodID, list);
  }

  const foods: FoodRecord[] = [];
  for (const r of table(files, 'FOOD NAME')) {
    const n = nutrients.get(r.FoodID);
    if (!n || n.energy_kcal === undefined || !r.FoodDescription) continue;
    foods.push({
      source: 'cnf',
      sourceId: r.FoodID,
      name: r.FoodDescription,
      nameFr: r.FoodDescriptionF || null,
      brand: null,
      category: groups.get(r.FoodGroupID) ?? null,
      region: 'CA',
      basis: 'g',
      nutrients: n,
      servings: (servings.get(r.FoodID) ?? []).sort((a, b) => a.amount - b.amount).slice(0, MAX_SERVINGS),
      barcodes: [],
      microCompleteness: microCompleteness(n),
    });
  }
  foods.sort((a, b) => Number(a.sourceId) - Number(b.sourceId));

  const out = resolve(args.out!);
  mkdirSync(dirname(out), { recursive: true });
  if (existsSync(out)) rmSync(out);
  const db = openNodeDriver(out);
  await createReferenceSchema(db);
  await db.transaction(async (tx) => {
    for (const f of foods) await insertReferenceFood(tx, f);
  });
  await finalizeReference(db, {
    source: 'cnf',
    title: 'Canadian Nutrient File 2015',
    publisher: 'Health Canada',
    license: 'Open Government Licence – Canada',
    license_url: 'https://open.canada.ca/en/open-government-licence-canada',
    attribution: 'Contains information licensed under the Open Government Licence – Canada.',
    foods: String(foods.length),
  });
  await db.exec('VACUUM');
  db.close();

  const sha256 = createHash('sha256').update(readFileSync(out)).digest('hex');
  const manifest = { source: 'cnf', title: 'Canadian Nutrient File 2015', foods: foods.length, sha256 };
  writeFileSync(resolve(args.manifest!), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${out}: ${foods.length} foods, sha256 ${sha256.slice(0, 12)}…`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
