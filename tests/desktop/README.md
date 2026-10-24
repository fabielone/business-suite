# Desktop runtime verification

Run from the repository root after root-owned installation and desktop staging:

```sh
npm run build:desktop:renderer
npm run build:desktop:demo
npx playwright test --config tests/desktop/playwright.config.ts
npm run test --workspace @suite/desktop
```

The runtime suite needs both renderer outputs (`apps/web/dist-desktop` and `apps/web/dist-desktop-demo`), compiled shell files in `apps/desktop/dist`, and an installed Electron binary. If the root build script changes, build both renderer modes and compile the shell before running. Tests copy the four compiled shell modules and the matching renderer into isolated temporary application fixtures; they never build or restage the shared desktop directory themselves.

The suite launches the actual Electron executable with Chromium sandboxing enabled. Each case uses its own temporary user-data directory; cleanup removes only directories created by this test run. The setup fixture uses the actual setup renderer and `setup` metadata. It deliberately supplies `--demo` to verify that a launch flag cannot enable demo access in a setup artifact. The fictional role picker uses session storage, so the restart test selects Worker again and verifies that its durable queue retained the original command IDs.

`server.ts` is a test-only entry point using the real `buildApp`, PGlite database, migrations and fictional seed. Its loopback-only `/__test/network` endpoint makes business routes return503, preserving the running database and demo epoch. This control route is absent from the production/demo API entry points and is never bundled with the desktop application. It provides a deterministic outage across Electron restarts without adding a test bypass to application code. The suite refuses an existing server on4310.

Coverage includes renderer sandbox/context isolation and absent Node globals, the narrow preload surface, malformed IPC requests failing before upstream access, renderer network CSP, blocked navigation/new windows, setup-mode refusal, worker price visibility, separate account queues, durable expense/completion intents after a full app restart, stable command IDs, unchanged server epoch, and one confirmed expense/completion after reconnect and repeated sync. Screenshots are written under `test-results/desktop`.

These are local runtime tests of an unpackaged Electron shell and shared renderer. They do not prove signed installer behavior, notarization, Windows execution when run on macOS, full OS-crash durability, secure production authentication, local encryption, update recovery, or real PostgreSQL concurrency. Record the actual host OS and test results separately; cross-building a Windows installer is not a Windows runtime pass.
