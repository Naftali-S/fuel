import { createUsdaClient, fdcToFoodRecord, mapFdcNutrients, type FdcFood } from './usda';

const cereal: FdcFood = {
  fdcId: 2001234,
  description: 'CHEERIOS CEREAL',
  dataType: 'Branded',
  brandOwner: 'General Mills',
  gtinUpc: '00016000275287',
  servingSize: 28,
  servingSizeUnit: 'GRM',
  householdServingFullText: '1 cup',
  foodNutrients: [
    { nutrientNumber: '208', unitName: 'KCAL', value: 359 },
    { nutrientNumber: '203', unitName: 'G', value: 12.8 },
    { nutrientNumber: '204', unitName: 'G', value: 6.41 },
    { nutrientNumber: '205', unitName: 'G', value: 74.4 },
    { nutrientNumber: '269', unitName: 'G', value: 5.13 },
    { nutrientNumber: '307', unitName: 'MG', value: 487 },
    { nutrientNumber: '318', unitName: 'IU', value: 3750 },
    { nutrientNumber: '324', unitName: 'IU', value: 200 },
    { nutrientNumber: '417', unitName: 'UG', value: 500 },
  ],
};

describe('mapFdcNutrients', () => {
  it('maps nutrient numbers and converts IU only when µg values are missing', () => {
    expect(mapFdcNutrients(cereal.foodNutrients!)).toEqual({
      energy_kcal: 359,
      protein_g: 12.8,
      fat_g: 6.41,
      carbs_g: 74.4,
      sugars_g: 5.13,
      sodium_mg: 487,
      vitamin_a_mcg: 1125,
      vitamin_d_mcg: 5,
      folate_mcg: 500,
    });
    expect(
      mapFdcNutrients([
        { nutrientNumber: '324', unitName: 'IU', value: 400 },
        { nutrientNumber: '328', unitName: 'UG', value: 7 },
        { nutrientNumber: '208', unitName: 'KJ', value: 1500 },
      ]),
    ).toEqual({ vitamin_d_mcg: 7 });
  });
});

describe('fdcToFoodRecord', () => {
  it('builds a US record with a tidy name, serving and canonical barcode', () => {
    expect(fdcToFoodRecord(cereal)).toMatchObject({
      source: 'usda',
      sourceId: '2001234',
      name: 'Cheerios Cereal',
      brand: 'General Mills',
      region: 'US',
      basis: 'g',
      servings: [{ label: '1 cup (28 g)', amount: 28 }],
      barcodes: ['0016000275287'],
    });
  });

  it('rejects foods without plausible energy', () => {
    expect(fdcToFoodRecord({ ...cereal, foodNutrients: [] })).toBeNull();
  });
});

describe('createUsdaClient', () => {
  const respond = (status: number, body: unknown) =>
    jest.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));

  it('sends the key as a header, never in the URL', async () => {
    const fetchImpl = respond(200, { foods: [cereal] });
    const results = await createUsdaClient({ apiKey: 'secret-key', fetchImpl }).search('cheerios');
    expect(results.map((f) => f.name)).toEqual(['Cheerios Cereal']);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).not.toContain('secret-key');
    expect(url).toContain('query=cheerios');
    expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe('secret-key');
  });

  it('matches a scanned barcode against branded GTINs', async () => {
    const other = { ...cereal, fdcId: 9, gtinUpc: '00016000999999' };
    const client = createUsdaClient({ apiKey: 'k', fetchImpl: respond(200, { foods: [other, cereal] }) });
    expect((await client.byGtin('0016000275287'))?.sourceId).toBe('2001234');
    expect(await client.byGtin('0077544827004')).toBeNull();
  });

  it('explains key and rate-limit errors', async () => {
    await expect(createUsdaClient({ apiKey: 'k', fetchImpl: respond(403, {}) }).search('x')).rejects.toThrow('rejected');
    await expect(createUsdaClient({ apiKey: 'k', fetchImpl: respond(429, {}) }).search('x')).rejects.toThrow('rate limit');
  });
});
