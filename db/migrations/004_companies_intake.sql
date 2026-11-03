-- Companies as their own record, and keys that let forms and sales channels add leads.
CREATE TABLE suite_companies (space_id uuid NOT NULL REFERENCES suite_spaces(id), id text NOT NULL, version integer NOT NULL CHECK(version>0), payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), PRIMARY KEY(space_id,id));
CREATE INDEX ON suite_companies (space_id, ((payload->>'archived')));
ALTER TABLE suite_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite_companies FORCE ROW LEVEL SECURITY;
CREATE POLICY suite_context ON suite_companies
USING (space_id::text = nullif(current_setting('suite.space_id',true),''))
WITH CHECK (space_id::text = nullif(current_setting('suite.space_id',true),''));

-- Only a SHA-256 hash of each key is stored; the key itself is shown once when created.
-- A key can only add leads (`lead.capture`) to its own workspace.
CREATE TABLE suite_intake_keys (
  space_id uuid NOT NULL REFERENCES suite_spaces(id),
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  source text NOT NULL CHECK (length(source) BETWEEN 1 AND 120),
  -- Browser origins allowed to post from a web page; empty means server-to-server only.
  origins text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY(space_id,id)
);
ALTER TABLE suite_intake_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite_intake_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY suite_context ON suite_intake_keys
USING (space_id::text = nullif(current_setting('suite.space_id',true),''))
WITH CHECK (space_id::text = nullif(current_setting('suite.space_id',true),''));
