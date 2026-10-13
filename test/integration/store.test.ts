// Needs a Postgres server: TEST_DATABASE_URL (default postgres://postgres:postgres@127.0.0.1:5432/postgres).
// Each run drops and recreates the database commando_test on it, applies the migrations and
// exercises the store and the report endpoint.
import { execFileSync } from 'node:child_process';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import examples from '../../spec/report-examples.json';

const SERVER = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres';
const NAME = 'commando_test';

let store: typeof import('../../src/lib/db');
let route: typeof import('../../src/app/api/v1/report/route');

beforeAll(async () => {
  const admin = postgres(SERVER, { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${NAME} WITH (FORCE)`);
  await admin.end();
  process.env.DATABASE_URL = SERVER;
  process.env.COMMANDO_DB_NAME = NAME;
  // Twice: the second run must be a no-op.
  for (let i = 0; i < 2; i++) {
    execFileSync('node', ['scripts/migrate.mjs'], { env: process.env, stdio: 'pipe' });
  }
  store = await import('../../src/lib/db');
  route = await import('../../src/app/api/v1/report/route');
});

afterAll(async () => {
  await store?.db().end();
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return route.POST(
    new Request('http://center.test/api/v1/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const base = {
  schema: 1,
  event: 'installed',
  site_url: 'https://www.kunde.ch/',
  plugin: { name: 'supertext-wordpress-polylang', version: '2.0.0' },
  system: { name: 'WordPress', version: '6.8.3' },
  runtime: { name: 'PHP', version: '8.3.12' },
  api_key_configured: false,
};

describe('report endpoint and store', () => {
  it('creates an installation from the first report', async () => {
    const res = await post(base);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    const [i] = await store.listInstallations();
    expect(i).toMatchObject({
      site_url: 'https://www.kunde.ch',
      plugin: 'supertext-wordpress-polylang',
      plugin_version: '2.0.0',
      system_version: '6.8.3',
      last_event: 'installed',
      report_count: 1,
      client_id: null,
    });
  });

  it('a settings save without changes adds history but no change', async () => {
    await post({ ...base, event: 'settings_saved', site_url: 'HTTPS://WWW.KUNDE.CH' });
    const [i] = await store.listInstallations();
    expect(i.report_count).toBe(2);
    const h = await store.installationHistory(i.id);
    expect(h.map((r) => [r.event, r.changed])).toEqual([
      ['settings_saved', false],
      ['installed', true],
    ]);
  });

  it('records a system upgrade (WordPress 6.8.3 → 6.9.0) as a change', async () => {
    await post({ ...base, event: 'upgraded', system: { name: 'WordPress', version: '6.9.0' }, api_key_configured: true });
    const [i] = await store.listInstallations();
    expect(i).toMatchObject({ system_version: '6.9.0', last_event: 'upgraded', api_key_configured: true, report_count: 3 });
    const [latest] = await store.installationHistory(i.id);
    expect(latest).toMatchObject({ event: 'upgraded', system_version: '6.9.0', changed: true });
  });

  it('keeps the same URL with another plugin as a separate installation', async () => {
    await post({ ...base, plugin: { name: 'Typo3-Supertext-Translation', version: '0.4.0' }, system: { name: 'TYPO3' } });
    expect(await store.listInstallations()).toHaveLength(2);
    expect(await store.listPlugins()).toEqual(['supertext-wordpress-polylang', 'Typo3-Supertext-Translation']);
  });

  it('hides local hosts unless asked', async () => {
    await post({ ...base, site_url: 'http://localhost:8080/' });
    expect(await store.listInstallations()).toHaveLength(2);
    expect(await store.listInstallations({ includeLocal: true })).toHaveLength(3);
  });

  it('accepts every valid example and rejects every invalid one', async () => {
    for (const ex of examples.valid) expect((await post(ex.body, { 'x-forwarded-for': '198.51.100.8' })).status, ex.name).toBe(202);
    for (const ex of examples.invalid) expect((await post(ex.body, { 'x-forwarded-for': '198.51.100.8' })).status, ex.name).toBe(400);
  });

  it('rejects non-JSON, oversized bodies and floods', async () => {
    expect((await post('not json', { 'x-forwarded-for': '198.51.100.9' })).status).toBe(400);
    expect((await post(base, { 'content-type': 'text/plain', 'x-forwarded-for': '198.51.100.9' })).status).toBe(415);
    const big = { ...base, padding: 'x'.repeat(9000) };
    expect((await post(big, { 'x-forwarded-for': '198.51.100.9' })).status).toBe(413);
    const statuses: number[] = [];
    for (let k = 0; k < 62; k++) statuses.push((await post(base, { 'x-forwarded-for': '198.51.100.10' })).status);
    expect(statuses.slice(0, 60).every((s) => s === 202)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  describe('API key check', () => {
    const site = { ...base, site_url: 'https://keys.example.ch', plugin: { name: 'Strapi-Supertext-Translation', version: '0.2.0' }, system: { name: 'Strapi' } };
    const ip = { 'x-forwarded-for': '198.51.100.20' };
    const find = async () => (await store.listInstallations({ q: 'keys.example.ch' }))[0];

    it('stores the check result of a settings save', async () => {
      const t = new Date(Date.now() - 60_000).toISOString();
      await post({ ...site, event: 'settings_saved', api_key_check: { status: 'ok', checked_at: t, http_status: 200 } }, ip);
      expect(await find()).toMatchObject({ api_key_status: 'ok', api_key_http_status: 200, api_key_error_code: null });
      expect((await find()).api_key_checked_at?.toISOString()).toBe(new Date(t).toISOString());
    });

    it('a report without a check (upgrade) keeps the stored result', async () => {
      await post({ ...site, event: 'upgraded', plugin: { name: 'Strapi-Supertext-Translation', version: '0.3.0' } }, ip);
      const i = await find();
      expect(i).toMatchObject({ plugin_version: '0.3.0', api_key_status: 'ok' });
      expect((await store.installationHistory(i.id))[0].api_key_status).toBeNull();
    });

    it('a rejected key is a change, with HTTP status and error code', async () => {
      await post(
        { ...site, event: 'api_key_check', plugin: { name: 'Strapi-Supertext-Translation', version: '0.3.0' },
          api_key_check: { status: 'invalid', http_status: 401, error_code: 'INVALID_API_KEY' } },
        ip,
      );
      const i = await find();
      expect(i).toMatchObject({ api_key_status: 'invalid', api_key_http_status: 401, api_key_error_code: 'INVALID_API_KEY', last_event: 'api_key_check' });
      const [latest] = await store.installationHistory(i.id);
      expect(latest).toMatchObject({ event: 'api_key_check', api_key_status: 'invalid', changed: true });
      // without checked_at the center uses the receive time
      expect(Math.abs(latest.api_key_checked_at!.getTime() - latest.received_at.getTime())).toBeLessThan(1000);
    });

    it('an older check doesn\'t overwrite a newer one', async () => {
      await post({ ...site, event: 'check', plugin: { name: 'Strapi-Supertext-Translation', version: '0.3.0' }, api_key_check: { status: 'ok', checked_at: '2026-01-01T00:00:00Z' } }, ip);
      expect((await find()).api_key_status).toBe('invalid');
    });

    it('filters by key status', async () => {
      // The spec examples posted earlier add a rejected key (www.example.ch) and an unreachable check (cms.example.org).
      expect((await store.listInstallations({ keyStatus: 'problem' })).map((i) => `${i.site_url} ${i.api_key_status}`).sort()).toEqual([
        'https://cms.example.org unreachable',
        'https://keys.example.ch invalid',
        'https://www.example.ch invalid',
      ]);
      expect((await store.listInstallations({ keyStatus: 'ok' })).every((i) => i.api_key_status === 'ok')).toBe(true);
      expect((await store.listInstallations({ keyStatus: 'unchecked' })).every((i) => i.api_key_status === null)).toBe(true);
    });

    it('a malformed check is ignored, the report still counts', async () => {
      const before = (await find()).report_count;
      const res = await post({ ...site, event: 'settings_saved', plugin: { name: 'Strapi-Supertext-Translation', version: '0.3.0' }, api_key_check: { status: 'BROKEN' } }, ip);
      expect(res.status).toBe(202);
      expect(await find()).toMatchObject({ api_key_status: 'invalid', report_count: before + 1 });
    });
  });

  it('maps installations to clients by hand', async () => {
    const [i] = await store.listInstallations({ q: 'kunde', plugin: 'supertext-wordpress-polylang' });
    const id = await store.ensureClient('Kunde AG');
    expect(await store.ensureClient('kunde ag')).toBe(id); // same client, case-insensitive
    await store.updateInstallation(i.id, id, 'Production');
    expect(await store.getInstallation(i.id)).toMatchObject({ client_id: id, client_name: 'Kunde AG', notes: 'Production' });
    expect(await store.listInstallations({ clientId: id })).toHaveLength(1);
    expect((await store.listInstallations({ clientId: 'none' })).every((x) => x.client_id === null)).toBe(true);
    expect((await store.getClient(id))?.installation_count).toBe(1);
    expect(await store.listInstallations({ q: 'Kunde AG' })).toHaveLength(1);
  });

  it('search escapes LIKE wildcards', async () => {
    expect(await store.listInstallations({ q: '%' })).toHaveLength(0);
  });

  it('deleting a client unmaps its installations; deleting an installation removes its history', async () => {
    const [c] = await store.listClients();
    await store.deleteClient(c.id);
    const [i] = await store.listInstallations({ q: 'kunde', plugin: 'supertext-wordpress-polylang' });
    expect(i.client_id).toBeNull();
    await store.deleteInstallation(i.id);
    expect(await store.getInstallation(i.id)).toBeNull();
    expect(await store.installationHistory(i.id)).toEqual([]);
  });
});
