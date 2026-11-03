#!/usr/bin/env python3
"""Independent Business Suite Docker profile using fabielone/backend's generator.

Only .local/suite and its path-specific Docker project are used. Never connects
to a remote Docker host, copies server credentials, or starts a permanent tunnel.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
from urllib.parse import quote
import uuid
import webbrowser

APP = 'business_suite'
IMAGE = 'business-suite-api:local-operations-20261030'
WEB = '/apps/business_suite/api/app/'
TABLES = ['suite_contacts', 'suite_deals', 'suite_projects', 'suite_expense_entries', 'suite_payments', 'suite_tasks', 'suite_referrals', 'suite_message_templates', 'suite_message_drafts', 'suite_automations', 'suite_automation_runs', 'suite_notifications', 'suite_companies']


def profile(root, port, lan_ip, tls_port):
    address = ipaddress.ip_address(lan_ip) if lan_ip else None
    if address and (address.version != 4 or not address.is_private or address.is_loopback):
        raise ValueError('Use this Mac’s private IPv4 LAN address.')
    for value in (port, tls_port):
        if not 1024 <= value <= 65535:
            raise ValueError('Ports must be between 1024 and 65535.')
    origin = f'http://localhost:{port}'
    origins = [origin, f'http://127.0.0.1:{port}']
    if address:
        origins.append(f'https://{address}:{tls_port}')
    return {
        'suite_local_profile': 1, 'mode': 'local',
        'project_name': 'suite-local-' + hashlib.sha256(str(root).encode()).hexdigest()[:12],
        'gateway_port': port, 'public_url': origin, 'lan_ip': str(address) if address else None,
        'tls_port': tls_port, 'postgres_password': secrets.token_hex(32), 'smtp': {},
        'apps': {APP: {
            'site_url': origin + WEB, 'origins': origins,
            'redirect_urls': [url + WEB for url in origins], 'signup_enabled': False,
            'development_auth': True, 'auth': {'google': {'enabled': False}, 'email_confirmation': False},
            'auth_password': secrets.token_hex(32), 'api_password': secrets.token_hex(32),
            'runtime_password': secrets.token_hex(32), 'jwt_secret': secrets.token_hex(32),
            'business_api': APP, 'suite_image': IMAGE,
        }},
    }


def validate(config, root):
    expected = 'suite-local-' + hashlib.sha256(str(root).encode()).hexdigest()[:12]
    if config.get('suite_local_profile') != 1 or config.get('mode') != 'local' or config.get('project_name') != expected or set(config.get('apps', {})) != {APP}:
        raise ValueError('State is not this checkout’s isolated Suite profile; nothing changed.')
    return config


def render(b, config):
    b.render(config)
    spec = json.loads(b.COMPOSE.read_text())
    env = spec['services'][APP + '-business']['environment']
    env.update(SUITE_AUTH_INTERNAL_URL='http://business_suite-auth:9999', SUITE_SECURE_COOKIES='false')
    env['SUITE_APP_URL'] = (f"https://{config['lan_ip']}:{config['tls_port']}" if config.get('lan_ip') else config['public_url']) + WEB
    caddy = (b.STATE / 'Caddyfile').read_text()
    # This generated instance has only Suite. Receipts/backup routes enforce their own tighter limits.
    caddy = caddy.replace('max_size 2MB', 'max_size 32MB')
    if config.get('lan_ip'):
        caddy = caddy.replace('  admin off', '  admin off\n  default_sni ' + config['lan_ip'])
        origin = f"https://{config['lan_ip']}:{config['tls_port']}"
        body = caddy.split(':8080 {', 1)[1].rsplit('}', 1)[0]
        caddy += '\n' + origin + ' {\n  tls internal\n' + body + '}\n'
        spec['services']['gateway']['ports'].append(f"{config['lan_ip']}:{config['tls_port']}:{config['tls_port']}")
    b.save(b.COMPOSE, json.dumps(spec, indent=2) + '\n')
    b.save(b.STATE / 'Caddyfile', caddy)
    b.dc('config', '--quiet')


def backup(b, config):
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    folder = b.STATE / 'backups' / stamp
    folder.mkdir(parents=True, mode=0o700)
    b.save(folder / 'config.json', json.dumps(config, indent=2))
    for name, command in [('database.dump', ['pg_dump', '-U', 'postgres', '-Fc', APP]), ('roles.sql', ['pg_dumpall', '-U', 'postgres', '--roles-only'])]:
        with os.fdopen(os.open(folder / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as handle:
            b.dc('exec', '-T', 'db', *command, stdout=handle)
    b.save(folder / 'COMPLETE', stamp + '\n')
    print('Private backup completed:', folder)
    return folder


def provision(b, config):
    b.dc('up', '-d', '--wait', 'db')
    exists = b.sql("SELECT 1 FROM pg_database WHERE datname='business_suite'", capture=True)
    if '(0 rows)' not in exists:
        backup(b, config)
    b.sql('REVOKE CONNECT ON DATABASE postgres,template1 FROM PUBLIC;')
    b.provision(config, APP)
    password = config['apps'][APP]['runtime_password']
    b.sql("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='business_suite_runtime') THEN CREATE ROLE business_suite_runtime LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10 PASSWORD " + b.literal(password) + "; END IF; END $$;")
    unsafe = b.sql("SELECT EXISTS(SELECT FROM pg_roles r WHERE r.rolname='business_suite_runtime' AND (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit OR EXISTS(SELECT FROM pg_auth_members m WHERE m.member=r.oid)));", capture=True)
    if '\n t\n' in unsafe:
        raise ValueError('Runtime role is privileged; deployment refused.')
    b.sql("GRANT CONNECT ON DATABASE business_suite TO business_suite_runtime; ALTER ROLE business_suite_runtime SET statement_timeout='10s';")
    b.dc('up', '-d', '--wait', '--no-deps', APP + '-auth')
    path = b.STATE / 'migration.env'
    url = 'postgresql://postgres:' + quote(config['postgres_password'], safe='') + '@db:5432/business_suite?options=' + quote('-c role=business_suite_owner', safe='')
    b.save(path, 'DATABASE_URL=' + url + '\n')
    try:
        b.run(['docker', 'run', '--rm', '--read-only', '--tmpfs', '/tmp', '--network', config['project_name'] + '_database', '--env-file', str(path), config['apps'][APP]['suite_image'], 'node', 'apps/api/dist/migrate.js'])
    finally:
        path.unlink(missing_ok=True)
    b.sql('''GRANT USAGE ON SCHEMA public TO business_suite_runtime;
GRANT SELECT ON suite_schema_migrations,suite_users,businesses,memberships,membership_grants,business_modules TO business_suite_runtime;
GRANT SELECT,INSERT,UPDATE ON jobs,expenses,command_receipts TO business_suite_runtime;
GRANT SELECT,INSERT ON job_assignments TO business_suite_runtime;
GRANT INSERT ON audit_events TO business_suite_runtime;
GRANT SELECT,INSERT,UPDATE ON suite_spaces,suite_space_members,suite_invitations TO business_suite_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON suite_sessions TO business_suite_runtime;
GRANT SELECT,INSERT ON suite_space_commands,suite_space_audit TO business_suite_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON suite_automation_schedule TO business_suite_runtime;
GRANT SELECT,INSERT,UPDATE ON suite_intake_keys TO business_suite_runtime;
GRANT SELECT,INSERT,UPDATE ON ''' + ','.join(TABLES) + ' TO business_suite_runtime;', APP)
    b.dc('up', '-d', '--wait', '--no-deps', APP + '-business', 'gateway')
    b.dc('restart', 'gateway')
    print('Local Suite ready:', config['public_url'] + WEB)
    if config.get('lan_ip'):
        print('Wi-Fi address (trust the local certificate first):', f"https://{config['lan_ip']}:{config['tls_port']}" + WEB)


def owner(b, config, email):
    if not email or len(email) > 254 or '@' not in email or any(c.isspace() for c in email):
        raise ValueError('Provide the owner email; no password is needed here.')
    email = email.lower()
    account = b.sql('SELECT 1 FROM auth.users WHERE lower(email)=' + b.literal(email), APP, capture=True)
    if '(0 rows)' not in account:
        print('This owner email already has an account. Sign in; no password or data was changed.')
        return
    path = b.STATE / 'owner-activation.json'
    if path.exists():
        saved = json.loads(path.read_text())
        if saved['email'] != email:
            raise ValueError('An activation for a different email already exists; nothing changed.')
        valid = b.sql('SELECT 1 FROM suite_invitations WHERE id=' + b.literal(saved['id']) + ' AND accepted_by IS NULL AND expires_at>now()', APP, capture=True)
        if '(0 rows)' not in valid:
            print('Existing private activation preserved:', path)
            return
    token, invitation = secrets.token_urlsafe(32), str(uuid.uuid4())
    digest = hashlib.sha256(token.encode()).hexdigest()
    b.sql("INSERT INTO suite_invitations(id,token_hash,email,role,expires_at) VALUES(" + ','.join(map(b.literal, [invitation, digest, email, 'owner'])) + ",now()+interval '7 days');", APP)
    b.save(path, json.dumps({'id': invitation, 'email': email, 'url': config['public_url'] + WEB + '#activate=' + token}, indent=2))
    print('Owner invitation prepared in private local state. No email sent:', path)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['init', 'up', 'status', 'stop', 'backup', 'owner', 'activate', 'certificate'])
    p.add_argument('--backend', type=Path, required=True)
    p.add_argument('--port', type=int, default=8002)
    p.add_argument('--lan-ip')
    p.add_argument('--tls-port', type=int, default=8443)
    p.add_argument('--email')
    p.add_argument('--certificate-output', type=Path)
    args = p.parse_args()
    root = args.backend.resolve()
    sys.path.insert(0, str(root / 'scripts'))
    import backend as b
    from dev import local_docker_environment
    if b.ROOT != root:
        raise ValueError('Wrong backend generator loaded.')
    env = local_docker_environment(os.environ.copy())
    os.environ.clear()
    os.environ.update(env)
    os.environ.pop('COMPOSE_FILE', None)
    os.environ.pop('COMPOSE_PROJECT_NAME', None)
    state = root / '.local' / 'suite'
    if state.is_symlink() or state.parent.is_symlink():
        raise ValueError('Local state must not be a symlink.')
    b.STATE, b.CONFIG, b.COMPOSE = state, state / 'config.json', state / 'compose.json'
    if args.command == 'init':
        if b.CONFIG.exists():
            config = validate(b.load(), root)
            print('Existing Suite profile preserved:', config['public_url'])
            return
        if state.exists() and any(state.iterdir()):
            raise ValueError('Unidentified Suite state exists; inspect before initializing.')
        config = profile(root, args.port, args.lan_ip, args.tls_port)
        volume = config['project_name'] + '_db_data'
        exists = subprocess.run(['docker', 'volume', 'inspect', volume], capture_output=True).returncode == 0
        if exists:
            raise ValueError('An existing database volume has no matching config. Restore its private state; do not reset it.')
        state.mkdir(parents=True, mode=0o700)
        b.save(b.CONFIG, json.dumps(config, indent=2) + '\n')
        render(b, config)
        print('Fresh Suite profile initialized; secrets retained only in', state)
        return
    config = validate(b.load(), root)
    if args.command == 'up':
        render(b, config)
        provision(b, config)
    elif args.command == 'status':
        b.dc('ps')
    elif args.command == 'stop':
        b.dc('stop')
    elif args.command == 'backup':
        backup(b, config)
    elif args.command == 'owner':
        owner(b, config, args.email)
    elif args.command == 'activate':
        path = state / 'owner-activation.json'
        webbrowser.open(json.loads(path.read_text())['url'])
        print('Opened the private owner activation. Choose your password in the browser.')
    elif args.command == 'certificate':
        if not args.certificate_output:
            raise ValueError('--certificate-output is required.')
        result = b.dc('exec', '-T', 'gateway', 'cat', '/data/caddy/pki/authorities/local/root.crt', capture_output=True)
        args.certificate_output.parent.mkdir(parents=True, exist_ok=True)
        args.certificate_output.write_bytes(result.stdout)
        print('Public local CA certificate exported:', args.certificate_output)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print('Local Suite setup failed:', error, file=sys.stderr)
        sys.exit(1)
