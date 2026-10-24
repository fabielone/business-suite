# Business Suite desktop — NOTE-009

This is the Windows/macOS desktop client foundation. It packages the existing React interface locally with Electron 45.0.0 and electron-builder 26.18.0. It shares the browser's IndexedDB adapter and the shared offline command engine. It is not the Android/iOS React Native client and does not replace the backend.

The default artifact opens a setup screen. A separately built, clearly named demo artifact uses fictional identities against the explicit local API. Real desktop authentication, secure account provisioning, signed updates and real business data are not supported yet.

## Build and launch

From the repository root after the coordinating dependency install:

    npm run build -w @suite/core
    npm run build -w @suite/offline
    npm run build -w @suite/web -- --mode desktop
    npm run build -w @suite/desktop
    npm run start -w @suite/desktop

For the explicit fictional demo:

    npm run build -w @suite/core
    npm run build -w @suite/offline
    npm run build -w @suite/web -- --mode desktop-demo
    npm run build:demo -w @suite/desktop
    npm run dev:demo -w @suite/api

Keep the demo API running and, in another terminal, launch:

    npm run start:demo -w @suite/desktop

The renderer is copied from apps/web/dist-desktop or dist-desktop-demo into dist/renderer. Main and preload JavaScript plus build-info.json are also in dist. No Vite server or remote renderer URL is used. The desktop window opens suite://app/ from bundled files, including when the network is unavailable.

build-info.json selects setup or demo. Development demo launch additionally requires --demo. A setup artifact stays setup even if --demo is supplied; packaged artifacts use their bundled mode metadata. The preload receives its mode from the trusted main process. Rebuilding changes the selected dist tree, so build the intended variant immediately before launching or packaging it. Do not stage a different variant while another verification run is using dist.

## Packaging without publication

After staging the intended variant:

    npm run package:mac -w @suite/desktop
    npm run package:win -w @suite/desktop

The macOS targets are DMG and ZIP using the host architecture by default (arm64 on the current development Mac). Choose a different Mac architecture explicitly when needed. The Windows script explicitly builds x64 NSIS even when invoked from an arm64 Mac; it does not silently inherit the host architecture. Artifacts go to apps/desktop/artifacts/setup or artifacts/demo. Demo and setup have different product names and application IDs. Packaging uses ASAR and includes only dist plus package metadata, not source/test trees.

The configuration disables signing/notarization for this local prototype and passes --publish never. No signing identity, certificate, publishing credential or update feed is configured. Windows installer configuration preserves app data on uninstall. Unsigned packages can trigger operating-system trust warnings. Packaging success is distinct from installation, runtime validation on each OS, signing, notarization and public distribution; record each separately in the task report.

## Renderer and API boundaries

The main window uses sandbox true, contextIsolation true, nodeIntegration false, webSecurity true and webviewTag false. Navigation, redirects, new windows, webviews, downloads, permission requests and device permissions are denied. Bundled content receives a restrictive CSP; remote scripts, frames and renderer network connections are not allowed. Asset paths are constrained to the renderer directory and supported content types.

The only exposed bridge is:

    window.suiteDesktop = {
      platform,
      mode: 'demo' | 'setup',
      request(input): Promise<{ status: number, data: unknown }>
    }

input accepts path, role (manager or worker), optional businessId, body, idempotencyKey and demoSessionId. A body selects POST; absence selects GET. It accepts no caller-selected host, method, headers, filesystem path, executable or shell command. The bridge exposes neither Electron objects nor generic IPC methods.

Main-process IPC verifies the exact current window's webContents, its main frame and the suite://app/ document URL. Same-document fragments such as #main are allowed; a query, different path, origin or frame is not. Setup mode refuses all API calls. Demo mode allows only:

| Method | Route relative to /v1 |
|---|---|
| GET | /workspace, /jobs, /expenses |
| POST | /jobs, /jobs/:UUID/close, /expenses, /expenses/:UUID/review |

Requests go only to http://127.0.0.1:4310/v1 through the window's session, configured for a direct connection rather than a system proxy. Commands require an idempotency key. The main process validates the route and identifiers, limits the complete serialized bridge input (including metadata) and JSON responses to 64 KiB, uses a ten-second deadline, omits credentials and forbids redirects. The response cap is a prototype limit; large collections need pagination before growing this slice.

Network failures return status 0 and a structured error. Invalid bridge inputs, setup mode, redirect attempts, malformed JSON and oversized responses return explicit errors; none become fictional success responses. Server permissions, record scope, version checks, audit and idempotency remain authoritative. This client bridge is not a new authorization system.

## Persistent offline data

Default profiles live beneath the platform's application-data directory in Business Suite Desktop/setup or Business Suite Desktop/demo. The corresponding Electron sessions use persist:suite-setup and persist:suite-demo. These profiles are separate from the browser's localhost IndexedDB and from the mobile SQLite files.

Within the demo session, the existing IndexedDB key includes the renderer origin, business and fictional identity. The shared engine also persists owner identity independently of its snapshot. This preserves the same queue, retry, conflict and demo-session rules documented in [the offline contract](../../docs/offline-contract.md). Expense capture and job completion save locally first. Job creation and expense review remain online-only. Saved, synchronized, approved and paid remain different states.

The desktop renderer does not register the browser service worker: the application shell is already bundled. Its business cache and queued intents remain in IndexedDB across desktop restarts. No secure local encryption or production sign-out/wipe policy is claimed.

The demo API still binds only to loopback and resets its database when restarted. X-Demo-Session-Id protects queued and direct commands against a changed fixture generation. Desktop restart preserves local entries; API restart does not preserve server data. Inspect pending entries before an explicit local-demo reset. A reset cannot undo an operation already accepted by the API.

## Source map and verification

- src/security.ts: pure build-mode, sender, route/body and asset-path checks.
- src/bridge.ts: bounded, fixed-endpoint HTTP adapter with injectable fetch for unit tests.
- src/preload.ts: the three-field isolated renderer bridge.
- src/main.ts: profile/session setup, protocol handler, window restrictions and IPC sender verification.
- scripts/stage.cjs: selects and copies the built renderer; writes bundled mode metadata.
- electron-builder.cjs: separate product identities, local packaging targets and no publication.
- test/: delegated pure bridge/security tests; tests/desktop at repository root covers Electron runtime flows.

Run npm run typecheck -w @suite/desktop and npm test -w @suite/desktop for local checks. Runtime tests must launch the matching staged build. A development-only SUITE_DESKTOP_TEST_PROFILE absolute path isolates test data; packaged apps ignore that environment variable. There is no product API-offline bypass or arbitrary API URL override. Test outages belong to the isolated test server or test-controlled Electron networking.

Initial implementation type checking and eight pure security/bridge tests pass. Actual package and runtime results belong in the current NOTE-009 report and repository verification record; do not infer Windows runtime success from a package produced on macOS. Before release, complete authenticated desktop access, account lifecycle, local-data security, update/migration recovery, signing/notarization, platform installation tests and accessibility checks.

The isolation choices follow Electron's [security guidance](https://www.electronjs.org/docs/latest/tutorial/security). Custom schemes are registered on the same persistent session used by the window, as required by the [protocol documentation](https://www.electronjs.org/docs/latest/api/protocol). Persistent partition semantics are described in the [session reference](https://www.electronjs.org/docs/latest/api/session). These references explain the mechanisms; they do not certify this application's release readiness.

## Local artifact results — 2026-10-24

On macOS27.0.1 arm64, the explicit demo produced macOS arm64 DMG/ZIP and a Windows x64 ZIP in `artifacts/demo`. The macOS packaged `.app` launched with `app.isPackaged` true without a Vite/API server and correctly showed the connect-once state. Its unpackaged runtime passed three flows including durable restart/reconnect and renderer isolation. ZIP CRC checks and DMG checksum verification passed. These are fictional-demo artifacts, unsigned and not notarized.

The NSIS cross-build reached the Windows app but failed launching the downloaded x86_64 macOS `makensis` tool with spawn error -86 on this ARM host. No NSIS installer was produced; no system translation/runtime was installed. The standalone Windows ZIP contains `Business Suite Demo.exe` plus its required files: extract the whole ZIP, not just the executable. Windows launch/install/uninstall has not been tested. The manual `.github/workflows/desktop.yml` defines native Windows packaging/testing but has not run.

From the root, `npm run package:desktop:win:zip:demo` rebuilds the fictional-demo ZIP; omit the final `:demo` for the setup-only variant. See [verification](../../docs/verification.md) for exact limits, dependency findings and checks. The missing product icon is still Electron's default; final branding/license and supported OS matrix remain open.
