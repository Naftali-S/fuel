import { isPlausible, mapOffNutrients, microCompleteness } from './nutrient-mapping';
import { createOffFetcher } from './off-api';
import { offToFoodRecord, regionFromCountries, type OffProduct } from './off-product';

describe('createOffFetcher', () => {
  const respond = (status: number, body: unknown) =>
    jest.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));

  it('requests only the needed fields and identifies the app, not the user', async () => {
    const fetchImpl = respond(200, {
      status: 1,
      product: { product_name: 'Oat drink', countries_tags: ['en:canada'], nutriments: { 'energy-kcal_100g': 46 } },
    });
    const food = await createOffFetcher({ appVersion: '0.1.0', fetchImpl })('0077544827004');
    expect(food).toMatchObject({ name: 'Oat drink', region: 'CA', sourceId: '0077544827004' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/0077544827004\?fields=code,/);
    expect((init?.headers as Record<string, string>)['User-Agent']).toBe(
      'Fuel/0.1.0 (personal nutrition app; https://github.com/Naftali-S/fuel)',
    );
  });

  it('returns null for unknown products and throws on server errors', async () => {
    expect(await createOffFetcher({ appVersion: '1', fetchImpl: respond(404, { status: 0 }) })('1')).toBeNull();
    expect(await createOffFetcher({ appVersion: '1', fetchImpl: respond(200, { status: 0 }) })('1')).toBeNull();
    await expect(createOffFetcher({ appVersion: '1', fetchImpl: respond(503, {}) })('1')).rejects.toThrow('HTTP 503');
  });

  it('reports network failures plainly', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(createOffFetcher({ appVersion: '1', fetchImpl })('1')).rejects.toThrow('No connection to Open Food Facts.');
  });
});

describe('mapOffNutrients', () => {
  it('converts grams to each nutrient’s unit', () => {
    expect(
      mapOffNutrients({
        'energy-kcal_100g': 389,
        fat_100g: 6.9,
        sodium_100g: 0.006,
        calcium_100g: 0.054,
        'vitamin-d_100g': 0.0000025,
        iron_100g: 0.0047,
      }),
    ).toEqual({ energy_kcal: 389, fat_g: 6.9, sodium_mg: 6, calcium_mg: 54, vitamin_d_mcg: 2.5, iron_mg: 4.7 });
  });

  it('falls back to kJ for energy and to salt for sodium', () => {
    const n = mapOffNutrients({ energy_100g: 1628, salt_100g: 1.25 });
    expect(n.energy_kcal).toBeCloseTo(389.101, 3);
    expect(n.sodium_mg).toBe(500);
  });

  it('reads CSV strings and ignores blanks and negatives', () => {
    expect(mapOffNutrients({ 'energy-kcal_100g': '250', fat_100g: '', proteins_100g: '-1', sugars_100g: '3.5' })).toEqual({
      energy_kcal: 250,
      sugars_g: 3.5,
    });
  });
});

describe('microCompleteness', () => {
  it('is the share of core micronutrients present', () => {
    expect(microCompleteness({ sodium_mg: 1, potassium_mg: 1, calcium_mg: 1, iron_mg: 1, fibre_g: 0, vitamin_c_mg: 0 })).toBe(0.5);
    expect(microCompleteness({ energy_kcal: 100 })).toBe(0);
  });
});

describe('isPlausible', () => {
  it('accepts consistent label data', () => {
    expect(isPlausible({ energy_kcal: 389, fat_g: 6.9, carbs_g: 66, protein_g: 13, sugars_g: 1 })).toBe(true);
    expect(isPlausible({ energy_kcal: 0 })).toBe(true); // water, diet soda
  });

  it('rejects impossible or inconsistent data', () => {
    expect(isPlausible({})).toBe(false);
    expect(isPlausible({ energy_kcal: 2000 })).toBe(false);
    expect(isPlausible({ energy_kcal: 900, fat_g: 120 })).toBe(false);
    expect(isPlausible({ energy_kcal: 100, fat_g: 20, carbs_g: 50, protein_g: 10 })).toBe(false);
    expect(isPlausible({ energy_kcal: 200, carbs_g: 10, sugars_g: 30 })).toBe(false);
  });
});

describe('regionFromCountries', () => {
  it('prefers Canada, then the US', () => {
    expect(regionFromCountries(['en:united-states', 'en:canada'])).toBe('CA');
    expect(regionFromCountries('en:france,en:united-states')).toBe('US');
    expect(regionFromCountries('en:france')).toBeNull();
    expect(regionFromCountries(null)).toBeNull();
  });
});

describe('offToFoodRecord', () => {
  const product: OffProduct = {
    code: '0077544827004',
    product_name: 'Céréales croquantes',
    product_name_en: 'Crunchy cereal',
    product_name_fr: 'Céréales croquantes',
    brands: 'Brand A, Brand B',
    countries_tags: 'en:canada,en:united-states',
    serving_size: '30 g (3/4 cup)',
    serving_quantity: '30',
    nutriments: { 'energy-kcal_100g': 389, fat_100g: 6.9, carbohydrates_100g: 66, proteins_100g: 13, sodium_100g: 0.2 },
  };

  it('builds a Canadian record with servings and a canonical barcode', () => {
    expect(offToFoodRecord(product)).toEqual({
      source: 'off',
      sourceId: '0077544827004',
      name: 'Crunchy cereal',
      nameFr: 'Céréales croquantes',
      brand: 'Brand A',
      category: null,
      region: 'CA',
      basis: 'g',
      nutrients: { energy_kcal: 389, fat_g: 6.9, carbs_g: 66, protein_g: 13, sodium_mg: 200 },
      servings: [{ label: '30 g (3/4 cup)', amount: 30 }],
      barcodes: ['0077544827004'],
      microCompleteness: 0.08,
    });
  });

  it('falls back to other names and detects millilitre servings', () => {
    const r = offToFoodRecord({
      ...product,
      product_name_en: '',
      product_name: null,
      serving_size: '250 mL',
      serving_quantity: 250,
    })!;
    expect(r.name).toBe('Céréales croquantes');
    expect(r.basis).toBe('ml');
  });

  it('skips products without a name or with implausible nutrition', () => {
    expect(offToFoodRecord({ ...product, product_name: '', product_name_en: '', product_name_fr: '' })).toBeNull();
    expect(offToFoodRecord({ ...product, nutriments: { 'energy-kcal_100g': 5000 } })).toBeNull();
  });
});
