import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import vectors from '../../spec/callback-vectors.json';
import { CHALLENGE, USER_AGENT, checkCallbackUrl, isBlockedAddress, pingCallback, pingOptionsFromEnv } from '../../src/lib/callback';
import { shouldPing, MIN_GAP_MS, REPING_AFTER_MS } from '../../src/lib/pinger';

describe('checkCallbackUrl (spec/callback-vectors.json)', () => {
  for (const v of vectors.urls) {
    it(`${v.ok ? 'accepts' : 'refuses'} ${v.callback} for ${v.site}`, () => {
      const r = checkCallbackUrl(v.callback, v.site);
      expect(r.ok).toBe(v.ok);
      if (r.ok && 'url' in v) expect(r.url).toBe(v.url);
      if (!r.ok) expect(r.reason).toMatch(/\S/);
    });
  }
});

describe('isBlockedAddress', () => {
  it.each(vectors.blocked_addresses)('blocks %s', (a) => expect(isBlockedAddress(a)).toBe(true));
  it.each(vectors.public_addresses)('allows %s', (a) => expect(isBlockedAddress(a)).toBe(false));
});

describe('pingCallback against a local server', () => {
  let server: http.Server;
  let base: string;
  const seen: { url: string; headers: http.IncomingHttpHeaders }[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push({ url: req.url ?? '', headers: req.headers });
      const u = new URL(req.url ?? '/', 'http://x');
      const c = u.searchParams.get('challenge') ?? '';
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
      };
      switch (u.pathname) {
        case '/ping':
          if (!CHALLENGE.test(c)) return json(400, { ok: false });
          return json(200, { ok: true, plugin: 'Typo3-Supertext-Translation', challenge: c });
        case '/cached':
          return json(200, { ok: true, plugin: 'Typo3-Supertext-Translation', challenge: 'an-old-cached-challenge' });
        case '/html':
          res.writeHead(200, { 'Content-Type': 'text/html' });
          return res.end('<html>Welcome</html>');
        case '/login':
          res.writeHead(302, { Location: '/wp-login.php' });
          return res.end();
        case '/error':
          return json(500, { error: 'boom' });
        case '/big':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ challenge: c, pad: 'x'.repeat(10_000) }));
        case '/slow':
          return setTimeout(() => json(200, { ok: true, plugin: 'Typo3-Supertext-Translation', challenge: c }), 1500);
        case '/other':
          return json(200, { ok: true, plugin: 'Joomla-Supertext-Translation', challenge: c });
        default:
          res.writeHead(404);
          return res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const ping = (path: string, opts = {}) => pingCallback(`${base}${path}`, 'Typo3-Supertext-Translation', { allowPrivate: true, ...opts });

  it('reachable when the plugin echoes the challenge', async () => {
    const r = await ping('/ping');
    expect(r).toMatchObject({ status: 'reachable', httpStatus: 200, detail: null });
    expect(r.ms).toBeGreaterThanOrEqual(0);
    const last = seen.at(-1)!;
    expect(new URL(last.url, 'http://x').searchParams.get('challenge')).toMatch(CHALLENGE);
    expect(last.headers['user-agent']).toBe(USER_AGENT);
    expect(last.headers.cookie).toBeUndefined();
  });

  it('keeps an existing query string', async () => {
    await ping('/ping?rest_route=/supertext/v1/ping');
    const u = new URL(seen.at(-1)!.url, 'http://x');
    expect(u.searchParams.get('rest_route')).toBe('/supertext/v1/ping');
    expect(u.searchParams.get('challenge')).toMatch(CHALLENGE);
  });

  it.each([
    ['/cached', 'wrong_answer', /challenge not echoed/],
    ['/html', 'wrong_answer', /not JSON/],
    ['/big', 'wrong_answer', /4 KB/],
    ['/other', 'wrong_answer', /Joomla/],
    ['/login', 'blocked', /HTTP 302 to \/wp-login\.php/],
    ['/error', 'blocked', /HTTP 500/],
    ['/missing', 'blocked', /HTTP 404/],
  ])('%s → %s', async (path, status, detail) => {
    const r = await ping(path);
    expect(r.status).toBe(status);
    expect(r.detail).toMatch(detail);
  });

  it('unreachable on timeout', async () => {
    const r = await ping('/slow', { timeoutMs: 300 });
    expect(r).toMatchObject({ status: 'unreachable', httpStatus: null, ms: null });
    expect(r.detail).toMatch(/no answer/);
  });

  it('unreachable when nothing listens', async () => {
    const r = await pingCallback('http://127.0.0.1:1/ping', 'X', { allowPrivate: true });
    expect(r).toMatchObject({ status: 'unreachable', detail: 'connection refused' });
  });

  it('refuses private addresses at connect time, also behind a public-looking name', async () => {
    const direct = await pingCallback(`${base}/ping`, 'Typo3-Supertext-Translation');
    expect(direct.status).toBe('refused');
    // A name that resolves to 127.0.0.1 (DNS rebinding style) is refused the same way.
    const port = new URL(base).port;
    const named = await pingCallback(`http://rebind.example.ch:${port}/ping`, 'Typo3-Supertext-Translation', { resolve: { 'rebind.example.ch': '127.0.0.1' } });
    expect(named).toMatchObject({ status: 'refused', detail: /private or reserved/ });
    expect(seen.some((s) => s.headers.host?.startsWith('rebind.example.ch'))).toBe(false);
  });

  it('a fixed address map (tests, screenshots) still sends the real host name', async () => {
    const port = new URL(base).port;
    const r = await pingCallback(`http://www.example.ch:${port}/ping`, 'Typo3-Supertext-Translation', { allowPrivate: true, resolve: { 'www.example.ch': '127.0.0.1' } });
    expect(r.status).toBe('reachable');
    expect(seen.at(-1)!.headers.host).toBe(`www.example.ch:${port}`);
  });

  it('unknown host', async () => {
    const r = await pingCallback('https://does-not-exist.invalid/ping', 'X');
    expect(r.status).toBe('unreachable');
  });
});

describe('shouldPing', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const at = (msAgo: number) => new Date(now - msAgo);
  const url = 'https://www.example.ch/ping';

  it('never without a URL or for local hosts', () => {
    expect(shouldPing({ callback_url: null, callback_checked_at: null, local: false }, 'settings_saved', null, now)).toBe(false);
    expect(shouldPing({ callback_url: url, callback_checked_at: null, local: true }, 'settings_saved', null, now)).toBe(false);
  });

  it('a new URL, a settings save or an install always pings (after a minute)', () => {
    expect(shouldPing({ callback_url: url, callback_checked_at: null, local: false }, 'upgraded', null, now)).toBe(true);
    expect(shouldPing({ callback_url: url, callback_checked_at: at(120_000), local: false }, 'upgraded', 'https://old/ping', now)).toBe(true);
    expect(shouldPing({ callback_url: url, callback_checked_at: at(120_000), local: false }, 'settings_saved', url, now)).toBe(true);
    expect(shouldPing({ callback_url: url, callback_checked_at: at(MIN_GAP_MS - 1000), local: false }, 'settings_saved', url, now)).toBe(false);
  });

  it('other reports re-ping only after a while', () => {
    expect(shouldPing({ callback_url: url, callback_checked_at: at(60 * 60_000), local: false }, 'upgraded', url, now)).toBe(false);
    expect(shouldPing({ callback_url: url, callback_checked_at: at(REPING_AFTER_MS), local: false }, 'upgraded', url, now)).toBe(true);
  });
});

describe('pingOptionsFromEnv', () => {
  it('is empty in production', () => expect(pingOptionsFromEnv({})).toEqual({}));
  it('reads the test switches', () => {
    expect(pingOptionsFromEnv({ COMMANDO_PING_ALLOW_PRIVATE: '1', COMMANDO_PING_HOSTS: 'a.example.ch=127.0.0.1, b.example.ch=10.0.0.2' })).toEqual({
      allowPrivate: true,
      resolve: { 'a.example.ch': '127.0.0.1', 'b.example.ch': '10.0.0.2' },
    });
  });
});
