import { normalizeSiteUrl } from './site-url';

/** A validated version report (spec/report-v1.schema.json). */
export interface Report {
  event: string;
  siteUrl: string;
  local: boolean;
  plugin: string;
  pluginVersion: string;
  system: string;
  systemVersion: string | null;
  runtime: string | null;
  runtimeVersion: string | null;
  sdkVersion: string | null;
  apiKeyConfigured: boolean | null;
  /** Latest automatic API key check, or null when the report has none (or a malformed one). */
  apiKeyCheck: ApiKeyCheck | null;
  /** The plugin's public ping endpoint as reported (checked against the site later), or null. */
  callbackUrl: string | null;
}

export interface ApiKeyCheck {
  status: string;
  /** null: the center stores the time it received the report. */
  checkedAt: Date | null;
  httpStatus: number | null;
  errorCode: string | null;
}

export const KEY_STATUSES = ['ok', 'invalid', 'missing', 'unreachable', 'error'] as const;

export const KNOWN_EVENTS = ['installed', 'settings_saved', 'upgraded', 'api_key_check', 'check'] as const;
export const MAX_BODY_BYTES = 8 * 1024;

export type ParseResult = { ok: true; report: Report } | { ok: false; error: string };

const PLUGIN_NAME = /^[A-Za-z0-9._-]{1,100}$/;
// Printable text only: no control characters, so nothing odd reaches the UI or the logs.
const PRINTABLE = /^[^\p{Cc}]*$/u;

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t || t.length > max || !PRINTABLE.test(t)) return null;
  return t;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * The key check is optional extra information: a malformed one is dropped (null) instead of
 * rejecting the whole report, so a plugin bug there never loses the version information.
 */
export function parseApiKeyCheck(value: unknown, now = Date.now()): ApiKeyCheck | null {
  const c = obj(value);
  const status = c && text(c.status, 40);
  if (!c || !status || !/^[a-z_]+$/.test(status)) return null;
  let checkedAt: Date | null = null;
  if (typeof c.checked_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(c.checked_at)) {
    const t = Date.parse(c.checked_at);
    // A clock in the future or in the distant past isn't believable: use the receive time.
    if (Number.isFinite(t) && t <= now + MAX_CLOCK_SKEW_MS && t >= Date.UTC(2020, 0, 1)) checkedAt = new Date(t);
  }
  const hs = c.http_status;
  const httpStatus = Number.isInteger(hs) && (hs as number) >= 100 && (hs as number) <= 599 ? (hs as number) : null;
  if (hs !== undefined && hs !== null && httpStatus === null) return null;
  const code = c.error_code === undefined || c.error_code === null ? null : text(c.error_code, 100);
  if (c.error_code !== undefined && c.error_code !== null && code === null) return null;
  return { status, checkedAt, httpStatus, errorCode: code };
}

/** Optional {"url": "..."}; anything malformed is dropped like a malformed key check. */
export function parseCallback(value: unknown): string | null {
  const c = obj(value);
  const url = c && text(c.url, 500);
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export function parseReport(body: unknown, now = Date.now()): ParseResult {
  const b = obj(body);
  if (!b) return { ok: false, error: 'Body must be a JSON object.' };
  if (b.schema !== 1) return { ok: false, error: 'Unsupported schema; expected "schema": 1.' };

  const event = text(b.event, 40);
  if (!event || !/^[a-z_]+$/.test(event)) return { ok: false, error: 'Missing or invalid "event".' };

  const site = normalizeSiteUrl(b.site_url);
  if (!site) return { ok: false, error: 'Missing or invalid "site_url" (absolute http or https URL).' };

  const plugin = obj(b.plugin);
  const pluginName = plugin && text(plugin.name, 100);
  if (!pluginName || !PLUGIN_NAME.test(pluginName)) return { ok: false, error: 'Missing or invalid "plugin.name".' };
  const pluginVersion = plugin && text(plugin.version, 50);
  if (!pluginVersion) return { ok: false, error: 'Missing or invalid "plugin.version".' };

  const system = obj(b.system);
  const systemName = system && text(system.name, 100);
  if (!systemName) return { ok: false, error: 'Missing or invalid "system.name".' };
  const runtime = obj(b.runtime);

  return {
    ok: true,
    report: {
      event,
      siteUrl: site.url,
      local: site.local,
      plugin: pluginName,
      pluginVersion,
      system: systemName,
      systemVersion: text(system.version, 50),
      runtime: runtime ? text(runtime.name, 50) : null,
      runtimeVersion: runtime ? text(runtime.version, 50) : null,
      sdkVersion: text(b.sdk_version, 50),
      apiKeyConfigured: typeof b.api_key_configured === 'boolean' ? b.api_key_configured : null,
      apiKeyCheck: parseApiKeyCheck(b.api_key_check, now),
      callbackUrl: parseCallback(b.callback),
    },
  };
}
