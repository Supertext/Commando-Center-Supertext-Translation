# Developer guide

The Commando Center collects version reports from the Supertext plugins and shows them to Supertext staff: which site runs which plugin version on which system and runtime version, whether its API key works, and since when. This guide covers the report protocol (what every plugin implements), the app's architecture, local setup, tests, deployment and releasing.

## Architecture

- **Next.js 16** (App Router, server components and server actions), TypeScript, Node.js 22, built as a standalone server (`output: 'standalone'`).
- **PostgreSQL** through [`postgres`](https://github.com/porsager/postgres) (no ORM). Plain SQL migrations in `migrations/`, applied by `scripts/migrate.mjs` before every start.
- **One shared password** (`COMMANDO_PASSWORD`). Login sets an HMAC-signed cookie valid for 14 days; the signing key is derived from the password, so changing it signs everyone out. Every page and every server action calls `requireAuth()`. Only `/api/v1/report`, `/health` and `/login` are public.
- **Latest releases** come from the GitHub API (`Supertext/<plugin>` → newest non-draft release, pre-releases included, because 0.x versions are published as pre-releases). Cached for an hour in memory; errors are cached for 10 minutes. `GITHUB_TOKEN` raises the rate limit.

| Path | What it is |
| --- | --- |
| `src/app/api/v1/report/route.ts` | The report endpoint |
| `src/app/page.tsx` | Installations list with filters and counts |
| `src/app/installations/[id]/page.tsx` | One installation: latest state, client mapping, notes, history |
| `src/app/clients/…` | Clients list and client page |
| `src/app/actions.ts` | Server actions (login, mapping, edits, deletes) |
| `src/lib/report.ts` | Validates a report body |
| `src/lib/site-url.ts` | Normalizes the site URL, recognizes local and test hosts |
| `src/lib/db.ts` | All queries |
| `src/lib/db-url.mjs` | Database URL from `DATABASE_URL` + `COMMANDO_DB_NAME`, shared by the app and the migrations |
| `src/lib/auth.ts`, `session.ts` | Password check and signed session cookie |
| `src/lib/releases.ts`, `semver.ts` | Latest GitHub release per plugin and version comparison |
| `spec/` | Protocol schema and test vectors, shared with the SDKs |

### Data model

- `installations`: one row per **normalized site URL + plugin** with the latest reported state (including the newest API key check), the client it is mapped to, notes, first and last report.
- `reports`: every report received (event, versions, the key check if the report had one, `changed` = differs from the previous state). The history on the installation page reads from here.
- `clients`: Supertext customers, created by hand. Names are unique regardless of case. Deleting a client unmaps its installations; deleting an installation deletes its history.

## Report protocol

Every Supertext plugin implements this. The JSON schema is `spec/report-v1.schema.json`; `spec/report-examples.json` and `spec/site-url-vectors.json` are the shared test vectors (the SDKs run them too).

### Request

```http
POST https://<center>/api/v1/report
Content-Type: application/json

{
  "schema": 1,
  "event": "upgraded",
  "site_url": "https://www.example.ch/",
  "plugin": { "name": "supertext-wordpress-polylang", "version": "2.1.0" },
  "system": { "name": "WordPress", "version": "6.9.0" },
  "runtime": { "name": "PHP", "version": "8.3.12" },
  "sdk_version": "0.3.0",
  "api_key_configured": true,
  "api_key_check": { "status": "ok", "checked_at": "2026-10-13T09:15:00+02:00", "http_status": 200 }
}
```

| Field | Required | Content |
| --- | --- | --- |
| `schema` | yes | `1` |
| `event` | yes | `installed` (first report of an installation), `settings_saved`, `upgraded` (plugin, system or runtime version changed since the last report), `api_key_check` (the key check result changed outside a settings save, see *The API key check*), `check` (sent by a command or test). Lower case and `_`, at most 40 characters; other values are stored as given. |
| `site_url` | yes | The base URL of the installation, as the system knows it (WordPress `home_url()`, TYPO3 site base, Magento base URL of the default store, the shop domain for Shopify, …). Absolute `http`/`https`. |
| `plugin.name` | yes | The plugin's GitHub repository name (`Typo3-Supertext-Translation`). The center reads the latest release from `github.com/Supertext/<name>`. |
| `plugin.version` | yes | From the plugin's official version source (see the conventions → *Releases*), never a second hardcoded copy. |
| `system.name`, `system.version` | name yes | The CMS, PIM, shop or application: `WordPress`, `TYPO3`, `Magento`, `Shopify`, … Use the system's own spelling. |
| `runtime.name`, `runtime.version` | no | `PHP`, `Node.js`, `Python`, `.NET`, `Java` and the full version. |
| `sdk_version` | no | Version of the bundled Supertext SDK (its `COMMIT` file's tag, if any). |
| `api_key_configured` | no | `true`/`false`. Never the key itself. |
| `api_key_check.status` | no | Result of the latest automatic key check: `ok`, `invalid` (Supertext answered 401/403), `missing` (no key set), `unreachable` (network error, timeout, HTTP 5xx), `error` (any other answer). Other values are stored as given. |
| `api_key_check.checked_at` | no | When the check ran, ISO 8601 with time zone. Missing, more than 5 minutes in the future or before 2020: the center uses the time it received the report. |
| `api_key_check.http_status` | no | The HTTP status Supertext answered the check with |
| `api_key_check.error_code` | no | Supertext's error code from the response body, if any (at most 100 characters) |

Unknown fields are accepted and ignored, so later versions can add fields without breaking older centers. The body may be at most 8 KB; strings must not contain control characters. A malformed `api_key_check` is dropped and the rest of the report is stored, so a plugin bug there never loses the version information.

The installation keeps the **newest** key check: a report without one (an `upgraded` report, an older plugin version) or with an older `checked_at` leaves the stored result alone. A changed key status counts as a change in the history (*API key rejected → ok*).

### Response

| Status | Meaning | Plugin does |
| --- | --- | --- |
| 202 | Stored | Remember what was reported (see below) |
| 400 | Invalid report (`error` says why) | Log once at debug level; it's a plugin bug |
| 413, 415 | Too large / not JSON | Same as 400 |
| 429 | Too many reports from this IP (60 per minute) | Try again later |
| 503 | Center can't store right now | Try again later |

The body is `{"ok": true}` or `{"ok": false, "error": "…"}`. Plugins ignore any other fields: later versions may return, for example, remote checks to run.

The site URL identifies the installation. The center lower-cases scheme and host, converts international domains to punycode, drops default ports, user info, query, fragment and trailing slashes, and keeps a sub-path (`https://example.com/de/shop`). Local and test hosts (`localhost`, private IPs, `*.test`, `*.local`, `*.localhost`, `*.ddev.site`, single-label names, …) are flagged and hidden by default. Same URL with two different plugins = two installations.

### When a plugin reports

1. **Settings saved.** After the administrator saves the plugin's settings and the automatic API key check has run, send `settings_saved` with its result in `api_key_check` — or `installed` if the plugin has never reported successfully.
2. **Upgrades.** The plugin stores the version set it last reported successfully: `"<plugin version>|<system version>|<runtime version>"`. On back-end requests that already run the plugin's code (its settings or status page, the translate action, a translation job, a CLI command), it compares the current set with the stored one. If they differ, it sends `upgraded`. This catches updates of the plugin, the system (e.g. WordPress 6.8 → 6.9) and the runtime (PHP 8.3 → 8.4) without relying on each system's update hooks. Don't check on front-end page views.
3. **Never block.** The report is fire-and-forget: at most 3 seconds timeout, no retries in the same request, errors only logged at debug level. A failed report never fails the save or the translation. Where the system offers it, send after the response (WordPress shutdown hook, Laravel/Symfony `kernel.terminate`, a queued job, `setImmediate`/background task).
4. **Throttle failures.** On failure, don't update the stored set and don't try again for an hour (store the time of the last attempt), so an unreachable center can't slow the back end down.
5. **Off means off.** With the setting off, send nothing — not even an "off" report.
6. **Server side only.** Reports go from the plugin's server code (or the hosted app's backend for Shopify and Wix), never from the editor's browser.

### The API key check

Every plugin checks the API key automatically, so administrators learn about a wrong key when they enter it, not when the first translation fails, and Supertext sees it in the center. The check is the SDK's cost-free `validateApiKey()` (`GET features` against the Supertext API; no translation, nothing billed). It runs whether or not version reporting is on; only the report depends on the setting.

**When**

1. **Settings saved:** every time the plugin's settings are saved, after storing them. The result is shown on the settings page (messages below) and sent with the `settings_saved` report. An invalid key never blocks saving.
2. **Key from the environment or a config file** (Directus, Strapi, Ghost, …, where no save happens): on back-end requests, when the key differs from the one last checked. Compare a fingerprint (SHA-256 of the key, kept locally, never sent anywhere). Report `api_key_check`.
3. **A translation is rejected with 401 or 403:** set the status to `invalid` and report `api_key_check`, but only when the status changes (no report per failed translation).
4. **Test connection** (where the plugin has the button): run the same check and update the stored result; report `api_key_check` when the status changed.

**How**

- Timeout 10 seconds. Rate limit (429): the SDK's usual retries, then `error` with `http_status: 429`.
- Map the result: 2xx → `ok`; 401, 403 → `invalid`; no key set → `missing` (no request); network error, timeout, 5xx → `unreachable`; anything else → `error` with `http_status` and Supertext's `error_code` if the body has one.
- Store locally: status, time, HTTP status, error code, key fingerprint. The status/settings page shows the last result with its time.
- Never log or send the key; `error_code` and `http_status` only.

**Messages** (placeholders like `{status}` untranslated; in the UI, *supertext.com* and *supertext.com → Integrations → API* link to https://www.supertext.com/person/en/account/signin and https://www.supertext.com/en/integrations/api in a new tab):

| Result | en | de | fr | it |
| --- | --- | --- | --- | --- |
| `ok` | API key checked: the connection to Supertext works. | API-Schlüssel geprüft: Die Verbindung zu Supertext funktioniert. | Clé API vérifiée : la connexion à Supertext fonctionne. | Chiave API verificata: la connessione a Supertext funziona. |
| `invalid` | Supertext rejected the API key. Check that you copied the whole key, or generate a new one at supertext.com → Integrations → API (requires the Admin role). No Supertext account yet? Create one at supertext.com. | Supertext hat den API-Schlüssel abgelehnt. Prüfen Sie, ob Sie den ganzen Schlüssel kopiert haben, oder erstellen Sie einen neuen unter supertext.com → Integrations → API (erfordert die Rolle Admin). Noch kein Supertext-Konto? Erstellen Sie eines auf supertext.com. | Supertext a refusé la clé API. Vérifiez que vous avez copié la clé entière ou générez-en une nouvelle sur supertext.com → Integrations → API (rôle Admin requis). Pas encore de compte Supertext ? Créez-en un sur supertext.com. | Supertext ha rifiutato la chiave API. Verifichi di aver copiato l'intera chiave oppure ne generi una nuova su supertext.com → Integrations → API (richiede il ruolo Admin). Non ha ancora un account Supertext? Ne crei uno su supertext.com. |
| `missing` | No API key is set yet. No Supertext account yet? Create one at supertext.com. Generate your API key at supertext.com → Integrations → API (requires the Admin role). | Es ist noch kein API-Schlüssel eingetragen. Noch kein Supertext-Konto? Erstellen Sie eines auf supertext.com. Ihren API-Schlüssel erstellen Sie unter supertext.com → Integrations → API (erfordert die Rolle Admin). | Aucune clé API n'est encore saisie. Pas encore de compte Supertext ? Créez-en un sur supertext.com. Générez votre clé API sur supertext.com → Integrations → API (rôle Admin requis). | Non è ancora stata inserita alcuna chiave API. Non ha ancora un account Supertext? Ne crei uno su supertext.com. Generi la Sua chiave API su supertext.com → Integrations → API (richiede il ruolo Admin). |
| `unreachable` | The API key couldn't be checked because Supertext can't be reached. The settings are saved; check again later. | Der API-Schlüssel konnte nicht geprüft werden, weil Supertext nicht erreichbar ist. Die Einstellungen sind gespeichert; prüfen Sie ihn später erneut. | La clé API n'a pas pu être vérifiée, car Supertext n'est pas joignable. Les paramètres sont enregistrés ; réessayez plus tard. | Non è stato possibile verificare la chiave API perché Supertext non è raggiungibile. Le impostazioni sono salvate; riprovi più tardi. |
| `error` | The API key couldn't be checked: Supertext answered with an error ({status}). The settings are saved; check again later. | Der API-Schlüssel konnte nicht geprüft werden: Supertext hat mit einem Fehler geantwortet ({status}). Die Einstellungen sind gespeichert; prüfen Sie ihn später erneut. | La clé API n'a pas pu être vérifiée : Supertext a répondu par une erreur ({status}). Les paramètres sont enregistrés ; réessayez plus tard. | Non è stato possibile verificare la chiave API: Supertext ha risposto con un errore ({status}). Le impostazioni sono salvate; riprovi più tardi. |

Plugins that already have a *Test connection* button and an *authentication failed* message keep their wording if it carries both links; the table is for plugins that don't have one yet.

### The setting in the plugins

Every plugin has this setting, **on by default**, next to its other settings (environment variable `SUPERTEXT_VERSION_REPORTS=0` turns it off where settings live in the environment, e.g. Directus, Strapi, Ghost; the plugin's settings file elsewhere). The URL of the center can be overridden for tests with `SUPERTEXT_REPORT_URL`; the default is in the SDK.

Strings (use the CMS's own word for the system instead of *CMS* where it has one: shop, PIM, …):

| | Label | Help text |
| --- | --- | --- |
| en | Send version information to Supertext | Sends the site URL and the versions of this plugin, the CMS and the runtime to Supertext when you save these settings and after an update, so Supertext support can see which version you run. No content, no API key and no personal data are sent. |
| de | Versionsinformationen an Supertext senden | Sendet die URL der Website sowie die Versionen dieses Plugins, des CMS und der Laufzeitumgebung an Supertext, wenn Sie diese Einstellungen speichern und nach einem Update. So sieht der Supertext-Support, welche Version Sie einsetzen. Es werden keine Inhalte, kein API-Schlüssel und keine Personendaten übertragen. |
| fr | Envoyer les informations de version à Supertext | Envoie à Supertext l'URL du site ainsi que les versions de ce plugin, du CMS et de l'environnement d'exécution lorsque vous enregistrez ces paramètres et après une mise à jour. Le support Supertext voit ainsi quelle version vous utilisez. Aucun contenu, aucune clé API et aucune donnée personnelle ne sont transmis. |
| it | Inviare le informazioni sulla versione a Supertext | Invia a Supertext l'URL del sito e le versioni di questo plugin, del CMS e dell'ambiente di esecuzione quando salva queste impostazioni e dopo un aggiornamento. In questo modo l'assistenza Supertext vede quale versione utilizza. Non vengono trasmessi contenuti, chiavi API né dati personali. |

Each plugin's `docs/INSTALLATION.md` lists the setting with exactly what is sent and how to turn it off.

## Local setup

Needs Node.js 22 and a PostgreSQL server (any version from 14).

```bash
npm ci
cp .env.example .env.local      # then set DATABASE_URL and COMMANDO_PASSWORD
npm run dev                     # applies migrations, then http://localhost:3000
```

Postgres in Docker: `docker run -d --name pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`, then `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres` and `COMMANDO_DB_NAME=commando` (the app creates the database).

Send a report by hand:

```bash
curl -i -H 'Content-Type: application/json' \
  -d '{"schema":1,"event":"check","site_url":"https://www.example.ch","plugin":{"name":"Typo3-Supertext-Translation","version":"0.4.0"},"system":{"name":"TYPO3","version":"13.4.2"}}' \
  http://localhost:3000/api/v1/report
```

## Tests

| Command | What it checks |
| --- | --- |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests: URL normalization, report validation and the API key check against `spec/`, versions, sessions, rate limit, database URL, release lookup |
| `npm run test:integration` | Migrations (twice), the store (including which key check an installation keeps) and the report endpoint against a real Postgres. Needs `TEST_DATABASE_URL` (default `postgres://postgres:postgres@127.0.0.1:5432/postgres`); drops and recreates the database `commando_test` on it |
| `test/image-check.sh` | The Docker image: starts it twice against Postgres, checks health, the login redirect, reports, migrations and that the password never reaches the log |

CI (`.github/workflows/ci.yml`) runs all of them on every push and pull request, with Postgres 16 as a service.

## Docs screenshots

`npm run docs:screenshots` fills an empty center with invented sample sites and clients and saves the screenshots in `docs/images/`. It starts a stand-in for the GitHub releases API on port 8766, so start the center with that first:

```bash
GITHUB_API_URL=http://127.0.0.1:8766 COMMANDO_DB_NAME=commando_docs COMMANDO_PASSWORD=… npm run dev
COMMANDO_URL=http://127.0.0.1:3000 COMMANDO_PASSWORD=… npm run docs:screenshots
```

Needs Playwright's Chromium (`npx playwright install chromium`, or `CHROME=/path/to/chrome`). Regenerate the screenshots in the same commit as UI changes.

## Deployment (Railway)

Railway builds the `Dockerfile` at the repo root. The image runs `scripts/migrate.mjs` and then the Next.js standalone server on `PORT` (8080 by default). Settings, the region and the healthcheck are set on the Railway service (Railway ignores `railway.json`); see `docs/INSTALLATION.md`.

## Dependency updates

Dependabot opens weekly pull requests (npm minor and patch grouped, GitHub Actions grouped, the Docker base image). Merge when CI is green. Not taken automatically:

- TypeScript 7 (native compiler): Next.js's type checking still needs 5.x.
- `@types/node` majors and the `node` image major: they follow the Node.js LTS line the image runs (22). Move both by hand.

## Code quality and security checks

- **Checks** workflow (`.github/workflows/checks.yml`): [actionlint](https://github.com/rhysd/actionlint) and [zizmor](https://docs.zizmor.sh/) lint the workflows on every push and pull request; dependency review fails a pull request that adds a package with a known vulnerability (moderate or worse). Actions are pinned to commit SHAs. Locally: `pip install actionlint-py zizmor`, then `actionlint` and `zizmor --offline .github/workflows`.
- **Links** workflow (`.github/workflows/links.yml`): [lychee](https://lychee.cli.rs/) checks the links in all Markdown files weekly and when docs change on `main`; broken links open the issue "Broken links in the docs".
- TypeScript is analysed by CodeQL default setup; secret scanning with push protection is on (both set by Remy's setup script).
- The report endpoint is public by design (plugins carry no credentials for the center). It validates every field, limits bodies to 8 KB and reports to 60 per minute per IP. Anyone could send invented reports; treat the data as information, not as proof.

## Releasing

Releases are published by `.github/workflows/release.yml` when the version is officially bumped; nobody tags or creates releases by hand.

1. Check that `npm run typecheck && npm test && npm run test:integration` pass.
2. Move the *Unreleased* entries in `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` section, and keep an empty *Unreleased* above it.
3. Set the same version in `package.json` (the footer shows it, linked to the release).
4. Push to `main`. The workflow checks that `package.json` matches `CHANGELOG.md`, then tags `vX.Y.Z` and creates the GitHub release (0.x as pre-releases). Railway deploys every push to `main` independently of releases.

## Known limitations / roadmap

- **Plugins:** the report client and the key-check mapping go into the SDKs (TypeScript, PHP, Python, .NET, Java), then into every plugin with the setting and the automatic key check above.
- **Remote checks:** a later version answers reports with checks to run (e.g. "test the API key", "translate a sample") and receives their results. The response format already allows extra fields.
- **Authenticity:** reports aren't signed. If invented reports become a problem, plugins could sign with a key derived from the Supertext API key.
- One shared password, no per-person accounts or audit log.
- The rate limit and the release cache live in memory: fine for one instance, not for several.
