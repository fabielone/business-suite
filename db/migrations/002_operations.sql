-- Additive, versioned operations domain. Existing Work/Money v1 data remains intact.
CREATE TABLE suite_spaces (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE suite_space_members (
  space_id uuid NOT NULL REFERENCES suite_spaces(id),
  user_id uuid NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','manager','collaborator','finance','viewer')),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(space_id,user_id)
);
CREATE INDEX suite_member_user ON suite_space_members(user_id) WHERE active;
CREATE TABLE suite_space_commands (
  space_id uuid NOT NULL REFERENCES suite_spaces(id),
  id text NOT NULL,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(space_id,id)
);
CREATE TABLE suite_space_audit (
  space_id uuid NOT NULL REFERENCES suite_spaces(id),
  id text NOT NULL,
  actor_id uuid NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(space_id,id)
);
CREATE TRIGGER suite_space_audit_immutable BEFORE UPDATE OR DELETE ON suite_space_audit
FOR EACH ROW EXECUTE FUNCTION reject_audit_change();

-- Typed collections have independent tables, indexes and future migration paths.
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['suite_contacts','suite_deals','suite_projects','suite_expense_entries','suite_payments','suite_tasks','suite_referrals','suite_message_templates','suite_message_drafts'] LOOP
    EXECUTE format('CREATE TABLE %I (space_id uuid NOT NULL REFERENCES suite_spaces(id), id text NOT NULL, version integer NOT NULL CHECK(version>0), payload jsonb NOT NULL CHECK(jsonb_typeof(payload)=''object''), PRIMARY KEY(space_id,id))',tab);
    EXECUTE format('CREATE INDEX ON %I (space_id, ((payload->>''archived'')))',tab);
  END LOOP;
END $$;

CREATE TABLE suite_sessions (
  token_hash text PRIMARY KEY,
  encrypted_tokens text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE suite_invitations (
  id uuid PRIMARY KEY,
  token_hash text UNIQUE NOT NULL,
  space_id uuid REFERENCES suite_spaces(id),
  email text NOT NULL,
  role text NOT NULL CHECK(role IN ('owner','manager','collaborator','finance','viewer')),
  created_by uuid,
  expires_at timestamptz NOT NULL,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((space_id IS NULL AND role='owner') OR (space_id IS NOT NULL AND role<>'owner'))
);

ALTER TABLE suite_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite_spaces FORCE ROW LEVEL SECURITY;
CREATE POLICY suite_spaces_context ON suite_spaces
USING (id::text = nullif(current_setting('suite.space_id',true),''))
WITH CHECK (id::text = nullif(current_setting('suite.space_id',true),''));
ALTER TABLE suite_space_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite_space_members FORCE ROW LEVEL SECURITY;
CREATE POLICY suite_members_context ON suite_space_members
USING (space_id::text = nullif(current_setting('suite.space_id',true),'') OR user_id::text = nullif(current_setting('suite.user_id',true),''))
WITH CHECK (space_id::text = nullif(current_setting('suite.space_id',true),''));
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['suite_contacts','suite_deals','suite_projects','suite_expense_entries','suite_payments','suite_tasks','suite_referrals','suite_message_templates','suite_message_drafts','suite_space_audit','suite_space_commands'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY suite_context ON %I USING (space_id::text = nullif(current_setting(''suite.space_id'',true),'''')) WITH CHECK (space_id::text = nullif(current_setting(''suite.space_id'',true),''''))',tab);
  END LOOP;
END $$;
-- Session and invitation secrets are API-only; there is no direct client table API.
REVOKE ALL ON suite_sessions,suite_invitations FROM PUBLIC;
