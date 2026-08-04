import { AkashikError } from "./errors.js";

/**
 * Validate an optional confidence value. Absent is always valid.
 */
export function validateConfidence(confidence: unknown): void {
  if (confidence === undefined) return;

  if (typeof confidence !== "object" || confidence === null || Array.isArray(confidence)) {
    throw new AkashikError("INVALID_CONFIDENCE", "confidence must be an object");
  }

  const c = confidence as Record<string, unknown>;

  if (typeof c.score !== "number" || Number.isNaN(c.score)) {
    throw new AkashikError("INVALID_CONFIDENCE", "confidence.score must be a number");
  }

  if (c.score < 0 || c.score > 1) {
    throw new AkashikError(
      "INVALID_CONFIDENCE",
      "confidence.score must be between 0 and 1 inclusive",
    );
  }

  if (c.reason !== undefined && typeof c.reason !== "string") {
    throw new AkashikError("INVALID_CONFIDENCE", "confidence.reason must be a string when present");
  }
}
