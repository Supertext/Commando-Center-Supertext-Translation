/**
 * Callback ping: the center calls the plugin's public ping endpoint to see whether the
 * installation is reachable from the internet (for future callbacks from Supertext).
 *
 * The URL comes from an unauthenticated report, so the center must never become a tool for
 * probing other hosts or its own network:
 *   - the callback host must be the site's host or a subdomain of it (a leading "www." of the
 *     site is ignored), http or https only, port 80/443 or the site's own port;
 *   - every address the host resolves to is checked at connect time (no DNS rebinding):
 *     loopback, private, link-local, CGNAT, multicast, reserved and Railway-internal ranges
 *     are refused;
 *   - GET only, no redirects followed, no cookies or credentials, 5 s timeout, 4 KB answer.
 * Test vectors: spec/callback-vectors.json.
 */
import { randomBytes } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { APP_REPO, APP_VERSION } from './version';

export type CallbackStatus = 'reachable' | 'unreachable' | 'blocked' | 'wrong_answer' | 'refused';

export interface PingResult {
  status: CallbackStatus;
  httpStatus: number | null;
  ms: number | null;
  /** Short, plain reason for staff ("connection timed out", "HTTP 302 to /login", …). */
  detail: string | null;
}

export const TIMEOUT_MS = 5000;
export const MAX_ANSWER_BYTES = 4096;
export const CHALLENGE = /^[A-Za-z0-9_-]{16,64}$/;
export const USER_AGENT = `Supertext-Commando-Center/${APP_VERSION} (+${APP_REPO})`;

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  // IPv4-mapped addresses (::ffff:a.b.c.d) are checked as IPv4 in isBlockedAddress: a ::ffff:0:0/96
  // rule here would make BlockList match every IPv4 address.
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001::', 32],
  ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, prefix, 'ipv6');

/** True for addresses the center must never connect to. */
export function isBlockedAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) return blocked.check(address, 'ipv4');
  if (v === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return true;
}

export type CallbackUrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/** Checks a reported callback URL against the installation's site URL (no network). */
export function checkCallbackUrl(callbackUrl: unknown, siteUrl: string): CallbackUrlCheck {
  if (typeof callbackUrl !== 'string' || !callbackUrl.trim() || callbackUrl.length > 500) {
    return { ok: false, reason: 'no valid URL' };
  }
  let u: URL;
  let site: URL;
  try {
    u = new URL(callbackUrl.trim());
    site = new URL(siteUrl);
  } catch {
    return { ok: false, reason: 'not an absolute URL' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'only http and https' };
  if (u.username || u.password) return { ok: false, reason: 'user info is not allowed' };
  if (u.hash) u.hash = '';
  const host = u.hostname.toLowerCase();
  const base = site.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== base && !host.endsWith(`.${base}`)) {
    return { ok: false, reason: `host ${host} is not ${base} or one of its subdomains` };
  }
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  const sitePort = site.port || (site.protocol === 'https:' ? '443' : '80');
  if (port !== '443' && port !== '80' && port !== sitePort) return { ok: false, reason: `port ${port} is not allowed` };
  if (isIP(host.replace(/^\[|\]$/g, '')) && isBlockedAddress(host.replace(/^\[|\]$/g, ''))) {
    return { ok: false, reason: 'private or reserved address' };
  }
  return { ok: true, url: u.toString() };
}

export function newChallenge(): string {
  return randomBytes(18).toString('base64url');
}

export interface PingOptions {
  /** Tests only: allow private addresses (a local test server). */
  allowPrivate?: boolean;
  /** Tests and docs screenshots only: fixed "ip" or "ip:port" per host instead of DNS. */
  resolve?: Record<string, string>;
  timeoutMs?: number;
}

/** Test-only switches from the environment; both must stay unset in production. */
export function pingOptionsFromEnv(env: Record<string, string | undefined> = process.env): PingOptions {
  const opts: PingOptions = {};
  if (env.COMMANDO_PING_ALLOW_PRIVATE === '1') opts.allowPrivate = true;
  if (env.COMMANDO_PING_HOSTS) {
    opts.resolve = Object.fromEntries(
      env.COMMANDO_PING_HOSTS.split(',').map((p) => p.trim().split('=')).filter((kv) => kv.length === 2 && kv[0] && kv[1]),
    );
  }
  return opts;
}

/** Pings the plugin: GET <url>?challenge=<c>; expects {"ok":true,"plugin":<name>,"challenge":<c>}. */
export function pingCallback(url: string, plugin: string, opts: PingOptions = {}): Promise<PingResult> {
  const challenge = newChallenge();
  const target = new URL(url);
  target.searchParams.set('challenge', challenge);
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const lib = target.protocol === 'https:' ? https : http;
  const fixedRaw = opts.resolve?.[target.hostname.toLowerCase()];
  const fixedMatch = fixedRaw?.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  const fixedAddress = fixedMatch ? { ip: fixedMatch[1].replace(/^\[|\]$/g, ''), port: fixedMatch[2] } : null;
  // Node connects to IP literals without calling lookup, so check those here.
  const literal = target.hostname.replace(/^\[|\]$/g, '');
  if (isIP(literal) && !opts.allowPrivate && isBlockedAddress(literal)) {
    return Promise.resolve({ status: 'refused', httpStatus: null, ms: null, detail: 'private or reserved address' });
  }

  // Validate every resolved address when the socket connects, not before: no rebinding window.
  const lookup = (hostname: string, options: object, cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
    const fixed = fixedAddress?.ip;
    const resolver = fixed
      ? (_h: string, _o: object, done: (e: NodeJS.ErrnoException | null, a: LookupAddress[]) => void) => done(null, [{ address: fixed, family: isIP(fixed) || 4 }])
      : (h: string, o: object, done: (e: NodeJS.ErrnoException | null, a: LookupAddress[]) => void) =>
          dnsLookup(h, { ...o, all: true }, (e, a) => done(e, a as LookupAddress[]));
    resolver(hostname, options, (err, addresses) => {
      if (err) return cb(err, '', 0);
      const list = (addresses as LookupAddress[]).filter((a) => opts.allowPrivate || !isBlockedAddress(a.address));
      if (!list.length) {
        const e = new Error('private or reserved address') as NodeJS.ErrnoException;
        e.code = 'ECOMMANDOBLOCKED';
        return cb(e, '', 0);
      }
      if ((options as { all?: boolean }).all) return cb(null, list);
      return cb(null, list[0].address, list[0].family);
    });
  };

  return new Promise((resolve) => {
    let done = false;
    const finish = (r: Omit<PingResult, 'ms'> & { ms?: number | null }) => {
      if (done) return;
      done = true;
      resolve({ ms: r.ms === undefined ? Date.now() - started : r.ms, ...r } as PingResult);
    };
    const req = lib.request(
      target,
      {
        method: 'GET',
        lookup: lookup as never,
        ...(fixedAddress?.port ? { port: Number(fixedAddress.port) } : {}),
        headers: { Host: target.host, 'User-Agent': USER_AGENT, Accept: 'application/json', 'Cache-Control': 'no-cache' },
        timeout: timeoutMs,
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status > 299) {
          const loc = res.headers.location ? ` to ${String(res.headers.location).slice(0, 120)}` : '';
          res.resume();
          return finish({ status: 'blocked', httpStatus: status, detail: `HTTP ${status}${status >= 300 && status < 400 ? loc : ''}` });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_ANSWER_BYTES) {
            req.destroy();
            return finish({ status: 'wrong_answer', httpStatus: status, detail: 'answer larger than 4 KB (not the plugin)' });
          }
          chunks.push(c);
        });
        res.on('end', () => {
          const ms = Date.now() - started;
          let body: unknown;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            return finish({ status: 'wrong_answer', httpStatus: status, ms, detail: 'answer is not JSON (a cache, firewall or login page?)' });
          }
          const b = body as { ok?: unknown; plugin?: unknown; challenge?: unknown };
          if (b?.challenge !== challenge) {
            return finish({ status: 'wrong_answer', httpStatus: status, ms, detail: 'challenge not echoed (cached or not the plugin)' });
          }
          if (b.plugin !== plugin) {
            return finish({ status: 'wrong_answer', httpStatus: status, ms, detail: `answered as ${String(b.plugin).slice(0, 100)}` });
          }
          return finish({ status: 'reachable', httpStatus: status, ms, detail: null });
        });
        res.on('error', () => finish({ status: 'unreachable', httpStatus: status, detail: 'connection closed early' }));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      finish({ status: 'unreachable', httpStatus: null, ms: null, detail: `no answer within ${Math.round(timeoutMs / 1000)} s` });
    });
    req.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'ECOMMANDOBLOCKED') return finish({ status: 'refused', httpStatus: null, ms: null, detail: 'the host resolves to a private or reserved address' });
      const why: Record<string, string> = {
        ENOTFOUND: 'host not found (DNS)',
        EAI_AGAIN: 'DNS lookup failed',
        ECONNREFUSED: 'connection refused',
        ECONNRESET: 'connection reset',
        EHOSTUNREACH: 'host unreachable',
        ENETUNREACH: 'network unreachable',
        ETIMEDOUT: 'connection timed out',
        CERT_HAS_EXPIRED: 'TLS certificate expired',
        DEPTH_ZERO_SELF_SIGNED_CERT: 'self-signed TLS certificate',
        SELF_SIGNED_CERT_IN_CHAIN: 'self-signed TLS certificate',
        UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS certificate not trusted',
        ERR_TLS_CERT_ALTNAME_INVALID: 'TLS certificate is for another host',
      };
      finish({ status: 'unreachable', httpStatus: null, ms: null, detail: why[e.code ?? ''] ?? (e.code ? `network error ${e.code}` : 'network error') });
    });
    req.end();
  });
}
