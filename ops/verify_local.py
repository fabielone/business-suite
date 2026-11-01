#!/usr/bin/env python3
"""Exercise real local PostgreSQL/GoTrue/API with scoped fictional accounts.

Refuses every non-local Suite profile. Removes only this run's known accounts,
workspaces and cookie sessions. Does not touch the owner's invitation/account.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import http.cookiejar
import json
import secrets
import sys
import time
from pathlib import Path
from urllib.request import Request, build_opener, HTTPCookieProcessor
from urllib.error import HTTPError
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend', required=True, type=Path)
    args = parser.parse_args()
    root = args.backend.resolve()
    sys.path.insert(0, str(root / 'scripts'))
    import backend as b
    from local_backend import validate, TABLES
    b.STATE = root / '.local' / 'suite'
    b.CONFIG, b.COMPOSE = b.STATE / 'config.json', b.STATE / 'compose.json'
    config = validate(b.load(), root)
    base = config['public_url'] + '/apps/business_suite/api/v2'
    run = str(uuid.uuid4())
    emails = [f'suite-{run}-{n}@example.com' for n in range(3)]
    password = secrets.token_urlsafe(30)
    sessions = []
    users = []
    invitation_ids = []
    passed = []

    class Client:
        def __init__(self):
            self.jar = http.cookiejar.CookieJar()
            self.opener = build_opener(HTTPCookieProcessor(self.jar))
            sessions.append(self)

        def call(self, path, body=None, status=200, origin=None):
            request = Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                              headers={'Content-Type': 'application/json', 'Origin': origin or config['public_url']})
            try:
                response = self.opener.open(request, timeout=25)
                actual, raw = response.status, response.read()
            except HTTPError as error:
                actual, raw = error.code, error.read()
            result = json.loads(raw)
            assert actual == status, (path, actual, result)
            return result

    def command(client, space, kind, payload, **extras):
        body = {'id': str(uuid.uuid4()), 'workspaceId': space, 'type': kind, 'payload': payload, **extras}
        return client.call(f'/workspaces/{space}/commands', body), body

    def owner_invitation(email):
        token, iid = secrets.token_urlsafe(32), str(uuid.uuid4())
        invitation_ids.append(iid)
        b.sql("INSERT INTO suite_invitations(id,token_hash,email,role,expires_at) VALUES(" + ','.join(map(b.literal, [iid, hashlib.sha256(token.encode()).hexdigest(), email, 'owner'])) + ",now()+interval '1 hour');", 'business_suite', capture=True)
        return token

    try:
        owner, reviewer, outsider = Client(), Client(), Client()
        anonymous = Client()
        anonymous.call('/workspaces', status=401)
        anonymous.call('/auth/login', {'email': emails[0], 'password': password}, status=403, origin='https://untrusted.example.com')
        passed.append('Anonymous and wrong-origin requests denied')
        token = owner_invitation(emails[0])
        user = owner.call('/auth/activate', {'token': token, 'name': 'Fictional owner', 'password': password})['user']
        users.append(user['id'])
        workspaces = owner.call('/workspaces')['workspaces']
        assert {w['workspace']['preset'] for w in workspaces} == {'signage', 'household', 'referrals'}
        space = next(w['workspace']['id'] for w in workspaces if w['workspace']['preset'] == 'signage')
        home = next(w['workspace']['id'] for w in workspaces if w['workspace']['preset'] == 'household')
        referrals = next(w['workspace']['id'] for w in workspaces if w['workspace']['preset'] == 'referrals')
        assert owner.call(f'/workspaces/{space}')['data']['contacts'] == []
        second_device = Client()
        assert second_device.call('/auth/login', {'email': emails[0], 'password': password})['user']['id'] == user['id']
        assert len(second_device.call('/workspaces')['workspaces']) == 3
        passed.append('Real GoTrue activation, HttpOnly session and three empty owned workspaces')
        invite = owner.call(f'/workspaces/{space}/invitations', {'email': emails[1], 'role': 'finance'})
        reviewer_user = reviewer.call('/auth/activate', {'token': invite['token'], 'name': 'Fictional reviewer', 'password': password})['user']
        users.append(reviewer_user['id'])
        outsider_user = outsider.call('/auth/activate', {'token': owner_invitation(emails[2]), 'name': 'Fictional outsider', 'password': password})['user']
        users.append(outsider_user['id'])
        outsider.call(f'/workspaces/{space}', status=403)
        reviewer.call(f'/workspaces/{home}', status=403)
        passed.append('Invitations and cross-account/workspace isolation')
        result, employee = command(owner, space, 'contact.save', {'name': 'Example employee', 'kind': 'member'})
        result, customer = command(owner, space, 'contact.save', {'name': 'Example customer', 'kind': 'customer'})
        result, deal = command(owner, space, 'deal.save', {'title': 'Synthetic sign', 'amountMinor': 10000, 'contactId': customer['id'], 'stageId': 'quoted'})
        result, job = command(owner, space, 'deal.convert', {'id': deal['id']})
        result, expense = command(owner, space, 'expense.add', {'description': 'Synthetic material', 'amountMinor': 1000, 'date': '2026-10-30', 'category': 'Materials', 'payerId': employee['id'], 'projectId': job['id'], 'reason': 'Fictional receipt test'})
        owner.call(f'/workspaces/{space}/commands', {'id': str(uuid.uuid4()), 'workspaceId': space, 'type': 'expense.review', 'payload': {'id': expense['id'], 'status': 'approved'}}, status=403)
        result, review = command(reviewer, space, 'expense.review', {'id': expense['id'], 'status': 'approved'})
        result, payment = command(owner, space, 'payment.add', {'kind': 'reimbursement', 'amountMinor': 600, 'date': '2026-10-30', 'toId': employee['id'], 'method': 'transfer', 'reference': 'Synthetic confirmation', 'allocations': [{'expenseId': expense['id'], 'amountMinor': 600}]})
        assert result['data']['payments'][0]['amountMinor'] == 600
        assert second_device.call(f'/workspaces/{space}')['data']['payments'][0]['amountMinor'] == 600
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: owner.call(f'/workspaces/{space}/commands', payment), range(2)))
        assert all(len(r['data']['payments']) == 1 for r in results)
        changed = {**payment, 'payload': {**payment['payload'], 'reference': 'changed'}}
        owner.call(f'/workspaces/{space}/commands', changed, status=409)
        overpaid = {**payment, 'id': str(uuid.uuid4())}
        owner.call(f'/workspaces/{space}/commands', overpaid, status=400)
        stale = {**employee, 'id': str(uuid.uuid4()), 'expectedRevision': 1}
        owner.call(f'/workspaces/{space}/commands', stale, status=409)
        passed.append('CRM conversion, review separation, partial reimbursement, parallel retries and stale conflicts')
        owner.call(f'/workspaces/{space}/members', {'id': reviewer_user['id'], 'role': 'viewer', 'active': True})
        view = reviewer.call(f'/workspaces/{space}')['data']
        assert view['expenses'] == [] and view['payments'] == [] and view['projects'][0]['amountMinor'] == 0 and view['audit'] == []
        reviewer.call(f'/workspaces/{space}/commands', {**employee, 'id': str(uuid.uuid4())}, status=403)
        owner.call(f'/workspaces/{space}/members', {'id': reviewer_user['id'], 'role': 'viewer', 'active': False})
        reviewer.call(f'/workspaces/{space}', status=403)
        passed.append('Restricted views, write denial and immediate membership revocation')
        _, a = command(owner, home, 'contact.save', {'name': 'Example A', 'kind': 'member', 'weight': 2})
        _, z = command(owner, home, 'contact.save', {'name': 'Example B', 'kind': 'member', 'weight': 1})
        h, _ = command(owner, home, 'expense.add', {'description': 'Synthetic groceries', 'amountMinor': 101, 'date': '2026-10-30', 'category': 'Groceries', 'payerId': a['id'], 'split': 'weighted'})
        assert sorted(s['amountMinor'] for s in h['data']['expenses'][0]['shares']) == [34, 67]
        _, task = command(owner, home, 'task.save', {'title': 'Synthetic chore', 'due': '2026-10-30', 'recurrence': 'weekly', 'assigneeId': z['id']})
        h, complete = command(owner, home, 'task.complete', {'id': task['id']})
        assert any(t['due'] == '2026-11-06' and not t['done'] for t in h['data']['tasks'])
        passed.append('Household weighted cents and recurring chores')
        _, candidate = command(owner, referrals, 'contact.save', {'name': 'Example candidate', 'kind': 'candidate', 'email': 'candidate@example.com'})
        _, referral = command(owner, referrals, 'referral.save', {'candidateId': candidate['id'], 'company': 'Example company', 'role': 'Developer', 'stage': 'Referred'})
        draft, _ = command(owner, referrals, 'draft.save', {'referralId': referral['id'], 'to': 'recruiter@example.com', 'subject': 'Fictional referral', 'body': 'This is a draft only.'})
        assert len(draft['data']['drafts']) == 1
        backup = owner.call(f'/workspaces/{space}/backup')
        new_id = str(uuid.uuid4())
        owner.call('/workspaces/restore', {'id': new_id, 'data': backup['data']})
        assert owner.call(f'/workspaces/{new_id}')['data']['expenses'][0]['amountMinor'] == 1000
        assert len(owner.call(f'/workspaces/{space}')['data']['payments']) == 1
        passed.append('Referral drafts and independent backup restoration')
        b.dc('restart', APP_SERVICE, stdout=sys.stderr)
        for attempt in range(20):
            try:
                restored = owner.call(f'/workspaces/{space}')
                break
            except Exception:
                if attempt == 19:
                    raise
                time.sleep(.5)
        assert len(restored['data']['payments']) == 1
        passed.append('Account session and records survive API container restart')
        owner.call('/auth/logout', {})
        owner.call('/workspaces', status=401)
        passed.append('Server-side logout invalidates the session')
        for line in passed:
            print('PASS:', line)
    finally:
        # This operator-only cleanup targets unique fixture user IDs, never all rows.
        if users:
            ids = ','.join(map(b.literal, users))
            space_where = f'space_id IN (SELECT id FROM suite_spaces WHERE owner_id IN ({ids}))'
            queries = ['BEGIN; SET LOCAL session_replication_role=replica;']
            for table in [*TABLES, 'suite_space_commands', 'suite_space_audit', 'suite_invitations', 'suite_space_members']:
                queries.append(f'DELETE FROM {table} WHERE {space_where};')
            queries.extend([f'DELETE FROM suite_spaces WHERE owner_id IN ({ids});', f'DELETE FROM suite_invitations WHERE accepted_by IN ({ids});', f'DELETE FROM auth.users WHERE id IN ({ids});'])
            for client in sessions:
                for cookie in client.jar:
                    if cookie.name == 'suite_session':
                        digest = hashlib.sha256(cookie.value.encode()).hexdigest()
                        queries.append('DELETE FROM suite_sessions WHERE token_hash=' + b.literal(digest) + ';')
            queries.append('COMMIT;')
            b.sql('\n'.join(queries), 'business_suite', capture=True)
        if invitation_ids:
            b.sql('DELETE FROM suite_invitations WHERE id IN (' + ','.join(map(b.literal, invitation_ids)) + ');', 'business_suite', capture=True)
        print('Scoped fictional verification data removed.')


APP_SERVICE = 'business_suite-business'
if __name__ == '__main__':
    main()
