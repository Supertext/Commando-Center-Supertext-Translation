import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/session';
import { getInstallation, installationHistory, listClients, type Installation, type ReportRow } from '@/lib/db';
import { latestRelease, repoUrl } from '@/lib/releases';
import { EVENT_LABEL, NameVersion, PluginVersion, ago, formatDate } from '@/components/ui';
import ConfirmButton from '@/components/confirm-button';
import { removeInstallation, saveInstallation } from '../../actions';

export const dynamic = 'force-dynamic';

/** What changed in a report compared with the one before it. */
function changes(row: ReportRow, before: ReportRow | undefined, i: Installation): string[] {
  if (!before) return ['first report'];
  const out: string[] = [];
  const diff = (label: string, a: string | null, b: string | null) => {
    if (a !== b) out.push(`${label} ${a ?? '–'} → ${b ?? '–'}`);
  };
  diff('Plugin', before.plugin_version, row.plugin_version);
  diff(i.system, before.system_version, row.system_version);
  diff(i.runtime ?? 'Runtime', before.runtime_version, row.runtime_version);
  diff('SDK', before.sdk_version, row.sdk_version);
  if (before.api_key_configured !== row.api_key_configured) {
    out.push(row.api_key_configured ? 'API key set' : 'API key removed');
  }
  return out;
}

export default async function InstallationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAuth();
  const { id } = await params;
  const sp = await searchParams;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  const i = await getInstallation(n);
  if (!i) notFound();
  const [history, clients, latest] = await Promise.all([installationHistory(n), listClients(), latestRelease(i.plugin)]);

  return (
    <>
      <p className="small">
        <Link className="link" href="/">
          ← Installations
        </Link>
      </p>
      <h1 className="row">
        {i.site_url}
        {i.local && <span className="badge local">local</span>}
      </h1>
      <p className="sub">
        <a className="link" href={i.site_url} target="_blank" rel="noopener noreferrer">
          Open site
        </a>{' '}
        · first report {formatDate(i.first_seen)} · {i.report_count} reports
      </p>
      {sp.saved && <p className="notice">Saved.</p>}

      <div className="grid2">
        <section className="card" aria-labelledby="state">
          <h2 id="state" style={{ margin: 0, padding: '14px 20px 0' }}>
            Latest report
          </h2>
          <dl className="facts">
            <dt>Plugin</dt>
            <dd>
              <a className="link" href={repoUrl(i.plugin)} target="_blank" rel="noopener">
                {i.plugin}
              </a>
            </dd>
            <dt>Plugin version</dt>
            <dd>
              <PluginVersion plugin={i.plugin} version={i.plugin_version} latest={latest} />
            </dd>
            <dt>System</dt>
            <dd>
              <NameVersion name={i.system} version={i.system_version} />
            </dd>
            <dt>Runtime</dt>
            <dd>
              <NameVersion name={i.runtime} version={i.runtime_version} />
            </dd>
            <dt>SDK</dt>
            <dd className="mono">{i.sdk_version ?? '–'}</dd>
            <dt>API key</dt>
            <dd>{i.api_key_configured === null ? '–' : i.api_key_configured ? 'configured' : 'not configured'}</dd>
            <dt>Last report</dt>
            <dd>
              {formatDate(i.last_seen)} ({ago(i.last_seen)}), {EVENT_LABEL[i.last_event] ?? i.last_event}
            </dd>
          </dl>
        </section>

        <section className="card" aria-labelledby="mapping">
          <h2 id="mapping" style={{ margin: 0, padding: '14px 20px 0' }}>
            Client and notes
          </h2>
          <form action={saveInstallation} className="form-body">
            <input type="hidden" name="id" value={i.id} />
            <label>
              Client
              <select name="client" defaultValue={i.client_id ? String(i.client_id) : 'none'}>
                <option value="none">Not mapped</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Or a new client
              <input name="new_client" placeholder="Client name" maxLength={200} />
            </label>
            <label>
              Notes
              <textarea name="notes" defaultValue={i.notes} maxLength={5000} placeholder="Contact, staging or production, …" />
            </label>
            <div className="row">
              <button type="submit" className="primary">
                Save
              </button>
            </div>
          </form>
        </section>
      </div>

      <h2>History</h2>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>Event</th>
              <th>Plugin</th>
              <th>{i.system}</th>
              <th>{i.runtime ?? 'Runtime'}</th>
              <th>Changes</th>
            </tr>
          </thead>
          <tbody>
            {history.map((r, k) => {
              const c = changes(r, history[k + 1], i);
              return (
                <tr key={r.id}>
                  <td>{formatDate(r.received_at)}</td>
                  <td>
                    <span className="badge event">{EVENT_LABEL[r.event] ?? r.event}</span>
                  </td>
                  <td className="mono">{r.plugin_version}</td>
                  <td className="mono">{r.system_version ?? '–'}</td>
                  <td className="mono">{r.runtime_version ?? '–'}</td>
                  <td className={c.length ? '' : 'muted'} style={{ whiteSpace: 'normal' }}>
                    {c.length ? c.join(', ') : 'no change'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {history.length >= 200 && <p className="small muted">Showing the latest 200 reports.</p>}

      <h2>Remove</h2>
      <form action={removeInstallation} className="row">
        <input type="hidden" name="id" value={i.id} />
        <span className="muted">Deletes this installation and its history. If the plugin reports again, it comes back as new.</span>
        <ConfirmButton message={`Delete ${i.site_url} and its history?`}>Delete installation</ConfirmButton>
      </form>
    </>
  );
}
