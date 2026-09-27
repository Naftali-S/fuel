import { expandUpcE, gtinCheckDigit, hasValidCheckDigit, normalizeBarcode } from './barcode';

describe('gtinCheckDigit', () => {
  it('computes GS1 mod-10 check digits', () => {
    expect(gtinCheckDigit('400638133393')).toBe(1); // EAN-13 4006381333931
    expect(gtinCheckDigit('03600029145')).toBe(2); // UPC-A 036000291452
    expect(gtinCheckDigit('9638507')).toBe(4); // EAN-8 96385074
  });
});

describe('hasValidCheckDigit', () => {
  it('accepts valid and rejects corrupted codes', () => {
    expect(hasValidCheckDigit('4006381333931')).toBe(true);
    expect(hasValidCheckDigit('4006381333932')).toBe(false);
    expect(hasValidCheckDigit('12ab')).toBe(false);
  });
});

describe('expandUpcE', () => {
  it.each([
    ['01234505', '012000003455'], // last digit 0-2: mfr d1 d2 d6 00, item 00 d3 d4 d5
    ['01234531', '012300000451'], // last digit 3:   mfr d1 d2 d3 00, item 000 d4 d5
    ['01234543', '012340000053'], // last digit 4:   mfr d1..d4 0,    item 0000 d5
    ['01234572', '012345000072'], // last digit 5-9: mfr d1..d5,      item 0000 d6
  ])('expands %s to %s', (upce, upca) => {
    expect(expandUpcE(upce)).toBe(upca);
    expect(hasValidCheckDigit(upca)).toBe(true);
  });

  it('rejects invalid number systems and lengths', () => {
    expect(expandUpcE('21234565')).toBeNull();
    expect(expandUpcE('0123')).toBeNull();
  });
});

describe('normalizeBarcode', () => {
  it('pads UPC-A to GTIN-13 and offers the 12-digit form as a candidate', () => {
    expect(normalizeBarcode('036000291452', 'upc_a')).toEqual({
      ok: true,
      gtin: '0036000291452',
      candidates: ['0036000291452', '036000291452'],
    });
  });

  it('maps iOS-style 13-digit UPC-A and plain UPC-A to the same GTIN', () => {
    const a = normalizeBarcode('0036000291452', 'ean13');
    const b = normalizeBarcode('036000291452', 'upc_a');
    expect(a.ok && b.ok && a.gtin === b.gtin).toBe(true);
  });

  it('expands UPC-E before normalizing', () => {
    expect(normalizeBarcode('01234505', 'upc_e')).toEqual({
      ok: true,
      gtin: '0012000003455',
      candidates: ['0012000003455', '012000003455'],
    });
  });

  it('keeps EAN-8 as-is', () => {
    expect(normalizeBarcode('96385074', 'ean8')).toEqual({ ok: true, gtin: '96385074', candidates: ['96385074'] });
  });

  it('strips the leading indicator digit from GTIN-14', () => {
    const r = normalizeBarcode('04006381333931');
    expect(r.ok && r.gtin).toBe('4006381333931');
  });

  it('reports why a code is rejected', () => {
    expect(normalizeBarcode('  ')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeBarcode('abc')).toEqual({ ok: false, reason: 'non-numeric' });
    expect(normalizeBarcode('12345')).toEqual({ ok: false, reason: 'bad-length' });
    expect(normalizeBarcode('4006381333932')).toEqual({ ok: false, reason: 'bad-check-digit' });
    expect(normalizeBarcode('2123456', 'upc_e')).toEqual({ ok: false, reason: 'bad-upce' });
  });
});
