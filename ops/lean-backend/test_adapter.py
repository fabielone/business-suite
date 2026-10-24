#!/usr/bin/env python3
"""Pure generator/installer checks. Uses synthetic config; never reads .local/config.json."""
import argparse
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

import install
from business_suite_config import suite_enabled, suite_service

BACKEND = None
ORIGINAL = None


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # Stable fictional service tokens make an exact comparison independent of time.
    module.token = lambda _secret, role: 'synthetic-test-token-' + role
    return module


def fixture():
    apps = {}
    for name in ('demo', 'isolation', 'agency', 'salad', 'bodagdl', 'zalatitan', 'unkitty'):
        app = {
            'site_url': 'https://' + name + '.example.test',
            'origins': ['https://' + name + '.example.test'],
            'redirect_urls': ['https://' + name + '.example.test/auth/callback'],
            'auth_password': 'test-only-auth-password',
            'api_password': 'test-only-api-password',
            'jwt_secret': 'test-only-jwt-secret-not-for-real-use',
            'signup_enabled': False,
        }
        if name == 'agency':
            app.update(business_api='agency', intake_key='synthetic-intake-key-' * 3)
        if name == 'salad':
            app.update(business_api='salad', cocinacostos_api_key='synthetic-signing-key-' * 3,
                       cocinacostos_webhook_url='', development_auth=True,
                       public_url='https://api-dev.example.test')
        if name in ('bodagdl', 'zalatitan', 'unkitty'):
            app.update(auth={'google': {'enabled': False}},
                       foundation={'contact_enabled': False, 'document_signing_key': 'synthetic-document-key-' * 3})
        apps[name] = app
    return {'mode': 'preview', 'public_url': 'https://api-dev.example.test',
            'postgres_password': 'synthetic-db-password', 'smtp': {}, 'apps': apps}


def suite_app():
    return {
        'site_url': 'http://127.0.0.1:5178',
        'origins': ['http://127.0.0.1:5178', 'http://localhost:5178'],
        'redirect_urls': ['http://127.0.0.1:5178/auth/callback'],
        'auth': {'google': {'enabled': False}}, 'signup_enabled': False,
        'auth_password': 'synthetic-suite-auth-password',
        'api_password': 'synthetic-unused-rest-password',
        'jwt_secret': 'synthetic-suite-jwt-secret-not-real',
        'runtime_password': 'synthetic-runtime-password-not-real-12345',
        'business_api': 'business_suite', 'suite_image': 'business-suite-api:dev',
        'public_url': 'https://api-dev.example.test',
    }


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        scripts = self.root / 'scripts'
        scripts.mkdir()
        for name in ('auth_config.py', 'foundation_config.py'):
            shutil.copy2(BACKEND / 'scripts' / name, scripts / name)
        (scripts / 'backend.py').write_text(ORIGINAL)
        shutil.copy2(install.HERE / 'business_suite_config.py', scripts / 'business_suite_config.py')
        (scripts / 'backend_patched.py').write_text(install.patched_source(ORIGINAL))
        self.before = load_module(scripts / 'backend.py', 'generator_before')
        self.after = load_module(scripts / 'backend_patched.py', 'generator_after')
        for module in (self.before, self.after):
            module.ROOT = Path('/synthetic/operator/backend')
            module.STATE = self.root / 'rendered'
            module.COMPOSE = module.STATE / 'compose.json'

    def render(self, module, config):
        module.render(config)
        return (json.loads(module.COMPOSE.read_text()), (module.STATE / 'Caddyfile').read_text())

    def test_existing_services_and_routes_are_exactly_unchanged(self):
        config = fixture()
        before, before_routes = self.render(self.before, config)
        unchanged, unchanged_routes = self.render(self.after, config)
        self.assertEqual(before, unchanged)
        self.assertEqual(before_routes, unchanged_routes)
        with_suite = copy.deepcopy(config)
        with_suite['apps']['business_suite'] = suite_app()
        after, after_routes = self.render(self.after, with_suite)
        without_suite = copy.deepcopy(after)
        without_suite['services'] = {key: value for key, value in after['services'].items()
                                     if not key.startswith('business_suite-')}
        self.assertEqual(before, without_suite)
        start = after_routes.index('  handle /apps/business_suite/* {')
        end = after_routes.index('  respond /healthz', start)
        self.assertEqual(before_routes, after_routes[:start] + after_routes[end:])

    def test_suite_has_private_runtime_and_no_rest_surface(self):
        config = fixture()
        config['apps']['business_suite'] = suite_app()
        generated, routes = self.render(self.after, config)
        self.assertNotIn('business_suite-rest', generated['services'])
        self.assertNotIn('/apps/business_suite/rest/', routes)
        service = generated['services']['business_suite-business']
        env = service['environment']
        self.assertTrue(env['DATABASE_URL'].startswith('postgres://business_suite_runtime:'))
        self.assertNotIn('SERVICE_KEY', env)
        self.assertNotIn('ports', service)
        self.assertNotIn('build', service)
        self.assertTrue(service['read_only'])
        self.assertEqual(service['user'], '1000:1000')
        self.assertEqual(service['cap_drop'], ['ALL'])
        self.assertEqual(service['networks'], ['database', 'edge'])
        auth = generated['services']['business_suite-auth']['environment']
        self.assertEqual(env['AUTH_ISSUER'], auth['GOTRUE_JWT_ISSUER'])
        self.assertEqual(env['AUTH_AUDIENCE'], auth['GOTRUE_JWT_AUD'])
        self.assertEqual(env['AUTH_JWT_SECRET'], auth['GOTRUE_JWT_SECRET'])
        self.assertEqual(auth['GOTRUE_DISABLE_SIGNUP'], 'true')
        suite_routes = routes[routes.index('  handle /apps/business_suite/* {'):]
        self.assertIn('handle_path /apps/business_suite/api/* {', suite_routes)
        self.assertNotIn('handle_path /apps/business_suite/api/v1/*', suite_routes)
        self.assertIn('x-business-id, idempotency-key', suite_routes)
        self.assertIn('header_down -Access-Control-Allow-Origin', suite_routes)
        self.assertNotIn('localhost(:[0-9]+)', suite_routes)

    def test_scoped_up_never_starts_rest_or_peer_services(self):
        calls = []
        self.after.dc = lambda *args, **_kwargs: calls.append(args)
        self.after.render = lambda _config: None
        self.after.provision = lambda _config, name: self.assertEqual(name, 'business_suite')
        self.after.migrate = lambda _config, name: self.assertEqual(name, 'business_suite')
        config = fixture()
        config['apps']['business_suite'] = suite_app()
        self.after.up_app(config, 'business_suite')
        self.assertEqual([call[-1] for call in calls if call[0] == 'up'],
                         ['business_suite-auth', 'business_suite-business'])
        self.assertIn(('restart', 'gateway'), calls)
        self.assertFalse(any('business_suite-rest' in call for call in calls))

    def test_rejects_cross_app_module_and_image_injection(self):
        with self.assertRaises(ValueError):
            suite_enabled('salad', {'business_api': 'business_suite'})
        with self.assertRaises(ValueError):
            suite_enabled('business_suite', {})
        for bad in ('untrusted/image:dev', 'business-suite-api:dev\nother', 'business-suite-api:dev;sh'):
            app = suite_app()
            app['suite_image'] = bad
            with self.assertRaises(ValueError):
                suite_service('business_suite', app, {}, 'https://api-dev.example.test')
        app = suite_app()
        app['runtime_password'] = 'short'
        with self.assertRaises(ValueError):
            suite_service('business_suite', app, {}, 'https://api-dev.example.test')

    def test_installer_is_guarded_backed_up_and_idempotent(self):
        operator = self.root / 'operator'
        (operator / 'scripts').mkdir(parents=True)
        target = operator / 'scripts/backend.py'
        target.write_text(ORIGINAL)
        dry_run = install.install(operator)
        self.assertEqual(dry_run['status'], 'ready-to-apply')
        self.assertEqual(target.read_text(), ORIGINAL)
        self.assertFalse((operator / 'scripts/business_suite_config.py').exists())
        applied = install.install(operator, True)
        self.assertEqual((Path(applied['backup']) / 'backend.py').read_text(), ORIGINAL)
        self.assertEqual(install.install(operator, True)['status'], 'already-installed')
        target.write_text(target.read_text() + '\n# operator change\n')
        with self.assertRaises(ValueError):
            install.install(operator, True)
        self.assertTrue(target.read_text().endswith('# operator change\n'))
        with self.assertRaises(ValueError):
            install.patched_source(ORIGINAL + '\n# different base\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend', type=Path, required=True)
    args, unittest_args = parser.parse_known_args()
    BACKEND = args.backend.resolve()
    ORIGINAL = (BACKEND / 'scripts/backend.py').read_text()
    if install.digest(ORIGINAL.encode()) != install.BASE_SHA256:
        metadata = json.loads((BACKEND / 'scripts/business_suite_adapter.json').read_text())
        ORIGINAL = (Path(metadata['backup']) / 'backend.py').read_text()
    if install.digest(ORIGINAL.encode()) != install.BASE_SHA256:
        raise ValueError('Original generator revision does not match the reviewed baseline')
    unittest.main(argv=[sys.argv[0], *unittest_args])
