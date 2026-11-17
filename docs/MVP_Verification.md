# MVP verification — 2026-11-16

## Result

The four canonical tools and the reusable Moodle client were exercised against
the configured student's authorized LMS session. All four tools completed over
actual MCP stdio without changing source between calls. Only read requests and
normal page navigation were used; no login, submission, completion or editing
action was performed.

| Live check | Observed result |
| --- | --- |
| `get_my_courses` | 4 enrolled courses |
| `get_course_assignments` | 18 assignment links across those 4 courses |
| `get_course_contents` | 26 sections, 135 accessible modules across those 4 courses |
| `get_upcoming_deadlines` | 1 deadline in the default seven-day window; ordered and within bounds |
| `MoodleClient.callBatch` | Two authorized read calls returned in caller order |
| Isolated Chrome dashboard/course/index/detail navigation | Four HTTP 200 authenticated pages |
| Browser calendar AJAX | `core_calendar_get_action_events_by_timesort`, HTTP 200, `error: false` |
| Browser detail date | The sampled displayed `Due` matched the calendar timestamp at UTC+07:00 |

Counts belong to this session and may change. They are not permanent totals or
evidence that the calendar lists every assignment. Browser capture occurred at
11:28 UTC+07:00. Machine-readable evidence contains no live session values,
student/course names, private page text or raw response bodies:

- [Browser Network evidence](evidence/browser-network-2026-11-16.json)
- [Final stdio and batch smoke output](evidence/live-smoke-2026-11-16.jsonl)

## Automated verification

The final `npm test` run passed **51 tests**; `npm run build` and
`git diff --check` also passed. The suite includes fixture tests for ordered
batching, errors at HTTP 200 and non-2xx status, root/array errors, malformed
envelopes, missing/invalid credentials, cookie injection, response-size bounds,
timeouts, date conversion/filtering, seven-day defaults, safe URLs, enrollment,
hidden resources, absent optional fields and all canonical/compatibility MCP tools.
The live script's disabled-by-default path is also exercised without credentials.

A mutation check inverted the new hidden-resource filter; the course-contents
tests failed as expected. The original source and compiled output were restored.
No tests were skipped or disabled to reach a passing result.

## Issue coverage

| Linear issue | Implementation and verification |
| --- | --- |
| HAN-10, HAN-40 | Generic single/batch transport; indexes and result cardinality; real two-call read batch |
| HAN-41 | Explicit success/error envelope validation, root errors and unchanged nested string data |
| HAN-42 | Typed, actionable errors; no raw remote messages/stacks; `missingparam` remains generic unless sesskey absence is known locally |
| HAN-43 | Timeout through body reading, redirect rejection, HTTP/network/response distinctions, 8 MiB response bound and no auth retries |
| HAN-44 | Offline fixtures and an explicit opt-in live smoke command excluded from default tests/CI |
| HAN-11 | Normalized enrolled courses through the canonical MCP tool; live count above |
| HAN-12 | Sanitized endpoint contract plus actual Chrome/DevTools calendar request and displayed deadline comparison |
| HAN-13 | `get_course_assignments(courseId)`, `id`/`name`, explicit course-module ID semantics, missing optional fields accepted |
| HAN-14 | `get_upcoming_deadlines`, seven-day default, date/course filters, explicit past-date opt-in and ascending due dates |
| HAN-15 | Enrolled-course sections and accessible activity/resource metadata; hidden/linkless restricted modules omitted; no file downloads |
| HAN-16 | Local session configuration, validation, redacted errors/URLs, ignored secret files and documented manual refresh |
| HAN-17 | All four canonical tools verified over stdio against fixtures and the live LMS; setup/examples/limitations documented |

## Decisions and remaining limits

- `assignments` and `deadlines` retain their existing schemas/output for compatibility.
  Canonical tools provide the names and seven-day behavior specified in Linear.
- Course/assignment page IDs are course-module IDs, not inferred assignment database
  IDs. Deadlines carry both their event ID and a course-module ID derived from a
  validated view link when present. Optional unverified fields are omitted.
- This LMS rejects `core_course_get_contents` through session AJAX with
  `servicenotavailable`. Course contents therefore use its authenticated HTML
  structure, which was inspected before implementation and exercised across all
  four enrolled courses. A different Moodle theme or course format may require an
  adapter update; unsupported page structures fail explicitly.
- Full live pagination with tied timestamps, missing/zero-date semantics, student
  and group overrides, and cutoff semantics remain unverified. Fixtures test the
  implemented pagination/date behavior. A `Submission status` label was seen in
  one browser sample; a normalized status enumeration was not established.
- The external LMS emitted one browser page error during capture. The four pages
  and target AJAX request still completed successfully. The error's private text
  was not retained, and no LMS frontend changes were made.
- The 2026-11-16 dependency audit recorded 8 pre-existing findings (3 high,
  5 moderate); this work adds no dependency. Zod 4 remediation conflicts with the
  framework's Zod 3 requirement. HTTP transport dependencies also need a separate
  compatibility-reviewed update. Review the recorded deferral by 2026-11-23;
  see the discovery document's section 7. No forced upgrades were applied.
