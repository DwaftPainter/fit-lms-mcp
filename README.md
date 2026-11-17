# HANU FIT LMS MCP

A Model Context Protocol (MCP) server providing authorized, read-only access to a student's HANU Faculty of Information Technology (FIT) Moodle LMS (`https://lms.fit.hanu.vn`).

It exposes enrolled courses, course assignments, upcoming deadlines, and course structure over stdio, with **automatic background authentication** and **interactive setup**.

---

## 🚀 Quick Start

Requires **Node.js 22 or later**. Node.js 24 LTS is recommended. CI tests Node.js 22, 24, and 26 on Linux and macOS.

Run the interactive setup assistant directly with `npx`:

```bash
npx fit-lms-mcp setup
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
4. Offer to register the MCP server with detected AI clients (**Claude Code**, **OpenCode**, **Codex**, or **Antigravity**). For Codex, use the manual configuration below.

After running setup, you can use the MCP server directly in your AI client with `npx -y fit-lms-mcp`.

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
claude mcp add fit-lms -- npx -y fit-lms-mcp
```

Or add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "fit-lms": {
      "command": "npx",
      "args": ["-y", "fit-lms-mcp"]
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
      "command": ["npx", "-y", "fit-lms-mcp"],
      "enabled": true,
      "timeout": 60000
    }
  }
}
```

### 3. Codex

Register via CLI:

```bash
codex mcp add fit-lms -- npx -y fit-lms-mcp
```

Or add to `~/.codex/config.toml`:

```toml
[mcp_servers.fit-lms]
command = "npx"
args = ["-y", "fit-lms-mcp"]
```

See the [Codex MCP documentation](https://developers.openai.com/codex/mcp/). The setup assistant currently writes a JSON configuration for Codex; use the CLI command or TOML configuration above instead.

### 4. Antigravity

Add to `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "fit-lms": {
      "command": "npx",
      "args": ["-y", "fit-lms-mcp"]
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
      "args": ["-y", "fit-lms-mcp"]
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
      "args": ["-y", "fit-lms-mcp"]
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
| `get_my_courses` | Optional `classification`: `all` (default), `inprogress`, `future`, `past` | Enrolled courses with ID, course name, short name, start/end dates, progress percentage, and LMS URL |
| `get_course_assignments` | Required positive integer `courseId` | List of visible assignments in the course with module ID, name, course ID, course name, and view link |
| `get_upcoming_deadlines` | Optional `daysAhead` (1–365, default **7**), `includePast` (default false), `from`, `to`, `courseId` | Due events sorted in ascending order by due date, with verified course module ID and direct submission link |
| `get_course_contents` | Required positive integer `courseId` | Course sections, module structure, activity titles, and resource metadata (excludes hidden/restricted items) |

### Tool Argument Examples

- List all enrolled courses:
  ```json
  {}
  ```
- Upcoming deadlines for the next 7 days:
  ```json
  {}
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

Publishing uses npm trusted publishing (OIDC) from a GitHub-hosted runner with Node.js 24 and npm 11. No `NPM_TOKEN` secret is required. Configure the package's Trusted Publisher on npm with:

- **Organization or user:** `DwaftPainter`
- **Repository:** `fit-lms-mcp` (without `@`)
- **Workflow filename:** `publish.yml`
- **Environment name:** leave empty; this workflow does not select an environment
- **Allowed actions:** enable `Allow npm publish`

Required fields in an existing trusted publisher cannot be edited; recreate the connection if they are incorrect. See the [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

## 📄 License

MIT © [DwaftPainter](https://github.com/DwaftPainter)
