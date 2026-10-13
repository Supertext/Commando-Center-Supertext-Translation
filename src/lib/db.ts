import postgres from 'postgres';
import { databaseUrls } from './db-url.mjs';
import type { Report } from './report';

type Sql = postgres.Sql;

const globalForDb = globalThis as unknown as { commandoSql?: Sql };

export function db(): Sql {
  if (!globalForDb.commandoSql) {
    globalForDb.commandoSql = postgres(databaseUrls().url, { max: 5, idle_timeout: 30, onnotice: () => {} });
  }
  return globalForDb.commandoSql;
}

export interface Installation {
  id: number;
  site_url: string;
  plugin: string;
  local: boolean;
  client_id: number | null;
  client_name: string | null;
  notes: string;
  plugin_version: string;
  system: string;
  system_version: string | null;
  runtime: string | null;
  runtime_version: string | null;
  sdk_version: string | null;
  api_key_configured: boolean | null;
  api_key_status: string | null;
  api_key_checked_at: Date | null;
  api_key_http_status: number | null;
  api_key_error_code: string | null;
  last_event: string;
  first_seen: Date;
  last_seen: Date;
  report_count: number;
}

export interface ReportRow {
  id: number;
  received_at: Date;
  event: string;
  plugin_version: string;
  system_version: string | null;
  runtime_version: string | null;
  sdk_version: string | null;
  api_key_configured: boolean | null;
  api_key_status: string | null;
  api_key_checked_at: Date | null;
  api_key_http_status: number | null;
  api_key_error_code: string | null;
  changed: boolean;
}

export interface Client {
  id: number;
  name: string;
  notes: string;
  created_at: Date;
  installation_count: number;
}

/** Stores a report: creates or updates the installation and appends to its history. */
export async function recordReport(r: Report, sql: Sql = db()): Promise<{ installationId: number; created: boolean; changed: boolean }> {
  return sql.begin(async (tx) => {
    const [{ now }] = await tx<{ now: Date }[]>`SELECT now() AS now`;
    const check = r.apiKeyCheck ? { ...r.apiKeyCheck, checkedAt: r.apiKeyCheck.checkedAt ?? now } : null;
    const [existing] = await tx<Installation[]>`
      SELECT * FROM installations WHERE site_url = ${r.siteUrl} AND plugin = ${r.plugin} FOR UPDATE`;

    // The installation keeps the newest check: a report without one (older plugin, or an upgrade
    // report) or with an older one leaves the stored result alone.
    const newer = check && (!existing?.api_key_checked_at || check.checkedAt >= existing.api_key_checked_at);
    const key = newer
      ? { status: check.status, checkedAt: check.checkedAt, httpStatus: check.httpStatus, errorCode: check.errorCode }
      : {
          status: existing?.api_key_status ?? null,
          checkedAt: existing?.api_key_checked_at ?? null,
          httpStatus: existing?.api_key_http_status ?? null,
          errorCode: existing?.api_key_error_code ?? null,
        };

    let id: number;
    let changed: boolean;
    if (!existing) {
      const [row] = await tx<{ id: number }[]>`
        INSERT INTO installations (site_url, plugin, local, plugin_version, system, system_version, runtime,
          runtime_version, sdk_version, api_key_configured, api_key_status, api_key_checked_at, api_key_http_status,
          api_key_error_code, last_event)
        VALUES (${r.siteUrl}, ${r.plugin}, ${r.local}, ${r.pluginVersion}, ${r.system}, ${r.systemVersion},
          ${r.runtime}, ${r.runtimeVersion}, ${r.sdkVersion}, ${r.apiKeyConfigured}, ${key.status}, ${key.checkedAt},
          ${key.httpStatus}, ${key.errorCode}, ${r.event})
        ON CONFLICT (site_url, plugin) DO UPDATE SET last_seen = ${now}
        RETURNING id`;
      id = row.id;
      changed = true;
    } else {
      id = existing.id;
      changed =
        existing.plugin_version !== r.pluginVersion ||
        existing.system !== r.system ||
        existing.system_version !== r.systemVersion ||
        existing.runtime !== r.runtime ||
        existing.runtime_version !== r.runtimeVersion ||
        existing.sdk_version !== r.sdkVersion ||
        existing.api_key_configured !== r.apiKeyConfigured ||
        existing.api_key_status !== key.status;
      await tx`
        UPDATE installations SET plugin_version = ${r.pluginVersion}, system = ${r.system},
          system_version = ${r.systemVersion}, runtime = ${r.runtime}, runtime_version = ${r.runtimeVersion},
          sdk_version = ${r.sdkVersion}, api_key_configured = ${r.apiKeyConfigured}, local = ${r.local},
          api_key_status = ${key.status}, api_key_checked_at = ${key.checkedAt},
          api_key_http_status = ${key.httpStatus}, api_key_error_code = ${key.errorCode},
          last_event = ${r.event}, last_seen = ${now}, report_count = report_count + 1
        WHERE id = ${id}`;
    }
    await tx`
      INSERT INTO reports (installation_id, received_at, event, plugin_version, system_version, runtime_version,
        sdk_version, api_key_configured, api_key_status, api_key_checked_at, api_key_http_status, api_key_error_code,
        changed)
      VALUES (${id}, ${now}, ${r.event}, ${r.pluginVersion}, ${r.systemVersion}, ${r.runtimeVersion}, ${r.sdkVersion},
        ${r.apiKeyConfigured}, ${check?.status ?? null}, ${check?.checkedAt ?? null}, ${check?.httpStatus ?? null},
        ${check?.errorCode ?? null}, ${changed})`;
    return { installationId: id, created: !existing, changed };
  });
}

export interface InstallationFilter {
  q?: string;
  plugin?: string;
  clientId?: number | 'none';
  includeLocal?: boolean;
  /** 'problem': any check result other than ok; 'unchecked': no check reported yet; or one status. */
  keyStatus?: string;
}

export async function listInstallations(f: InstallationFilter = {}, sql: Sql = db()): Promise<Installation[]> {
  const like = f.q ? `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return sql<Installation[]>`
    SELECT i.*, c.name AS client_name
    FROM installations i LEFT JOIN clients c ON c.id = i.client_id
    WHERE true
      ${f.includeLocal ? sql`` : sql`AND NOT i.local`}
      ${f.plugin ? sql`AND i.plugin = ${f.plugin}` : sql``}
      ${f.clientId === 'none' ? sql`AND i.client_id IS NULL` : f.clientId ? sql`AND i.client_id = ${f.clientId}` : sql``}
      ${
        f.keyStatus === 'problem'
          ? sql`AND i.api_key_status IS NOT NULL AND i.api_key_status <> 'ok'`
          : f.keyStatus === 'unchecked'
            ? sql`AND i.api_key_status IS NULL`
            : f.keyStatus
              ? sql`AND i.api_key_status = ${f.keyStatus}`
              : sql``
      }
      ${like ? sql`AND (i.site_url ILIKE ${like} OR c.name ILIKE ${like} OR i.system ILIKE ${like} OR i.notes ILIKE ${like})` : sql``}
    ORDER BY i.last_seen DESC
    LIMIT 2000`;
}

export async function listPlugins(sql: Sql = db()): Promise<string[]> {
  const rows = await sql<{ plugin: string }[]>`SELECT DISTINCT plugin FROM installations ORDER BY plugin`;
  return rows.map((r) => r.plugin);
}

export async function getInstallation(id: number, sql: Sql = db()): Promise<Installation | null> {
  const [row] = await sql<Installation[]>`
    SELECT i.*, c.name AS client_name FROM installations i LEFT JOIN clients c ON c.id = i.client_id WHERE i.id = ${id}`;
  return row ?? null;
}

export async function installationHistory(id: number, limit = 200, sql: Sql = db()): Promise<ReportRow[]> {
  return sql<ReportRow[]>`
    SELECT id, received_at, event, plugin_version, system_version, runtime_version, sdk_version, api_key_configured,
      api_key_status, api_key_checked_at, api_key_http_status, api_key_error_code, changed
    FROM reports WHERE installation_id = ${id} ORDER BY received_at DESC, id DESC LIMIT ${limit}`;
}

export async function updateInstallation(id: number, clientId: number | null, notes: string, sql: Sql = db()): Promise<void> {
  await sql`UPDATE installations SET client_id = ${clientId}, notes = ${notes} WHERE id = ${id}`;
}

export async function deleteInstallation(id: number, sql: Sql = db()): Promise<void> {
  await sql`DELETE FROM installations WHERE id = ${id}`;
}

export async function listClients(sql: Sql = db()): Promise<Client[]> {
  return sql<Client[]>`
    SELECT c.*, count(i.id)::int AS installation_count
    FROM clients c LEFT JOIN installations i ON i.client_id = c.id
    GROUP BY c.id ORDER BY lower(c.name)`;
}

export async function getClient(id: number, sql: Sql = db()): Promise<Client | null> {
  const [row] = await sql<Client[]>`
    SELECT c.*, (SELECT count(*)::int FROM installations WHERE client_id = c.id) AS installation_count
    FROM clients c WHERE c.id = ${id}`;
  return row ?? null;
}

/** Returns the client with this name (case-insensitive), creating it if needed. */
export async function ensureClient(name: string, sql: Sql = db()): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO clients (name) VALUES (${name})
    ON CONFLICT (lower(name)) DO UPDATE SET name = clients.name
    RETURNING id`;
  return row.id;
}

export async function updateClient(id: number, name: string, notes: string, sql: Sql = db()): Promise<void> {
  await sql`UPDATE clients SET name = ${name}, notes = ${notes} WHERE id = ${id}`;
}

export async function deleteClient(id: number, sql: Sql = db()): Promise<void> {
  await sql`DELETE FROM clients WHERE id = ${id}`;
}
