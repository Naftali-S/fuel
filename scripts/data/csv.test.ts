import { parseCsv, parseCsvRecords } from './csv';

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
