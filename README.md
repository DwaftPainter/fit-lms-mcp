# HANU FIT LMS MCP

A Model Context Protocol (MCP) server providing authorized, read-only access to a student's HANU Faculty of Information Technology (FIT) Moodle LMS (`https://lms.fit.hanu.vn`).

It exposes enrolled courses, course assignments, upcoming deadlines, and course structure over stdio, with **automatic background authentication** and **interactive setup**.

## Cài MCP cho Moodle LMS FIT HANU

`fit-lms-mcp` kết nối Claude Code, Codex, OpenCode hoặc Antigravity với Moodle LMS của Khoa Công nghệ Thông tin, Trường Đại học Hà Nội (HANU). Sinh viên có thể xem môn học, tài liệu, bài tập và hạn nộp bằng tài khoản LMS của mình.

Cài Node.js 22 trở lên rồi chạy lệnh sau để thiết lập.

```bash
npx -y fit-lms-mcp@latest setup
```

Nhập mã sinh viên và mật khẩu LMS khi được hỏi. Chọn đăng ký MCP với ứng dụng AI mà setup phát hiện, rồi khởi động lại ứng dụng. Với Codex, tự động đăng ký cần lệnh `codex` trên `PATH`.

Sau khi kết nối, thử hỏi “Tuần này mình có bài tập nào sắp đến hạn?” hoặc “Cho mình xem tài liệu của môn Cơ sở dữ liệu”.

---

## 🚀 Quick Start

Requires **Node.js 22 or later**. Node.js 24 LTS is recommended. CI tests Node.js 22, 24, and 26 on Linux and macOS.

Run the interactive setup assistant directly with `npx`:

```bash
npx -y fit-lms-mcp@latest setup
```

Or, from a local workspace:

```bash
npm install
npm run setup
```

The interactive setup assistant will:

1. Prompt for your LMS student ID and password (safely masked).
2. Test the connection against HANU LMS immediately.
3. Save your configuration securely with `0600` permissions to `~/.fit-lms-mcp/.env` when run via `npx`, or the workspace `.env` when run from the package root.
4. Offer to register the MCP server with detected AI clients (**Claude Code**, **OpenCode**, **Codex**, or **Antigravity**). Automatic registration for Codex requires the `codex` CLI on your PATH.

After running setup, restart your AI client. The npm configuration uses `npx -y fit-lms-mcp@latest` so npm resolves the latest stable release whenever the client starts the MCP server.

### Updating an existing installation

If your client already uses `fit-lms-mcp@latest`, restart it to pick up a new release. For an older `npx` entry, change the package argument to `fit-lms-mcp@latest` and restart the client. You can keep using the credentials saved by setup.

If you installed the package globally, run `npm install -g fit-lms-mcp@latest` and restart your client.

---

## ⚙️ Manual Configuration

For a local workspace, copy the template, edit `.env`, and build:

```bash
cp .env.example .env
npm run build
```

For use via `npx`, create `~/.fit-lms-mcp/.env` with the settings below and restrict its permissions to `0600`.

| Variable | Description |
| :--- | :--- |
| `LMS_BASE_URL` | Required Moodle base URL, e.g. `https://lms.fit.hanu.vn` (no credentials, query or fragment) |
| `LMS_USERNAME` | Student ID / username for automatic login (Option 1 - Recommended) |
| `LMS_PASSWORD` | Password for automatic login (Option 1; automatically logs in and refreshes expired sessions) |
| `TIMEOUT_MS` | Optional request timeout in milliseconds (default: `5000`, maximum: `2147483647`) |
| `LMS_CACHE_TTL_MS` | Optional course metadata cache lifetime in milliseconds (default `900000`, maximum `2147483647`, `0` disables caching) |
| `LMS_MOODLE_SESSION` | MoodleSession cookie value (Option 2 - Manual legacy session) |
| `LMS_MOODLE_SESSKEY` | sesskey query parameter from the same session (Option 2 - Manual legacy session) |

*Configuration failures name the invalid setting without printing sensitive credential values. Workspace `.env` files are ignored by Git.*

When credentials are not already supplied through the environment, the server looks for `.env` in its working directory, then `~/.fit-lms-mcp/.env`. The first readable file is used. You can also provide settings through your AI client's environment configuration.

---

## 🤖 AI Client Integration

The following examples use the credentials saved by the `npx` setup flow.

### 1. Claude Code

Register via CLI:

```bash
claude mcp add fit-lms -- npx -y fit-lms-mcp@latest
```

Or add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "fit-lms": {
      "command": "npx",
      "args": ["-y", "fit-lms-mcp@latest"]
    }
  }
}
```

### 2. OpenCode

Add to `~/.config/opencode/opencode.jsonc` (or project `opencode.json`):

```json
{
  "mcp": {
    "fit-lms": {
      "type": "local",
      "command": ["npx", "-y", "fit-lms-mcp@latest"],
      "enabled": true,
      "timeout": 60000
    }
  }
}
```

### 3. Codex

Register via CLI:

```bash
codex mcp add fit-lms -- npx -y fit-lms-mcp@latest
```

Or add to `~/.codex/config.toml`:

```toml
[mcp_servers.fit-lms]
command = "npx"
args = ["-y", "fit-lms-mcp@latest"]
```

See the [Codex MCP documentation](https://developers.openai.com/codex/mcp/).

### 4. Antigravity

Add to `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "fit-lms": {
      "command": "npx",
      "args": ["-y", "fit-lms-mcp@latest"]
    }
  }
}
```

### 5. Cursor

Add to `~/.cursor/mcp.json` or `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "fit-lms": {
      "command": "npx",
      "args": ["-y", "fit-lms-mcp@latest"]
    }
  }
}
```

### 6. Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fit-lms": {
      "command": "npx",
      "args": ["-y", "fit-lms-mcp@latest"]
    }
  }
}
```

### Local Workspace Configuration

To run a local build with an explicit credentials file, replace the `npx` command and arguments with:

```json
{
  "command": "node",
  "args": [
    "--env-file=/absolute/path/to/fit-lms-mcp/.env",
    "/absolute/path/to/fit-lms-mcp/dist/index.js"
  ]
}
```

For OpenCode, use these values as a single command array. For Codex, use them as the `command` and `args` values in the TOML table above.

> [!TIP]
> On macOS with NVM, if your GUI application does not inherit terminal `$PATH`, replace `"npx"` or `"node"` with its full executable path (for example, the output of `which npx` or `which node`).

---

## 🛠️ MCP Tools

| Tool | Input | Output |
| :--- | :--- | :--- |
| `get_my_courses` | Optional `classification` (`all` by default, `inprogress`, `future`, `past`) and optional boolean `bypassCache` | Enrolled courses with ID, course name, short name, start/end dates, progress percentage, and LMS URL |
| `get_course_assignments` | Required positive integer `courseId` | List of visible assignments in the course with module ID, name, course ID, course name, and view link |
| `get_assignment_detail` | Required positive integer `courseModuleId` | Detailed assignment information: prompt instructions, submission status (*Submitted for grading*, *Draft*, *No submission*), grading status, due date, time remaining, last modified, and cutoff date |
| `get_upcoming_deadlines` | Optional `daysAhead` (1–365, default **7**), `includePast` (default false), `from`, `to`, `courseId` | Due events sorted in ascending order by due date, with verified course module ID and direct submission link |
| `get_course_contents` | Required positive integer `courseId` and optional boolean `bypassCache` | Course sections, module structure, activity titles, and resource metadata (excludes hidden/restricted items) |
| `get_course_announcements` | Required positive integer `courseId`, optional zero-based `page` (default **0**) | Up to 10 visible announcements in Moodle forum order, with title, message text, discussion link, and author and timestamp when available |
| `get_material_detail` | Required positive integers `courseId` and `courseModuleId` from `get_course_contents` | Name, type, Moodle link, and available details for File, Folder, Page, and URL modules, including file names and links, page text, or the destination URL |

Moodle may log the activity view or apply its view-based completion settings when the server reads an announcement forum or material page. Material lookups read metadata and page text without downloading files or opening external destinations.

Course lists and course contents are cached in memory for 15 minutes by default. Pass `bypassCache: true` to refresh from Moodle immediately after an enrollment or material change. Deadlines, submission status, announcements, and material details are fetched live.

### Tool Argument Examples

- List all enrolled courses:
  ```json
  {}
  ```
- Upcoming deadlines for the next 7 days:
  ```json
  {}
  ```
- Get detailed submission status and instructions for an assignment:
  ```json
  { "courseModuleId": 42 }
  ```
- Deadlines for the next 14 days for a specific course:
  ```json
  { "courseId": 660, "daysAhead": 14 }
  ```
- Get assignments for course ID 660:
  ```json
  { "courseId": 660 }
  ```

*Compatibility tools `assignments` and `deadlines` remain available for backwards compatibility.*

---

### Example Prompts

Once connected to your AI assistant, you can ask:

- "List my enrolled courses on HANU FIT LMS."
- "Show all assignments and upcoming deadlines for the next 7 days."
- "What topics and materials are in course 660?"
- "Show the announcements for course 660."
- "Open the details of the exam guide listed in course 660."

---

## 🔐 Authentication & Session Management

### Option 1: Automatic Login (Recommended)
Set `LMS_USERNAME` and `LMS_PASSWORD` in your `.env`.
- When called, the server automatically executes the 3-step Moodle authentication flow (`logintoken` CSRF retrieval ➔ POST credentials ➔ extract `MoodleSession` cookie ➔ extract `sesskey`).
- Credentials and session tokens are cached in memory.
- If a session expires during use, `MoodleClient` **transparently re-authenticates and retries the request once** in the background.

### Option 2: Manual Session Cookies (Legacy)
If you prefer not to store student credentials in `.env`, provide `LMS_MOODLE_SESSION` and `LMS_MOODLE_SESSKEY`:
1. Log in to `https://lms.fit.hanu.vn` in your browser.
2. In DevTools (F12) ➔ Application/Storage ➔ Cookies, copy `MoodleSession`.
3. In DevTools ➔ Network, filter for `/lib/ajax/service.php` and copy the `sesskey` parameter.
4. Paste both into `.env`.

---

## 🧪 Verification & Testing

Run the automated test suite (synthetic fixtures, local HTTP server, zero network credentials needed):

```bash
npm test
npm run build
```

To run the opt-in live smoke verification against HANU LMS:

```bash
LMS_LIVE_SMOKE=1 node --env-file=.env scripts/smoke-live.mjs
```

---

## 📂 Source Layout

- `src/config/env.ts`: Validates environment settings and credentials.
- `src/moodle/auth/`: Contains `AutoLoginAuthProvider`, `ManualSessionProvider`, and `provider-factory.ts`.
- `src/moodle/client.ts`: Reusable Moodle HTTP client with batching and transparent auth retry.
- `src/services/`: Course, assignment, deadline, and course content services.
- `src/tools/` & `src/mcp/tools/`: MCP tool definitions and schemas.
- `scripts/setup.mjs`: Interactive setup assistant.

## Publishing Releases

Version 2.0.0 requires Node.js 22 or later; Node.js 18 and 20 are no longer supported.

The `publish.yml` workflow publishes on a `v*` Git tag push or a manual workflow run. Creating a GitHub Release does not trigger a second publish. Update `package.json` and `package-lock.json` before tagging a release, and make the tag match the package version (for example, `v2.0.0`). Published npm versions cannot be reused, even after unpublishing.

For manual runs, the `tag` input selects the npm distribution channel: `latest`, `beta`, or `next`. To publish the stable version `2.0.0` from `package.json`, select `latest`. The package version (`2.0.0`), Git tag (`v2.0.0`), and npm channel (`latest`) are separate values.

Publishing uses npm trusted publishing (OIDC) from a GitHub-hosted runner with Node.js 24 and npm 11. No `NPM_TOKEN` secret is required. Configure the package's Trusted Publisher on npm with:

- **Organization or user:** `DwaftPainter`
- **Repository:** `fit-lms-mcp` (without `@`)
- **Workflow filename:** `publish.yml`
- **Environment name:** leave empty; this workflow does not select an environment
- **Allowed actions:** enable `Allow npm publish`

Required fields in an existing trusted publisher cannot be edited; recreate the connection if they are incorrect. See the [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

## 📄 License

MIT © [DwaftPainter](https://github.com/DwaftPainter)
