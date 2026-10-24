---
tags: [business-suite, licensing, open-source, contributions]
updated: 2026-10-24
---
# Business Suite open source and contributions

← [business-suite hub](<business-suite hub.md>) · [business-suite requirements](<business-suite requirements.md>) · [business-suite open decisions](<business-suite open decisions.md>) · [business-suite sources and agent handoff](<business-suite sources and agent handoff.md>)

## Decision and publication status
**BS-DEC-002 — selected policy, 2026-10-24.** The human explicitly requests that [fabielone/business-suite](https://github.com/fabielone/business-suite) become public, with an appropriate open-source license, credit, forks and pull requests, while retaining control over the official project. The human identifies this as their personally owned project, maintained solo for now and open to contributors. NOTE-011 License and publicly release Business Suite (Obsidian reference) records authorization, repository review and release evidence.

**AGPL-3.0-only** is the selected license for original project work. It is GNU Affero General Public License version 3 only, without an automatic option to adopt later versions. The original-work copyright notice is **Copyright (C) 2026 Fabiel (@fabielone)**. It does not claim ownership of third-party components or future contributors' independent work.

**Publication checkpoint:** license installation, source review, commit/push and verification of public GitHub visibility/license recognition are in progress under NOTE-011. The initial private upload recorded by NOTE-010 remains historical. A public source repository is distinct from a supported binary release or a production-ready service; current application and deployment limitations remain in [business-suite roadmap](<business-suite roadmap.md>).

## Why this policy fits
This is a networked business application with installable clients. Strong copyleft supports the human's preference that others can improve and fork the software while preserving access to corresponding source when the license requires it. AGPL adds a source-offer requirement for users interacting remotely with a modified version over a network. Commercial use and independent forks remain allowed; a license that forbids those generally would not provide the same open-source freedoms.

The standard license text in repository `LICENSE` is authoritative. Repository `LICENSING.md` explains scope and practical boundaries; `CONTRIBUTING.md` explains incoming contributions. These notes summarize the selected policy and do not replace the license text.

| Question | Policy |
|---|---|
| Who controls the official repository? | Fabiel (@fabielone) is the current sole maintainer and decides official merges, releases and project direction. `.github/CODEOWNERS` records review ownership; it is not itself proof that GitHub branch protection is enabled. |
| Can someone fork, modify or host the project? | Yes, including commercial use, subject to the applicable AGPL requirements and preserved third-party terms. A compliant independent fork does not need the official maintainer's permission for each change. |
| Must everyone send changes upstream? | No. Required source availability under the license is different from a mandatory pull request to this repository. |
| How is credit retained? | Preserve applicable copyright and license notices and comply with the license's notice requirements. Do not add an invented mandatory promotional badge or promise that credit must appear in every screen. |
| Can a fork imply official endorsement? | No permission to misrepresent a fork as an official release or to imply Fabiel's endorsement is granted. Final branding remains a separate open decision; this policy does not assert a registered trademark. |
| Who owns incoming contributions? | Contributors retain their copyright; original incoming contributions are accepted under AGPL-3.0-only. No copyright-assignment CLA is established by this policy. |
| Can Fabiel offer another license later? | Fabiel can separately license work they own. Relicensing work owned by others requires the necessary rights or permission; accepting a pull request does not transfer those rights automatically. |

## Source and distribution obligations
Keep the standard AGPL text and applicable notices with covered source and distributions. When conveying covered binaries, meet the license's corresponding-source and other applicable requirements. When operating a modified covered version that users interact with remotely, meet AGPL section 13's prominent offer of corresponding source to those users. Do not summarize this as an unconditional duty to publish every private change or as a requirement to submit every modification upstream.

Third-party dependencies, vendored files, assets and notices keep their existing terms. Before adding or copying code, record its origin and license and assess compatibility with the way it will be combined and distributed. A package manifest declaring AGPL for original project code does not relicense all of its dependencies.

Before future mobile-store or desktop binary releases, review combined dependency licenses, corresponding-source delivery, bundled notices, installation-information obligations where applicable, and the distribution channel's terms. Source publication does not resolve App Store or other store compatibility, authorize signing credentials, or certify that current local demo packages are ready for public distribution.

## Contributions and review
Useful contributions include implementation, bug fixes, tests, documentation and reproducible issue reports. Read the repository's `CONTRIBUTING.md` and `AGENTS.md`, the feature contract, and current evidence before changing behavior. Keep changes within their stated scope and explain checks and remaining limits. The maintainer may request changes or decline a pull request; public access does not grant collaborator or release privileges.

Contributors must have the right to submit their work and must preserve required third-party notices. Do not submit employer/client code without permission, secrets, actual customer or worker records, production receipt images, or copied data from other applications. Demo and test fixtures remain fictional. The operator backend workspace, credentials, backups and verification identities remain outside the public repository.

No contributor assignment, additional maintainer, hosted-service terms, production privacy policy or automatic publication of operational data is created by this source-release decision. A public repository is not authorization to change shared infrastructure or migrate existing businesses.

## Primary references
- [GNU AGPL version 3 text](https://www.gnu.org/licenses/agpl-3.0.html): the legal text, including corresponding-source and remote-interaction provisions.
- [OSI's GNU AGPL version 3 license entry](https://opensource.org/license/agpl-v3): approved open-source license reference.
- [SPDX AGPL-3.0-only identifier](https://spdx.org/licenses/AGPL-3.0-only.html): exact metadata identifier; distinguish it from `AGPL-3.0-or-later`.

Root records the actual release commit, verified public status and repository license recognition in NOTE-011 and its report, then refreshes the portable requirements export. Preserve NOTE-007 through NOTE-010 as historical evidence.
