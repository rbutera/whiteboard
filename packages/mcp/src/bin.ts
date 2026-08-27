#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWhiteboardMcpServer } from "./facade.js";

/**
 * The `wboard-mcp` executable: the stateless facade over a fresh in-memory
 * `BoardService`, connected to stdio. No flags, no config — a host that needs
 * its own persistence embeds `createWhiteboardMcpServer` in-process instead.
 */
const { server } = createWhiteboardMcpServer();
await server.connect(new StdioServerTransport());
