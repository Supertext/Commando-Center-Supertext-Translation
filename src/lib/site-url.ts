/**
 * Normalizes the site URL a plugin reports, so the same installation always maps to the same row.
 * Test vectors: spec/site-url-vectors.json (shared with the SDKs).
 */
export interface NormalizedSiteUrl {
  url: string;
  local: boolean;
}

export function normalizeSiteUrl(input: unknown): NormalizedSiteUrl | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw || raw.length > 500) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname) return null;
  // URL already lower-cases scheme and host, converts IDN to punycode and drops default ports.
  const path = u.pathname.replace(/\/+$/, '');
  const url = `${u.protocol}//${u.host}${path}`;
  return { url, local: isLocalHost(u.hostname) };
}

export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  if (!h.includes('.') && !h.includes(':')) return true; // single-label intranet names
  if (/\.(localhost|test|local|internal|lan|example|invalid)$/.test(h)) return true;
  if (/\.(ddev\.site|lndo\.site)$/.test(h)) return true;
  const ip = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (h.includes(':')) return h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
  return false;
}
