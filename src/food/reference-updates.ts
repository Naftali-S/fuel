/**
 * Update and integrity checks for the downloadable Open Food Facts Canada
 * file (pure, so they can be unit-tested).
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const UPDATE_CHECK_DAYS = 7;

/** True when `latest` is a later build date (YYYY-MM-DD) than `current`. */
export function isNewerVersion(current: string, latest: string): boolean {
  return ISO_DAY.test(current) && ISO_DAY.test(latest) && latest > current;
}

/** Checks for a new file at most once every UPDATE_CHECK_DAYS days. */
export function shouldCheckForUpdate(lastCheckedIso: string | null, now: Date): boolean {
  const last = lastCheckedIso ? Date.parse(lastCheckedIso) : NaN;
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= UPDATE_CHECK_DAYS * 86_400_000;
}

/**
 * Compares a downloaded file with its manifest. Returns a message for the
 * user when it doesn't match, or null when it's good. Older manifests
 * without a checksum are checked by size only.
 */
export function verifyDownload(
  manifest: { bytes: number; md5?: string },
  file: { size: number | null; md5: string | null },
): string | null {
  if (file.size !== manifest.bytes) return 'The download was incomplete. Try again.';
  if (manifest.md5 && (file.md5 ?? '').toLowerCase() !== manifest.md5.toLowerCase()) {
    return 'The downloaded file is damaged. Try again.';
  }
  return null;
}
