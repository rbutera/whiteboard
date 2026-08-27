# Context packet — A5 release-alpha

Track A of the board rebuild (plan: `docs/developing/plans/board-rebuild-plan.md` in rbutera/rennet; tracker: https://github.com/rbutera/rennet/issues/463). This repo is public and MIT. Rule Zero governs: no consent gates, no ceremony, no speculative hardening. The decision tickets are CLOSED — implement, never re-litigate.

A1–A4 landed: the nx monorepo with the `pnpm check` gate (`format,lint,typecheck,test,build`); `@wboard/core` (wire contract + fixture corpus), `@wboard/server` (reference board service), `@wboard/mcp` (stateless MCP facade + `wboard-mcp` bin + WS push). All three sit at `0.0.0`, unpublished. **Build on what exists — do not touch core/server/mcp semantics.** The npm scope is `@wboard/*`.

## Loop rules

The loop rules from `openspec/changes/a1-bootstrap-monorepo/context.md` apply verbatim. In brief: fresh context per session, state on disk; session start = read this packet + `tasks.md` + `git log --oneline -15` + `pnpm check`, pick the highest unfinished task; commit per task, push freely; no placeholders; verification is evidence shown, never asserted.

## Objective

Publish **alpha versions of `@wboard/core`, `@wboard/server`, `@wboard/mcp` to npm**, publicly (MIT), under the `wboard` org, using **nx release** (nx 23.1.1 already in the workspace) configured in `nx.json`. **LOCAL publish only — no GitHub Actions / CI publishing (explicitly out of scope; escalation required to add it).** The flip condition is the installability proof: the published packages install and run a real end-to-end in a temp directory outside the repo.

## Current release state (what you are fixing)

- Root `@wboard/workspace` is `private: true` — stays private and unpublished.
- All three packages: `version: 0.0.0`, `license: MIT`, ESM, `main`/`types`/`exports`/`files: ["dist"]` already correct. `@wboard/mcp` has the `wboard-mcp` bin.
- **Missing for a clean publish**: `repository`/`homepage`/`description` fields, `publishConfig`, per-package `LICENSE` and `README.md` (root has both; npm packs per-package only). No `release` block in `nx.json`.
- `@wboard/server` and `@wboard/mcp` declare `workspace:*` deps — these MUST be concrete semver ranges in the published manifests (nx release versioning rewrites them; the temp-dir install proves it, because `workspace:*` in a published tarball makes `npm install` fail).

## The npm token (read carefully, then handle it exactly once)

The npm automation token lives at `/Volumes/ExternalNVMe/home/dev/.whiteboard_env` (single line `NPM_TOKEN=...`). Rules:

- Source it into the environment **at publish invocation only**, e.g. `sh -c 'set -a; . /Volumes/ExternalNVMe/home/dev/.whiteboard_env; set +a; pnpm nx release publish'`.
- **Never** commit it, echo/cat it, copy it into the repo or any `.npmrc` that is tracked, or reference it anywhere except by that path.
- It must never enter an nx-cached target: `nx-release-publish` is uncacheable by nx design — never add `cache: true` to it or wrap publish in a cacheable target. No token-bearing env var may appear in any target's `inputs`.

## Decision tickets (closed, permalinked)

- https://github.com/rbutera/rennet/issues/456 — **primary authority**: `@wboard/*` scope, per-package semver as a **separate axis from the protocol version** (SPEC.md owns protocol `0.1`; the release must not conflate them — no SPEC.md version edits in this workstream), nx release → npm.
- https://github.com/rbutera/rennet/issues/463 — Track A packet. A5 gates Rennet's B4, which consumes the published packages.

## Decisions baked in (decided in `proposal.md`, not re-litigated)

Read `proposal.md` for rationale. In brief: **fixed/locked versioning** across the three packages; first release **`0.1.0-alpha.0`**, subsequent `nx release version prerelease` bumps `alpha.N`; dist-tag **`alpha`**, baked into each package's `publishConfig` (`{"access": "public", "tag": "alpha"}`) so `latest` can never point at a prerelease; **no changelog / GitHub-release generation**; git tag `v{version}`; the `0.1` numeral coinciding with protocol `0.1` is incidental and asserted independent in verification.

## Out of scope (do NOT start)

- **Any CI/GitHub Actions publishing** — explicitly out of scope; escalation required.
- Provenance/attestation ceremony beyond npm defaults; 2FA/signing ceremony (Rule Zero).
- **A6** (Python/PyPI), **A7** (docs site). Publishing the root workspace package.
- Any semantic change to core/server/mcp; any SPEC.md protocol-version edit.
- Graduating `latest`/`1.0` — a later release decides that.

## Verification (end-to-end, positive control that can fail)

1. Clean `pnpm check` green before publish.
2. Straggler sweep exactly as specified in `tasks.md` cluster 1 — expected-zero patterns hit zero.
3. Pre-publish: `npm pack --dry-run` per package shows `dist/`, `README.md`, `LICENSE`, and a manifest with concrete dep versions (no `workspace:*`).
4. **Installability proof (the a5 flip condition)**: in a TEMP directory OUTSIDE the repo, `npm install @wboard/core@alpha @wboard/server@alpha @wboard/mcp@alpha`; run a real end-to-end: create a board via the published server package, apply ops, fold events with `project` and assert the state; drive MCP tools (`create_board` → `apply_ops` → `get_events`) via the published mcp package over `InMemoryTransport` with a real MCP client; assert `describe_board` reports `protocol_version: "0.1"` while the installed package version is `0.1.0-alpha.N` (the two axes are separate). **Positive control**: flip one assertion (e.g. wrong expected state) → the script FAILS; revert. Evidence shown.
5. `npm view @wboard/core dist-tags` (and the other two) shows `alpha` → the published version and no `latest` pointing elsewhere unexpectedly.

## Completion sigil

`<promise>A5-COMPLETE</promise>`
