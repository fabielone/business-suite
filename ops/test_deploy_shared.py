#!/usr/bin/env python3
"""Pure deployment-plan tests. No Docker, live config, or operator writes."""
import base64
import copy
import hashlib
import hmac
import json
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest

import deploy_shared as deploy


def signed_token(secret, role, expiry=None, algorithm='HS256'):
    encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=').decode()
    content = encode({'alg': algorithm}) + '.' + encode({
        'role': role, 'aud': 'authenticated', 'iss': 'self-hosted-backend',
        'exp': time.time() + 600 if expiry is None else expiry,
    })
    return content + '.' + base64.urlsafe_b64encode(
        hmac.new(secret.encode(), content.encode(), hashlib.sha256).digest(),
    ).rstrip(b'=').decode()


class DeploymentPlanTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.secret = 'synthetic-peer-secret-never-a-real-credential'
        self.token = signed_token(self.secret, 'agency_service')
        self.peer = {'jwt_secret': self.secret}
        self.old_spec = {'name': 'synthetic', 'services': {
            'db': {'image': 'postgres:test-only'},
            'agency-business': {'environment': {'SERVICE_KEY': self.token}},
            'gateway': {'image': 'caddy:test-only'},
        }, 'networks': {'edge': {}}}
        self.new_spec = copy.deepcopy(self.old_spec)
        self.new_spec['services']['business_suite-business'] = {'image': 'business-suite-api:dev'}
        self.old_caddy = ':8080 {\n  respond /peer "unchanged"\n  respond 404\n}\n'
        self.new_caddy = ':8080 {\n  respond /peer "unchanged"\n  handle /apps/business_suite/* {\n    respond 404\n  }\n  respond 404\n}\n'
        self.b = SimpleNamespace(STATE=self.root, COMPOSE=self.root / 'compose.json',
                                 CONFIG=self.root / 'config.json')
        self.b.save = lambda path, value: path.write_text(value)
        self.b.token = lambda *_args: 'must-not-rotate-peer'
        self.b.COMPOSE.write_text(json.dumps(self.old_spec))
        (self.root / 'Caddyfile').write_text(self.old_caddy)
        self.b.CONFIG.write_text('{"before": true}')
        self.original = {path: path.read_bytes() for path in
                         (self.b.COMPOSE, self.root / 'Caddyfile', self.b.CONFIG)}
        self.dc_calls = []
        self.b.dc = lambda *args: self.dc_calls.append(args)
        def render(_config):
            self.assertEqual(self.b.token(self.secret, 'agency_service'), self.token)
            self.b.save(self.b.COMPOSE, json.dumps(self.new_spec))
            self.b.save(self.root / 'Caddyfile', self.new_caddy)
        self.b.render = render

    def check_unchanged(self):
        for path, content in self.original.items():
            self.assertEqual(path.read_bytes(), content)

    def configure(self):
        deploy.configure_backend(self.b, {'after': True}, {'agency': self.peer})

    def test_valid_plan_publishes_after_temporary_validation(self):
        live_compose = self.b.COMPOSE
        def validate(*args):
            self.assertNotEqual(self.b.COMPOSE, live_compose)
            self.check_unchanged()
            self.dc_calls.append(args)
        self.b.dc = validate
        self.configure()
        self.assertEqual(self.dc_calls, [('config', '--quiet')])
        self.assertEqual(self.b.COMPOSE, live_compose)
        self.assertEqual(json.loads(self.b.CONFIG.read_text()), {'after': True})
        self.assertEqual(json.loads(live_compose.read_text()), self.new_spec)

    def test_peer_definition_or_route_change_never_publishes(self):
        self.new_spec['services']['agency-business']['unexpected'] = True
        with self.assertRaises(ValueError):
            self.configure()
        self.check_unchanged()
        del self.new_spec['services']['agency-business']['unexpected']
        self.new_caddy = self.new_caddy.replace('/peer', '/changed-peer')
        with self.assertRaises(ValueError):
            self.configure()
        self.check_unchanged()
        self.assertEqual(self.dc_calls, [])

    def test_failed_validation_leaves_all_live_files_unchanged(self):
        live_compose = self.b.COMPOSE
        def fail(*_args):
            raise RuntimeError('synthetic validation failure')
        self.b.dc = fail
        with self.assertRaises(RuntimeError):
            self.configure()
        self.check_unchanged()
        self.assertEqual(self.b.COMPOSE, live_compose)

    def test_partial_publication_is_rolled_back(self):
        save = self.b.save
        def fail_on_config(path, value):
            if path == self.b.CONFIG:
                raise OSError('synthetic disk failure before config publish')
            save(path, value)
        self.b.save = fail_on_config
        with self.assertRaises(OSError):
            self.configure()
        self.check_unchanged()

    def test_concurrent_operator_edit_is_preserved(self):
        self.b.dc = lambda *_args: self.b.CONFIG.write_text('{"concurrent": true}')
        with self.assertRaises(ValueError):
            self.configure()
        self.assertEqual(json.loads(self.b.CONFIG.read_text()), {'concurrent': True})
        self.assertEqual(self.b.COMPOSE.read_bytes(), self.original[self.b.COMPOSE])
        self.assertEqual((self.root / 'Caddyfile').read_bytes(), self.original[self.root / 'Caddyfile'])

    def test_peer_tokens_are_validated_and_never_silently_regenerated(self):
        for token in (None, 'malformed', signed_token(self.secret, 'agency_service', expiry=0),
                      signed_token(self.secret, 'wrong_role'), signed_token('wrong-secret', 'agency_service'),
                      signed_token(self.secret, 'agency_service', algorithm='none')):
            services = {'agency-business': {'environment': {'SERVICE_KEY': token}}}
            preserve = deploy.retain_peer_tokens(lambda *_args: self.fail('Peer token was regenerated'),
                                                 {'agency': self.peer}, services)
            with self.assertRaises(ValueError):
                preserve(self.secret, 'agency_service')
        preserve = deploy.retain_peer_tokens(lambda *_args: 'new-suite-token', {'agency': self.peer},
                                             self.old_spec['services'])
        self.assertEqual(preserve(self.secret, 'agency_service'), self.token)
        self.assertEqual(preserve('new-suite-secret', 'business_suite_service'), 'new-suite-token')

    def test_failed_dump_is_not_reused_as_a_completed_snapshot(self):
        snapshot = self.root / 'before-migrations.dump'
        def fail(*_args, stdout):
            stdout.write(b'synthetic incomplete dump')
            raise RuntimeError('synthetic dump failure')
        self.b.dc = fail
        with self.assertRaises(RuntimeError):
            deploy.snapshot_database(self.b, snapshot)
        self.assertFalse(snapshot.exists())
        self.assertEqual(list(self.root.glob('*.partial-*')), [])
        self.b.dc = lambda *_args, stdout: stdout.write(b'synthetic successful dump')
        deploy.snapshot_database(self.b, snapshot)
        self.assertEqual(snapshot.read_bytes(), b'synthetic successful dump')
        self.assertEqual(snapshot.stat().st_mode & 0o777, 0o600)
        self.b.dc = lambda *_args, **_kwargs: self.fail('Existing snapshot overwritten')
        deploy.snapshot_database(self.b, snapshot)


if __name__ == '__main__':
    unittest.main()
