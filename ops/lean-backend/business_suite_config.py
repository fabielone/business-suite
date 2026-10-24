"""Explicit Business Suite adapter for the existing lean-backend generator.

Contains no credentials. Install beside backend.py with install.py; do not copy
the operator's .local configuration into the Suite repository.
"""
import re
from urllib.parse import quote

APP = 'business_suite'


def suite_enabled(name, app):
    """Only this exact app/module pair may use the dedicated integration."""
    requested = app.get('business_api') == APP
    if (name == APP) != requested:
        raise ValueError('business_suite requires its matching explicit business_api module')
    return requested


def suite_service(name, app, common, public_url):
    if name != APP or not suite_enabled(name, app):
        raise ValueError('Unsupported Suite app')
    password = app.get('runtime_password')
    if not isinstance(password, str) or not 32 <= len(password) <= 256:
        raise ValueError('Business Suite requires a private runtime password of 32–256 characters')
    image = app.get('suite_image', 'business-suite-api:dev')
    if not isinstance(image, str) or not re.fullmatch(
        r'business-suite-api:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}', image
    ):
        raise ValueError('Suite image must be a tagged local business-suite-api image')
    if app.get('foundation') is not None:
        raise ValueError('Business Suite does not use the portfolio foundation service')
    if 'auth' not in app:
        raise ValueError('Business Suite requires explicit auth settings and exact origins')
    return {
        **common,
        'image': image,
        'user': '1000:1000',
        'environment': {
            'NODE_ENV': 'production',
            'DATABASE_URL': 'postgres://business_suite_runtime:' + quote(password, safe='') + '@db:5432/business_suite',
            'API_HOST': '0.0.0.0',
            'API_PORT': '4310',
            'API_ALLOWED_ORIGINS': ','.join(app['origins']),
            'AUTH_ISSUER': public_url + '/apps/business_suite/auth/v1',
            'AUTH_AUDIENCE': 'authenticated',
            'AUTH_JWT_SECRET': app['jwt_secret'],
        },
        'networks': ['database', 'edge'],
        'mem_limit': '256m',
        'cpus': 0.5,
        'pids_limit': 128,
        'read_only': True,
        'tmpfs': ['/tmp:rw,noexec,nosuid,size=16m'],
        'cap_drop': ['ALL'],
        'depends_on': {
            'db': {'condition': 'service_healthy'},
            'business_suite-auth': {'condition': 'service_healthy'},
        },
        'healthcheck': {
            'test': ['CMD', 'node', '-e',
                     "fetch('http://127.0.0.1:4310/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
            'interval': '30s', 'timeout': '5s', 'retries': 3, 'start_period': '10s',
        },
    }


def suite_routes():
    # Retain /v1 in the upstream path. API health remains /api/healthz.
    # Caddy owns browser CORS at this boundary; remove API duplicates.
    return [
        '    handle_path /apps/business_suite/api/* {',
        '      reverse_proxy business_suite-business:4310 {',
        '        header_down -Access-Control-Allow-Origin',
        '        header_down -Access-Control-Allow-Credentials',
        '        header_down -Access-Control-Allow-Methods',
        '        header_down -Access-Control-Allow-Headers',
        '      }',
        '    }',
    ]
