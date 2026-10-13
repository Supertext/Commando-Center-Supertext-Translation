import Link from 'next/link';
import { requireAuth } from '@/lib/session';
import { listClients } from '@/lib/db';
import { createClient } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  await requireAuth();
  const clients = await listClients();
  return (
    <>
      <h1>Clients</h1>
      <p className="sub">Supertext customers. Map an installation to a client on the installation's page.</p>

      <form action={createClient} className="filters">
        <input name="name" placeholder="New client name" required maxLength={200} aria-label="New client name" />
        <button type="submit" className="primary">
          Add client
        </button>
      </form>

      <div className="card table-wrap">
        {clients.length === 0 ? (
          <p className="empty">No clients yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Installations</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link className="link" href={`/clients/${c.id}`}>
                      {c.name}
                    </Link>
                  </td>
                  <td>{c.installation_count}</td>
                  <td className="muted" style={{ whiteSpace: 'normal' }}>
                    {c.notes.length > 120 ? `${c.notes.slice(0, 120)}…` : c.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
