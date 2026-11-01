import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/** Cache build assets only. Business responses are never stored in the service-worker cache. */
export function offlineShell(): Plugin {
  let directory = '';
  let base = '/';
  return {
    name: 'suite-offline-shell',
    apply: 'build',
    configResolved(config) {
      directory = config.build.outDir;
      base = config.base;
    },
    closeBundle() {
      const manifestPath = join(directory, 'manifest.webmanifest');
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        manifest.start_url = base;
        manifest.scope = base;
        manifest.icons = manifest.icons?.map((icon: { src: string }) => ({
          ...icon,
          src: base + icon.src.replace(/^\//, ''),
        }));
        writeFileSync(manifestPath, JSON.stringify(manifest));
      }
      const files = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
        );
      const paths = files(directory).filter(
        (path) => !path.endsWith('.map') && !path.endsWith('/sw.js'),
      );
      const hash = createHash('sha256');
      for (const path of paths) hash.update(readFileSync(path));
      const urls = paths.map((path) => base + path.slice(directory.length + 1));
      const prefix =
        'suite-shell-' + createHash('sha256').update(base).digest('hex').slice(0, 8) + '-';
      const name = prefix + hash.digest('hex').slice(0, 16);
      writeFileSync(
        join(directory, 'sw.js'),
        `
const CACHE = ${JSON.stringify(name)};
const ASSETS = ${JSON.stringify(urls)};
const BASE = ${JSON.stringify(base)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(${JSON.stringify(prefix)}) && key !== CACHE).map(key => caches.delete(key)))),
  self.clients.claim()
])));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE) || url.pathname.startsWith('/api/') || url.pathname.startsWith('/sharedapi/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match(BASE + 'index.html'))));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  }
});
`,
      );
    },
  };
}
