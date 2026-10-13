/** Minimal semver handling for plugin versions ("1.2.3", "v1.2.3", "1.2.3-beta.1"). */
export interface Version {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

export function parseVersion(v: string | null | undefined): Version | null {
  if (!v) return null;
  const m = v.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [] };
}

/** -1, 0 or 1; null when either side isn't a version (e.g. "dev-main"). */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number | null {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  }
  if (!x.pre.length && !y.pre.length) return 0;
  if (!x.pre.length) return 1; // 1.0.0 > 1.0.0-beta
  if (!y.pre.length) return -1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return +p < +q ? -1 : 1;
    if (pn) return -1;
    if (qn) return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

export type VersionStatus = 'current' | 'outdated' | 'ahead' | 'unknown';

export function versionStatus(installed: string | null, latest: string | null): VersionStatus {
  const c = compareVersions(installed, latest);
  if (c === null) return 'unknown';
  return c === 0 ? 'current' : c < 0 ? 'outdated' : 'ahead';
}
