import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import type { FastifyInstance } from 'fastify';

/** Only the built public app directory can be served. No data/API response enters its cache. */
export function registerStaticApp(app: FastifyInstance, directory: string) {
  const root = resolve(directory);
  app.get('/app', async (_request, reply) => reply.redirect('app/'));
  app.get<{ Params: { '*': string } }>('/app/*', async (request, reply) => {
    const name = request.params['*'] || 'index.html';
    if (
      name.includes('\0') ||
      name.includes('\\') ||
      name.split('/').some((part) => part.startsWith('.'))
    )
      return reply.code(404).send();
    try {
      const file = await realpath(resolve(root, name));
      if (!file.startsWith(root + sep)) return reply.code(404).send();
      const content = await readFile(file);
      const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
        '.webmanifest': 'application/manifest+json',
      };
      if (!types[extname(file)]) return reply.code(404).send();
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      );
      reply.header(
        'Cache-Control',
        name.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
      return reply.type(types[extname(file)]!).send(content);
    } catch {
      return reply.code(404).send();
    }
  });
}
