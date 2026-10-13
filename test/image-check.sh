#!/usr/bin/env bash
# Checks the production image: starts it twice against a Postgres server (creating its own
# database the first time), then checks health, the login redirect, a report and the logs.
# Needs the image "commando" and Postgres on 127.0.0.1:5432 (postgres/postgres).
set -euo pipefail

PORT=8091
PASSWORD="ci-$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
PG_URL="${PG_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"

start() {
  docker rm -f commando >/dev/null 2>&1 || true
  docker run -d --name commando --network host \
    -e PORT=$PORT -e DATABASE_URL="$PG_URL" -e COMMANDO_DB_NAME=commando_ci -e COMMANDO_PASSWORD="$PASSWORD" \
    commando >/dev/null
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "the center did not become healthy"; return 1
}

# The test-only ping switches must never be baked into the image.
if docker image inspect commando --format '{{json .Config.Env}}' | grep -q 'COMMANDO_PING_'; then
  echo "the image sets a COMMANDO_PING_* test switch"; exit 1
fi

start
code=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "http://127.0.0.1:$PORT/")
[[ "$code" == "307 http://127.0.0.1:$PORT/login" ]] || { echo "expected a redirect to /login, got: $code"; exit 1; }
curl -fsS "http://127.0.0.1:$PORT/login" | grep -q 'name="password"' || { echo "login page has no password field"; exit 1; }

body='{"schema":1,"event":"installed","site_url":"https://www.example.ch/","plugin":{"name":"Typo3-Supertext-Translation","version":"0.4.0"},"system":{"name":"TYPO3","version":"13.4.2"},"runtime":{"name":"PHP","version":"8.3.12"}}'
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d "$body" "http://127.0.0.1:$PORT/api/v1/report")
[[ "$code" == 202 ]] || { echo "report: expected 202, got $code"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{"schema":1}' "http://127.0.0.1:$PORT/api/v1/report")
[[ "$code" == 400 ]] || { echo "invalid report: expected 400, got $code"; exit 1; }

# Second start: migrations are a no-op, the report is still there.
start
logs=$(docker logs commando 2>&1)
grep -qF 'migrate: database is up to date' <<< "$logs" || { echo "no migration message in the log"; exit 1; }
if grep -qF "$PASSWORD" <<< "$logs"; then echo "the password appears in the log"; exit 1; fi
count=$(docker run --rm --network host -e PGPASSWORD=postgres "${PSQL_IMAGE:-postgres:16}" \
  psql -h 127.0.0.1 -U postgres -d commando_ci -tAc 'SELECT count(*) FROM installations')
[[ "$count" == 1 ]] || { echo "expected 1 installation after restart, got $count"; exit 1; }

echo "image check passed"
