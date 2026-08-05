import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFileAdapter } from "../../src/file.js";
import { runAdapterConformanceSuite } from "./adapter-suite.js";

runAdapterConformanceSuite("FileAdapter", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akashik-file-"));
  const adapter = createFileAdapter({ path: path.join(dir, "field.jsonl") });
  await adapter.init?.();
  return {
    adapter,
    cleanup: async () => {
      await adapter.close?.();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
});
