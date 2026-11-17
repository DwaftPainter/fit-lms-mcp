# HAN-12 — Assignment & Deadline Endpoint Discovery

**Status:** Calendar deadline path verified by HTTP and by isolated Chrome Network capture; see sections 7–8 for current implementation and evidence.\
**Verified:** 2026-10-21, approximately 17:59–18:02 UTC+07:00\
**Issue:** [HAN-12](https://linear.app/hanoi-university/issue/HAN-12/discover-assignment-and-deadline-moodle-endpoints)\
**Scope:** Read-only access to enrolled courses and their assignment pages.\
**Authentication reference:** [HAN-9 — Moodle Authentication & Request Contract](Moodle_Authentication_Request_Contract.md)

## 1. Verification method and results

Requests used Node.js `fetch` with `LMS_BASE_URL`, `LMS_MOODLE_SESSION`, and `LMS_MOODLE_SESSKEY` from `.env`. No automatic login or submission action was performed. Raw responses and credentials were not saved in the repository.

This was an authenticated HTTP check, **not a browser DevTools capture**. Date comparisons used the `Due` text in authenticated assignment HTML, not a rendered browser screenshot. The installed Moodle version remains unknown.

| Check | Observed result |
| --- | --- |
| Session control: enrolled-courses AJAX request | HTTP 200, `error: false`, 4 courses |
| `mod_assign_get_assignments` through AJAX | HTTP 200, `error: true`, `servicenotavailable` |
| Calendar action events, starting at Unix time 0 | HTTP 200, 8 events; all `modulename: "assign"`, `eventtype: "due"` |
| Calendar action events, starting at the current time | 4 upcoming events |
| Course association | All 8 events referenced courses in the returned enrollment list |
| Assignment detail pages | Two HTTP 200 HTML pages: one upcoming assignment and one past assignment |
| Displayed deadline comparison | Both HTML `Due` values matched the event timestamp at UTC+07:00 |
| Sampled course page and assignment index | Each contained 10 distinct assignment-view links |
| Submission status / cutoff date | Not confirmed; sampled detail pages exposed `Opened` and `Due` labels |

Counts describe this session, not permanent course totals. The examples preserve observed structures while replacing identifiers, names, timestamps, and URLs with synthetic values. Responses below are excerpts.

## 2. Shared AJAX contract

```http
POST /lib/ajax/service.php?sesskey=<REDACTED>
Content-Type: application/json
Cookie: MoodleSession=<REDACTED>
```

The `info` query parameter was included in the initial requests and omitted in subsequent successful calendar checks. It is not required for the tested calendar request.

Moodle distinguishes AJAX-enabled external functions from other web-service functions. A known method name does not establish availability for a student session. See the official [AJAX guide](https://github.com/moodle/devdocs/blob/main/docs/guides/javascript/ajax/index.md) and [external-service security checks](https://github.com/moodle/devdocs/blob/main/docs/apis/subsystems/external/writing-a-service.md).

## 3. Recorded checks

### C01 — Assignment listing

The course IDs in this request came from the successful enrolled-courses response.

```json
[
  {
    "index": 0,
    "methodname": "mod_assign_get_assignments",
    "args": {
      "courseids": [900001, 900004, 900005, 900006],
      "capabilities": [],
      "includenotenrolledcourses": false
    }
  }
]
```

Observed error structure, HTTP 200; the exception message is omitted:

```json
[
  {
    "error": true,
    "exception": {
      "errorcode": "servicenotavailable"
    }
  }
]
```

This confirms unavailability for the tested session AJAX request. It does not establish whether a separately configured REST/mobile service could expose the method.

The following authenticated HTML routes both returned HTTP 200:

```http
GET /course/view.php?id=<ENROLLED_COURSE_ID>
GET /mod/assign/index.php?id=<ENROLLED_COURSE_ID>
Cookie: MoodleSession=<REDACTED>
```

The course HTML contained 10 distinct `/mod/assign/view.php` links. The assignment index also contained 10 distinct links, including the sampled assignment. Its columns included `Topic`, `Assignments`, `Due date`, and `Grade`; one additional column was not classified.

The index was requested directly using an enrolled course ID; an index link was not found in the sampled course HTML. No browser click sequence or pagination behavior was captured for this page. This is an HTML retrieval path, not a confirmed JSON listing API.

### C02 — Assignment details and displayed dates

Two same-origin assignment URLs were selected from the calendar events: one upcoming and one past.

```http
GET /mod/assign/view.php?id=<COURSE_MODULE_ID>
Cookie: MoodleSession=<REDACTED>
```

Both returned HTTP 200 with `text/html; charset=utf-8`. Simplified markup showing the observed labels, with synthetic dates and wrapper attributes omitted:

```html
<div><strong>Opened:</strong> Monday, 1 January 2024, 12:00 AM</div>
<div><strong>Due:</strong> Tuesday, 2 January 2024, 12:00 AM</div>
```

| Sample | Calendar classification | Labels | Deadline comparison |
| --- | --- | --- | --- |
| A1 | Upcoming | `Opened`, `Due` | `Due` wall time minus `timesort` = 420 minutes |
| A2 | Past | `Opened`, `Due` | `Due` wall time minus `timesort` = 420 minutes |

Both displayed dates agree with the API timestamp at UTC+07:00. This establishes the observed offset for these pages, not a guarantee about every user's display timezone.

In both samples, `events[].instance` equalled the `id` query parameter in the selected assignment-view URL. Do not generalize this observation into a guaranteed assignment database-ID mapping.

### C03 — Submission status and cutoff dates

Neither sampled detail page exposed an explicit `Submission status` label or a cutoff-date label in the inspected HTML. Both contained an `Add submission` control; it was not activated.

No submission-status JSON API, status enumeration, cutoff field, or student/group override contract was confirmed. Do not infer a submission state from a missing label or an available button.

### C04 — Calendar action events and deadlines

Confirmed method: `core_calendar_get_action_events_by_timesort`.

```json
[
  {
    "index": 0,
    "methodname": "core_calendar_get_action_events_by_timesort",
    "args": {
      "timesortfrom": 0,
      "aftereventid": 0,
      "limitnum": 20
    }
  }
]
```

Observed success structure, HTTP 200; this synthetic one-event example illustrates the structure, while the live response contained 8 events:

```json
[
  {
    "error": false,
    "data": {
      "events": [
        {
          "id": 900003,
          "name": "Example assignment deadline",
          "activityname": "Example assignment",
          "modulename": "assign",
          "eventtype": "due",
          "instance": 900002,
          "timestart": 1800000000,
          "timesort": 1800000000,
          "timeduration": 0,
          "visible": 1,
          "overdue": false,
          "course": {
            "id": 900001,
            "fullname": "Example course",
            "shortname": "EXAMPLE"
          }
        }
      ],
      "firstid": 900003,
      "lastid": 900003
    }
  }
]
```

The initial request returned 8 events: 4 past and 4 upcoming. All were assignment `due` events belonging to enrolled courses. `timesort` equalled `timestart` for all 8. A separate request with `timesortfrom` set to the current Unix time returned 4 events.

Other observed fields included `description`, `formattedtime`, `isactionevent`, `url`, `viewurl`, and `action`. The `action` object contained `name`, `url`, `itemcount`, `actionable`, and `showitemcount`. Edit/delete URLs and flags were also present; omit those actions from read-only MCP output.

Assignment URLs were located by inspecting `action.url`, `url`, and `viewurl` and selecting a same-origin URL with path `/mod/assign/view.php`. The check did not record which field supplied each selected URL.

### C05 — Calendar pagination

| Request | Observed result |
| --- | --- |
| `timesortfrom: 0`, `aftereventid: 0`, `limitnum: 2` | 2 events; `firstid` and `lastid` matched the first and last event IDs |
| Keep `timesortfrom: 0`, set `aftereventid` to returned `lastid` | 2 events with overlap against the first page |
| Set `timesortfrom` to the last event's `timesort` and `aftereventid` to its `id` | 2 events without overlap; both appeared in the initial 8-event result |

Advancing only `aftereventid` was insufficient. The successful next-page check supplied both the last event's timestamp and ID, keeping `limitnum: 2`; all three arguments were numbers.

This covered the first two pages only. Full traversal, events sharing a timestamp, and `timesortto` filtering remain unverified.

## 4. Field mapping supported by observations

| Needed field | Observed source | Evidence / limit |
| --- | --- | --- |
| Course ID / name | `events[].course.id`, `.fullname`, `.shortname` | C04; membership checked against enrolled courses |
| Calendar event ID | `events[].id` | C04/C05; retain for deduplication and pagination |
| Assignment title | `events[].activityname` or `.name` | String fields observed in C04 |
| Assignment view URL | Same-origin assignment URL among `action.url`, `url`, `viewurl` | C02/C04; exact supplying field was not recorded |
| Assignment database ID | Not confirmed | `instance` matched the view-link `id` in two samples only |
| Open date | HTML `Opened` display text | C02; no JSON source confirmed |
| Due date | `events[].timesort` / `.timestart` for `assign` + `due` events | C04; equal in all 8 events and compared with HTML in C02 |
| Cutoff date | Not confirmed | C03 |
| Effective date after student/group overrides | Not confirmed | No override case tested |
| Submission status | Not confirmed | C03; do not manufacture a normalized value |

The tested calendar timestamps are Unix seconds. Sampled HTML dates matched UTC+07:00 rendering. Missing/null/zero-date behavior was not established because the selected events had populated timestamps.

## 5. Retrieval decision and implementation follow-up

1. Confirm the session and obtain enrolled course IDs with the enrolled-courses method.
2. Call `core_calendar_get_action_events_by_timesort` with numeric `timesortfrom`, `aftereventid`, and `limitnum`. A current-time lower bound was verified for upcoming events.
3. Select `modulename === "assign"` and `eventtype === "due"`, retaining event/course identifiers and a verified view URL. Convert seconds when producing ISO dates.
4. For the next page, advance both the last event's `timesort` and ID; deduplicate by event ID. Complete traversal and tied timestamps need further testing before claiming exhaustive coverage.
5. Use authenticated course/index/detail HTML to check visible activities and displayed dates. Do not treat calendar action events as an exhaustive assignment list: the sampled course listed 10 activities, and this check did not establish that every activity has an action event.

**HAN-13:** The draft `mod_assign_get_assignments` call is not supported by this AJAX check. Assignment listing needs another confirmed JSON route or an explicit decision to parse authenticated HTML.

**HAN-14:** A direct calendar deadline path is confirmed. The draft assignment-service dependency cannot be assumed to work while its listing method returns `servicenotavailable`.

## 6. Acceptance and remaining evidence

- [x] Sanitized request/payload/response structures are recorded for the selected deadline path and unavailable assignment AJAX candidate.
- [x] A callable deadline method and authenticated assignment page routes have been identified.
- [x] A deadline retrieval path is confirmed against `Due` text in two authenticated assignment pages.
- [x] Pagination observations and optional-field limitations are recorded without treating untested cases as confirmed.
- [x] Capture browser-generated requests with the DevTools Network protocol; see section 8 for isolated Chrome evidence.
- [ ] Verify full pagination, tied timestamps, and upper date bounds.
- [ ] Confirm cutoff dates, submission status, missing-date semantics, and student/group overrides where exposed.

## 7. Implementation follow-up — 2026-11-16

- `deadlines` uses the calendar method directly, independently of the assignment listing. It filters `assign` + `due`, deduplicates event IDs and advances both cursor fields until an empty page. Repeated cursors and the 100-page safety limit fail rather than return partial results.
- Due-date output and inclusive date filters use `timestart`; `timesort` is used only for pagination. Retrieval starts at zero and date filters are applied locally so action ordering does not exclude valid due dates. This distinction follows the [official calendar API](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/calendar/externallib.php) and [event pagination implementation](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/calendar/classes/local/event/data_access/event_vault.php), rather than assuming those fields are always equal. These references do not establish the installed LMS version.
- `assignments` explicitly uses authenticated `/mod/assign/index.php?id=<COURSE_ID>` HTML, restricted to enrolled courses. A pinned HTML parser (`parse5` 7.3.0) extracts assignment links and decoded titles without executing scripts. The output identifies course modules and omits unverified status/date fields. The [official assignment index](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/assign/index.php) also delegates to the course index view; markup expectations are tested using synthetic fixtures, not a newly captured live page.
- Course enumeration follows `nextoffset` before selecting courses. Read-only assignment URLs retain only the `id` parameter; redirects are not followed with session credentials.
- Automated tests exercise HTTP boundaries and start the actual MCP server over stdio against a local synthetic Moodle server, including empty results and expired sessions. Full pagination, overlapping pages, tied cursor timestamps and date filtering are tested synthetically; the live acceptance items above remain open.
- A live session check on 2026-11-16 returned `AUTH_REQUIRED`. Refresh the session and repeat the documented checks to validate the implementation against the current LMS. No login or submission action was performed.
- Dependency audit on 2026-11-16 (`npm audit --omit=dev`) reported eight findings in existing dependencies (three high, five moderate), with none reported for the newly added `parse5`/`entities` packages. The high findings concern Zod 3, its dependent framework, and `body-parser`. Zod 4 remediation conflicts with the framework's required Zod 3 schema identity; `body-parser` is part of HTTP transport dependencies while this entry point uses stdio. Dependency remediation is deferred to a separate compatibility-tested update; review again by 2026-11-23. No forced dependency upgrades were applied.

## 8. Browser and completed implementation verification — 2026-11-16

The earlier `AUTH_REQUIRED` result in section 7 was superseded by a successful
check with the current configured session. The four canonical MCP tools
(`get_my_courses`, `get_course_assignments`, `get_upcoming_deadlines`,
`get_course_contents`) and a two-call batch passed against the live LMS. See the
[verification report](MVP_Verification.md).

[Sanitized browser evidence](evidence/browser-network-2026-11-16.json) was captured
at 11:28 UTC+07:00 using an isolated Google Chrome context and the DevTools Network
protocol via Playwright. This observes actual browser requests generated by normal
page navigation; no synthetic in-page fetch, form submission or completion action
was performed. The existing local session configuration supplied the test context.
No daily browser profile, saved browser tokens or unrelated tabs were accessed.

- Dashboard, enrolled course, assignment index and one upcoming assignment detail
  page returned HTTP 200 in the authenticated browser.
- The dashboard called `core_calendar_get_action_events_by_timesort` with numeric
  `timesortfrom`, `timesortto`, `limitnum` and boolean
  `limittononsuspendedevents`. Its HTTP 200 response had `error: false` and
  `data.events`, `firstid`, `lastid`. Argument/response field shapes are retained;
  credential values, names, identifiers and private response content are omitted.
- The selected assignment's displayed `Due` date matched the calendar timestamp
  at UTC+07:00. A `Submission status` label appeared in this sample, but no status
  enum/JSON contract or cutoff label was established; normalized status/cutoff
  fields remain omitted.
- A browser response for `core_courseformat_get_state` was a string, confirming
  why generic transport must preserve nested string data rather than decode every
  `data` value automatically.
- `core_course_get_contents` returned `servicenotavailable` in a separate direct
  AJAX check. The implemented contents tool therefore parses the authenticated
  course page, exposing sections and accessible module links without downloading
  resource files.
- The external LMS emitted one page error during browser navigation. All four
  target pages and the calendar request completed successfully; no browser error
  text or private page content was stored. The LMS frontend itself was not changed.

The browser-request capture item in section 6 is now satisfied by this evidence.
Full live pagination with tied timestamps, upper-bound edge cases, cutoff dates,
missing-date semantics and student/group overrides remain unverified beyond the
recorded fixtures and samples. They are limits of the evidence, not new claims.
