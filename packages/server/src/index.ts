import { PROTOCOL_VERSION } from "@whtbrd/core";

/**
 * The protocol version this server implements, sourced from `@whtbrd/core`
 * (which SPEC.md owns). Surfaced in the MCP `describe` handshake once the
 * facade lands (A4).
 */
export const IMPLEMENTED_PROTOCOL_VERSION = PROTOCOL_VERSION;

export { PROTOCOL_VERSION };
