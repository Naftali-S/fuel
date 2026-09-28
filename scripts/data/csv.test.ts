import { labelMillilitres, plausibleServings } from './cnf-servings';
import { parseCsv, parseCsvRecords } from './csv';

describe('plausibleServings', () => {
  it('reads millilitres from CNF measure labels', () => {
    expect(labelMillilitres('250ml, sifted')).toBe(250);
    expect(labelMillilitres('100 ml flaked')).toBe(100);
    expect(labelMillilitres('1 fillet')).toBeNull();
    expect(labelMillilitres('2 fruits + 30ml liquid')).toBeNull();
  });

  it('drops volume measures with impossible densities', () => {
    // Real CNF case: instant coffee powder, 100 mL = 18.4 g but "5ml" = 91.8 g.
    expect(
      plausibleServings([
        { label: '5ml', amount: 91.8 },
        { label: '100ml', amount: 18.4 },
      ]),
    ).toEqual([{ label: '100ml', amount: 18.4 }]);
  });

  it('drops a measure far from the others and keeps non-volume measures', () => {
    expect(
      plausibleServings([
        { label: '15ml', amount: 20.8 },
        { label: '125ml', amount: 173.3 },
        { label: '250ml', amount: 34.7 }, // a factor off by ten
        { label: '1 cup', amount: 250 },
      ]),
    ).toEqual([
      { label: '15ml', amount: 20.8 },
      { label: '125ml', amount: 173.3 },
      { label: '1 cup', amount: 250 },
    ]);
  });
});

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas and newlines', () => {
    expect(parseCsv('a,"b, c","say ""hi""","line\nbreak"\r\n1,2,3,4')).toEqual([
      ['a', 'b, c', 'say "hi"', 'line\nbreak'],
      ['1', '2', '3', '4'],
    ]);
  });

  it('keeps empty trailing fields', () => {
    expect(parseCsv('x,,\n')).toEqual([['x', '', '']]);
  });
});

describe('parseCsvRecords', () => {
  it('maps rows to header keys and skips blank lines', () => {
    const text = 'FoodID,FoodDescription,,\n2,"Chop suey, with meat",,\n,,,\n';
    expect(parseCsvRecords(text)).toEqual([{ FoodID: '2', FoodDescription: 'Chop suey, with meat', '': '' }]);
  });
});
