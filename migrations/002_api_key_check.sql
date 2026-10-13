-- Result of the plugins' automatic API key check (protocol field api_key_check).
-- NULL everywhere: the plugin hasn't sent a check yet (older plugin versions).
ALTER TABLE installations
  ADD COLUMN api_key_status      text,
  ADD COLUMN api_key_checked_at  timestamptz,
  ADD COLUMN api_key_http_status integer,
  ADD COLUMN api_key_error_code  text;

ALTER TABLE reports
  ADD COLUMN api_key_status      text,
  ADD COLUMN api_key_checked_at  timestamptz,
  ADD COLUMN api_key_http_status integer,
  ADD COLUMN api_key_error_code  text;

CREATE INDEX installations_api_key_status_idx ON installations (api_key_status);
