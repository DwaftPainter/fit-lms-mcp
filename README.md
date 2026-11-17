# HANU FIT LMS MCP

A local, read-only Model Context Protocol (MCP) server for HANU Faculty of Information Technology (FIT) Moodle LMS (`https://lms.fit.hanu.vn`).
It exposes enrolled courses, course assignments, upcoming deadlines, and course structure over stdio to your AI assistants.

## Quick Setup

Requires **Node.js 22 or later**. Node.js 24 LTS is recommended. CI tests Node.js 22, 24, and 26 on Linux and macOS.

Run the interactive setup assistant to configure your credentials and automatically register the MCP server into your AI tools (**Claude Code**, **OpenCode**, **Codex**, or **Antigravity**):

```bash
npx fit-lms-mcp setup
```

The setup assistant will:
1. Prompt for your LMS Student ID and Password (passwords are masked in the terminal).
2. Test authentication directly against `https://lms.fit.hanu.vn`.
3. Save the configuration securely to `~/.fit-lms-mcp/.env` with strict `0600` permissions (`-rw-------`).
4. Automatically register the MCP server with detected AI clients.

## AI Client Configuration

If you prefer to configure your AI client manually, use the following configuration templates. When running via `npx -y fit-lms-mcp`, credentials stored in `~/.fit-lms-mcp/.env` are automatically loaded. Alternatively, you can supply credentials via the `env` block.

### 1. Claude Code

Run the CLI command:
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

Add to `~/.config/opencode/opencode.jsonc`:
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

Add to `~/.codex/config.json`:
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

## Environment Variables

| Variable | Description |
| --- | --- |
| `LMS_BASE_URL` | Base Moodle URL (default: `https://lms.fit.hanu.vn`) |
| `LMS_USERNAME` | Student ID / username for automatic authentication |
| `LMS_PASSWORD` | Student password for automatic authentication |
| `LMS_MOODLE_SESSION` | *(Optional / Legacy)* MoodleSession cookie value |
| `LMS_MOODLE_SESSKEY` | *(Optional / Legacy)* Sesskey query parameter |
| `TIMEOUT_MS` | Request timeout in milliseconds (default: `5000`) |

### Authentication & Security
* **Automatic Login & Re-Authentication**: By configuring `LMS_USERNAME` and `LMS_PASSWORD`, the server performs the form login on Moodle, caches the session in memory, and transparently re-authenticates whenever the session expires.
* **Strictly Read-Only**: The server only reads course information and deadlines. It never submits assignments, modifies course data, or downloads private files. Credentials are never echoed in logs or error messages.

## Tools

| Tool | Parameters | Description |
| --- | --- | --- |
| `get_my_courses` | `classification` (optional: `all`, `inprogress`, `future`, `past`) | Retrieves enrolled courses, IDs, full names, progress, and URLs |
| `get_course_assignments` | `courseId` (required integer) | Lists all visible assignments in a course with module IDs and URLs |
| `get_upcoming_deadlines` | `daysAhead` (optional integer, default `7`), `includePast`, `from`, `to`, `courseId` | Retrieves upcoming assignment deadlines sorted chronologically |
| `get_course_contents` | `courseId` (required integer) | Fetches structured course sections, module metadata, and visible topics |

### Example Prompts
Once connected to your AI assistant, you can ask queries such as:
* *"List my enrolled courses on HANU FIT LMS."*
* *"Show all assignments and upcoming deadlines for the next 7 days."*
* *"What topics and materials are in course 660?"*

## License

MIT
