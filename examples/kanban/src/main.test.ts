import { it } from "vitest";
import { run } from "./main.js";

// The example's asserts are the test: run() throws on any mismatch, so a drift
// between the packages and what docs/examples/kanban.md shows fails the gate.
it("kanban library-path example runs to completion", async () => {
  await run();
});
