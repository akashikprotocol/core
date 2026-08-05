/**
 * File-backed StorageAdapter. Imported from the "@akashikprotocol/core/file"
 * subpath. Uses only node:fs and node:path — no dependency, optional or
 * otherwise, is required to use this module.
 *
 * Good fit: local development, single-machine long-running processes, CLI
 * tools, embedded use, tests that need real durability, small deployments
 * where a database is overkill.
 *
 * Poor fit: serverless across machines, or any deployment spanning more
 * than one machine. Multiple machines cannot share a local file, and
 * network filesystems do not provide the locking semantics this adapter
 * relies on — use PostgresAdapter there. Supported concurrency is multiple
 * processes on the SAME machine sharing one file, serialized by a lock file.
 */
export { createFileAdapter } from "./adapters/file.js";
export type { FileAdapterOptions } from "./adapters/file.js";
