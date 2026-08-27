import { it } from "vitest";
import { run } from "./main.js";

// The example's asserts are the test: run() throws on any mismatch, so a drift
// between the MCP facade and what docs/examples/diagramming.md shows fails the gate.
it("diagramming MCP-path example runs to completion", async () => {
  await run();
});
