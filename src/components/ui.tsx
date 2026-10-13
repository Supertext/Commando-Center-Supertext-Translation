import { releaseUrl } from '@/lib/releases';
import { versionStatus, type VersionStatus } from '@/lib/semver';

const TZ = process.env.COMMANDO_TIMEZONE || 'Europe/Zurich';

export function formatDate(d: Date | string): string {
  return new Date(d).toLocaleString('de-CH', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ago(d: Date | string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(d).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

const LABEL: Record<VersionStatus, string> = {
  current: 'latest',
  outdated: 'update available',
  ahead: 'newer than release',
  unknown: 'no release',
};

export function PluginVersion({ plugin, version, latest }: { plugin: string; version: string; latest: string | null }) {
  const status = versionStatus(version, latest);
  const url = releaseUrl(plugin, version);
  return (
    <span className="row" style={{ gap: 6 }}>
      {url ? (
        <a className="link mono" href={url} target="_blank" rel="noopener">
          {version}
        </a>
      ) : (
        <span className="mono">{version}</span>
      )}
      <span className={`badge ${status}`} title={latest ? `Latest release: ${latest}` : 'No published release found on GitHub'}>
        {status === 'outdated' && latest ? `${latest} available` : LABEL[status]}
      </span>
    </span>
  );
}

export function NameVersion({ name, version }: { name: string | null; version: string | null }) {
  if (!name) return <span className="muted">–</span>;
  return (
    <span>
      {name} {version && <span className="mono">{version}</span>}
    </span>
  );
}

export const EVENT_LABEL: Record<string, string> = {
  installed: 'installed',
  settings_saved: 'settings saved',
  upgraded: 'upgraded',
  check: 'check',
};
