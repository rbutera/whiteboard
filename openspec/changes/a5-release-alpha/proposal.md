# A5 — release-alpha

## Why

A4 finished the TS side of the protocol, but nothing is installable: all three packages sit at `0.0.0`, unpublished, with `workspace:*` deps and no publish fields. Rennet's B4 consumes `@wboard/*` from npm — it is blocked until the packages exist there. A5 configures nx release, cleans the manifests for publishing, and ships the first public alpha, proven by installing the published packages in a fresh temp directory and running a real end-to-end.

## What Changes

- **nx release configured in `nx.json`** (a `release` block): the three package projects (verify exact project names with `pnpm nx show projects`; root workspace excluded), `projectsRelationship: "fixed"`, `releaseTagPattern: "v{version}"`, changelog generation disabled (`workspaceChangelog: false`, `projectChangelogs: false`), and versioning configured so `workspace:*` local deps are rewritten to concrete versions in the published manifests (`preserveLocalDependencyProtocols: false` — verify the exact option shape against nx 23 docs, never guess flags).
- **Versioning story (decided): fixed/locked, `0.1.0-alpha.N`, dist-tag `alpha`.**
  - *Fixed, not independent*: the three packages ship in lockstep (`mcp` depends on `server` + `core`, `server` on `core`) and always will while the protocol is young — one version number, one tag, zero matrix bookkeeping.
  - *First version `0.1.0-alpha.0`*: the normal pre-1.0 starting point. The `0.1` numeral coincides with protocol version `0.1` **by accident, not by rule** — SPEC.md owns the protocol version as a separate axis (#456), package semver will drift past it, and the verification asserts the axes independently. No SPEC.md edit ships in this change.
  - *Dist-tag `alpha`*: an alpha should not be what a bare `npm install @wboard/core` resolves once a stable exists. `"tag": "alpha"` goes in each package's `publishConfig`, **but nx 23's `nx release publish` ignores `publishConfig.tag` and defaults `--tag` to `latest`** — so the durable guard is `tag=alpha` in the tracked root `.npmrc` (proven with `pnpm nx release publish --dry-run` showing tag "alpha" without a `--tag` flag). Even so, **npm auto-tags the first-ever version of a brand-new package as `latest` regardless of `--tag`, and refuses to delete the `latest` tag (E403)** — so on the very first publish `latest` unavoidably equals the alpha (nothing else exists to point it at); it repoints when a later version graduates. The install proof pins `@alpha`. Graduation to `latest` is a later, deliberate release.
  - *Bump command for subsequent alphas*: `pnpm nx release version prerelease` → `0.1.0-alpha.1`, ….
- **Package hygiene** (each of core/server/mcp): `description`; `repository` (`git+https://github.com/rbutera/whiteboard.git` with per-package `directory`); `homepage` (`https://github.com/rbutera/whiteboard#readme`); `publishConfig: {"access": "public", "tag": "alpha"}`; a `LICENSE` file (copy of root MIT — npm packs per-package, and npm always includes `package.json`/`README`/`LICENSE` regardless of `files`); a short `README.md` per package — one paragraph on what the package is, install line, a minimal usage snippet, an alpha notice, and a link to `spec/SPEC.md` on GitHub as the authority. Root `README.md` gains one install line noting the packages are on npm under the `alpha` dist-tag. Existing `main`/`types`/`exports`/`files` fields are already correct and stay as they are.
- **Three-name straggler sweep** (pre-publish): grep living files for scope misuse. Expected-zero patterns, exactly:
  - `grep -rnE '@whtbrd|@whiteboard/' . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=openspec` → **zero hits**.
  - `grep -rniE 'whtbrd' . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=openspec` → **zero hits**.
  - `openspec/` is excluded because change packets are historical records (a4's packet legitimately notes the `@whtbrd` rename). Bare "whiteboard" words and the repo slug `rbutera/whiteboard` are fine and not swept.
- **Local publish** with the token sourced from `/Volumes/ExternalNVMe/home/dev/.whiteboard_env` at invocation only (see context.md's token rules). `nx release publish` is uncacheable by nx design and stays that way — the token never enters a cacheable target, an nx input, or any tracked file.
- **No CI publish workflow is authored.** Out of scope, escalation required.

## Verification strategy

Pre-publish, `npm pack --dry-run` per package is the tarball truth: `dist/`, `README.md`, `LICENSE` present, manifest deps concrete (no `workspace:*`). Post-publish, the flip condition is the temp-dir installability proof (context.md §Verification 4): install `@alpha` outside the repo, run the server-package end-to-end (create board → apply ops → fold events with `project` → assert state) and the mcp-package end-to-end (real MCP client over `InMemoryTransport`: `create_board` → `apply_ops` → `get_events`), assert `protocol_version` (`"0.1"`) is reported independently of package version (`0.1.0-alpha.N`), and exercise the positive control (flip one assertion → script fails → revert). `npm view … dist-tags` confirms the `alpha` tag landed.

## Capabilities

### New Capabilities

- `npm-release`: nx release configuration — fixed versioning, `alpha` dist-tag, changelog-free, local-only publish with the token sourced at invocation.
- `package-publishing-hygiene`: publish-clean manifests, per-package LICENSE + README, straggler-swept scope.

### Modified Capabilities

- (none — no runtime behavior of core/server/mcp changes.)

## Impact

- `nx.json` — new `release` block.
- `packages/{core,server,mcp}/package.json` — version `0.1.0-alpha.N` (written by nx release), `description`/`repository`/`homepage`/`publishConfig` fields.
- `packages/{core,server,mcp}/{LICENSE,README.md}` — new.
- Root `README.md` — one install line.
- Git: release commit + `v0.1.0-alpha.0` tag on main.
- npm registry: `@wboard/core`, `@wboard/server`, `@wboard/mcp` publicly published under dist-tag `alpha`.
- No source, spec, or CI changes.
