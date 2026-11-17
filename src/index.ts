#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function tryLoadEnv(): void {
  if (process.env.LMS_USERNAME || process.env.LMS_MOODLE_SESSION) {
    return;
  }

  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    path.join(os.homedir(), ".fit-lms-mcp", ".env"),
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      if (typeof process.loadEnvFile === "function") {
        try {
          process.loadEnvFile(envPath);
          return;
        } catch {
          // fallback to manual parse if loadEnvFile fails
        }
      }
      try {
        const content = fs.readFileSync(envPath, "utf8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx === -1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (key && !(key in process.env)) {
            process.env[key] = val;
          }
        }
        return;
      } catch {
        // ignore read errors
      }
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("setup") || args.includes("--setup")) {
    // Dynamic import to execute setup assistant
    // @ts-expect-error setup.mjs is an ES script without TS definitions
    const { runSetup } = await import("../scripts/setup.mjs");
    await runSetup();
    return;
  }

  tryLoadEnv();

  const { loadConfig } = await import("./config/env.js");
  const { createServer } = await import("./mcp/server.js");

  loadConfig();

  const server = createServer();
  server.start();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
