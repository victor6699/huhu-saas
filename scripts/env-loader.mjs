import fs from "node:fs";
import path from "node:path";

export function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const index = line.indexOf("=");
    if (index === -1) {
      continue;
    }

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function applyEnvRecord(record, shellEnvKeys) {
  for (const [key, value] of Object.entries(record)) {
    if (shellEnvKeys.has(key)) {
      continue;
    }

    process.env[key] = value;
  }
}

export function getRootEnvFiles(rootDir, includeLegacyEnv = true) {
  const files = [
    path.join(rootDir, ".env.shared"),
    path.join(rootDir, ".env.secret"),
  ];

  if (includeLegacyEnv) {
    files.push(path.join(rootDir, ".env"));
  }

  return files;
}

export function loadWorkspaceEnv({
  rootDir,
  projectDir = rootDir,
  includeProjectEnv = true,
  includeLegacyRootEnv = true,
} = {}) {
  const shellEnvKeys = new Set(Object.keys(process.env));
  const loadedFiles = [];

  for (const filePath of getRootEnvFiles(rootDir, includeLegacyRootEnv)) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const record = parseEnvFile(filePath);
    applyEnvRecord(record, shellEnvKeys);
    loadedFiles.push(filePath);
  }

  if (includeProjectEnv) {
    const projectEnvPath = path.join(projectDir, ".env");
    if (fs.existsSync(projectEnvPath)) {
      const record = parseEnvFile(projectEnvPath);
      applyEnvRecord(record, shellEnvKeys);
      loadedFiles.push(projectEnvPath);
    }
  }

  return {
    loadedFiles,
    env: { ...process.env },
  };
}

export function viteDefineFromEnv(env = process.env) {
  return Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => key.startsWith("VITE_"))
      .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );
}
