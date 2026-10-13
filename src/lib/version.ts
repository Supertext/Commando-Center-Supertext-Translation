import pkg from '../../package.json';

/** The center's own version, from package.json (the official version source). */
export const APP_VERSION: string = pkg.version;
export const APP_REPO = 'https://github.com/Supertext/Commando-Center-Supertext-Translation';

export function appReleaseUrl(): string | null {
  return /^\d+\.\d+\.\d+$/.test(APP_VERSION) ? `${APP_REPO}/releases/tag/v${APP_VERSION}` : null;
}
