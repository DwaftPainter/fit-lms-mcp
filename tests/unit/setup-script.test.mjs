import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  serializeEnvValue,
  parseEnvContent,
  stripJsonComments,
  updateJsonConfigFile,
  saveEnvFile,
  runSetup,
} from "../../scripts/setup.mjs";

test("[P1] serializeEnvValue properly quotes values containing hash, quotes and spaces", () => {
  const hashPass = "Dummy#Pass42";
  const serialized = serializeEnvValue(hashPass);
  assert.equal(serialized, '"Dummy#Pass42"');

  const tmpEnv = path.join(os.tmpdir(), `test_env_${Date.now()}_hash.env`);
  fs.writeFileSync(tmpEnv, `LMS_PASSWORD=${serialized}\n`);

  const readBack = execFileSync(process.execPath, [
    `--env-file=${tmpEnv}`,
    "-e",
    "console.log(process.env.LMS_PASSWORD)",
  ], { encoding: "utf8" }).trim();

  assert.equal(readBack, "Dummy#Pass42");
  fs.unlinkSync(tmpEnv);
});

test("[P1] parseEnvContent extracts unquoted and quoted values correctly", () => {
  const content = [
    'LMS_BASE_URL="https://lms.fit.hanu.vn"',
    'TIMEOUT_MS=5000 # inline comment',
    'LMS_USERNAME="2101040001"',
    'LMS_PASSWORD="Dummy#Pass42"',
  ].join("\n");

  const parsed = parseEnvContent(content);
  assert.equal(parsed.LMS_BASE_URL, "https://lms.fit.hanu.vn");
  assert.equal(parsed.TIMEOUT_MS, "5000");
  assert.equal(parsed.LMS_USERNAME, "2101040001");
  assert.equal(parsed.LMS_PASSWORD, "Dummy#Pass42");
});

test("[P2] updateJsonConfigFile aborts without writing when JSON parse fails", () => {
  const tmpBroken = path.join(os.tmpdir(), `test_broken_${Date.now()}.json`);
  const initialContent = '{\n  "corrupted": true,\n  syntax error here';
  fs.writeFileSync(tmpBroken, initialContent, "utf8");

  const ok = updateJsonConfigFile(tmpBroken, { command: "node" });
  assert.equal(ok, false);

  const afterContent = fs.readFileSync(tmpBroken, "utf8");
  assert.equal(afterContent, initialContent);

  fs.unlinkSync(tmpBroken);
});

test("[P2] updateJsonConfigFile supports JSONC comments and updates target key", () => {
  const tmpJsonc = path.join(os.tmpdir(), `test_jsonc_${Date.now()}.jsonc`);
  const jsoncContent = `{\n  // This is a comment\n  "existing": true,\n  "mcpServers": {\n    "other": { "command": "other-bin" }\n  }\n}`;
  fs.writeFileSync(tmpJsonc, jsoncContent, "utf8");

  const ok = updateJsonConfigFile(tmpJsonc, { command: "node", args: ["test"] }, "mcpServers");
  assert.equal(ok, true);

  const parsed = JSON.parse(fs.readFileSync(tmpJsonc, "utf8"));
  assert.equal(parsed.existing, true);
  assert.deepEqual(parsed.mcpServers.other, { command: "other-bin" });
  assert.deepEqual(parsed.mcpServers["fit-lms"], { command: "node", args: ["test"] });

  fs.unlinkSync(tmpJsonc);
});

test("[P2] updateJsonConfigFile updates OpenCode mcp key", () => {
  const tmpOpenCode = path.join(os.tmpdir(), `test_opencode_${Date.now()}.json`);
  fs.writeFileSync(tmpOpenCode, JSON.stringify({ "$schema": "https://opencode.ai/config.json", mcp: {} }), "utf8");

  const serverConfig = { type: "local", command: ["node", "index.js"], enabled: true };
  const ok = updateJsonConfigFile(tmpOpenCode, serverConfig, "mcp");
  assert.equal(ok, true);

  const parsed = JSON.parse(fs.readFileSync(tmpOpenCode, "utf8"));
  assert.deepEqual(parsed.mcp["fit-lms"], serverConfig);

  fs.unlinkSync(tmpOpenCode);
});

test("updateJsonConfigFile preserves string contents while accepting JSONC trailing commas", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fit-jsonc-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "config.jsonc");
  const note = 'Keep ,} and ,] and ,  } with "quotes", \\paths and https://example.com/*literal*/';
  fs.writeFileSync(file, `{
    // Keep the strings verbatim
    "note": ${JSON.stringify(note)},
    "items": ["literal ,]", /* trailing comma */ ],
    "mcpServers": {"other": {"command": "other",},},
  }`);

  assert.equal(updateJsonConfigFile(file, { command: "node" }), true);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(parsed.note, note);
  assert.deepEqual(parsed.items, ["literal ,]"]);
  assert.deepEqual(parsed.mcpServers.other, { command: "other" });
});

for (const key of ["mcpServers", "mcp"]) {
  test(`updateJsonConfigFile creates a missing config with ${key}.fit-lms`, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fit-new-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, "nested", "config.json");
    const server = { command: "node" };

    assert.equal(updateJsonConfigFile(file, server, key), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
      [key]: { "fit-lms": server },
    });
  });

  for (const name of ["fit-lms", "hanu-lms"]) {
    test(`updateJsonConfigFile updates existing ${key}.${name} without adding a duplicate`, (t) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fit-server-"));
      t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
      const file = path.join(dir, "config.json");
      const other = { command: "other" };
      fs.writeFileSync(file, JSON.stringify({ [key]: { [name]: { command: "old" }, other } }));

      const server = { command: "new" };
      assert.equal(updateJsonConfigFile(file, server, key), true);
      assert.equal(updateJsonConfigFile(file, server, key), true);
      assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
        [key]: { [name]: server, other },
      });
    });
  }

  for (const value of [null, [], ["existing-server"], "existing-server", false, 1]) {
    test(`updateJsonConfigFile leaves invalid ${key}=${JSON.stringify(value)} unchanged`, (t) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fit-invalid-"));
      t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
      const file = path.join(dir, "config.json");
      const content = JSON.stringify({ keep: true, [key]: value });
      fs.writeFileSync(file, content);

      assert.equal(updateJsonConfigFile(file, { command: "node" }, key), false);
      assert.equal(fs.readFileSync(file, "utf8"), content);
    });
  }
}

test("[P2] saveEnvFile creates .env with 0600 mode and secures existing files", () => {
  const tmpEnv = path.join(os.tmpdir(), `test_perms_${Date.now()}.env`);

  // First creation
  saveEnvFile(tmpEnv, {
    baseUrl: "https://lms.fit.hanu.vn",
    timeoutMs: "5000",
    username: "user1",
    password: "Dummy#Pass42",
  });

  const stat1 = fs.statSync(tmpEnv);
  const mode1 = stat1.mode & 0o777;
  assert.equal(mode1, 0o600);

  // Simulate existing file with 0644
  fs.chmodSync(tmpEnv, 0o644);
  assert.equal(fs.statSync(tmpEnv).mode & 0o777, 0o644);

  // Overwriting must secure it back to 0600
  saveEnvFile(tmpEnv, {
    baseUrl: "https://lms.fit.hanu.vn",
    timeoutMs: "5000",
    username: "user1",
    password: "Dummy#Pass42",
  });

  const stat2 = fs.statSync(tmpEnv);
  assert.equal(stat2.mode & 0o777, 0o600);

  fs.unlinkSync(tmpEnv);
});

test("runSetup is exported and callable", () => {
  assert.equal(typeof runSetup, "function");
});
