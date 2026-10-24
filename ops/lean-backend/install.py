#!/usr/bin/env python3
"""Review/apply the bounded Suite adapter to the known shared backend generator.

Dry-run is the default. Never reads private backend config or starts containers.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import tempfile

BASE_SHA256 = '136e8d675c64d768d263127699e0b498d7d78918b9d3c80860e2e3ab50296f2b'
MARKER = '# Business Suite adapter v1 (repo-owned ops/lean-backend).'
HERE = Path(__file__).resolve().parent


def digest(value):
    return hashlib.sha256(value).hexdigest()


def replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError('Generator anchor changed; review the operator source before adapting this installer')
    return source.replace(old, new, 1)


def patched_source(original):
    if digest(original.encode()) != BASE_SHA256:
        raise ValueError('Unrecognized backend.py revision; refusing to patch or overwrite operator changes')
    source = replace_once(
        original,
        'from foundation_config import foundation\n',
        'from foundation_config import foundation\n' + MARKER + '\n' +
        'from business_suite_config import suite_enabled, suite_service, suite_routes\n',
    )
    source = replace_once(source, '        validate_name(n)\n        development_auth = ',
                          '        validate_name(n)\n        suite = suite_enabled(n, a)\n        development_auth = ')
    start = source.index("        services[n + '-rest'] = ")
    end = source.index("        business = a.get('business_api')", start)
    rest = source[start:end]
    source = source[:start] + '        if not suite:\n' + ''.join('    ' + line for line in rest.splitlines(keepends=True)) + source[end:]
    source = replace_once(
        source,
        "        if business:\n            if business not in ('agency', 'salad') or business != n:",
        "        if suite:\n            services[n + '-business'] = suite_service(n, a, common, app_url)\n        elif business:\n            if business not in ('agency', 'salad') or business != n:",
    )
    source = replace_once(
        source,
        "        if n == 'salad':\n            cors_headers += ', idempotency-key, accept-profile, content-profile, x-retry-count'",
        "        if suite:\n            cors_headers += ', x-business-id, idempotency-key'\n        if n == 'salad':\n            cors_headers += ', idempotency-key, accept-profile, content-profile, x-retry-count'",
    )
    source = replace_once(
        source,
        "        if business:\n            business_prefix = '/kitchen' if business == 'salad' else '/api/v1'",
        "        if suite:\n            caddy += suite_routes()\n        elif business:\n            business_prefix = '/kitchen' if business == 'salad' else '/api/v1'",
    )
    source = replace_once(
        source,
        "        for kind, port in [('auth', 9999), ('rest', 3000)]:",
        "        for kind, port in ([('auth', 9999)] if suite else [('auth', 9999), ('rest', 3000)]):",
    )
    source = replace_once(
        source,
        "    targets = [n + '-rest']\n    dc('up', '-d', '--wait', '--no-deps', *targets)",
        "    if not suite_enabled(n, c['apps'][n]):\n        dc('up', '-d', '--wait', '--no-deps', n + '-rest')",
    )
    compile(source, 'backend.py', 'exec')
    return source


def atomic_write(path, data, mode):
    descriptor, temporary = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def install(backend_root, apply=False):
    root = Path(backend_root).resolve()
    target = root / 'scripts/backend.py'
    helper = root / 'scripts/business_suite_config.py'
    helper_data = (HERE / 'business_suite_config.py').read_bytes()
    original = target.read_bytes()
    manifest = root / 'scripts/business_suite_adapter.json'
    if MARKER.encode() in original:
        if not manifest.is_file():
            raise ValueError('Adapter marker exists without its manifest; inspect manually')
        installed = json.loads(manifest.read_text())
        if (installed.get('base_sha256') != BASE_SHA256 or
                installed.get('installed_sha256') != digest(original) or
                installed.get('helper_sha256') != digest(helper_data) or
                not helper.is_file() or helper.read_bytes() != helper_data):
            raise ValueError('Installed adapter/source changed; refusing automatic overwrite')
        return {'status': 'already-installed', 'backend': str(target), 'sha256': digest(original)}
    if helper.exists() or manifest.exists():
        raise ValueError('Suite helper/manifest already exists without the expected patch; inspect manually')
    patched = patched_source(original.decode()).encode()
    result = {'status': 'ready-to-apply', 'backend': str(target), 'base_sha256': digest(original),
              'installed_sha256': digest(patched), 'helper_sha256': digest(helper_data)}
    if not apply:
        return result
    backup = root / '.local/operator-backups' / (
        'suite-generator-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3)
    )
    backup.mkdir(parents=True, mode=0o700)
    shutil.copy2(target, backup / 'backend.py')
    os.chmod(backup / 'backend.py', 0o600)
    # Recheck after planning/backup so concurrent operator edits are not lost.
    if target.read_bytes() != original or helper.exists() or manifest.exists():
        raise ValueError('Operator source changed during installation; nothing overwritten')
    atomic_write(helper, helper_data, 0o644)
    atomic_write(target, patched, target.stat().st_mode & 0o777)
    metadata = {key: value for key, value in result.items() if key.endswith('sha256')}
    metadata['backup'] = str(backup)
    atomic_write(manifest, (json.dumps(metadata, indent=2) + '\n').encode(), 0o644)
    return {**result, 'status': 'installed', 'backup': str(backup)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend', type=Path, required=True, help='Existing backend root; contains scripts/backend.py')
    parser.add_argument('--apply', action='store_true', help='Apply after review; default only validates and reports hashes')
    args = parser.parse_args()
    print(json.dumps(install(args.backend, args.apply), indent=2))


if __name__ == '__main__':
    main()
