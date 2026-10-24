# Native preview

Expo / React Native client for the same `@suite/offline` engine used by the web app. This is a fictional, simulator-only development preview. Real mode shows setup requirements; it does not connect or pretend to sign in.

## Local use

Install dependencies from the repository root with the workspace lockfile. Expo 58 supports Node 22.13+, 24.3+, 26+, or 27+; this preview was bundled with Node 22. The host's Node 25 is outside Expo's supported range.

Build the shared packages and start the local API from the repository root:

```sh
npm run build --workspace @suite/core
npm run build --workspace @suite/offline
npm run demo
```

In another terminal, use a compatible Node runtime:

```sh
npm run ios:demo --workspace @suite/mobile
# or, with an Android emulator already running:
adb reverse tcp:4310 tcp:4310
adb reverse tcp:8081 tcp:8081
npm run android:demo --workspace @suite/mobile
```

The CLI requires a compatible Expo Go installation or development client on the simulator. Android uses `adb reverse` to reach the computer's loopback API. The source fixes API access to `http://127.0.0.1:4310/v1`; do not replace it with a LAN address or weaken the server's Host checks. `expo-device` blocks physical devices in demo mode. The CLI starts Metro with `--localhost`.

`npm run start --workspace @suite/mobile` runs the setup-only mode. `EXPO_PUBLIC_SUITE_MODE=demo` is an explicit build-time development choice, not a secret or authentication credential. No real sign-in, production API configuration, receipt upload, expense review, reimbursement, payment, push/background sync or app-store distribution is included.

## Local data and synchronization

- Work, Money and Sync tabs share one app. Manager/Worker switches are visibly fictional and are not an authentication mechanism.
- An SQLite file is scoped to the fixed API, business and user. The shared engine stores ownership and the demo server session. Changing demo sessions with outstanding entries locks replay; an explicit, warned reset is required to remove old local entries.
- SQLite uses WAL and full synchronous writes. Each change reads and writes within an exclusive transaction; the save promise resolves after commit. A serialized connection protects overlapping operations in this JS process.
- Confirmed snapshots and pending requests are separate. Closing a job locally does not change its confirmed status. Saving an expense does not approve, reimburse or pay it. Pending amounts are never added to confirmed totals.
- The same persisted request key is reused after timeout or lost response. The shared engine rechecks account scope, permissions and demo session before replay. Conflicts/rejections stay visible; they are not silently rewritten or retried as new requests.
- Sync runs after a local save, on app open/foreground/reconnection, manually, and every 30 seconds while there are queued entries and the app is active. It does not promise background delivery when the OS suspends or terminates the app.
- The first online connection is required to prepare the cached workspace. Offline operation uses that cached scope; server authorization is checked again before any write. Access errors clear confirmed records and lock the queue instead of being treated as network loss.
- SQLite is not encrypted here. Only fictional data belongs in this preview. Production offline access, device security, authentication and retention remain future design work.

## Checks and limitations

```sh
npm run typecheck --workspace @suite/mobile
npm run test --workspace @suite/mobile
npm run export:demo --workspace @suite/mobile
npm run export --workspace @suite/mobile
```

The two exports build Android and iOS Hermes bundles. Export success is not an Xcode/Gradle native build, signed package, simulator interaction test, physical-device test, or proof of SQLite behavior on a device. Simulator runtimes are available on the development computer, but no Expo Go/development client was installed during this task. Native visual, accessibility and lifecycle testing remains to be run.

Typecheck, the two money-input tests, and both Android/iOS exports passed. The initial Expo compatibility check recommended TypeScript6.0.3 instead of5.9.3. The repository was then aligned to `~6.0.3`; the follow-up `expo install --check` passed with dependencies up to date. Runtime dependency versions match Expo58 recommendations.

Suggested native runtime checks: prepare the Worker account online; interrupt API access while preserving its process; save an expense and job completion; terminate/reopen the app and inspect the same queue; reconnect and confirm each request once; switch roles and verify separation; confirm an old-version conflict stays in Sync; restart the demo API and confirm old-session writes are blocked. The API may need a temporary loopback proxy for a connection-loss test that preserves its ephemeral session.

Automation selectors use `testID`: `role-worker`, `role-manager`, `tab-work`, `tab-money`, `tab-sync`, `prepare-device`, `close-job-<id>`, `expense-description`, `expense-amount`, `expense-reason`, `save-expense`, `sync-now`, `discard-<id>`, and `reset-local-demo`. Controls also have accessible text/labels. No simulator or device interaction checks are claimed by these selectors.

Versions follow `bundledNativeModules.json` in the [Expo 58.0.19 registry archive](https://registry.npmjs.org/expo/-/expo-58.0.19.tgz). Storage uses [Expo SQLite's exclusive transactions](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/#withexclusivetransactionasynctask); physical-device gating uses [`Device.isDevice`](https://docs.expo.dev/versions/v58.0.0/sdk/device/#deviceisdevice).
