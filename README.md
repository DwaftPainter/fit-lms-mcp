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
- `deadlines`: assignment due events from the authenticated student's calendar. Optional `from` and `to` are inclusive ISO 8601 due-date bounds with a timezone; `from` defaults to the current time. Optional `courseId` filters one course.

For example, call `deadlines` with `{}` for upcoming deadlines, or with
`{"from":"2026-01-01T00:00:00+07:00","to":"2026-12-31T23:59:59+07:00","courseId":900001}`.
Each result includes `eventId`, `title`, `courseId`, `courseName`, `dueDate` (UTC ISO 8601), and a read-only assignment `url` or `null`.

The deadline tool follows calendar pages using both the last event's `timesort` and ID, deduplicates by event ID, and sorts by actual due date (`timestart`). It scans from Unix time zero and applies date filters locally because action sort time can differ from the due date. A stalled cursor or a traversal beyond 100 pages returns an error instead of a partial list. Events without a usable due date are omitted. Calendar action events do not cover every assignment and do not establish submission status or cutoff dates.

## Project Structure

```
hanu-lms-mcp/
├── src/
│   ├── tools/        # MCP Tools
│   │   └── ExampleTool.ts
│   └── index.ts      # Server entry point
├── package.json
└── tsconfig.json
```

## Adding Components

The project comes with an example tool in `src/tools/ExampleTool.ts`. You can add more tools using the CLI:

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

1. Make changes to your tools
2. Run `npm run build` to compile
3. The server will automatically load your tools on startup

## Learn More

- [MCP Framework Github](https://github.com/QuantGeekDev/mcp-framework)
- [MCP Framework Docs](https://mcp-framework.com)
