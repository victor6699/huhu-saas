import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkspaceEnv } from "./env-loader.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

loadWorkspaceEnv({
  rootDir,
  projectDir: process.cwd(),
  includeProjectEnv: true,
  includeLegacyRootEnv: true,
});
