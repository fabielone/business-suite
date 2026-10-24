# Contributing to Business Suite

Business Suite is currently maintained by
[Fabiel (@fabielone)](https://github.com/fabielone). Forks, bug reports,
documentation improvements and pull requests are welcome. The project is an
early offline-first foundation; production readiness and the complete business
workflows remain on the roadmap.

## Start small

Read the [README](README.md), [portable requirements](docs/requirements/README.md)
and [implemented source map](docs/source-map.md). The portable requirements are
available to everyone; access to the maintainer's local notes or Docker server
is not required to contribute. Propose changes to the portable notes in your
pull request; the maintainer reconciles accepted changes into the canonical
requirements before the next export.

For a substantial feature or architectural change, open an issue describing the
problem and proposed behavior first. Small, focused fixes can go straight to a
pull request. Keep unrelated cleanup separate and preserve the documented
business, money, authorization and offline invariants.

## Develop and verify

Use the supported Node version in `.nvmrc`, then follow the local-demo steps in
the README. Use invented fixtures only. Do not connect to the maintainer's
development endpoint, change a shared Docker host or copy operator configuration
as part of a normal contribution.

Before submitting code, run the checks appropriate to your change. The usual
starting point is:

```sh
npm ci
npm run check
npm test
```

Use the documented browser, offline, native or PostgreSQL checks when your
change affects those behaviors. State which checks you actually ran and which
platforms you could not test. Documentation-only changes need link/content and
format checks, not unrelated application test runs.

In a pull request, explain the problem, resulting behavior, verification and any
remaining limitation. Include relevant screenshots for UI changes, using only
fictional data. Never include credentials, private keys, receipts, real customer
or worker records, session exports, database dumps or private infrastructure
configuration in issues, commits, screenshots or logs.

## Licensing and attribution

By intentionally submitting a contribution for inclusion, you offer your
contribution under `AGPL-3.0-only`, the same license as the project. Submit only
material you have the right to contribute under those terms. You retain your
copyright; no copyright assignment or separate CLA is currently required.
Identify any third-party code or assets, their source and their license, and
preserve their notices. Do not add incompatible or unidentified material.

AI-assisted changes are welcome when you have the right to submit them, review
them yourself and verify their behavior. Do not treat generated text as evidence
of test success, ownership or license compatibility.

See [LICENSING.md](LICENSING.md) for the project's attribution, dependency and
future-licensing boundaries. Forks do not need to contribute their changes back;
the source-sharing obligations are those in [LICENSE](LICENSE).

## Review and maintenance

Fabiel decides what is merged and which versions are official releases.
Contributions do not automatically grant write access, maintainer status or a
guaranteed review timeline. `.github/CODEOWNERS` identifies the maintainer for
review routing; it does not by itself enforce branch protection or grant access.
Additional maintainers will be appointed explicitly if the project grows.
