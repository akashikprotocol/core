/**
 * Postgres-backed StorageAdapter. Imported from the "@akashikprotocol/core/postgres"
 * subpath, never from the package root — the core entry point has exactly
 * one runtime dependency (ulid), and this keeps it that way. `pg` is an
 * optional peer dependency: install it yourself to use this module.
 */
export { createPostgresAdapter } from "./adapters/postgres.js";
export type { PostgresAdapterOptions } from "./adapters/postgres.js";
