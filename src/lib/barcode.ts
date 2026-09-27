/**
 * Retail barcode (GTIN) helpers.
 *
 * Scanners report the same product in different shapes: iOS reports UPC-A as a
 * 13-digit EAN with a leading 0, UPC-E is a compressed 8-digit form, and food
 * databases key products by 8-, 12- or 13-digit codes. Everything is normalized
 * to a canonical GTIN-13 (or GTIN-8 for EAN-8) before lookup.
 */

export type ScannedSymbology = 'ean13' | 'ean8' | 'upc_a' | 'upc_e' | (string & {});

export type NormalizedBarcode =
  | { ok: true; gtin: string; candidates: string[] }
  | { ok: false; reason: 'empty' | 'non-numeric' | 'bad-length' | 'bad-check-digit' | 'bad-upce' };

/** GS1 mod-10 check digit for a code body (all digits except the check digit). */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d{8,14}$/.test(code)) return false;
  return gtinCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** Expands an 8-digit UPC-E (number system + 6 digits + check) to 12-digit UPC-A. */
export function expandUpcE(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const ns = upce[0];
  const d = upce.slice(1, 7);
  const check = upce[7];
  const last = d[5];
  let body: string; // 5-digit manufacturer code + 5-digit product code
  if (last === '0' || last === '1' || last === '2') {
    body = d.slice(0, 2) + last + '0000' + d.slice(2, 5);
  } else if (last === '3') {
    body = d.slice(0, 3) + '00000' + d.slice(3, 5);
  } else if (last === '4') {
    body = d.slice(0, 4) + '00000' + d[4];
  } else {
    body = d.slice(0, 5) + '0000' + last;
  }
  return ns + body + check;
}

/**
 * Normalizes a scanned or typed barcode. `candidates` lists equivalent keys to
 * try against databases that store codes in different lengths.
 */
export function normalizeBarcode(raw: string, symbology?: ScannedSymbology): NormalizedBarcode {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (!/^\d+$/.test(trimmed)) return { ok: false, reason: 'non-numeric' };

  let code = trimmed;
  if (symbology === 'upc_e') {
    const expanded = expandUpcE(code);
    if (!expanded) return { ok: false, reason: 'bad-upce' };
    code = expanded;
  }

  if (![8, 12, 13, 14].includes(code.length)) return { ok: false, reason: 'bad-length' };
  if (!hasValidCheckDigit(code)) return { ok: false, reason: 'bad-check-digit' };

  if (code.length === 8) return { ok: true, gtin: code, candidates: [code] };

  // A GTIN-14 with a leading 0 indicator digit is the same trade item as its GTIN-13.
  const gtin = code.length === 14 && code.startsWith('0') ? code.slice(1) : code.padStart(13, '0');
  const candidates = [gtin];
  if (gtin.length === 13 && gtin.startsWith('0')) candidates.push(gtin.slice(1)); // UPC-A form
  return { ok: true, gtin, candidates };
}
