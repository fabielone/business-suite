#!/usr/bin/env python3
"""Verify the deployed Suite with short-lived fictional users/tenant only.

This operator command creates two confirmed @example.invalid Auth users without
sending email, exercises real password login and API persistence, restarts only
business_suite-business, then removes only its marked fixtures. Never run it as
an untrusted web endpoint. It requires the private lean-backend operator config.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPRedirectHandler
from uuid import UUID, uuid4

APP = 'business_suite'
LOCAL = 'http://127.0.0.1:8000/apps/business_suite'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, help='Optional nonsecret JSON evidence file')
    args = parser.parse_args()
    root = args.backend.resolve()
    sys.path.insert(0, str(root / 'scripts'))
    import backend as b
    require(b.ROOT == root, 'Wrong backend module loaded.')
    c = b.load()
    a = c['apps'][APP]
    require(a.get('business_api') == APP, 'Suite-specific backend configuration required.')
    public = b.app_public_url(c, APP) + '/apps/business_suite'
    b.validate_url(public, production=True)
    origin = a['origins'][0]
    service = b.token(a['jwt_secret'], APP + '_service')
    anon = b.token(a['jwt_secret'], APP + '_anon')
    run_id = uuid4().hex
    marker = 'SUITE_SMOKE_' + run_id
    business = str(uuid4())
    created_users = []
    credentials = {}
    tokens = {}
    passed = []
    cleanup = {'business_rows_removed': False, 'auth_users_removed': False}
    phase = 'initial health'
    failure = None
    opener = build_opener(NoRedirect())

    def request(path, method='GET', payload=None, headers=None):
        data = None if payload is None else json.dumps(payload).encode()
        values = {'User-Agent': 'BusinessSuite-OperatorVerification/1.0'}
        if data is not None:
            values['Content-Type'] = 'application/json'
        values.update(headers or {})
        req = Request(LOCAL + path, data=data, method=method, headers=values)
        try:
            response = opener.open(req, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            raw = response.read(1024 * 1024)
            try:
                body = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                body = None
            return response.status, response.headers, body

    def checked(result, status, message, error_code=None):
        require(result[0] == status, message + f' (expected {status}, got {result[0]}).')
        if error_code:
            require(isinstance(result[2], dict) and result[2].get('error', {}).get('code') == error_code,
                    message + ': wrong error code.')
        return result[2]

    def done(message):
        passed.append(message)
        print('PASS ' + message, flush=True)

    def api(path, who='worker', method='GET', payload=None, key=None, extra=None):
        h = {'Authorization': 'Bearer ' + tokens[who], 'X-Business-Id': business}
        if key:
            h['Idempotency-Key'] = key
        h.update(extra or {})
        return request('/api/v1' + path, method, payload, h)

    def sql(query):
        return b.sql(query, APP, capture=True)

    def row(query):
        output = sql('SELECT row_to_json(result) FROM (' + query + ') result;')
        rows = [json.loads(line.strip()) for line in output.splitlines()
                if line.strip().startswith('{')]
        require(len(rows) == 1, 'Expected one verification result from PostgreSQL.')
        return rows[0]

    def health():
        result = checked(request('/api/healthz'), 200, 'Suite API health')
        require(result == {'status': 'ok', 'demo': False}, 'Real API must not use demo mode.')

    def cleanup_owned_rows():
        if not created_users:
            cleanup['business_rows_removed'] = True
            cleanup['auth_users_removed'] = True
            return
        ids = ','.join(b.literal(user['id']) + '::uuid' for user in created_users)
        names = ','.join(b.literal(marker + ' ' + user['role']) for user in created_users)
        # Every destructive statement is tied to fresh UUIDs and verified marker
        # values. Trigger suppression is transaction-local, never persistent.
        sql(f"""BEGIN;
SELECT id FROM businesses WHERE id={b.literal(business)} FOR UPDATE;
SELECT id FROM suite_users WHERE id IN ({ids}) FOR UPDATE;
DO $guard$ BEGIN
  IF EXISTS(SELECT 1 FROM businesses WHERE id={b.literal(business)} AND name<>{b.literal(marker)}) THEN
    RAISE EXCEPTION 'Synthetic business marker mismatch';
  END IF;
  IF EXISTS(SELECT 1 FROM suite_users WHERE id IN ({ids}) AND name NOT IN ({names})) THEN
    RAISE EXCEPTION 'Synthetic user marker mismatch';
  END IF;
  IF EXISTS(SELECT 1 FROM memberships WHERE user_id IN ({ids}) AND business_id<>{b.literal(business)}) THEN
    RAISE EXCEPTION 'Synthetic user joined an unexpected business';
  END IF;
END $guard$;
SET LOCAL session_replication_role=replica;
DELETE FROM audit_events WHERE business_id={b.literal(business)};
DELETE FROM command_receipts WHERE business_id={b.literal(business)};
DELETE FROM expenses WHERE business_id={b.literal(business)};
DELETE FROM job_assignments WHERE business_id={b.literal(business)};
DELETE FROM jobs WHERE business_id={b.literal(business)};
DELETE FROM membership_grants WHERE business_id={b.literal(business)};
DELETE FROM business_modules WHERE business_id={b.literal(business)};
DELETE FROM memberships WHERE business_id={b.literal(business)};
DELETE FROM businesses WHERE id={b.literal(business)} AND name={b.literal(marker)};
DELETE FROM suite_users WHERE id IN ({ids}) AND name IN ({names});
COMMIT;""")
        remaining = row(f"SELECT (SELECT count(*) FROM businesses WHERE id={b.literal(business)}) AS businesses, "
                        f"(SELECT count(*) FROM suite_users WHERE id IN ({ids})) AS users, "
                        f"(SELECT count(*) FROM audit_events WHERE business_id={b.literal(business)}) AS audit, "
                        "current_setting('session_replication_role') AS trigger_mode")
        require(remaining == {'businesses': 0, 'users': 0, 'audit': 0, 'trigger_mode': 'origin'},
                'Synthetic row cleanup or transaction-local trigger restoration failed.')
        cleanup['business_rows_removed'] = True
        for user in created_users:
            endpoint = '/auth/v1/admin/users/' + user['id']
            auth_headers = {'Authorization': 'Bearer ' + service, 'apikey': anon}
            found = request(endpoint, headers=auth_headers)
            if found[0] == 404:
                continue
            actual = checked(found, 200, 'Inspect synthetic Auth user before cleanup')
            require(actual.get('id') == user['id'] and actual.get('email') == user['email'],
                    'Refusing to delete Auth user with mismatched identity marker.')
            checked(request(endpoint, 'DELETE', headers=auth_headers), 200, 'Delete synthetic Auth user')
            checked(request(endpoint, headers=auth_headers), 404, 'Confirm synthetic Auth deletion')
        cleanup['auth_users_removed'] = True

    try:
        health()
        checked(request('/auth/v1/health'), 200, 'Suite Auth health')
        result = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '20',
                                 '-A', 'curl/8.0 BusinessSuite-OperatorVerification',
                                 public + '/api/healthz'], capture_output=True, text=True)
        require(result.returncode == 0 and json.loads(result.stdout) == {'status': 'ok', 'demo': False},
                'Public HTTPS real API health failed.')
        done('local Auth/API health and public HTTPS API health')

        phase = 'deployed runtime role'
        role_code = """import pg from 'pg';
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try {
 const result=await client.query(`SELECT current_user,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 AND c.relkind IN ('r','p') AND pg_has_role(current_user,c.relowner,'USAGE')) AS owns_tables
 FROM pg_roles WHERE rolname=current_user`);
 console.log(JSON.stringify(result.rows[0]));
} finally {await client.end();}"""
        result = b.dc('exec', '-T', APP + '-business', 'node', '--input-type=module', '-e', role_code,
                      capture_output=True, text=True)
        actual_role = json.loads(result.stdout)
        require(actual_role == {'current_user': APP + '_runtime', 'rolsuper': False,
                               'rolbypassrls': False, 'rolcreatedb': False, 'rolcreaterole': False,
                               'owns_tables': False}, 'Deployed runtime role is overprivileged.')
        done('running API uses its non-owner restricted PostgreSQL login')

        phase = 'synthetic Auth user creation and password login'
        for role in ('manager', 'worker'):
            email = f'suite-smoke-{run_id}-{role}@example.invalid'
            password = secrets.token_urlsafe(36)
            created = checked(request('/auth/v1/admin/users', 'POST',
                                      {'email': email, 'password': password, 'email_confirm': True,
                                       'user_metadata': {'suite_verification': marker}},
                                      {'Authorization': 'Bearer ' + service, 'apikey': anon}),
                              200, 'Create confirmed synthetic Auth user')
            user_id = str(UUID(created['id']))
            created_users.append({'id': user_id, 'email': email, 'role': role})
            require(created.get('email') == email, 'Created Auth email marker differs.')
            credentials[role] = {'email': email, 'password': password}
            login = checked(request('/auth/v1/token?grant_type=password', 'POST', credentials[role],
                                    {'apikey': anon}), 200, 'Real Auth password login')
            require(login.get('user', {}).get('id') == user_id, 'Auth login returned another user.')
            require(isinstance(login.get('access_token'), str), 'Auth did not return an access token.')
            tokens[role] = login['access_token']
        done('two confirmed synthetic Auth users sign in with real password-issued JWTs; no email sent')

        phase = 'synthetic business setup'
        manager = created_users[0]['id']
        worker = created_users[1]['id']
        sql(f"""BEGIN;
INSERT INTO suite_users(id,name) VALUES
({b.literal(manager)},{b.literal(marker + ' manager')}),
({b.literal(worker)},{b.literal(marker + ' worker')});
INSERT INTO businesses(id,name) VALUES({b.literal(business)},{b.literal(marker)});
INSERT INTO memberships(business_id,user_id) VALUES
({b.literal(business)},{b.literal(manager)}),({b.literal(business)},{b.literal(worker)});
INSERT INTO business_modules(business_id,module,enabled) VALUES
({b.literal(business)},'work',true),({b.literal(business)},'money',true);
INSERT INTO membership_grants(business_id,user_id,permission,scope)
SELECT {b.literal(business)}::uuid,{b.literal(manager)}::uuid,p,'business' FROM unnest(ARRAY[
'work.jobs.read','work.jobs.create','work.jobs.close','work.prices.read',
'money.expenses.read','money.expenses.submit','money.expenses.review']) p;
INSERT INTO membership_grants(business_id,user_id,permission,scope) VALUES
({b.literal(business)},{b.literal(worker)},'work.jobs.read','assigned'),
({b.literal(business)},{b.literal(worker)},'work.jobs.close','assigned'),
({b.literal(business)},{b.literal(worker)},'money.expenses.read','own'),
({b.literal(business)},{b.literal(worker)},'money.expenses.submit','own');
COMMIT;""")
        workspace = checked(api('/workspace'), 200, 'Worker workspace')
        require(workspace['user']['id'] == worker and workspace['demo'] is False,
                'Live JWT was not mapped to the expected business membership.')
        done('real Auth subjects map to isolated explicit business memberships and grants')

        phase = 'authorization and CORS'
        checked(request('/api/v1/workspace', headers={'X-Business-Id': business}), 401,
                'Unauthenticated API denied', 'UNAUTHENTICATED')
        checked(api('/workspace', extra={'X-Business-Id': str(uuid4())}), 403,
                'Unrelated business denied', 'BUSINESS_ACCESS_DENIED')
        job_input = {'title': marker + ' job', 'customerName': 'Fictional verification customer',
                     'agreedPriceMinor': 123450, 'currency': 'MXN', 'assignedUserIds': [worker]}
        checked(api('/jobs', method='POST', payload=job_input, key=str(uuid4()),
                    extra={'X-Demo-User': 'manager', 'X-Role': 'manager'}), 403,
                'Forged manager headers denied', 'ACTION_DENIED')
        allowed = api('/workspace', extra={'Origin': origin})
        checked(allowed, 200, 'Allowed browser origin')
        require(allowed[1].get_all('Access-Control-Allow-Origin') == [origin],
                'Exactly one matching CORS allow-origin header is required.')
        preflight = request('/api/v1/expenses', 'OPTIONS', headers={
            'Origin': origin, 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key,x-business-id'})
        checked(preflight, 204, 'Allowed preflight')
        require(preflight[1].get_all('Access-Control-Allow-Origin') == [origin],
                'Preflight CORS header was duplicated or mismatched.')
        allowed_headers = preflight[1].get('Access-Control-Allow-Headers', '').lower()
        require(all(name in allowed_headers for name in ['authorization', 'idempotency-key', 'x-business-id']),
                'Suite preflight must permit its required headers.')
        hostile = api('/workspace', extra={'Origin': 'https://hostile.example.invalid'})
        checked(hostile, 403, 'Hostile browser origin denied')
        require(not hostile[1].get_all('Access-Control-Allow-Origin'), 'Hostile origin received CORS permission.')
        done('unauthenticated/cross-business/forged-role requests denied; exact CORS and preflight pass')

        phase = 'job and expense workflow'
        job = checked(api('/jobs', 'manager', 'POST', job_input, str(uuid4())), 201, 'Create job')['job']
        job_id = str(UUID(job['id']))
        require(job['agreedPriceMinor'] == 123450 and job['version'] == 1, 'Job price/version mismatch.')
        visible = checked(api('/jobs'), 200, 'Assigned worker jobs')['jobs']
        require(len(visible) == 1 and visible[0]['id'] == job_id and 'agreedPriceMinor' not in visible[0],
                'Worker assigned-job view leaked price or unexpected jobs.')
        close_key = str(uuid4())
        closed = checked(api('/jobs/' + job_id + '/close', method='POST', payload={'version': 1}, key=close_key),
                         200, 'Worker closes assigned job')
        retry = checked(api('/jobs/' + job_id + '/close', method='POST', payload={'version': 1}, key=close_key),
                        200, 'Close replay')
        require(closed == retry and closed['job']['version'] == 2 and closed['job']['status'] == 'completed',
                'Completion replay changed the result.')
        expense_key = str(uuid4())
        expense_input = {'jobId': job_id, 'description': marker + ' invented expense',
                         'amountMinor': 16050, 'currency': 'MXN',
                         'missingReceiptReason': 'Synthetic verification; no real purchase.'}
        expense = checked(api('/expenses', method='POST', payload=expense_input, key=expense_key),
                          201, 'Worker submits expense')
        require(checked(api('/expenses', method='POST', payload=expense_input, key=expense_key),
                        201, 'Expense replay') == expense, 'Expense replay differs.')
        expense_id = str(UUID(expense['expense']['id']))
        counts = row(f"SELECT (SELECT count(*) FROM expenses WHERE id={b.literal(expense_id)} AND business_id={b.literal(business)}) AS expenses, "
                     f"(SELECT count(*) FROM command_receipts WHERE business_id={b.literal(business)} AND key={b.literal(expense_key)} AND response IS NOT NULL) AS receipts, "
                     f"(SELECT count(*) FROM audit_events WHERE business_id={b.literal(business)} AND record_id={b.literal(expense_id)} AND action='expense.submitted') AS audit")
        require(counts == {'expenses': 1, 'receipts': 1, 'audit': 1}, 'Expense replay created duplicate records.')
        approved = checked(api('/expenses/' + expense_id + '/review', 'manager', 'POST',
                               {'version': 1, 'decision': 'approve'}, str(uuid4())), 200, 'Manager approves expense')
        require(approved['expense']['status'] == 'approved' and approved['expense']['version'] == 2,
                'Expense review state/version mismatch.')
        done('manager job, scoped worker completion, exactly-once expense retry and manager approval persist')

        phase = 'API-only restart and persistence'
        b.dc('restart', APP + '-business', capture_output=True, text=True)
        deadline = time.monotonic() + 30
        while True:
            try:
                health()
                break
            except Exception:
                if time.monotonic() >= deadline:
                    raise AssertionError('Suite API did not become healthy after its scoped restart.') from None
                time.sleep(1)
        after_job = checked(api('/jobs', 'manager'), 200, 'Persisted job after restart')['jobs']
        after_expense = checked(api('/expenses'), 200, 'Persisted expense after restart')['expenses']
        require(len(after_job) == 1 and after_job[0]['id'] == job_id
                and after_job[0]['status'] == 'completed' and after_job[0]['version'] == 2
                and after_job[0]['agreedPriceMinor'] == 123450, 'Job changed or disappeared after restart.')
        require(len(after_expense) == 1 and after_expense[0] == approved['expense'],
                'Approved expense changed or disappeared after restart.')
        require(checked(api('/expenses', method='POST', payload=expense_input, key=expense_key),
                        201, 'Expense replay after restart') == expense,
                'Persisted command receipt no longer returns its original result.')
        done('only Suite API restarted; records, agreed price and idempotency receipts survived')
    except Exception as error:
        # Do not echo HTTP bodies, subprocess stderr, tokens, config or passwords.
        failure = {'phase': phase, 'category': type(error).__name__}
        if isinstance(error, AssertionError):
            failure['message'] = str(error)
        print('FAIL ' + phase + ' (' + type(error).__name__ + ')', file=sys.stderr)
    finally:
        try:
            cleanup_owned_rows()
            done('synthetic tenant and both Auth users removed; trigger mode restored')
        except Exception as error:
            failure = failure or {'phase': 'synthetic fixture cleanup', 'category': type(error).__name__}
            print('FAIL synthetic fixture cleanup; inspect the private evidence marker before retrying.', file=sys.stderr)
        evidence = {'verified_at': datetime.now(timezone.utc).isoformat(), 'run_marker': marker,
                    'business_id': business, 'auth_user_ids': [user['id'] for user in created_users],
                    'passed': passed, 'cleanup': cleanup, 'failure': failure,
                    'limits': ['No real business data or customer emails used.',
                               'No client login UI, external identity provider or production readiness claim.',
                               'Only business_suite-business was restarted.']}
        if args.evidence:
            b.save(args.evidence.resolve(), json.dumps(evidence, indent=2) + '\n')
        credentials.clear()
        tokens.clear()
    if failure:
        return 1
    print(f'Deployed verification complete: {len(passed)} groups passed; synthetic fixtures cleaned.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print('Verifier setup failed (' + type(error).__name__ + '); configuration values are hidden.', file=sys.stderr)
        sys.exit(1)
