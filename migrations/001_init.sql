-- Clients: Supertext customers, mapped to installations by hand.
CREATE TABLE clients (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  notes       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clients_name_key ON clients (lower(name));

-- Installations: one per normalized site URL and plugin, with the latest reported state.
CREATE TABLE installations (
  id                  serial PRIMARY KEY,
  site_url            text NOT NULL,
  plugin              text NOT NULL,
  local               boolean NOT NULL DEFAULT false,
  client_id           integer REFERENCES clients (id) ON DELETE SET NULL,
  notes               text NOT NULL DEFAULT '',
  plugin_version      text NOT NULL,
  system              text NOT NULL,
  system_version      text,
  runtime             text,
  runtime_version     text,
  sdk_version         text,
  api_key_configured  boolean,
  last_event          text NOT NULL,
  first_seen          timestamptz NOT NULL DEFAULT now(),
  last_seen           timestamptz NOT NULL DEFAULT now(),
  report_count        integer NOT NULL DEFAULT 1,
  UNIQUE (site_url, plugin)
);
CREATE INDEX installations_client_idx ON installations (client_id);
CREATE INDEX installations_last_seen_idx ON installations (last_seen DESC);

-- Reports: every report received, for the history of each installation.
CREATE TABLE reports (
  id                  bigserial PRIMARY KEY,
  installation_id     integer NOT NULL REFERENCES installations (id) ON DELETE CASCADE,
  received_at         timestamptz NOT NULL DEFAULT now(),
  event               text NOT NULL,
  plugin_version      text NOT NULL,
  system_version      text,
  runtime_version     text,
  sdk_version         text,
  api_key_configured  boolean,
  changed             boolean NOT NULL DEFAULT false
);
CREATE INDEX reports_installation_idx ON reports (installation_id, received_at DESC);
