-- Cleaner FILE promotion: APPLIED → CHECKING → ON_FILE → PAUSED, desk checks, opt-in public card, audit log.
ALTER TABLE cleaner_files ADD COLUMN file_status text NOT NULL DEFAULT 'APPLIED'
  CHECK (file_status IN ('APPLIED', 'CHECKING', 'ON_FILE', 'PAUSED'));
ALTER TABLE cleaner_files ADD COLUMN abn_checked boolean NOT NULL DEFAULT false;
ALTER TABLE cleaner_files ADD COLUMN coc_sighted boolean NOT NULL DEFAULT false;
ALTER TABLE cleaner_files ADD COLUMN rate_agreed boolean NOT NULL DEFAULT false;
ALTER TABLE cleaner_files ADD COLUMN on_file_since timestamptz;
ALTER TABLE cleaner_files ADD COLUMN status_changed_at timestamptz;
ALTER TABLE cleaner_files ADD COLUMN status_changed_by text;
ALTER TABLE cleaner_files ADD COLUMN suburbs text[] NOT NULL DEFAULT '{}';
ALTER TABLE cleaner_files ADD COLUMN public_card boolean NOT NULL DEFAULT false;
ALTER TABLE cleaner_files ADD COLUMN public_first_name text;
ALTER TABLE cleaner_files ADD COLUMN public_consent_at timestamptz;
ALTER TABLE cleaner_files ADD COLUMN public_consent_by text;

CREATE INDEX cleaner_files_file_status_idx ON cleaner_files (file_status);
CREATE INDEX cleaner_files_email_lower_idx ON cleaner_files (lower(email));

CREATE TABLE cleaner_status_log (
  id bigserial PRIMARY KEY,
  cleaner_file_id uuid NOT NULL REFERENCES cleaner_files(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cleaner_status_log_file_idx ON cleaner_status_log (cleaner_file_id, changed_at DESC);

-- Desk-recorded FILE rows (verified certificate + expiry) carry over as ON_FILE.
UPDATE cleaner_files
SET file_status = 'ON_FILE', abn_checked = true, coc_sighted = true, rate_agreed = true,
    on_file_since = coalesce(desk_verified_at, created_at), status_changed_at = now(), status_changed_by = 'migration'
WHERE status = 'FILE' AND desk_verified_at IS NOT NULL AND coc_expires_on IS NOT NULL;
-- A FILE label without that evidence goes back to the desk for checking.
UPDATE cleaner_files SET file_status = 'CHECKING', status_changed_at = now(), status_changed_by = 'migration'
WHERE status = 'FILE' AND file_status = 'APPLIED';
UPDATE cleaner_files SET file_status = 'PAUSED', status_changed_at = now(), status_changed_by = 'migration'
WHERE status IN ('HOLD', 'DEAD');

INSERT INTO cleaner_status_log (cleaner_file_id, action, from_status, to_status, changed_by)
SELECT id, 'migrate', NULL, file_status, 'migration' FROM cleaner_files WHERE status_changed_by = 'migration';
