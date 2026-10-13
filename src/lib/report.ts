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
}

export const KNOWN_EVENTS = ['installed', 'settings_saved', 'upgraded', 'check'] as const;
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

export function parseReport(body: unknown): ParseResult {
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
    },
  };
}
