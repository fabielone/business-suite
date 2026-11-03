-- Automations (CRM workflow note): rules, their runs and in-app notifications.
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['suite_automations','suite_automation_runs','suite_notifications'] LOOP
    EXECUTE format('CREATE TABLE %I (space_id uuid NOT NULL REFERENCES suite_spaces(id), id text NOT NULL, version integer NOT NULL CHECK(version>0), payload jsonb NOT NULL CHECK(jsonb_typeof(payload)=''object''), PRIMARY KEY(space_id,id))',tab);
    EXECUTE format('CREATE INDEX ON %I (space_id, ((payload->>''archived'')))',tab);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY suite_context ON %I USING (space_id::text = nullif(current_setting(''suite.space_id'',true),'''')) WITH CHECK (space_id::text = nullif(current_setting(''suite.space_id'',true),''''))',tab);
  END LOOP;
END $$;

-- The scheduler must find due workspaces before it can set a workspace context, so this
-- table has no RLS. It holds only workspace IDs and times; rules and runs stay tenant-scoped.
CREATE TABLE suite_automation_schedule (
  space_id uuid PRIMARY KEY REFERENCES suite_spaces(id),
  next_check_at timestamptz NOT NULL
);
CREATE INDEX suite_automation_schedule_due ON suite_automation_schedule(next_check_at);
REVOKE ALL ON suite_automation_schedule FROM PUBLIC;

-- Team lead and production roles were added to the application with the CRM workflow
-- slice; automations assign work to them.
ALTER TABLE suite_space_members DROP CONSTRAINT suite_space_members_role_check;
ALTER TABLE suite_space_members ADD CONSTRAINT suite_space_members_role_check
  CHECK (role IN ('owner','manager','collaborator','finance','viewer','lead','production'));
ALTER TABLE suite_invitations DROP CONSTRAINT suite_invitations_role_check;
ALTER TABLE suite_invitations ADD CONSTRAINT suite_invitations_role_check
  CHECK (role IN ('owner','manager','collaborator','finance','viewer','lead','production'));
