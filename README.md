# HANU LMS MCP

A local, read-only MCP server for a student's authorized HANU Moodle data.
It exposes enrolled courses, course assignments, upcoming deadlines and course
structure over stdio, using an existing Moodle session.

## Setup

```bash
npm ci --ignore-scripts
cp .env.example .env
# Fill in your own current session values in .env.
npm run build
```

The runtime supports Node.js 18.19+. The `--env-file` examples below require
Node.js 20.6+; with older Node versions, supply the variables through your MCP
client's environment instead. The server itself does not automatically load `.env`.

| Variable | Meaning |
| --- | --- |
| `LMS_BASE_URL` | Required HTTP(S) Moodle base URL, e.g. `https://lms.fit.hanu.vn`; no credentials, query or fragment |
| `LMS_MOODLE_SESSION` | Required value of your own `MoodleSession` cookie |
| `LMS_MOODLE_SESSKEY` | Required sesskey from the same browser login session |
| `TIMEOUT_MS` | Optional request timeout in milliseconds, including response-body reading; default `5000`, maximum `2147483647` |

Configuration failures name the invalid setting without printing its value.
Cookie delimiters/control characters and unsafe sesskeys are rejected. Real
`.env*` files are ignored by Git; `.env.example` contains placeholders only.

## Tools

| Tool | Input | Result |
| --- | --- | --- |
| `get_my_courses` | Optional `classification`: `all` (default), `inprogress`, `future`, `past` | Normalized enrolled courses, including IDs, names and optional dates/progress/URLs |
| `get_course_assignments` | Required positive `courseId` | Visible assignments with `id`, `idType`, `name`, `courseId`, `courseName`, `url` |
| `get_upcoming_deadlines` | Optional `daysAhead` (1–365, default **7**), `includePast` (default false), `from`, `to`, `courseId` | Assignment due events sorted by due date, with course names and identifiers |
| `get_course_contents` | Required positive `courseId` | `{courseId, courseName, sections}`; each section contains its number, title, visibility and accessible module metadata |

Examples of tool arguments:

```json
{}
```

Use `{}` with `get_my_courses` or `get_upcoming_deadlines`. Select a course ID from
the course results for the other two tools:

```json
{ "courseId": 900001 }
```

```json
{ "daysAhead": 14, "courseId": 900001 }
```

```json
{ "from": "2026-11-01T00:00:00+07:00", "to": "2026-11-30T23:59:59+07:00" }
```

Deadline `from`/`to` bounds are inclusive ISO 8601 timestamps with a timezone.
Explicit bounds override the default window. Without `from`, `includePast: true`
starts at Unix time zero; otherwise the lower bound is now. Without `to`, the
upper bound is now plus `daysAhead` × 24 hours. Dates are returned as UTC ISO 8601.

Assignment `id` and course-content module `id` identify **course modules**, not
assignment database records; assignment results state `idType: "courseModule"`.
Deadlines include `eventId`, `title`, `courseId`, `courseName`, `dueDate`, `url` and
`courseModuleId` (or `null` when a verified view link is unavailable). Unverified
open/cutoff dates and submission state are omitted rather than inferred.

The existing `assignments` and `deadlines` tools remain available for compatibility.
`assignments` accepts an optional course ID and keeps its `courseModuleId`/`title`
output. `deadlines` keeps its explicit date filters and unbounded future default;
use `get_upcoming_deadlines` for the seven-day default.

## Connect OpenCode

Merge this entry into `mcp` in `~/.config/opencode/opencode.jsonc` for global use,
or `opencode.json` in a project. Replace both absolute paths with your checkout.

```json
{
  "mcp": {
    "hanu-lms": {
      "type": "local",
      "command": [
        "node",
        "--env-file=/absolute/path/to/hanu-lms-mcp/.env",
        "/absolute/path/to/hanu-lms-mcp/dist/index.js"
      ],
      "enabled": true,
      "timeout": 60000
    }
  }
}
```

For desktop environments without Node on `PATH`, replace `node` with its absolute
executable path. Run `opencode mcp list`, reopen OpenCode after rebuilding, and ask:

```text
Use hanu-lms to list my courses, then show what I need to submit in the next 7 days.
```

For Claude Desktop, the equivalent entry under `mcpServers` is:

```json
{
  "mcpServers": {
    "hanu-lms": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/hanu-lms-mcp/.env",
        "/absolute/path/to/hanu-lms-mcp/dist/index.js"
      ]
    }
  }
}
```

## Refresh the session

1. Sign in normally to your own LMS account in your browser.
2. In browser DevTools, obtain the `MoodleSession` cookie from Application/Storage
   and the `sesskey` query value from a normal `/lib/ajax/service.php` Network
   request. Copy both from the same current login into your local `.env`.
3. Restart/reconnect the MCP server in the client. Rebuild only if code changed.

Do not paste live values into chat, screenshots, issues, logs or source control.
The server does not collect passwords or perform automatic login. `AUTH_REQUIRED`
means Moodle requested authentication. `INVALID_SESSION_KEY` means an invalid
sesskey and does not prove that the session expired. An empty course list alone
does not prove authentication failure. A remote `missingparam` may concern any
method argument; only a known missing local sesskey maps to `MISSING_SESSION_KEY`.

## Verification

```bash
npm test
npm run build
```

Default tests use synthetic fixtures and a local HTTP server. They do not contact
HANU or require credentials. They cover ordered batches, root/array errors,
malformed responses, response-size limits, timeouts, schema validation, date
filtering, hidden resources and actual stdio calls to all four canonical tools.

Live verification is opt-in and excluded from the default test command/CI:

```bash
# After building; Node.js 20.6+ for --env-file.
LMS_LIVE_SMOKE=1 node --env-file=.env scripts/smoke-live.mjs

# When the required environment variables are already supplied:
LMS_LIVE_SMOKE=1 npm run test:live
```

Without `LMS_LIVE_SMOKE=1`, the live script exits before connecting. The authorized
smoke test exercises all four tools over stdio for enrolled courses and a two-call
AJAX batch. It prints only check results and counts. See the dated
[MVP verification report](docs/MVP_Verification.md) for actual live evidence.

## Retrieval and limits

- Moodle AJAX calls use a session cookie and sesskey. `callBatch` supports up to
  50 calls, associates results by array position and verifies response count.
  A failed call rejects the batch with a safe typed error and its `requestIndex`;
  no partial successful list is returned. Nested JSON strings remain strings until
  a method-specific adapter explicitly decodes them.
- Requests reject redirects, apply a timeout through body reading, limit responses
  to 8 MiB and discard raw server messages/stacks. Authentication failures are not
  retried. Returned links use the configured LMS and omit session keys/actions.
- Courses follow `nextoffset`, with deduplication and a 100-page safety limit.
- Assignment lists and course contents use authenticated HTML. The tested LMS does
  not expose `mod_assign_get_assignments` or `core_course_get_contents` through
  session AJAX. Supported Moodle page structures are checked explicitly; other
  layouts fail rather than silently report an empty course. Hidden/restricted
  resources are omitted. No resource files are downloaded automatically.
- Deadlines scan calendar action events from zero, advance both `timesort` and
  event ID, deduplicate and filter on actual due time (`timestart`). Stalled cursors
  or more than 100 pages fail explicitly. Events without usable dates are omitted.
  Calendar action events are not an exhaustive assignment/submission history.
- Student/group overrides and cutoff-date semantics remain unverified. Browser
  capture confirms a displayed due date, not every possible override scenario.

## Source layout and contracts

`src/config` validates environment configuration; `src/moodle` owns transport,
authentication and parsing; `src/services` normalizes results; `src/tools` and
`src/mcp/tools` expose MCP schemas. `src/mcp/server.ts` registers the tools.

- [Authentication and request contract](docs/Moodle_Authentication_Request_Contract.md)
- [Assignment and deadline discovery](docs/Moodle_Assignment_Deadline_Endpoint_Discovery.md)
- [MVP verification and known limitations](docs/MVP_Verification.md)
- [Implementation plan and Linear issue index](tasks/plan.md)
