# hanu-lms-mcp

A Model Context Protocol (MCP) server built with mcp-framework.

## Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

```

## Configuration

Set these environment variables in the process that starts the server:

| Variable | Requirement |
| --- | --- |
| `LMS_BASE_URL` | Required HTTP(S) Moodle base URL, without credentials, query, or fragment |
| `LMS_MOODLE_SESSION` | Required Moodle session cookie value |
| `LMS_MOODLE_SESSKEY` | Required Moodle session key |
| `TIMEOUT_MS` | Optional positive integer in milliseconds; defaults to `5000` |

The server checks configuration before starting. If a setting is missing or invalid, it exits with an error naming the setting, without printing credential values. Replace the credential placeholders in the examples below with your own values. Copying `.env.example` to `.env` does not load that file automatically; pass its values through your process environment or your MCP client's `env` configuration. This check confirms credential presence, not whether the session is still valid.

## Documentation

- [HAN-9 — Moodle authentication and request contract](docs/Moodle_Authentication_Request_Contract.md)
- [HAN-12 — Assignment and deadline endpoint discovery](docs/Moodle_Assignment_Deadline_Endpoint_Discovery.md)

## Available tools

- `get_my_courses`: enrolled courses, optionally filtered by `classification` (`all`, `inprogress`, `future`, `past`).
- `assignments`: visible assignment links from authenticated assignment index pages. Optional `courseId` selects an enrolled course; omit it to scan all enrolled courses. Each result contains `courseModuleId`, `title`, `courseId`, `courseName`, and a read-only `url`. The course-module ID identifies the assignment page, not the assignment database record. This tool does not infer due dates, cutoff dates, or submission status from localized HTML.
- `deadlines`: assignment due events from the authenticated student's calendar. Optional `from` and `to` are inclusive ISO 8601 due-date bounds with a timezone; `from` defaults to the current time. Optional `courseId` filters one course.

For example, call `deadlines` with `{}` for upcoming deadlines, or with
`{"from":"2026-01-01T00:00:00+07:00","to":"2026-12-31T23:59:59+07:00","courseId":900001}`.
Each result includes `eventId`, `title`, `courseId`, `courseName`, `dueDate` (UTC ISO 8601), and a read-only assignment `url` or `null`.

The deadline tool follows calendar pages using both the last event's `timesort` and ID, deduplicates by event ID, and sorts by actual due date (`timestart`). It scans from Unix time zero and applies date filters locally because action sort time can differ from the due date. A stalled cursor or a traversal beyond 100 pages returns an error instead of a partial list. Events without a usable due date are omitted. Calendar action events do not cover every assignment and do not establish submission status or cutoff dates.

Course listing follows `nextoffset`, deduplicates by course ID, and fails on stalled pagination or the 100-page safety limit. The assignment HTML parser expects a Moodle assignment index body, its main region and assignment table (or an empty-index notification). Unexpected layouts fail explicitly. Session redirects are rejected; refresh the configured credentials when Moodle requests login. Index requests are sequential and read only. Returned assignment URLs exclude session keys and action parameters.

## Project Structure

```
hanu-lms-mcp/
├── src/
│   ├── config/      # Environment validation
│   ├── mcp/         # Server registration and course tool
│   ├── moodle/      # Authenticated HTTP client, API adapters and response schemas
│   ├── services/    # Course, assignment and deadline retrieval
│   ├── tools/       # Assignment and deadline MCP tools
│   └── index.ts     # Server entry point
├── tests/
│   ├── unit/        # Validation, parsing, pagination and error cases
│   └── integration/ # Stdio MCP against a local synthetic Moodle server
├── package.json
└── tsconfig.json
```

## Adding Components

Add tools in `src/tools/` using the CLI:

```bash
# Add a new tool
mcp add tool my-tool

# Example tools you might create:
mcp add tool data-processor
mcp add tool api-client
mcp add tool file-handler
```

## Tool Development

Example tool structure:

```typescript
import { MCPTool } from "mcp-framework";
import { z } from "zod";

interface MyToolInput {
  message: string;
}

class MyTool extends MCPTool<MyToolInput> {
  name = "my_tool";
  description = "Describes what your tool does";

  schema = {
    message: {
      type: z.string(),
      description: "Description of this input parameter",
    },
  };

  async execute(input: MyToolInput) {
    // Your tool logic here
    return `Processed: ${input.message}`;
  }
}

export default MyTool;
```

## Publishing to npm

1. Update your package.json:
   - Ensure `name` is unique and follows npm naming conventions
   - Set appropriate `version`
   - Add `description`, `author`, `license`, etc.
   - Check `bin` points to the correct entry file

2. Build and test locally:
   ```bash
   npm run build
   npm link
   hanu-lms-mcp  # Test your CLI locally
   ```

3. Login to npm (create account if necessary):
   ```bash
   npm login
   ```

4. Publish your package:
   ```bash
   npm publish
   ```

After publishing, users can add it to their claude desktop client (read below) or run it with npx
```

## Using with Claude Desktop

### Local Development

Add this configuration to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "hanu-lms-mcp": {
      "command": "node",
      "args":["/absolute/path/to/hanu-lms-mcp/dist/index.js"],
      "env": {
        "LMS_BASE_URL": "https://lms.fit.hanu.vn",
        "LMS_MOODLE_SESSION": "your_moodle_session_cookie",
        "LMS_MOODLE_SESSKEY": "your_moodle_sesskey"
      }
    }
  }
}
```

### After Publishing

Add this configuration to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "hanu-lms-mcp": {
      "command": "npx",
      "args": ["hanu-lms-mcp"],
      "env": {
        "LMS_BASE_URL": "https://lms.fit.hanu.vn",
        "LMS_MOODLE_SESSION": "your_moodle_session_cookie",
        "LMS_MOODLE_SESSKEY": "your_moodle_sesskey"
      }
    }
  }
}
```

## Building and Testing

```bash
npm test
npm run build
```

Tests compile the project and run unit tests plus a stdio MCP integration test against a local synthetic Moodle HTTP server. They do not require `.env` or a real student session. They cover tool discovery, course → assignment/deadline retrieval, pagination, empty results, expired sessions, unsafe links and timeouts. The framework also discovers tools in `src/tools/` at startup; the course tool is registered explicitly.

Live LMS verification requires valid session credentials. On 2026-11-16, the local session returned `AUTH_REQUIRED`; the new implementation has not been verified against a refreshed session. HTML theme differences, complete live pagination, tied live timestamps and student/group overrides remain to be verified.

## Learn More

- [MCP Framework Github](https://github.com/QuantGeekDev/mcp-framework)
- [MCP Framework Docs](https://mcp-framework.com)
