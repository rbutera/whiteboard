import { PROTOCOL_VERSION } from "@wboard/core";

/**
 * The protocol version this server implements, sourced from `@wboard/core`
 * (which SPEC.md owns). Surfaced in the MCP `describe` handshake once the
 * facade lands (A4).
 */
export const IMPLEMENTED_PROTOCOL_VERSION = PROTOCOL_VERSION;

export { PROTOCOL_VERSION };
export * from "./store.js";
export * from "./project.js";
export * from "./service.js";
