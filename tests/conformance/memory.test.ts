import { createMemoryAdapter } from "../../src/adapters/memory.js";
import { runAdapterConformanceSuite } from "./adapter-suite.js";

runAdapterConformanceSuite("MemoryAdapter", async () => ({
  adapter: createMemoryAdapter(),
  cleanup: async () => {},
}));
