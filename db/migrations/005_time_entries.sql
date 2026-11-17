-- Time clock: one row per shift (clock-in to clock-out). Hours only; no pay or prices.
CREATE TABLE suite_time_entries (space_id uuid NOT NULL REFERENCES suite_spaces(id), id text NOT NULL, version integer NOT NULL CHECK(version>0), payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), PRIMARY KEY(space_id,id));
CREATE INDEX ON suite_time_entries (space_id, ((payload->>'memberId')));
ALTER TABLE suite_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite_time_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY suite_context ON suite_time_entries
USING (space_id::text = nullif(current_setting('suite.space_id',true),''))
WITH CHECK (space_id::text = nullif(current_setting('suite.space_id',true),''));
