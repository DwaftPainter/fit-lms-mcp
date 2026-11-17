import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("live smoke exits without credentials or network access when not explicitly enabled", () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL("../../scripts/smoke-live.mjs", import.meta.url))], {
    env: { PATH: process.env.PATH, LMS_LIVE_SMOKE: "0" }, encoding: "utf8",
  });
  assert.match(output, /Live smoke disabled/);
});
