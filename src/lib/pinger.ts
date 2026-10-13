import { checkCallbackUrl, pingCallback, pingOptionsFromEnv, type PingOptions, type PingResult } from './callback';
import { getInstallation, lastPingUrl, savePing, type Installation } from './db';

/** At most one ping per installation per minute, whatever triggers it. */
export const MIN_GAP_MS = 60_000;
/** Without a reason (new URL, settings saved, …), ping again after this long. */
export const REPING_AFTER_MS = 6 * 60 * 60 * 1000;
/** Pings in flight at once; more are skipped (the next report pings again). */
export const MAX_IN_FLIGHT = 8;

const ALWAYS_PING_EVENTS = new Set(['installed', 'settings_saved', 'check']);
const lastAttempt = new Map<number, number>();
let inFlight = 0;

export type PingOutcome = { pinged: true; url: string; result: PingResult } | { pinged: false; reason: string };

/** Whether a report should trigger a ping (pure, for tests). */
export function shouldPing(
  i: Pick<Installation, 'callback_url' | 'callback_checked_at' | 'local'>,
  event: string,
  previousUrl: string | null,
  now = Date.now(),
): boolean {
  if (!i.callback_url || i.local) return false;
  if (i.callback_checked_at && now - i.callback_checked_at.getTime() < MIN_GAP_MS) return false;
  if (previousUrl !== i.callback_url) return true;
  if (ALWAYS_PING_EVENTS.has(event)) return true;
  return !i.callback_checked_at || now - i.callback_checked_at.getTime() >= REPING_AFTER_MS;
}

/**
 * Pings the installation's callback URL and stores the result.
 * trigger 'report': only when shouldPing says so. 'manual': staff pressed Ping now.
 */
export async function pingInstallation(
  installationId: number,
  trigger: 'report' | 'manual',
  event = 'check',
  opts: PingOptions = pingOptionsFromEnv(),
): Promise<PingOutcome> {
  const i = await getInstallation(installationId);
  if (!i) return { pinged: false, reason: 'installation not found' };
  if (!i.callback_url) return { pinged: false, reason: 'the plugin reports no ping endpoint' };
  if (i.local && !opts.allowPrivate) return { pinged: false, reason: 'local or test host' };

  const now = Date.now();
  const last = lastAttempt.get(installationId) ?? 0;
  const gap = trigger === 'manual' ? 10_000 : MIN_GAP_MS;
  if (now - last < gap) return { pinged: false, reason: 'pinged a moment ago' };
  if (trigger === 'report' && !shouldPing(i, event, await lastPingUrl(installationId), now)) {
    return { pinged: false, reason: 'not due' };
  }
  if (inFlight >= MAX_IN_FLIGHT) return { pinged: false, reason: 'too many pings at once' };

  lastAttempt.set(installationId, now);
  if (lastAttempt.size > 10_000) lastAttempt.clear();

  const check = checkCallbackUrl(i.callback_url, i.site_url);
  let result: PingResult;
  if (!check.ok) {
    result = { status: 'refused', httpStatus: null, ms: null, detail: check.reason };
  } else {
    inFlight++;
    try {
      result = await pingCallback(check.url, i.plugin, opts);
    } finally {
      inFlight--;
    }
  }
  await savePing(installationId, trigger, i.callback_url, result);
  return { pinged: true, url: i.callback_url, result };
}

/** Test helper: forget the in-memory throttle. */
export function resetPinger(): void {
  lastAttempt.clear();
  inFlight = 0;
}
