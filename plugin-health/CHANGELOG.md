# Changelog — Supertext Plugin Health

All five languages share one version. Changes not yet released go under *Unreleased*.

## Unreleased

## 0.1.0 — 2026-10-16

### Added

- TypeScript, PHP, Python, .NET and Java: `InstallationReporter` (version reports, the API key check result, `installed`/`settings_saved`/`upgraded`/`api_key_check`/`check`), `reportsEnabled()` (setting plus `SUPERTEXT_VERSION_REPORTS`), `pingResponse()` for the plugin's public ping endpoint, `ReporterState` and `KeyCheck`.
- Moved here from the Supertext SDK (0.1–0.2), with one change: the reporter no longer creates an SDK client. The plugin passes a key checker (the SDK's `checkApiKey()` and `apiKeyFingerprint()`) and the SDK version. The stored state is unchanged.
- `spec/reporter.json`: the reporter's scenarios, the setting and the ping answers.
