/**
 * Helpers for reading the Open Food Facts CSV/TSV export, which changes
 * shape from time to time:
 * - since Oct 2026 some text fields contain unquoted line breaks, so one
 *   product can span several lines;
 * - the `brands` column was replaced by `brands_tags` / `brands_en` (slugs).
 */

/** Longest a partial record may grow before it is treated as garbage. */
const MAX_PENDING_CHARS = 200_000;
const RECORD_START = /^\d+\t/;

const fieldCount = (s: string) => {
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 9) n++;
  return n;
};

/**
 * Reassembles records with `width` tab-separated fields from lines, joining
 * lines broken inside a field (the break becomes a space). Fragments that
 * overshoot the width are reported through `onMalformed` and dropped.
 */
export function createRecordJoiner(width: number, onMalformed: (fragment: string) => void = () => undefined) {
  let pending: string | null = null;

  const push = (line: string): string[] | null => {
    const joined: string = pending === null ? line : `${pending} ${line}`;
    const n = fieldCount(joined);
    if (n === width) {
      pending = null;
      return joined.split('\t');
    }
    if (n < width && joined.length <= MAX_PENDING_CHARS) {
      pending = joined;
      return null;
    }
    // Overshot: the pending fragment was broken. Start again from this line if it begins a record.
    onMalformed(pending ?? line);
    pending = null;
    if (joined !== line && RECORD_START.test(line)) return push(line);
    return null;
  };

  /** Reports a trailing partial record at end of input. */
  const flush = () => {
    if (pending !== null && pending.trim() !== '') onMalformed(pending);
    pending = null;
  };

  return { push, flush };
}

/** Synchronous convenience wrapper over createRecordJoiner. */
export function* records(
  lines: Iterable<string>,
  width: number,
  onMalformed?: (fragment: string) => void,
): Generator<string[]> {
  const joiner = createRecordJoiner(width, onMalformed);
  for (const line of lines) {
    const record = joiner.push(line);
    if (record) yield record;
  }
  joiner.flush();
}

type BrandColumns = Partial<Record<'brands' | 'brands_en' | 'brands_tags' | 'brand_owner', string>>;

/** "president-s-choice" → "President's Choice" */
function fromSlug(slug: string): string | null {
  const s = slug.split(',')[0].trim().replace(/^[a-z]{2}:/, '');
  if (!s) return null;
  return s
    .replace(/-s(?=-|$)/g, "'s")
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** A display brand from whichever brand columns this export has. */
export function brandFromExport(c: BrandColumns): string | null {
  const first = c.brands?.split(',')[0].trim();
  if (first) return first;
  const owner = c.brand_owner?.trim();
  if (owner) return owner;
  return fromSlug(c.brands_en || c.brands_tags || '');
}
