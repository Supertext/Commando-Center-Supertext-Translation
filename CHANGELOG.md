# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- API key check: reports can carry `api_key_check` (status `ok`, `invalid`, `missing`, `unreachable` or `error`, with time, HTTP status and Supertext's error code) and the new event `api_key_check`. The installations list shows the latest result per site with a filter (*Key problem*, …) and a count; the installation page shows it with its history (*API key rejected → ok*). A malformed check is ignored without losing the report; an older check never replaces a newer one. The developer guide defines when every plugin checks its key automatically and the messages in four languages.
- Report endpoint `POST /api/v1/report` (protocol v1, `spec/report-v1.schema.json`): plugins report their site URL, plugin, system, runtime and SDK versions and why (`installed`, `settings_saved`, `upgraded`, `check`). Site URLs are normalized; local and test hosts are flagged. Bodies up to 8 KB, 60 reports per minute per IP.
- Installations list with counts, search and filters (plugin, client, *update available*, local hosts); plugin versions compared with the latest GitHub release of each plugin.
- Installation page with the latest report, client mapping, notes and the history of all reports with what changed (e.g. *WordPress 6.8.3 → 6.9.0*).
- Clients: create, rename, notes, delete; map installations to clients by hand.
- Login with one shared password (`COMMANDO_PASSWORD`), signed 14-day session cookie, login rate limit.
- PostgreSQL migrations at every start; `COMMANDO_DB_NAME` creates and uses an own database on a shared server.
- Docker image for Railway with `/health`; the center's version in the footer, linked to its release.
- Installation, user and developer guides with screenshots; unit and integration tests, image check and CI.
