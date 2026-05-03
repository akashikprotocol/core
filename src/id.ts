import { ulid } from "ulid";

/** Generate a ULID for a new field entry. */
export function generateId(): string {
  return ulid();
}
