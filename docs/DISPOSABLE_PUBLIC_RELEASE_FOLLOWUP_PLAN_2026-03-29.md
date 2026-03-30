# Disposable Public Release Follow-Up Plan (2026-03-29)

This checklist is intentionally disposable. Its job is to capture the remaining work after the first public-safe import lands, so we can keep moving without re-discovering the same caveats.

## Goal

Make `finance-analyzer` not just migrated and public-safe, but comfortably publishable and easier to maintain as the long-term public repo.

## Current State

The first public-safe import is already in place:
1. public code, tests, and demo data were migrated,
2. sensitive fixtures were excluded,
3. the repo validates standalone,
4. the first public commit can land now.

The remaining work is follow-up hardening and polish, not migration-critical cleanup.

## Task 1: Confirm Highcharts Usage Licensing Posture

Goal: confirm the public repo can legally use Highcharts in its current CDN-backed setup.

Subtasks:
1. confirm whether the intended public-site usage is covered by your Highcharts license posture,
2. document the chosen posture for future maintainers,
3. decide whether the CDN-backed approach is sufficient long-term,
4. if not, replace Highcharts with an allowed alternative.

Done when:
1. the usage posture is explicit,
2. there is no ambiguity about whether Highcharts can remain in the public experience.

## Task 2: Clean The Public Web / Private Overlay Contract

Goal: reduce public-repo knowledge of private-only file layout.

Current caveat:
1. the public web runtime and tests still reference `tmp_sensitive_data/...` paths as part of the contract,
2. this does not leak sensitive data, but it keeps private-path knowledge in the public repo.

Subtasks:
1. decide whether the current explicit sensitive-path contract is acceptable long-term,
2. if not, replace it with a cleaner contract such as an injected manifest, base URL, or profile config,
3. update the public runtime code,
4. update the public tests,
5. re-validate the private repo against the new contract.

Done when:
1. the public repo no longer needs to know the concrete private overlay layout,
2. the private repo can still supply real data cleanly.

## Task 3: Curate The Public Documentation Set

Goal: evolve from a minimal bootstrap README to a stable public-facing documentation set.

Subtasks:
1. expand `README.md` from bootstrap text into the real public project README,
2. add a short explanation of demo-data vs private-data workflows,
3. decide which docs from the old repo deserve a curated public version,
4. reintroduce only the stable docs that help public users and contributors,
5. keep planning-heavy or transitional docs out of the public repo.

Done when:
1. a new contributor can understand what the repo does and how to run it,
2. the public docs reflect the public repo, not the migration history.

## Task 4: Strengthen Public Repo Operator Workflow

Goal: make the public repo easy to clone, build, and validate without split-era tribal knowledge.

Subtasks:
1. decide whether to keep `scripts/build-web-wasm.sh` as the canonical wasm build path,
2. make sure the README and any future CI use the same public commands,
3. consider adding a top-level helper command for the common public validation flow,
4. confirm pre-commit and OSS guardrails are documented for public contributors.

Done when:
1. the public repo has one obvious setup and validation path,
2. local setup does not rely on migration context.

## Task 5: Cut The Private Repo Over To The Real Public Repo

Goal: stop depending on the temporary bootstrap source and make the split official.

Subtasks:
1. repoint the private repo `public/` submodule to the real `finance-analyzer` remote,
2. validate the private Go suite against the new public repo,
3. validate the private web flow against the new public repo,
4. remove any remaining references to the temporary bootstrap source.

Done when:
1. the private repo consumes the real public repo,
2. `pdf_tmp` is no longer part of the active architecture.

## Recommended Order

1. Land the first public commit.
2. Repoint the private repo submodule to `finance-analyzer`.
3. Resolve the vendor licensing posture.
4. Decide whether to keep or redesign the web private-overlay contract.
5. Expand the public docs once the architecture is stable.

## Regroup Trigger

Pause and re-scope if:
1. licensing review requires removing or replacing a core charting dependency,
2. the web contract cleanup starts changing public runtime semantics in a broad way,
3. the private repo cannot consume the public repo cleanly after the submodule cutover.
