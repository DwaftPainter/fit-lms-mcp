# Complete the HANU LMS MCP issue contracts

Tasks are tracked in Linear project **HANU LMS MCP**, workspace `hanoi-university`.
This plan implements the existing issues; it does not replace their acceptance criteria.

## Ordered work

1. **HAN-40–44 / HAN-10:** add ordered batch calls, validate every response envelope,
   recognize root errors, normalize errors without raw server messages, and test
   network/HTTP/timeout/malformed-response cases. Verify with focused client tests.
2. **HAN-16:** reject unsafe credentials, keep credentials out of diagnostics,
   document manual session refresh, and verify ignored local secret files.
3. **HAN-13:** expose `get_course_assignments(courseId)` with `id`/`name` fields;
   retain the existing `assignments` tool as a documented compatibility entry point.
4. **HAN-14:** expose `get_upcoming_deadlines`, default to seven days, include a
   verified course-module identifier, and test date bounds and past-date opt-in.
   Retain the existing `deadlines` entry point for compatibility.
5. **HAN-15:** expose enrolled-course sections and accessible module metadata through
   `get_course_contents`; use a documented authenticated HTML fallback if the
   course-contents AJAX method is unavailable. Never download resource files.
6. **HAN-11/12/17/44:** verify all four canonical tools over stdio, add an opt-in
   read-only live smoke test and OpenCode setup/refresh instructions, record actual
   evidence and update only Linear criteria supported by it.

## Checkpoints

- After the client: focused tests and existing suite pass.
- After canonical tools: schema and service tests pass; existing tool contracts remain usable.
- At completion: `npm test`, `npm run build`, `git diff --check`, and a read-only
  live smoke test when the configured session is available.

## Boundaries

- Reuse the session provider, HTTP client and existing parsers; add no dependency.
- Never infer submission state, cutoff dates, hidden-resource access or actual
  session expiry from an invalid sesskey alone.
- A simulated test is not live LMS evidence. DevTools capture remains explicit
  if no browser tooling is available. Do not mark that evidence collected.

## Completion evidence

Implementation and canonical/compatibility tool checks are complete. The live
stdio smoke test passed for all four enrolled courses, and an isolated Chrome
DevTools-protocol capture confirmed the browser calendar request and a displayed
deadline. See [MVP verification](../docs/MVP_Verification.md) for counts, commands,
issue coverage and evidence limits. No private browser profile or raw LMS response
was persisted. The separate dependency remediation noted in that report is outside
these session/tool implementation issues.
