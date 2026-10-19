import { isNewerVersion, shouldCheckForUpdate, verifyDownload } from './reference-updates';

describe('isNewerVersion', () => {
  it('compares build dates', () => {
    expect(isNewerVersion('2026-09-28', '2026-10-28')).toBe(true);
    expect(isNewerVersion('2026-10-28', '2026-10-28')).toBe(false);
    expect(isNewerVersion('2026-10-28', '2026-09-28')).toBe(false);
  });

  it('ignores malformed versions', () => {
    expect(isNewerVersion('?', '2026-10-28')).toBe(false);
    expect(isNewerVersion('2026-09-28', 'latest')).toBe(false);
  });
});

describe('shouldCheckForUpdate', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  it('checks at most once a week', () => {
    expect(shouldCheckForUpdate(null, now)).toBe(true);
    expect(shouldCheckForUpdate('2026-10-16T12:00:00Z', now)).toBe(false);
    expect(shouldCheckForUpdate('2026-10-11T12:00:00Z', now)).toBe(true);
    expect(shouldCheckForUpdate('not a date', now)).toBe(true);
  });
});

describe('verifyDownload', () => {
  it('accepts a file matching size and MD5', () => {
    expect(verifyDownload({ bytes: 10, md5: 'abc' }, { size: 10, md5: 'ABC' })).toBeNull();
  });

  it('rejects size or checksum mismatches', () => {
    expect(verifyDownload({ bytes: 10, md5: 'abc' }, { size: 9, md5: 'abc' })).toMatch(/incomplete/);
    expect(verifyDownload({ bytes: 10, md5: 'abc' }, { size: 10, md5: 'def' })).toMatch(/damaged/);
    expect(verifyDownload({ bytes: 10, md5: 'abc' }, { size: 10, md5: null })).toMatch(/damaged/);
  });

  it('falls back to size only for manifests without a checksum', () => {
    expect(verifyDownload({ bytes: 10 }, { size: 10, md5: null })).toBeNull();
  });
});
