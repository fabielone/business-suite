# syntax=docker/dockerfile:1
# Override with a reviewed digest when producing a deployment release.
ARG NODE_IMAGE=node:22.23.4-bookworm-slim

FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY apps/api/package.json ./apps/api/package.json

FROM manifests AS build
# Install only the two server workspaces. Do not download mobile/desktop tooling.
RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund \
    --workspace @suite/core --workspace @suite/api --include-workspace-root=false
COPY packages/core/tsconfig.json ./packages/core/tsconfig.json
COPY packages/core/src ./packages/core/src
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/src ./apps/api/src
RUN npm run build --workspace @suite/core \
    && npm run build --workspace @suite/api \
    && rm -f apps/api/dist/demo.js apps/api/dist/demo.d.ts

FROM manifests AS production-dependencies
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    --workspace @suite/core --workspace @suite/api --include-workspace-root=false

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4310
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=manifests /app/apps/api/package.json ./apps/api/package.json
COPY --from=manifests /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY db/migrations ./db/migrations
# Files are root-owned/read-only to the process. The Node image supplies uid/gid1000.
USER 1000:1000
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "--input-type=module", "-e", "const response = await fetch('http://127.0.0.1:' + (process.env.API_PORT ?? '4310') + '/healthz', {signal: AbortSignal.timeout(3000)}); if (!response.ok) process.exit(1); const body = await response.json(); if (body.status !== 'ok' || body.demo !== false) process.exit(1);"]
# No automatic schema migrations or demo fallback. Credentials enter only at runtime.
CMD ["node", "apps/api/dist/server.js"]
