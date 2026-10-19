import { brandFromExport, records } from './off-export';

describe('records', () => {
  it('passes through well-formed rows', () => {
    expect([...records(['a\tb\tc', 'd\te\tf'], 3)]).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('rejoins a row split by a line break inside a field', () => {
    // Since Oct 2026 the export can contain unquoted newlines inside text fields.
    expect([...records(['123\tFirst line', 'second line\tz', '456\tok\ty'], 3)]).toEqual([
      ['123', 'First line second line', 'z'],
      ['456', 'ok', 'y'],
    ]);
  });

  it('drops fragments that can’t form a valid row and recovers on the next record', () => {
    const malformed: string[] = [];
    const out = [...records(['', '\t\t\t\t', 'x\ty', '789\ta\tb'], 3, (l) => malformed.push(l))];
    expect(out).toEqual([['789', 'a', 'b']]);
    expect(malformed.length).toBeGreaterThan(0);
  });
});

describe('brandFromExport', () => {
  it('prefers the old brands column, then the brand owner', () => {
    expect(brandFromExport({ brands: 'Quaker, PepsiCo', brands_en: 'quaker', brand_owner: 'PepsiCo' })).toBe('Quaker');
    expect(brandFromExport({ brands_en: 'quaker-oats', brand_owner: 'The Quaker Oats Company' })).toBe('The Quaker Oats Company');
  });

  it('turns brand slugs back into words', () => {
    expect(brandFromExport({ brands_en: 'jeff-de-bruges,other' })).toBe('Jeff De Bruges');
    expect(brandFromExport({ brands_tags: 'xx:president-s-choice' })).toBe("President's Choice");
  });

  it('returns null without a brand', () => {
    expect(brandFromExport({})).toBeNull();
    expect(brandFromExport({ brands_en: '', brand_owner: ' ' })).toBeNull();
  });
});
