#!/usr/bin/env python3
"""Scoped Business Suite deployment onto an existing, backed-up lean-backend host.

Requires the reviewed ops/lean-backend adapter. Never initializes the host,
rotates existing credentials, starts peer apps, or seeds business data.
"""
import argparse
import base64
import hashlib
import hmac
import time
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
from urllib.parse import quote

APP = 'business_suite'
RUNTIME = APP + '_runtime'


def retain_peer_tokens(original_token, peers, old_services):
    """Preserve valid existing derived credentials; never rotate peers implicitly."""
    def retained_token(secret, role):
        for name, peer in peers.items():
            if role != name + '_service':
                continue
            if secret != peer['jwt_secret']:
                raise ValueError('Peer signing configuration changed; inspect before rendering.')
            tokens = set()
            for service_name in (name + '-business', name + '-identity'):
                env = old_services.get(service_name, {}).get('environment', {})
                token = env.get('SERVICE_KEY') or env.get('SALAD_SERVICE_KEY')
                if token:
                    tokens.add(token)
            if len(tokens) != 1:
                raise ValueError('Missing or inconsistent peer service token; review that peer separately.')
            token = tokens.pop()
            try:
                header, payload, signature = token.split('.')
                decode = lambda value: json.loads(base64.urlsafe_b64decode(value + '=' * (-len(value) % 4)))
                decoded_header, decoded = decode(header), decode(payload)
                expected = base64.urlsafe_b64encode(hmac.new(
                    secret.encode(), (header + '.' + payload).encode(), hashlib.sha256,
                ).digest()).rstrip(b'=').decode()
                valid = (decoded_header.get('alg') == 'HS256' and
                         hmac.compare_digest(signature, expected) and decoded.get('role') == role and
                         decoded.get('aud') == 'authenticated' and decoded.get('iss') == 'self-hosted-backend' and
                         isinstance(decoded.get('exp'), (int, float)) and decoded['exp'] > time.time())
            except (ValueError, TypeError, AttributeError, UnicodeError):
                valid = False
            if not valid:
                raise ValueError('Peer service token needs a separate reviewed renewal.')
            return token
        return original_token(secret, role)
    return retained_token


def configure_backend(b, config, peers):
    """Stage/validate without touching live files; roll back publication failures."""
    compose_path = b.COMPOSE
    caddy_path = b.STATE / 'Caddyfile'
    paths = (caddy_path, compose_path, b.CONFIG)
    before = {path: path.read_bytes() for path in paths}
    old_spec = json.loads(before[compose_path])
    original_token, original_save = b.token, b.save
    rendered = {}

    def capture(path, value):
        if path not in (compose_path, caddy_path) or not isinstance(value, str):
            raise ValueError('Renderer attempted an unexpected write; nothing published.')
        rendered[path] = value

    b.token = retain_peer_tokens(original_token, peers, old_spec['services'])
    b.save = capture
    try:
        b.render(config)
    finally:
        b.token, b.save = original_token, original_save
    if set(rendered) != {compose_path, caddy_path}:
        raise ValueError('Renderer did not produce the complete configuration.')
    new_spec = json.loads(rendered[compose_path])
    strip_suite = lambda spec: {
        **spec,
        'services': {name: service for name, service in spec['services'].items()
                     if not name.startswith(APP + '-')},
    }
    if strip_suite(new_spec) != strip_suite(old_spec):
        raise ValueError('Peer/shared definitions changed; staged configuration was not published.')
    def without_suite_routes(text):
        lines = text.splitlines(keepends=True)
        starts = [index for index, line in enumerate(lines)
                  if line.rstrip() == '  handle /apps/business_suite/* {']
        if not starts:
            return text
        if len(starts) != 1:
            raise ValueError('Unexpected Suite gateway structure; inspect before publishing.')
        start = starts[0]
        end = next((index for index in range(start + 1, len(lines))
                    if lines[index].rstrip() == '  }'), None)
        if end is None:
            raise ValueError('Unclosed Suite gateway route; nothing published.')
        return ''.join(lines[:start] + lines[end + 1:])
    if without_suite_routes(before[caddy_path].decode()) != without_suite_routes(rendered[caddy_path]):
        raise ValueError('Peer/shared gateway routes changed; nothing published.')
    # The rendered gateway retains its live mount path; this file is only used
    # for Compose schema/interpolation validation, never for starting containers.
    with tempfile.TemporaryDirectory(prefix='suite-config-check-', dir=b.STATE) as staging:
        candidate = Path(staging) / 'compose.json'
        original_save(candidate, rendered[compose_path])
        b.COMPOSE = candidate
        try:
            b.dc('config', '--quiet')
        finally:
            b.COMPOSE = compose_path
    rendered[b.CONFIG] = json.dumps(config, indent=2) + '\n'
    if any(path.read_bytes() != value for path, value in before.items()):
        raise ValueError('Operator files changed during validation; nothing published.')
    published = []
    try:
        for path in paths:
            original_save(path, rendered[path])
            published.append(path)
    except BaseException:
        for path in reversed(published):
            # Never replace a concurrent operator edit during rollback.
            if path.read_bytes() != rendered[path].encode():
                raise RuntimeError('Concurrent operator edit prevents rollback; inspect private backup.')
            original_save(path, before[path].decode())
        raise


def snapshot_database(b, snapshot):
    """A failed dump must never occupy the filename used to skip a later dump."""
    if snapshot.exists():
        if not snapshot.is_file() or snapshot.stat().st_size == 0:
            raise ValueError('Existing pre-migration snapshot is invalid; inspect before continuing.')
        return
    descriptor, name = tempfile.mkstemp(prefix=snapshot.name + '.partial-', dir=snapshot.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            b.dc('exec', '-T', 'db', 'pg_dump', '-U', 'postgres', '-Fc', APP, stdout=output)
            output.flush()
            os.fsync(output.fileno())
        if temporary.stat().st_size == 0:
            raise ValueError('Pre-migration dump is empty; nothing published.')
        # Same-filesystem link publishes without overwriting a concurrent snapshot.
        os.link(temporary, snapshot)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['configure', 'database', 'start'])
    parser.add_argument('--backend', type=Path, required=True)
    parser.add_argument('--backup', type=Path, required=True, help='Completed pre-deployment backend backup')
    parser.add_argument('--public-url', default='https://api-dev.fabiel.org')
    parser.add_argument('--image', default='business-suite-api:dev')
    args = parser.parse_args()
    root = args.backend.resolve()
    backup = args.backup.resolve()
    if not (backup / 'COMPLETE').is_file():
        raise ValueError('A completed private backend backup is required.')
    sys.path.insert(0, str(root / 'scripts'))
    import backend as b
    from business_suite_config import suite_service
    if b.ROOT != root:
        raise ValueError('Wrong backend module was loaded.')
    c = b.load()
    previous = json.loads((backup / 'config.json').read_text())
    if {k: v for k, v in c.items() if k != 'apps'} != {k: v for k, v in previous.items() if k != 'apps'}:
        raise ValueError('Shared configuration differs from the reviewed backup; inspect before deploying.')
    peers = {n: a for n, a in c['apps'].items() if n != APP}
    if peers != {n: a for n, a in previous['apps'].items() if n != APP}:
        raise ValueError('Peer configuration changed since backup; take and review a new baseline.')
    b.validate_url(args.public_url, production=True, origin=True)
    subprocess.run(['docker', 'image', 'inspect', args.image], check=True, stdout=subprocess.DEVNULL)
    b.dc('exec', '-T', 'db', 'pg_isready', '-U', 'postgres')
    if args.phase == 'configure':
        if APP not in c['apps']:
            c['apps'][APP] = {
                'site_url': 'http://127.0.0.1:5178',
                'origins': ['http://127.0.0.1:5178', 'http://localhost:5178'],
                'redirect_urls': ['http://127.0.0.1:5178/auth/callback', 'http://localhost:5178/auth/callback'],
                'signup_enabled': False,
                'public_url': args.public_url.rstrip('/'),
                'auth': {'google': {'enabled': False}},
                'auth_password': secrets.token_hex(32),
                'api_password': secrets.token_hex(32),
                'runtime_password': secrets.token_hex(32),
                'jwt_secret': secrets.token_hex(32),
                'business_api': APP,
                'suite_image': args.image,
            }
        else:
            a = c['apps'][APP]
            if a.get('public_url') != args.public_url.rstrip('/') or a.get('business_api') != APP:
                raise ValueError('Existing Suite endpoint/module differs; explicit migration review required.')
            a['suite_image'] = args.image
        suite_service(APP, c['apps'][APP], {}, args.public_url.rstrip('/'))
        configure_backend(b, c, peers)
        print('Suite configuration added; peer definitions preserved; no containers changed.')
        return
    if APP not in c['apps']:
        raise ValueError('Run configure first.')
    a = c['apps'][APP]
    suite_service(APP, a, {}, b.app_public_url(c, APP))
    if a['suite_image'] != args.image:
        raise ValueError('Requested image differs from configured Suite image.')
    if args.phase == 'database':
        b.provision(c, APP)
        role = b.sql(f"SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{RUNTIME}');", capture=True)
        if '\n t\n' not in role:
            b.sql(f"CREATE ROLE {RUNTIME} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10 PASSWORD {b.literal(a['runtime_password'])};")
        unsafe = b.sql(f"SELECT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname='{RUNTIME}' AND (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit OR NOT r.rolcanlogin OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)));", capture=True)
        if '\n t\n' in unsafe:
            raise ValueError('Runtime role is privileged or has role memberships; refusing deployment.')
        b.sql(f"GRANT CONNECT ON DATABASE {APP} TO {RUNTIME}; ALTER ROLE {RUNTIME} SET statement_timeout='10s';")
        b.dc('up', '-d', '--wait', '--no-deps', APP + '-auth')
        snapshot = b.STATE / 'business-suite-before-migrations.dump'
        snapshot_database(b, snapshot)
        migration_env = b.STATE / 'business-suite-migration.env'
        url = 'postgresql://postgres:' + quote(c['postgres_password'], safe='') + '@db:5432/' + APP
        # The administrator can SET ROLE; schema objects belong to this app's owner.
        url += '?options=' + quote('-c role=' + APP + '_owner', safe='')
        b.save(migration_env, 'DATABASE_URL=' + url + '\n')
        try:
            b.run(['docker', 'run', '--rm', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
                   '--network', c.get('project_name', 'lean-backend') + '_database',
                   '--env-file', str(migration_env), args.image, 'node', 'apps/api/dist/migrate.js'])
        finally:
            migration_env.unlink(missing_ok=True)
        b.sql(f'''GRANT USAGE ON SCHEMA public TO {RUNTIME};
GRANT SELECT ON suite_schema_migrations,suite_users,businesses,memberships,membership_grants,business_modules TO {RUNTIME};
GRANT SELECT,INSERT,UPDATE ON jobs,expenses,command_receipts TO {RUNTIME};
GRANT SELECT,INSERT ON job_assignments TO {RUNTIME};
GRANT INSERT ON audit_events TO {RUNTIME};''', APP)
        print('Suite database/Auth/migrations/runtime grants ready. No business records or accounts seeded.')
        return
    # Validate the newly generated file using a fresh mount before replacing the gateway process.
    b.run(['docker', 'run', '--rm', '--network', 'none', '-v', str(b.STATE / 'Caddyfile') + ':/etc/caddy/Caddyfile:ro',
           '--entrypoint', 'caddy', b.IMAGES['caddy'], 'validate', '--config', '/etc/caddy/Caddyfile'])
    b.dc('up', '-d', '--wait', '--no-deps', APP + '-business')
    b.dc('restart', 'gateway')
    print('Suite API started; only shared gateway restarted to load the additional route.')


if __name__ == '__main__':
    main()
