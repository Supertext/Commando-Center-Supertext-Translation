# Working on this repository

The **Supertext Commando Center**: collects version reports from all Supertext plugins and shows them to Supertext staff (Next.js 16 + PostgreSQL, Railway). Part of Supertext's translation plugins project; the shared conventions (docs, repo setup, checks, releases, dependency updates) apply here too.

## Always

- **Docs in the same commit:** `docs/INSTALLATION.md` (deploy, settings, troubleshooting), `docs/USER_GUIDE.md` (staff using the center, with screenshots), `docs/DEVELOPER.md` (report protocol, architecture, tests, releasing). `CHANGELOG.md` gets an entry under *Unreleased* for every visible change; `README.md` stays a short overview.
- **The report protocol is a contract with ~30 plugins.** `spec/` (schema, examples, URL vectors) and `docs/DEVELOPER.md` → *Report protocol* change together, only in backward-compatible ways (new optional fields, new events). Plugins in the field never update in step with the center. A breaking change needs `schema: 2` and keeps accepting 1.
- The protocol also lives in the SDK repo (`Supertext-API-SDK-and-Guide`, all five SDKs). Change it there in the same step.
- UI changes: regenerate the screenshots with `npm run docs:screenshots` (see the developer guide).
- Every page and server action calls `requireAuth()`; only `/api/v1/report`, `/health` and `/login` are public.
- Never log or store API keys, passwords or report senders' IP addresses.
- The UI is for Supertext staff and stays in English (the plugins' own UI is the one in four languages).

## Before committing

`npm run typecheck && npm test && npm run test:integration` (Postgres on 127.0.0.1:5432, see the developer guide). Image changes: `docker build -t commando . && test/image-check.sh`. Workflow changes: `actionlint` and `zizmor --offline .github/workflows`.

## Releases

`.github/workflows/release.yml` publishes when `CHANGELOG.md` gets a new `## [X.Y.Z] - YYYY-MM-DD` section and `package.json` has the same version. Never tag by hand. Railway deploys every push to `main`.

## Dependency updates

Keep TypeScript 5 and `@types/node` 22 (Dependabot ignores their majors; see the developer guide). npm 10's arborist crashes on Vitest 4 next to Next 16 (`edgesOut`); Vitest 5 is fine.
