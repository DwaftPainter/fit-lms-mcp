#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

export function serializeEnvValue(val) {
  const str = String(val ?? "");
  if (!str.includes('"')) {
    return `"${str}"`;
  }
  if (!str.includes("'")) {
    return `'${str}'`;
  }
  return `"${str.replace(/"/g, '\\"')}"`;
}

export function parseEnvContent(content) {
  const result = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();

    if (val.startsWith('"')) {
      const closingIdx = val.indexOf('"', 1);
      if (closingIdx > 0) {
        val = val.slice(1, closingIdx);
      }
    } else if (val.startsWith("'")) {
      const closingIdx = val.indexOf("'", 1);
      if (closingIdx > 0) {
        val = val.slice(1, closingIdx);
      }
    } else {
      const hashIdx = val.indexOf("#");
      if (hashIdx >= 0) {
        val = val.slice(0, hashIdx).trim();
      }
    }
    result[key] = val;
  }
  return result;
}

export function stripJsonComments(text) {
  let inString = false;
  let quoteChar = "";
  let escaped = false;
  let result = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quoteChar) {
        inString = false;
      }
    } else {
      if (char === '"' || char === "'") {
        inString = true;
        quoteChar = char;
        result += char;
      } else if (char === "/" && next === "/") {
        const nl = text.indexOf("\n", i + 2);
        if (nl === -1) break;
        i = nl - 1;
      } else if (char === "/" && next === "*") {
        const end = text.indexOf("*/", i + 2);
        if (end === -1) break;
        i = end + 1;
      } else if (char === "}" || char === "]") {
        // Strip trailing commas only outside strings, after skipping comments.
        result = result.replace(/,(\s*)$/, "$1");
        result += char;
      } else {
        result += char;
      }
    }
  }
  return result;
}

export function updateJsonConfigFile(configPath, serverConfig, key = "mcpServers") {
  let json = {};
  if (fs.existsSync(configPath)) {
    let raw = "";
    try {
      raw = fs.readFileSync(configPath, "utf8");
    } catch (readErr) {
      console.error(`\n❌ Không thể đọc file cấu hình: ${configPath} (${readErr.message})`);
      console.error(`   ⚠️  Đã HỦY thao tác ghi để bảo vệ file của bạn.`);
      return false;
    }

    if (raw.trim().length > 0) {
      try {
        json = JSON.parse(stripJsonComments(raw));
      } catch (parseErr) {
        console.error(`\n❌ Không thể parse file cấu hình JSON hiện tại: ${configPath}`);
        console.error(`   Lỗi cú pháp: ${parseErr.message}`);
        console.error(`   ⚠️  Đã HỦY thao tác ghi để bảo vệ toàn vẹn file cấu hình hiện tại của bạn.`);
        return false;
      }
    }
  }

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    console.error(`\n❌ Cấu trúc JSON không hợp lệ (không phải JSON object): ${configPath}`);
    console.error(`   ⚠️  Đã HỦY thao tác ghi.`);
    return false;
  }

  if (Object.hasOwn(json, key) &&
      (json[key] === null || typeof json[key] !== "object" || Array.isArray(json[key]))) {
    console.error(`\n❌ Cấu trúc ${key} không hợp lệ (không phải JSON object): ${configPath}`);
    console.error(`   ⚠️  Đã HỦY thao tác ghi để bảo vệ file của bạn.`);
    return false;
  }
  if (!Object.hasOwn(json, key)) {
    json[key] = {};
  }
  // Reuse the legacy name when present so setup does not add a second server.
  const serverName = !Object.hasOwn(json[key], "fit-lms") && Object.hasOwn(json[key], "hanu-lms")
    ? "hanu-lms"
    : "fit-lms";
  json[key][serverName] = serverConfig;

  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(json, null, 2) + "\n", "utf8");
    return true;
  } catch (writeErr) {
    console.error(`\n❌ Lỗi khi ghi file ${configPath}: ${writeErr.message}`);
    return false;
  }
}

export function askText(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function askPassword(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // Non-TTY (piped) mode: do NOT attach output stream so input is not echoed
      const rl = readline.createInterface({
        input: process.stdin,
      });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    // TTY mode: raw mode directly on stdin with NO readline output
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    let input = "";
    const onData = (chunk) => {
      const str = chunk.toString("utf8");
      for (const c of str) {
        if (c === "\r" || c === "\n" || c === "\u0004") {
          stdin.setRawMode(wasRaw ?? false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(input);
          return;
        } else if (c === "\u0003") {
          stdin.setRawMode(wasRaw ?? false);
          process.stdout.write("\n");
          process.exit(0);
        } else if (c === "\b" || c === "\x7f") {
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else {
          input += c;
          process.stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

export function ask(question, isPassword = false) {
  return isPassword ? askPassword(question) : askText(question);
}

export function saveEnvFile(envPath, { baseUrl, timeoutMs, cacheTtlMs, username, password }) {
  const envContent = [
    `LMS_BASE_URL=${serializeEnvValue(baseUrl)}`,
    `TIMEOUT_MS=${serializeEnvValue(timeoutMs)}`,
    ...(cacheTtlMs === undefined ? [] : [`LMS_CACHE_TTL_MS=${serializeEnvValue(cacheTtlMs)}`]),
    "",
    "# Auto-login credentials",
    `LMS_USERNAME=${serializeEnvValue(username)}`,
    `LMS_PASSWORD=${serializeEnvValue(password)}`,
    "",
  ].join("\n");

  fs.writeFileSync(envPath, envContent, { mode: 0o600, encoding: "utf8" });
  try {
    fs.chmodSync(envPath, 0o600);
  } catch {
    // Ignore on filesystems without POSIX permissions
  }
}

export async function runSetup() {
  console.log("\n=================================================");
  console.log("   HANU FIT LMS MCP — Interactive Setup Assistant");
  console.log("=================================================\n");

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(scriptDir, "..");
  const isLocalDev = path.resolve(process.cwd()) === packageRoot;

  let envPath;
  const distIndexPath = path.resolve(packageRoot, "dist/index.js");
  const nodePath = process.execPath;

  if (isLocalDev) {
    envPath = path.resolve(packageRoot, ".env");
    // 1. Ensure build exists in local dev
    if (!fs.existsSync(distIndexPath)) {
      console.log("📦 Chưa tìm thấy bản build, đang tiến hành build TypeScript sang dist/...");
      try {
        execSync("npm run build", { cwd: packageRoot, stdio: "inherit" });
        console.log("✅ Build hoàn tất.\n");
      } catch {
        console.error("❌ Lỗi khi build project. Vui lòng kiểm tra lại npm run build.");
        process.exit(1);
      }
    }
  } else {
    const configDir = path.join(os.homedir(), ".fit-lms-mcp");
    try {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    } catch {
      // Ignore directory creation errors if already exists
    }
    envPath = path.join(configDir, ".env");
  }

  // 2. Load existing .env if present
  let existingBaseUrl = "https://lms.fit.hanu.vn";
  let existingUsername = "";
  let existingTimeout = "5000";
  let existingCacheTtlMs;

  if (fs.existsSync(envPath)) {
    try {
      const parsed = parseEnvContent(fs.readFileSync(envPath, "utf8"));
      if (parsed.LMS_BASE_URL) existingBaseUrl = parsed.LMS_BASE_URL;
      if (parsed.LMS_USERNAME) existingUsername = parsed.LMS_USERNAME;
      if (parsed.TIMEOUT_MS) existingTimeout = parsed.TIMEOUT_MS;
      existingCacheTtlMs = parsed.LMS_CACHE_TTL_MS;
    } catch {
      // Ignore read errors
    }
  } else if (!isLocalDev) {
    // Check if local dev .env exists as fallback
    const localEnv = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(localEnv)) {
      try {
        const parsed = parseEnvContent(fs.readFileSync(localEnv, "utf8"));
        if (parsed.LMS_BASE_URL) existingBaseUrl = parsed.LMS_BASE_URL;
        if (parsed.LMS_USERNAME) existingUsername = parsed.LMS_USERNAME;
        if (parsed.TIMEOUT_MS) existingTimeout = parsed.TIMEOUT_MS;
        existingCacheTtlMs = parsed.LMS_CACHE_TTL_MS;
      } catch {
        // Ignore read errors
      }
    }
  }

  // 3. Ask user for inputs
  console.log("Vui lòng nhập thông tin đăng nhập LMS FIT HANU:\n");

  const baseUrlInput = await ask(`1. LMS Base URL [${existingBaseUrl}]: `);
  const baseUrl = (baseUrlInput || existingBaseUrl).replace(/\/$/, "");

  const usernamePrompt = existingUsername ? `2. Mã sinh viên [${existingUsername}]: ` : "2. Mã sinh viên (Username): ";
  const usernameInput = await ask(usernamePrompt);
  const username = usernameInput || existingUsername;
  if (!username) {
    console.error("❌ Mã sinh viên không được để trống!");
    process.exit(1);
  }

  const password = await ask("3. Mật khẩu LMS (sẽ được ẩn khi gõ): ", true);
  if (!password) {
    console.error("❌ Mật khẩu không được để trống!");
    process.exit(1);
  }

  const timeoutInput = await ask(`4. Request Timeout ms [${existingTimeout}]: `);
  const timeoutMs = timeoutInput || existingTimeout;

  // 4. Test login if requested
  const testLoginAnswer = await ask("\nBạn có muốn kiểm tra đăng nhập tới LMS ngay bây giờ không? (Y/n): ");
  if (!testLoginAnswer || testLoginAnswer.toLowerCase() === "y") {
    process.stdout.write("⏳ Đang thử kết nối và đăng nhập tới " + baseUrl + "...\n");
    try {
      const { AutoLoginAuthProvider } = await import("../dist/moodle/auth/auto-login-auth-provider.js");
      const provider = new AutoLoginAuthProvider({
        baseUrl,
        username,
        password,
        timeoutMs: Number(timeoutMs),
      });
      const creds = await provider.getCredentials();
      if (creds && creds.session) {
        console.log("✅ Đăng nhập thành công! LMS đã xác thực tài khoản.");
      }
    } catch (error) {
      console.warn("⚠️  Cảnh báo: Kiểm tra đăng nhập thất bại: " + (error?.message || error));
      console.warn("   (Bạn vẫn có thể tiếp tục lưu file .env và thử lại sau)");
      const proceed = await ask("Bạn có muốn tiếp tục lưu cấu hình này không? (Y/n): ");
      if (proceed && proceed.toLowerCase() !== "y") {
        console.log("Đã hủy bỏ thiết lập.");
        process.exit(0);
      }
    }
  }

  // 5. Save to .env with 0600 permissions and escaped values
  saveEnvFile(envPath, { baseUrl, timeoutMs, cacheTtlMs: existingCacheTtlMs, username, password });
  console.log(`\n🎉 Đã lưu cấu hình an toàn (permissions: 0600) vào: ${envPath}`);

  // 6. Define configurations for clients
  const mcpServerConfig = isLocalDev
    ? {
        command: nodePath,
        args: [`--env-file=${envPath}`, distIndexPath],
      }
    : {
        command: "npx",
        args: ["-y", "fit-lms-mcp"],
      };

  const openCodeConfig = isLocalDev
    ? {
        type: "local",
        command: [nodePath, `--env-file=${envPath}`, distIndexPath],
        enabled: true,
        timeout: 60000,
      }
    : {
        type: "local",
        command: ["npx", "-y", "fit-lms-mcp"],
        enabled: true,
        timeout: 60000,
      };

  // 7. Auto-detect and configure: Claude Code, OpenCode, Codex, Antigravity
  console.log("\n-------------------------------------------------");
  console.log("   Cấu hình AI Clients (Claude Code, OpenCode, Codex, Antigravity)");
  console.log("-------------------------------------------------");

  const clients = [
    {
      name: "Claude Code",
      detect: () => fs.existsSync(path.join(os.homedir(), ".claude.json")) || fs.existsSync(path.join(os.homedir(), ".claude")),
      getConfigPath: () => path.join(os.homedir(), ".claude.json"),
      key: "mcpServers",
      getConfig: () => mcpServerConfig,
    },
    {
      name: "OpenCode",
      detect: () => {
        const dir = path.join(os.homedir(), ".config/opencode");
        return fs.existsSync(dir) || fs.existsSync(path.join(dir, "opencode.jsonc")) || fs.existsSync(path.join(dir, "opencode.json"));
      },
      getConfigPath: () => {
        const dir = path.join(os.homedir(), ".config/opencode");
        if (fs.existsSync(path.join(dir, "opencode.jsonc"))) return path.join(dir, "opencode.jsonc");
        if (fs.existsSync(path.join(dir, "opencode.json"))) return path.join(dir, "opencode.json");
        return path.join(dir, "opencode.jsonc");
      },
      key: "mcp",
      getConfig: () => openCodeConfig,
    },
    {
      name: "Codex",
      detect: () => {
        const dir = path.join(os.homedir(), ".codex");
        const altDir = path.join(os.homedir(), ".config/codex");
        return fs.existsSync(dir) || fs.existsSync(altDir);
      },
      getConfigPath: () => {
        const dir = path.join(os.homedir(), ".codex");
        if (fs.existsSync(path.join(dir, "mcp.json"))) return path.join(dir, "mcp.json");
        return path.join(dir, "config.json");
      },
      key: "mcpServers",
      getConfig: () => mcpServerConfig,
    },
    {
      name: "Antigravity",
      detect: () => {
        const dir = path.join(os.homedir(), ".gemini");
        return fs.existsSync(dir);
      },
      getConfigPath: () => path.join(os.homedir(), ".gemini/config/mcp_config.json"),
      key: "mcpServers",
      getConfig: () => mcpServerConfig,
    },
  ];

  let detectedCount = 0;
  for (const client of clients) {
    if (client.detect()) {
      detectedCount++;
      const targetPath = client.getConfigPath();
      const answer = await ask(`Phát hiện ${client.name} (${targetPath}).\n  👉 Tự động đăng ký MCP vào ${client.name}? (Y/n): `);
      if (!answer || answer.toLowerCase() === "y") {
        const ok = updateJsonConfigFile(targetPath, client.getConfig(), client.key);
        if (ok) {
          console.log(`  ✅ Đã đăng ký thành công vào: ${targetPath}\n`);
        } else {
          console.log(`  ⚠️  Không thể tự động ghi file cấu hình ${client.name}.\n`);
        }
      }
    }
  }

  if (detectedCount === 0) {
    console.log("ℹ️  Chưa phát hiện tự động thư mục của Claude Code, OpenCode, Codex hoặc Antigravity.");
  }

  // 8. Output configurations for manual copy
  console.log("\n=================================================");
  console.log("   Cấu hình MCP cho các AI Client (Copy thủ công)");
  console.log("=================================================\n");

  const cliExample = isLocalDev
    ? `claude mcp add fit-lms -- ${nodePath} --env-file=${envPath} ${distIndexPath}`
    : `claude mcp add fit-lms -- npx -y fit-lms-mcp`;

  console.log("1. Claude Code:");
  console.log(`   Lệnh CLI: ${cliExample}`);
  console.log("   Hoặc trong ~/.claude.json:");
  console.log(JSON.stringify({ mcpServers: { "fit-lms": mcpServerConfig } }, null, 2));

  console.log("\n2. OpenCode (~/.config/opencode/opencode.jsonc):");
  console.log(JSON.stringify({ mcp: { "fit-lms": openCodeConfig } }, null, 2));

  console.log("\n3. Codex (~/.codex/config.json):");
  console.log(JSON.stringify({ mcpServers: { "fit-lms": mcpServerConfig } }, null, 2));

  console.log("\n4. Antigravity (~/.gemini/config/mcp_config.json):");
  console.log(JSON.stringify({ mcpServers: { "fit-lms": mcpServerConfig } }, null, 2));

  console.log("\n✨ Setup hoàn tất! Bạn có thể khởi động AI Client của mình để bắt đầu.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runSetup().catch((err) => {
    console.error("Lỗi:", err);
    process.exit(1);
  });
}
