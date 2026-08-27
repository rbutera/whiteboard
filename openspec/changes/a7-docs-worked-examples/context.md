# Context packet — A7 docs-worked-examples

Track A of the board rebuild (plan: `docs/developing/plans/board-rebuild-plan.md` in rbutera/rennet; tracker: https://github.com/rbutera/rennet/issues/463). This repo is public and MIT. Rule Zero governs: no consent gates, no ceremony, no speculative hardening. The decision tickets are CLOSED — implement, never re-litigate.

A1–A5 landed: the nx monorepo with the `pnpm check` gate (`format,lint,typecheck,test,build`); `@wboard/core` (wire contract + fixture corpus), `@wboard/server` (reference board service), `@wboard/mcp` (stateless MCP facade + `wboard-mcp` bin + WS push); published to npm as `@wboard/{core,server,mcp}@0.1.0-alpha.2` under dist-tag `alpha`. **Build on what exists — do not touch core/server/mcp semantics, SPEC.md's normative text, or the release config.**

## Loop rules

The loop rules from `openspec/changes/a1-bootstrap-monorepo/context.md` apply verbatim. In brief: fresh context per session, state on disk; session start = read this packet + `tasks.md` + `git log --oneline -15` + `pnpm check`, pick the highest unfinished task; commit per task, push freely; no placeholders; verification is evidence shown, never asserted.

## Objective

Ship the **docs + worked examples** workstream (plan table row A7: "docs + worked examples — kanban + diagramming examples"):

- A `docs/` library at the repo root that **explains and shows** the protocol — quickstart, concepts, and three guides — while **SPEC.md remains the single normative source**. Docs never restate a wire table or error enum as their own authority; they link to the SPEC section that defines it.
- Two **runnable worked examples** under `examples/` — **kanban** and **diagramming** — that are real workspace packages whose assert-backed scripts run inside the `pnpm check` gate on every push. The examples are the drift alarm: if the packages' APIs or semantics move away from what the docs show, the gate fails.
- Root `README.md` grows a short docs/examples map.

The flip condition is the verification cluster: both examples RUN (in-gate against the workspace source, and once against the published `@alpha` packages in a temp dir), and a positive control proves the gate fails when an example's assertion is flipped.

## What already exists (do not duplicate)

- `spec/SPEC.md` — the normative wire contract, error enum, projection semantics, reference-server requirement, MCP facade. **Authority. Untouched by A7.**
- Per-package `README.md`s (A5) — one install line + one minimal snippet each. They stay as-is; docs pages go deeper and link to them, not vice versa.
- Root `README.md` — one-paragraph pitch + install line. A7 adds links only.
- `spec/fixtures/` corpus — conformance fixtures, not documentation. Examples do not reuse it.

## Decision tickets (closed, permalinked)

- https://github.com/rbutera/rennet/issues/463 — Track A packet; A7 is its final TS-side row. A7 blocks nothing (A6 Python trails independently); it can land any time after A5.
- https://github.com/rbutera/rennet/issues/455 — tool shapes the examples must model correctly (element `{id, kind, data}`, typed attributes incl. `element` refs and `many`, all-or-nothing apply, op_id dedup).
- https://github.com/rbutera/rennet/issues/453 / #454 — statelessness + event-log-as-truth framing the concepts page teaches.
- https://github.com/rbutera/rennet/issues/456 — two version axes; docs must keep package semver and protocol version visibly separate.

## Decisions baked in (decided in `proposal.md`, not re-litigated)

Read `proposal.md` for rationale. In brief: **no static-site generator** — plain GitHub-rendered markdown in `docs/`; **examples are private workspace packages** under `examples/*` with `workspace:*` deps, wired into the standard nx gate; docs pages keep fences short and link to the example source as the runnable truth; kanban drives the **library path** (`BoardService` + `project`), diagramming drives the **MCP path** (real client over `InMemoryTransport`, incl. `screenshot`).

## Out of scope (do NOT start)

- Any SPEC.md content change; any core/server/mcp source change beyond zero (examples import, never patch).
- A docs website/SSG, GitHub Pages, custom domains, link-checker or snippet-extraction toolchains.
- **A6** (Python twins) and any Python docs; MCP Apps widget render target (#453, deferred).
- Publishing anything: no version bump, no `nx release`, examples excluded from the release projects (the `nx.json` release block lists `core`,`server`,`mcp` explicitly — leave it).
- API reference generation (typedoc etc.) — the exported surface is small; READMEs + guides cover it.

## Verification (end-to-end, positive control that can fail)

1. Clean `pnpm check` green, now including the two example projects' targets (`pnpm nx show projects` lists them; the test target executes each example's assert-backed run).
2. **Positive control**: flip one assertion in the kanban example (wrong expected state after the move) → `pnpm check` FAILS; revert → green. Evidence shown, both runs.
3. **Published-package run**: in a temp dir OUTSIDE the repo, `npm init -y && npm_config_min_release_age=0 npm install @wboard/core@alpha @wboard/server@alpha @wboard/mcp@alpha`, copy each example's script beside it, run both to completion (exit 0). **Note (this machine):** `~/.npmrc` sets `min-release-age=7`, so a fresh alpha needs the `npm_config_min_release_age=0` prefix for npm installs (surfaces as `ENOVERSIONS` otherwise; pnpm ignores the key).
4. Docs link integrity: every relative link in `docs/**/*.md` and the root README resolves to a file in the repo (a shell loop over `grep -o` output is fine; no link-checker dependency).
5. Everything committed and pushed on the change branch, PR against `main` opened with the evidence in the body.

## Completion sigil

`<promise>A7-COMPLETE</promise>`
