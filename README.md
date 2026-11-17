# FIT LMS MCP

A Model Context Protocol (MCP) server providing authorized, read-only access to a student's HANU Faculty of Information Technology (FIT) Moodle LMS (`https://lms.fit.hanu.vn`).

It exposes enrolled courses, course assignments, upcoming deadlines, and course structure over stdio, with **automatic background authentication** and **interactive setup**.

---

## 🚀 Quick Start

### Option 1: Use directly with `npx` (No Git clone needed)

You can run the interactive setup assistant anywhere:

```bash
npx fit-lms-setup
```

Then register the server in your AI client using `npx -y fit-lms-mcp`.

---

### Option 2: Clone and run locally

```bash
git clone https://github.com/DwaftPainter/fit-lms-mcp.git
cd fit-lms-mcp
npm install
npm run setup
```

The interactive setup assistant will:
1. Prompt for your LMS student ID and password (safely masked).
2. Test the connection against HANU LMS immediately.
3. Save your `.env` configuration file securely with `0600` permissions.
4. Automatically register the MCP server into **Claude Code**, **OpenCode**, **Codex**, or **Antigravity**.

---

## ⚙️ Manual Configuration

If you prefer to configure manually, copy the template and edit [.env](file:///.env):

```bash
cp .env.example .env
npm run build
```

| Variable | Description |
| :--- | :--- |
| `LMS_BASE_URL` | Required Moodle base URL, e.g. `https://lms.fit.hanu.vn` (no credentials, query or fragment) |
| `LMS_USERNAME` | Student ID / username for automatic login (Option 1 - Recommended) |
| `LMS_PASSWORD` | Password for automatic login (Option 1; automatically logs in and refreshes expired sessions) |
| `TIMEOUT_MS` | Optional request timeout in milliseconds (default: `5000`, maximum: `2147483647`) |
| `LMS_MOODLE_SESSION` | MoodleSession cookie value (Option 2 - Manual legacy session) |
| `LMS_MOODLE_SESSKEY` | sesskey query parameter from the same session (Option 2 - Manual legacy session) |

*Configuration failures name the invalid setting without printing sensitive credential values. Saved `.env` files are ignored by Git.*

---

## 🤖 AI Client Integration

### 1. Claude Code
Register via CLI:
```bash
claude mcp add fit-lms -- node --env-file=/absolute/path/to/fit-lms-mcp/.env /absolute/path/to/fit-lms-mcp/dist/index.js
```
Or add to `~/.claude.json`:
```json
{
  "mcpServers": {
    "fit-lms": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/fit-lms-mcp/.env",
        "/absolute/path/to/fit-lms-mcp/dist/index.js"
      ]
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
      "command": [
        "node",
        "--env-file=/absolute/path/to/fit-lms-mcp/.env",
        "/absolute/path/to/fit-lms-mcp/dist/index.js"
      ],
      "enabled": true,
      "timeout": 60000
    }
  }
}
```

### 3. Antigravity
Add to `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "fit-lms": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/fit-lms-mcp/.env",
        "/absolute/path/to/fit-lms-mcp/dist/index.js"
      ]
    }
  }
}
```

### 4. Cursor
Add to `~/.cursor/mcp.json` or `.cursor/mcp.json` in your project:
```json
{
  "mcpServers": {
    "fit-lms": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/fit-lms-mcp/.env",
        "/absolute/path/to/fit-lms-mcp/dist/index.js"
      ]
    }
  }
}
```

### 5. Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "fit-lms": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/fit-lms-mcp/.env",
        "/absolute/path/to/fit-lms-mcp/dist/index.js"
      ]
    }
  }
}
```

> [!TIP]
> On macOS with NVM, if your GUI application does not inherit terminal `$PATH`, replace `"node"` with your full Node executable path (e.g. `which node`).

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

## 📄 License

MIT © [DwaftPainter](https://github.com/DwaftPainter)
