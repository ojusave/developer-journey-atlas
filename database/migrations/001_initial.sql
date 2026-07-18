CREATE TABLE IF NOT EXISTS diagnostic_sessions (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'processing', 'complete')),
  pending_turn_id uuid,
  catalog_version text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  state jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diagnostic_turns (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  objective_id text NOT NULL,
  correction_of_turn_id uuid REFERENCES diagnostic_turns(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('accepted', 'processing', 'completed', 'failed', 'superseded')),
  encrypted_envelope jsonb,
  result jsonb,
  error_code text,
  workflow_run_id text,
  envelope_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, idempotency_key),
  UNIQUE (session_id, revision)
);

ALTER TABLE diagnostic_sessions
  DROP CONSTRAINT IF EXISTS diagnostic_sessions_pending_turn_id_fkey;

ALTER TABLE diagnostic_sessions
  ADD CONSTRAINT diagnostic_sessions_pending_turn_id_fkey
  FOREIGN KEY (pending_turn_id) REFERENCES diagnostic_turns(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS diagnostic_events (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  turn_id uuid REFERENCES diagnostic_turns(id) ON DELETE SET NULL,
  revision integer NOT NULL CHECK (revision >= 0),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diagnostic_turns_session_created_idx
  ON diagnostic_turns (session_id, created_at);

CREATE INDEX IF NOT EXISTS diagnostic_turns_pending_envelope_idx
  ON diagnostic_turns (envelope_expires_at)
  WHERE encrypted_envelope IS NOT NULL;

CREATE INDEX IF NOT EXISTS diagnostic_sessions_expiry_idx
  ON diagnostic_sessions (expires_at);

CREATE INDEX IF NOT EXISTS diagnostic_events_session_revision_idx
  ON diagnostic_events (session_id, revision);
