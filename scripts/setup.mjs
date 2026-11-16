#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { execSync } from "node:child_process";

function ask(question, isPassword = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (isPassword && process.stdin.isTTY) {
      process.stdout.write(question);
      let input = "";
      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();

      const onData = (chunk) => {
        const str = chunk.toString("utf8");
        for (const c of str) {
          if (c === "\r" || c === "\n" || c === "\u0004") {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener("data", onData);
            process.stdout.write("\n");
            rl.close();
            resolve(input);
            return;
          } else if (c === "\u0003") {
            stdin.setRawMode(false);
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
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

function updateJsonConfigFile(configPath, serverConfig) {
  let json = {};
  if (fs.existsSync(configPath)) {
    try {
      json = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
      json = {};
    }
  }
  if (!json.mcpServers) json.mcpServers = {};
  json.mcpServers["hanu-lms"] = serverConfig;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(json, null, 2), "utf8");
}

async function main() {
  console.log("\n=================================================");
  console.log("   HANU LMS MCP — Interactive Setup Assistant");
  console.log("=================================================\n");

  const cwd = process.cwd();
  const envPath = path.resolve(cwd, ".env");
  const distIndexPath = path.resolve(cwd, "dist/index.js");
  const nodePath = process.execPath;

  // 1. Ensure build exists
  if (!fs.existsSync(distIndexPath)) {
    console.log("📦 Chưa tìm thấy bản build, đang tiến hành build TypeScript sang dist/...");
    try {
      execSync("npm run build", { stdio: "inherit" });
      console.log("✅ Build hoàn tất.\n");
    } catch {
      console.error("❌ Lỗi khi build project. Vui lòng kiểm tra lại npm run build.");
      process.exit(1);
    }
  }

  // 2. Load existing .env if present
  let existingBaseUrl = "https://lms.fit.hanu.vn";
  let existingUsername = "";
  let existingTimeout = "5000";

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("LMS_BASE_URL=")) existingBaseUrl = trimmed.split("=")[1].trim();
      if (trimmed.startsWith("LMS_USERNAME=")) existingUsername = trimmed.split("=")[1].trim();
      if (trimmed.startsWith("TIMEOUT_MS=")) existingTimeout = trimmed.split("=")[1].trim();
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

  // 5. Save to .env
  const envContent = [
    `LMS_BASE_URL=${baseUrl}`,
    `TIMEOUT_MS=${timeoutMs}`,
    "",
    "# Auto-login credentials",
    `LMS_USERNAME=${username}`,
    `LMS_PASSWORD=${password}`,
    "",
  ].join("\n");

  fs.writeFileSync(envPath, envContent, "utf8");
  console.log(`\n🎉 Đã lưu cấu hình an toàn vào: ${envPath}`);

  // 6. Generate MCP server config
  const mcpServerConfig = {
    command: nodePath,
    args: [`--env-file=${envPath}`, distIndexPath],
  };

  const jsonSnippet = JSON.stringify({ mcpServers: { "hanu-lms": mcpServerConfig } }, null, 2);

  // 7. Auto-configure Claude Desktop or Cursor if available on macOS
  const platform = os.platform();
  const claudePath = platform === "darwin"
    ? path.join(os.homedir(), "Library/Application Support/Claude/claude_desktop_config.json")
    : null;
  const cursorPath = path.join(os.homedir(), ".cursor/mcp.json");

  console.log("\n-------------------------------------------------");
  console.log("   Cấu hình AI Client (Claude Desktop / Cursor / VS Code)");
  console.log("-------------------------------------------------");

  if (claudePath && fs.existsSync(path.dirname(claudePath))) {
    const addClaude = await ask("Tự động đăng ký MCP vào Claude Desktop? (Y/n): ");
    if (!addClaude || addClaude.toLowerCase() === "y") {
      updateJsonConfigFile(claudePath, mcpServerConfig);
      console.log(`✅ Đã cập nhật file: ${claudePath}`);
    }
  }

  const addCursor = await ask("Tự động đăng ký MCP vào Cursor (~/.cursor/mcp.json)? (Y/n): ");
  if (!addCursor || addCursor.toLowerCase() === "y") {
    updateJsonConfigFile(cursorPath, mcpServerConfig);
    console.log(`✅ Đã cập nhật file: ${cursorPath}`);
  }

  console.log("\n📋 Đoạn cấu hình JSON của bạn (để copy thủ công khi cần):");
  console.log(jsonSnippet);
  console.log("\n✨ Setup hoàn tất! Khởi động lại Cursor hoặc Claude Desktop để bắt đầu sử dụng.");
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
