# Installation guide

How to run the Supertext Commando Center: requirements, deployment on Railway, settings, updates and troubleshooting. For using the center, see the [user guide](USER_GUIDE.md); for the report protocol and development, the [developer guide](DEVELOPER.md).

## Requirements

- A container host. The center runs on [Railway](https://railway.com) in the Supertext project; any Docker host works.
- PostgreSQL 14 or later. On Railway, the shared Postgres service is used; the center creates its own database on it.
- A domain the plugins can reach over HTTPS. The plugins send reports to `https://<domain>/api/v1/report`, and that address ships in every plugin, so use a domain Supertext controls (for example `commando.supertext.com`), not the generated Railway domain.

## Deploy on Railway

1. In the Supertext Railway project, create a service from the GitHub repository `Supertext/Commando-Center-Supertext-Translation` (branch `main`). Railway builds the `Dockerfile` at the repo root.
2. Region: **ams** (Amsterdam), one replica.
3. Variables (see *Settings* below): at least `DATABASE_URL` (reference the shared Postgres: `${{Postgres.DATABASE_URL}}`), `COMMANDO_DB_NAME=commando` and `COMMANDO_PASSWORD`.
4. Healthcheck path: `/health` (answers `ok` when the app reaches its database). Restart policy: on failure.
5. Networking: add the custom domain and the DNS record Railway shows (CNAME). Railway issues the certificate.
6. Deploy. On the first start the log shows `migrate: created database commando` and `migrate: applied 001_init.sql`.

Every push to `main` deploys again. Migrations run on every start and only apply what's new.

## Settings

All settings are environment variables (Railway service variables).

| Variable | Required | Default | What it does |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | – | Postgres connection URL (`postgresql://user:password@host:5432/railway`) |
| `COMMANDO_DB_NAME` | no | the database in `DATABASE_URL` | The center's own database on that server; created on the first start. Letters, digits and `_` only |
| `COMMANDO_PASSWORD` | yes | – | Shared login password, at least 12 characters. Changing it signs everyone out |
| `GITHUB_TOKEN` | no | – | A GitHub token (no scopes needed for public repositories). Without it, the release lookup is limited to 60 GitHub API requests per hour, which is enough for normal use |
| `GITHUB_OWNER` | no | `Supertext` | GitHub owner of the plugin repositories |
| `COMMANDO_TIMEZONE` | no | `Europe/Zurich` | Time zone for dates in the UI |
| `PORT` | no | `8080` | Port the server listens on (Railway sets it) |

Keep the password only in Railway's variables: never in the repository, in chat or in tickets.

## What the center receives and stores

Per report: the site URL, the plugin name and version, the system name and version, the runtime name and version, the SDK version, whether an API key is set, the result of the plugin's automatic API key check (status, time, HTTP status and Supertext's error code), and why the report was sent (`installed`, `settings_saved`, `upgraded`, `api_key_check`, `check`). No content, no API keys, no user names or e-mail addresses. The sender's IP address is used for the rate limit in memory and not stored. Clients and notes are entered by Supertext staff.

Plugins send reports by default; administrators can turn it off in each plugin's settings (*Send version information to Supertext*). Each plugin's installation guide documents this.

## Update

Push to `main` (or merge a pull request): Railway builds and deploys, migrations run at start. To roll back, redeploy an earlier deployment in Railway; migrations are only ever added, so an older version runs on a newer database as long as no migration removed something it needs (check `migrations/` before rolling back across one).

## Backup

The data lives in the `commando` database on the shared Postgres service and is covered by its backups. A manual backup: `pg_dump "$DATABASE_URL_WITH_COMMANDO_DB" > commando.sql`.

## Uninstall

Delete the Railway service, then the database: `DROP DATABASE commando;` on the Postgres service. Plugins that still report get no answer; that never affects them (reports are fire-and-forget).

## Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| Login says *Login is not configured* | `COMMANDO_PASSWORD` is missing or shorter than 12 characters |
| *Wrong password* after a password change | Expected: sign in with the new password |
| *Too many attempts* on login | 10 attempts per 15 minutes per IP address. Wait, or restart the service |
| Healthcheck fails, log shows `DATABASE_URL is not set` | Set the variable (reference the Postgres service) |
| Log shows `permission denied to create database` | The Postgres user can't create databases: create `commando` by hand, or leave `COMMANDO_DB_NAME` empty and point `DATABASE_URL` at an existing database |
| Every plugin version shows *no release* | GitHub can't be reached or the rate limit is used up: set `GITHUB_TOKEN`. Plugins without any GitHub release also show *no release* |
| Every installation shows *not checked* under API key | Expected until the plugins have the version that checks the key; older plugin versions don't send a check |
| An installation appears twice | The plugin reported different URLs (e.g. with and without `www`). Delete the one that no longer reports |
| No installations appear | Plugins report only once they have the reporting version and their settings are saved or they are updated. Send a test report (see the developer guide) to check the endpoint |
