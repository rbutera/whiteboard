# A5 tasks

Ordered clusters. Each cluster is a clean stopping point sized for one implementer session: land it, run `pnpm check`, commit, push, stop if the session is done. Within a cluster each numbered task is independently committable.

## Cluster 1 — package hygiene + straggler sweep

- [x] 1.1 Each of `packages/{core,server,mcp}/package.json`: add `description`, `repository` (`{"type": "git", "url": "git+https://github.com/rbutera/whiteboard.git", "directory": "packages/<name>"}`), `homepage` (`https://github.com/rbutera/whiteboard#readme`), `publishConfig` (`{"access": "public", "tag": "alpha"}`). Leave `main`/`types`/`exports`/`files`/`license`/`bin` as they are. `pnpm check` green. Commit.
- [x] 1.2 Per-package `LICENSE` (copy of root MIT, verbatim) and `README.md`: one paragraph on what the package is, `npm install @wboard/<name>@alpha`, a minimal real usage snippet (core: validate a batch; server: `BoardService` create→apply→getEvents; mcp: `createWhiteboardMcpServer` + `InMemoryTransport`), an alpha notice, and a link to `spec/SPEC.md` on GitHub as the authority. Root `README.md`: one install line noting the npm packages under the `alpha` dist-tag. Commit.
- [x] 1.3 Straggler sweep — run and record both greps, expected zero hits each:
  - `grep -rnE '@whtbrd|@whiteboard/' . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=openspec`
  - `grep -rniE 'whtbrd' . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=openspec`
  Any hit is a bug: fix it, re-run to zero. (Bare "whiteboard" words and `rbutera/whiteboard` are fine; `openspec/` packets are historical records and excluded.) Positive control: temporarily add a `@whtbrd` line to a scratch file in-repo, confirm the grep catches it, delete it. Evidence shown. Commit any fixes.

## Cluster 2 — nx release configuration

- [x] 2.1 `nx.json`: add the `release` block — `projects` = the three package projects only (verify names with `pnpm nx show projects`; root workspace excluded), `projectsRelationship: "fixed"`, `releaseTagPattern: "v{version}"`, changelog generation disabled (`workspaceChangelog: false`, `projectChangelogs: false`), and versioning set so `workspace:*` local deps are rewritten to concrete versions in published manifests (`preserveLocalDependencyProtocols: false` — check the exact nx 23 option shape via nx docs/`--help`, never guess flags). Do NOT add caching to any release target: `nx-release-publish` stays uncacheable. Commit.
- [x] 2.2 Dry-run the version step: `pnpm nx release version 0.1.0-alpha.0 --first-release --dry-run` shows all three packages moving to `0.1.0-alpha.0` in lockstep with `workspace:*` deps rewritten. Then run it for real (writes package.jsons + lockfile, creates the release commit and `v0.1.0-alpha.0` tag per config). `pnpm check` green. 
- [x] 2.3 Tarball truth: `npm pack --dry-run` in each package dir (after `pnpm nx run-many -t build`) — verify `dist/`, `README.md`, `LICENSE` are in the file list and the packed manifest has concrete dep versions, no `workspace:*`. Evidence shown. Commit anything the dry-run flushed out. Push (with tags).

## Cluster 3 — publish + installability proof (the a5 flip condition)

- [x] 3.1 Publish, locally: `sh -c 'set -a; . /Volumes/ExternalNVMe/home/dev/.whiteboard_env; set +a; pnpm nx release publish'`. The `alpha` dist-tag is the durable default from the tracked root `.npmrc` (`tag=alpha`) — no `--tag` flag needed, and it survives future maintainers forgetting one (nx ignores `publishConfig.tag`). Token rules from context.md are absolute: source at invocation only; never commit, echo, or copy it; it must not enter any nx-cached target or tracked `.npmrc` (the tracked `.npmrc` holds only `link-workspace-packages` and `tag`, never the token — auth is supplied at invocation via a userconfig referencing `${NPM_TOKEN}`). If publish 404s on the scope, the `wboard` npm org needs the token owner's attention — stop and report, do not improvise auth. Confirm with `npm view @wboard/core dist-tags` (and server, mcp): `alpha` → the published version. (npm auto-tags the first-ever publish `latest` too; unavoidable, repoints on graduation.)
- [x] 3.2 In a TEMP directory OUTSIDE the repo (e.g. `$(mktemp -d)`): `npm init -y && npm_config_min_release_age=0 npm install @wboard/core@alpha @wboard/server@alpha @wboard/mcp@alpha` (the `min_release_age=0` override is required on this machine to install a just-published version — see Notes; `name@alpha` resolution otherwise works). Write one ESM script against the **installed** packages (no repo imports, no workspace resolution): create a board via `BoardService` with a small host schema, `apply` ops, `getEvents`, fold with `project`, assert the expected state; then `createWhiteboardMcpServer()` + real MCP client over `InMemoryTransport`, drive `create_board` → `apply_ops` → `get_events`, assert the round-trip; assert `describe_board` returns `protocol_version === "0.1"` while `@wboard/core`'s installed `package.json` version is `0.1.0-alpha.0` (separate axes). Script exits non-zero on any failed assert.
- [x] 3.3 Positive control: flip one assertion (e.g. wrong expected state) → the script FAILS; revert → passes. Show both runs' evidence.
- [x] 3.4 Final: `pnpm check` green, everything committed and pushed on the change branch (`git rev-parse origin/a5-release-alpha` == local HEAD — this lands via PR #6 against `main`, not a direct push to `main`), tag `v0.1.0-alpha.0` pushed, PR body updated with the evidence. Output `<promise>A5-COMPLETE</promise>`.

## Notes

- LOCAL publish only. No GitHub Actions publish workflow — out of scope, escalation required to add one.
- No changelog, no GitHub release, no provenance/attestation beyond npm defaults, no 2FA/signing ceremony (Rule Zero).
- No SPEC.md edits: the protocol version (`0.1`) is SPEC.md's axis and this release does not touch it.
- Root `@wboard/workspace` stays `private: true` and out of the release projects.
- Subsequent alphas: `pnpm nx release version prerelease` → `0.1.0-alpha.1`, then the same bare publish invocation (`.npmrc` supplies `tag=alpha`).
- **Local install-proof gotcha (this machine):** `~/.npmrc` sets `min-release-age=7`, an npm supply-chain guard that refuses any version younger than 7 days (surfaces as `ENOVERSIONS`, not a 404). For a local `npm install @wboard/*@alpha` proof of a fresh publish, prefix `npm_config_min_release_age=0`. npm-only — pnpm ignores the key.
