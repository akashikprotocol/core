/**
 * The conformance levels this SDK satisfies, per the Akashik Protocol
 * Specification.
 *
 * The conformance ratchet is one-way: once a level is claimed in a release,
 * that level's requirements are permanent commitments. A later release may
 * add a level; it may never drop one.
 *
 * v0.1 — partial L0 (not claimed here; partial conformance is not conformance)
 * v0.2 — L0
 * v0.3 — L0, L1
 */
export const FIELD_PROTOCOL_LEVELS = ["L0", "L1"] as const;

export type ProtocolLevel = (typeof FIELD_PROTOCOL_LEVELS)[number];
