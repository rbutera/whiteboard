import { PROTOCOL_VERSION } from "@wboard/core";

/**
 * The protocol version this MCP facade speaks, sourced from `@wboard/core`
 * (which `spec/SPEC.md` owns) and surfaced through the `describe_board` tool's
 * `protocol_version` — the MCP handshake surface (#456).
 */
export const IMPLEMENTED_PROTOCOL_VERSION = PROTOCOL_VERSION;

export { PROTOCOL_VERSION };
export {
  type BoardRenderer,
  createWhiteboardMcpServer,
  type WhiteboardMcp,
  type WhiteboardMcpOptions,
} from "./facade.js";
