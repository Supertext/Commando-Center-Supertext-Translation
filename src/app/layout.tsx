import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { isSignedIn } from '@/lib/session';
import { APP_REPO, APP_VERSION, appReleaseUrl } from '@/lib/version';
import { logout } from './actions';

export const metadata: Metadata = {
  title: 'Supertext Commando Center',
  description: 'Which Supertext plugin and system versions each installation runs.',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await isSignedIn();
  const release = appReleaseUrl();
  return (
    <html lang="en">
      <body>
        {signedIn && (
          <header className="top">
            <Link href="/" className="logo">
              <span className="dot" aria-hidden="true" />
              Commando Center
            </Link>
            <nav aria-label="Main">
              <Link href="/">Installations</Link>
              <Link href="/clients">Clients</Link>
            </nav>
            <span className="spacer" />
            <form action={logout}>
              <button type="submit">Sign out</button>
            </form>
          </header>
        )}
        <main>{children}</main>
        <footer className="bottom">
          Supertext Commando Center{' '}
          {release ? (
            <a className="link" href={release} target="_blank" rel="noopener">
              v{APP_VERSION}
            </a>
          ) : (
            <span>v{APP_VERSION}</span>
          )}{' '}
          ·{' '}
          <a className="link" href={APP_REPO} target="_blank" rel="noopener">
            GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
