# Fixture corpus

The shared conformance corpus for the whiteboard protocol. It is **not a
package** — it is language-neutral JSON that every implementation runs. The TS
twins (`@whiteboard/core`, `@whiteboard/server`) and the Python twins both run
this whole corpus in CI; passing it is what "implements protocol version X"
means.

> Status: skeleton (A1). **A2 populates this corpus.** `accept/` and `reject/`
> are intentionally empty for now.

## Fixture shape

Each fixture is a JSON document:

```json
{
  "schema": { "...": "the host schema the board was created with" },
  "input": { "...": "the element(s) / apply ops under test" },
  "expect": "accept"
}
```

or, for a rejection:

```json
{
  "schema": { "...": "..." },
  "input": { "...": "..." },
  "expect": { "reject": "<error-code>" }
}
```

- `expect` is either the string `"accept"` or an object `{ "reject": <error-code> }`.
- `<error-code>` MUST be one of the codes from SPEC.md's **closed** error-code
  enum (`unknown-kind`, `missing-required`, `wrong-type`, `bad-ref`, …). A
  fixture may not use a code that SPEC.md does not define.

## Layout

- `accept/` — fixtures whose `input` is valid against `schema` (`expect: "accept"`).
- `reject/` — fixtures whose `input` is invalid (`expect: { reject: <code> }`).

## Scope

The corpus is not only validate/reject. It also covers **log → projection**
server-semantics cases: an event log folding to an expected projected state,
`op_id` dedup, and all-or-nothing batch application. Those cases are added
alongside the reference server (A3).
