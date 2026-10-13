# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Report endpoint `POST /api/v1/report` (protocol v1, `spec/report-v1.schema.json`): plugins report their site URL, plugin, system, runtime and SDK versions and why (`installed`, `settings_saved`, `upgraded`, `check`). Site URLs are normalized; local and test hosts are flagged. Bodies up to 8 KB, 60 reports per minute per IP.
- Installations list with counts, search and filters (plugin, client, *update available*, local hosts); plugin versions compared with the latest GitHub release of each plugin.
- Installation page with the latest report, client mapping, notes and the history of all reports with what changed (e.g. *WordPress 6.8.3 → 6.9.0*).
- Clients: create, rename, notes, delete; map installations to clients by hand.
- Login with one shared password (`COMMANDO_PASSWORD`), signed 14-day session cookie, login rate limit.
- PostgreSQL migrations at every start; `COMMANDO_DB_NAME` creates and uses an own database on a shared server.
- Docker image for Railway with `/health`; the center's version in the footer, linked to its release.
- Installation, user and developer guides with screenshots; unit and integration tests, image check and CI.
