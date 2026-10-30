-- Inner Turn desk intake schema (Melbourne STR changeover)
-- Aligns with site forms: manager-enquire, lot-pack, cleaner-file
-- Statuses: LEAD / FILE / LIVE / HOLD / DEAD only

DO $$ BEGIN
  CREATE TYPE desk_status AS ENUM ('LEAD', 'FILE', 'LIVE', 'HOLD', 'DEAD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE desk_lane AS ENUM ('managers', 'cleaners', 'booking', 'disputes');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Parties (managers or cleaners)
CREATE TABLE IF NOT EXISTS parties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lane            desk_lane NOT NULL,
  status          desk_status NOT NULL DEFAULT 'LEAD',
  company_name    text,
  contact_name    text,
  email           text,
  mobile          text,
  website         text,
  abn             text,
  notes           text,
  dead_reason     text,
  source          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parties_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS parties_lane_status_idx ON parties (lane, status);
CREATE INDEX IF NOT EXISTS parties_mobile_idx ON parties (mobile);

-- Manager lot packs (executable when required fields present)
CREATE TABLE IF NOT EXISTS lot_packs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id        uuid REFERENCES parties(id) ON DELETE SET NULL,
  status          desk_status NOT NULL DEFAULT 'LEAD',
  source          text,
  company_name    text,
  contact_name    text,
  email           text,
  phone           text,
  address         text,
  suburb          text,
  street          text,
  postcode        text,
  beds            text,
  checkout_at     timestamptz,
  checkin_at      timestamptz,
  access          text,
  linen           text,
  parking         text,
  oc_allowed      text,
  details         text,
  notes           text,
  form_name       text,
  form_submission_id text,
  executable      boolean GENERATED ALWAYS AS (
                    coalesce(nullif(trim(suburb), ''), nullif(trim(street), ''), nullif(trim(address), '')) IS NOT NULL
                    AND nullif(trim(beds), '') IS NOT NULL
                    AND checkout_at IS NOT NULL
                    AND checkin_at IS NOT NULL
                    AND nullif(trim(access), '') IS NOT NULL
                  ) STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lot_packs_executable_idx ON lot_packs (executable) WHERE executable = true;
CREATE INDEX IF NOT EXISTS lot_packs_status_idx ON lot_packs (status);
CREATE INDEX IF NOT EXISTS lot_packs_email_idx ON lot_packs (email);
CREATE UNIQUE INDEX IF NOT EXISTS lot_packs_form_submission_uidx
  ON lot_packs (form_submission_id) WHERE form_submission_id IS NOT NULL;

-- Cleaner FILE records (pay lock + CoC + named person)
CREATE TABLE IF NOT EXISTS cleaner_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id        uuid REFERENCES parties(id) ON DELETE SET NULL,
  status          desk_status NOT NULL DEFAULT 'LEAD',
  company_name    text,
  contact_name    text,
  named_person    text,
  named_mobile    text,
  email           text,
  mobile          text,
  website         text,
  abn             text,
  rate_1bed       numeric(10,2),
  rate_2bed       numeric(10,2),
  rate_3bed       numeric(10,2),
  rate_4bed       numeric(10,2),
  rates_gst       text,
  rates_include_photos boolean,
  rates_include_linen  boolean,
  rates_notes     text,
  coc_insurer     text,
  coc_policy      text,
  coc_expires_on  date,
  coc_pl_limit    numeric(14,2),
  coc_notes       text,
  areas           text,
  postcodes       text,
  availability    text,
  travel          text,
  access_notes    text,
  form_name       text,
  form_submission_id text,
  pay_lock_ok     boolean,
  missing_fields  text[],
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cleaner_files_status_idx ON cleaner_files (status);
CREATE INDEX IF NOT EXISTS cleaner_files_email_idx ON cleaner_files (email);
CREATE UNIQUE INDEX IF NOT EXISTS cleaner_files_form_submission_uidx
  ON cleaner_files (form_submission_id) WHERE form_submission_id IS NOT NULL;

-- Raw Netlify Forms intake (audit + dedupe before promote to lot_packs / cleaner_files)
CREATE TABLE IF NOT EXISTS form_intake (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_name           text NOT NULL,
  form_id             text,
  submission_id       text,
  submitted_at        timestamptz,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed           boolean NOT NULL DEFAULT false,
  processed_at        timestamptz,
  party_id            uuid REFERENCES parties(id) ON DELETE SET NULL,
  lot_pack_id         uuid REFERENCES lot_packs(id) ON DELETE SET NULL,
  cleaner_file_id     uuid REFERENCES cleaner_files(id) ON DELETE SET NULL,
  skip_reason         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_intake_submission_unique UNIQUE (submission_id)
);

CREATE INDEX IF NOT EXISTS form_intake_unprocessed_idx ON form_intake (processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS form_intake_form_name_idx ON form_intake (form_name);

-- Touch updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS parties_set_updated_at ON parties;
CREATE TRIGGER parties_set_updated_at
  BEFORE UPDATE ON parties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS lot_packs_set_updated_at ON lot_packs;
CREATE TRIGGER lot_packs_set_updated_at
  BEFORE UPDATE ON lot_packs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS cleaner_files_set_updated_at ON cleaner_files;
CREATE TRIGGER cleaner_files_set_updated_at
  BEFORE UPDATE ON cleaner_files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Board helpers
CREATE OR REPLACE VIEW v_executable_lot_packs AS
SELECT *
FROM lot_packs
WHERE executable = true
  AND status IN ('LEAD', 'FILE', 'LIVE', 'HOLD');

CREATE OR REPLACE VIEW v_cleaner_file_ready AS
SELECT *
FROM cleaner_files
WHERE status = 'FILE'
   OR (
        rate_1bed IS NOT NULL
    AND rate_2bed IS NOT NULL
    AND rate_3bed IS NOT NULL
    AND nullif(trim(abn), '') IS NOT NULL
    AND coc_expires_on IS NOT NULL
    AND nullif(trim(named_person), '') IS NOT NULL
   );

-- Improve existing intakes table used by submission-created
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS lane text;
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS executable boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS intakes_status_idx ON intakes (status);
CREATE INDEX IF NOT EXISTS intakes_kind_status_idx ON intakes (kind, status);
CREATE INDEX IF NOT EXISTS intakes_email_idx ON intakes (email);
CREATE INDEX IF NOT EXISTS intakes_executable_idx ON intakes (executable) WHERE executable = true;
