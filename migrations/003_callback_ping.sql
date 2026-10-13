-- Callback ping: can the center reach the plugin's public ping endpoint from the internet?
-- callback_url NULL: the plugin doesn't offer one (older version, hosted app, reporting off).
ALTER TABLE installations
  ADD COLUMN callback_url          text,
  ADD COLUMN callback_status       text,
  ADD COLUMN callback_checked_at   timestamptz,
  ADD COLUMN callback_http_status  integer,
  ADD COLUMN callback_ms           integer,
  ADD COLUMN callback_detail       text;

CREATE INDEX installations_callback_status_idx ON installations (callback_status);

CREATE TABLE callback_pings (
  id               bigserial PRIMARY KEY,
  installation_id  integer NOT NULL REFERENCES installations (id) ON DELETE CASCADE,
  checked_at       timestamptz NOT NULL DEFAULT now(),
  trigger          text NOT NULL,          -- report or manual
  url              text NOT NULL,
  status           text NOT NULL,
  http_status      integer,
  ms               integer,
  detail           text
);
CREATE INDEX callback_pings_installation_idx ON callback_pings (installation_id, checked_at DESC);
