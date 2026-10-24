CREATE TABLE suite_users (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160)
);
CREATE TABLE businesses (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE memberships (
  business_id uuid NOT NULL REFERENCES businesses(id),
  user_id uuid NOT NULL REFERENCES suite_users(id),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (business_id, user_id)
);
CREATE TABLE business_modules (
  business_id uuid NOT NULL REFERENCES businesses(id),
  module text NOT NULL CHECK (module IN ('work','money','crm','resources')),
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (business_id, module)
);
CREATE TABLE membership_grants (
  business_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission text NOT NULL CHECK (permission IN (
    'work.jobs.read','work.jobs.create','work.jobs.close','work.prices.read',
    'money.expenses.read','money.expenses.submit','money.expenses.review'
  )),
  scope text NOT NULL CHECK (scope IN ('business','assigned','own')),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (business_id, user_id, permission),
  FOREIGN KEY (business_id,user_id) REFERENCES memberships(business_id,user_id)
);
CREATE TABLE jobs (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft','scheduled','in_progress','completed')),
  agreed_price_minor bigint NOT NULL CHECK (agreed_price_minor BETWEEN 0 AND 1000000000000),
  currency text NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  created_by uuid NOT NULL,
  closed_by uuid,
  closed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,id),
  FOREIGN KEY (business_id,created_by) REFERENCES memberships(business_id,user_id),
  FOREIGN KEY (business_id,closed_by) REFERENCES memberships(business_id,user_id),
  CHECK ((status = 'completed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
      OR (status <> 'completed' AND closed_at IS NULL AND closed_by IS NULL))
);
CREATE TABLE job_assignments (
  business_id uuid NOT NULL,
  job_id uuid NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY (business_id,job_id,user_id),
  FOREIGN KEY (business_id,job_id) REFERENCES jobs(business_id,id),
  FOREIGN KEY (business_id,user_id) REFERENCES memberships(business_id,user_id)
);
CREATE TABLE expenses (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id),
  job_id uuid,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000000000),
  currency text NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  payer_user_id uuid NOT NULL,
  missing_receipt_reason text NOT NULL CHECK (length(btrim(missing_receipt_reason)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  reviewed_by uuid,
  review_reason text CHECK (length(review_reason) <= 1000),
  reviewed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,id),
  FOREIGN KEY (business_id,job_id) REFERENCES jobs(business_id,id),
  FOREIGN KEY (business_id,payer_user_id) REFERENCES memberships(business_id,user_id),
  FOREIGN KEY (business_id,reviewed_by) REFERENCES memberships(business_id,user_id),
  CHECK ((status = 'submitted' AND reviewed_by IS NULL AND reviewed_at IS NULL)
      OR (status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (status <> 'approved' OR reviewed_by <> payer_user_id)
);
CREATE TABLE command_receipts (
  business_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  command text NOT NULL,
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 160),
  request_hash text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,actor_id,command,key),
  FOREIGN KEY (business_id,actor_id) REFERENCES memberships(business_id,user_id)
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  record_type text NOT NULL CHECK (record_type IN ('job','expense')),
  record_id uuid NOT NULL,
  before_state jsonb,
  after_state jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id,actor_id) REFERENCES memberships(business_id,user_id)
);
CREATE FUNCTION reject_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only';
END;
$$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_change();
CREATE INDEX jobs_business_created ON jobs(business_id,created_at DESC);
CREATE INDEX assignment_user ON job_assignments(business_id,user_id,job_id);
CREATE INDEX expenses_business_payer ON expenses(business_id,payer_user_id,created_at DESC);
CREATE INDEX audit_business_record ON audit_events(business_id,record_type,record_id);

-- API still uses explicit business predicates and active membership/action checks.
-- Production must connect with a non-owner, non-BYPASSRLS role. Demo superuser
-- execution tests application isolation, not PostgreSQL runtime-role enforcement.
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses FORCE ROW LEVEL SECURITY;
CREATE POLICY business_context ON businesses
  USING (id::text = nullif(current_setting('suite.business_id',true),''))
  WITH CHECK (id::text = nullif(current_setting('suite.business_id',true),''));
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'memberships','business_modules','membership_grants','jobs','job_assignments',
    'expenses','command_receipts','audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format(
      'CREATE POLICY business_context ON %I USING (business_id::text = nullif(current_setting(''suite.business_id'',true),'''')) WITH CHECK (business_id::text = nullif(current_setting(''suite.business_id'',true),''''))',
      table_name
    );
  END LOOP;
END;
$$;
