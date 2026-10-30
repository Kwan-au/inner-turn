CREATE TABLE job_threads (
  code text PRIMARY KEY,
  state jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE job_thread_sessions (
  token_hash text PRIMARY KEY,
  code text NOT NULL REFERENCES job_threads(code) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager', 'cleaner', 'desk')),
  name text NOT NULL,
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX job_thread_sessions_expiry_idx ON job_thread_sessions(expires_at);
ALTER TABLE cleaner_files ADD COLUMN coc_blob_key text;
ALTER TABLE cleaner_files ADD COLUMN desk_verified_at timestamptz;
ALTER TABLE cleaner_files ADD COLUMN written_rates boolean NOT NULL DEFAULT false;
