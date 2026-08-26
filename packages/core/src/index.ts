/**
 * The whiteboard wire-contract (protocol) version this library implements.
 *
 * This is the protocol-version axis owned by `spec/SPEC.md` — deliberately
 * separate from this package's npm semver. Every whiteboard library declares
 * the protocol version it implements and surfaces it in the MCP `describe`
 * handshake. See `spec/SPEC.md` for the authoritative definition.
 */
export const PROTOCOL_VERSION = "0.1" as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;
