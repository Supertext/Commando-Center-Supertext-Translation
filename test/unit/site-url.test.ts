import { describe, expect, it } from 'vitest';
import vectors from '../../spec/site-url-vectors.json';
import { normalizeSiteUrl } from '../../src/lib/site-url';

describe('normalizeSiteUrl (spec/site-url-vectors.json)', () => {
  for (const v of vectors.vectors) {
    it(JSON.stringify(v.input), () => {
      const got = normalizeSiteUrl(v.input);
      if (v.url === null) {
        expect(got).toBeNull();
      } else {
        expect(got).toEqual({ url: v.url, local: v.local });
      }
    });
  }

  it('rejects non-strings and very long URLs', () => {
    expect(normalizeSiteUrl(42)).toBeNull();
    expect(normalizeSiteUrl(null)).toBeNull();
    expect(normalizeSiteUrl(`https://example.com/${'a'.repeat(600)}`)).toBeNull();
  });
});
