# HAN-9 — Moodle Authentication & Request Contract

**Scope:** Read-only access to the student's authorized LMS data\
**LMS base URL:** `https://lms.fit.hanu.vn`\
**Platform:** Moodle (inferred from endpoint and method naming; verify)

> **Security:** Never record real session cookies, `sesskey` values, passwords, authorization headers, or other credentials in this document, Linear, screenshots, or source control. Replace them with `<REDACTED>` before saving or sharing. Test only with your own authorized account and normal LMS functions.

## 1. Environment

| Item | Value |
| --- | --- |
| Tested on | `2026-10-19` |
| Browser | `Chrome` |
| Account role | Student |
| Login method | `password` |
| Endpoint type | Moodle AJAX / Web Service |
| API documentation available? | `TBD` |

## 2. Authentication contract

### 2.1 Session cookie

- Cookie name observed: `MoodleSession` (confirm in DevTools)
- Required for this endpoint? `Yes`
- Obtained after login? `Yes`
- Session lifetime: `Browser session; server-side timeout unknown.`
- Observed behavior after logout/expiration: `TBD`

Sanitized representation:

```http
Cookie: MoodleSession=<REDACTED>
```

### 2.2 `sesskey`

- Location: URL query parameter
- Required? `Yes`
- Stays the same during a session? `Yes`
- Changes after login? `Yes`
- Behavior if missing: `500 Internal Server Error`
- Behavior if invalid: `500 Internal Server Error`

Sanitized representation:

```text
?sesskey=<REDACTED>
```

**Note:** `sesskey` is not a permanent API token. Determine its behavior from observation, rather than assuming it is sufficient for authentication.

### 2.3 Session expiration and re-authentication

| Scenario | HTTP status | Response shape | Expected MCP behavior |
| --- | --- | --- | --- |
| Valid session | `200` | `[{error: false, data: {courses: Course[], nextoffset: number}}]` | Return parsed data |
| Reload after logout; browser still sends an old `MoodleSession` cookie | `200` | `[{error: false, data: {courses:[], nextoffset: 0}}]` | Do not infer `AUTH_REQUIRED` from an empty course list alone; verify authentication separately |
| Expired session | `TBD` | `TBD` | `AUTH_SESSION_EXPIRED` |
| Missing `sesskey` | `200` | `[{error: true, exception: {errorcode: "missingparam"}}]` | Clear auth/request error |
| Invalid `sesskey` | `200` | `[{error: true, exception: {errorcode: "invalidsesskey"}}]` | Clear auth/request error |
| Missing `MoodleSession`, retained `sesskey` | `200` | `[{error: true, exception: {errorcode: "servicerequireslogin"}}]` | AUTH_SESSION_EXPIRED |

**Safe testing:** Revisit the LMS normally after signing out and document the browser's observed behavior. Do not probe unauthorized resources or bypass authentication controls.

## 3. AJAX request contract

**Observed endpoint:**

```http
POST https://lms.fit.hanu.vn/lib/ajax/service.php
```

**Query parameters to verify:**

| Name | Example | Required? | Notes |
| --- | --- | --- | --- |
| `sesskey` | `<REDACTED>` | `true` | Session-related parameter |
| `info` | `core_course_get_enrolled_courses_by_timeline_classification` | `false` | Method identifier |

**Representative request body (Confirm):**

```json
[
  {
    "index": 0,
    "methodname": "core_course_get_enrolled_courses_by_timeline_classification",
    "args": {
      "offset": 0,
      "limit": 24,
      "classification": "all",
      "sort": "fullname",
      "customfieldname": "",
      "customfieldvalue": "",
      "searchvalue": ""
    }
  }
]
```

**Illustrative response envelope (confirm shape):** The records below are synthetic and do not represent a student's enrollments.

```json
[
  {
    "error": false,
    "data": {
      "courses": [
        {
          "id": 900001,
          "fullname": "Example Course A",
          "shortname": "EXAMPLE_A",
          "startdate": 1700000000,
          "enddate": 1730000000,
          "visible": true,
          "progress": 75,
          "viewurl": "https://example.invalid/course/view.php?id=900001"
        },
        {
          "id": 900002,
          "fullname": "Example Course B",
          "shortname": "EXAMPLE_B",
          "startdate": 1700000000,
          "enddate": 1730000000,
          "visible": true,
          "progress": 12,
          "viewurl": "https://example.invalid/course/view.php?id=900002"
        },
        {
          "id": 900003,
          "fullname": "Example Course C",
          "shortname": "EXAMPLE_C",
          "startdate": 1700000000,
          "enddate": 1730000000,
          "visible": true,
          "progress": 0,
          "viewurl": "https://example.invalid/course/view.php?id=900003"
        },
        {
          "id": 900004,
          "fullname": "Example Course D",
          "shortname": "EXAMPLE_D",
          "startdate": 1700000000,
          "enddate": 1730000000,
          "visible": true,
          "progress": 0,
          "viewurl": "https://example.invalid/course/view.php?id=900004"
        }
      ],
      "nextoffset": 4
    }
  }
]

```

### Request headers checklist

**Minimal request test:** Passed

- [x] `Content-Type: application/json` — Not explicitly required
- [x] `Accept` — Not explicitly required
- [ ] `Cookie: MoodleSession=<REDACTED>` — Used; necessity test pending
- [x] `X-Requested-With` — Not required
- [x] `Referer` — Not required (`referrerPolicy: "no-referrer"`)
- [x] `Accept-Language` — Not explicitly required
- [x] `info` query parameter — Not required

**Observed result:**

- HTTP status: `200 OK`
- Response: `error=false`
- Courses returned: `4`
- Explicit request headers: None
- Credentials mode: `include`

**Conclusion:** The endpoint accepts a minimal POST request without explicitly configured HTTP headers. Authentication still relies on the existing browser session and a valid `sesskey`.


## 4. Captured API — enrolled courses

**Proposed MCP tool:** `get_my_courses`\
**Moodle method:** `core_course_get_enrolled_courses_by_timeline_classification`\
**Observed purpose:** List courses enrolled/visible to the logged-in student.

### Capture notes

| Field | Observation |
| --- | --- |
| Browser page triggering request | `https://lms.fit.hanu.vn/my/courses.php` |
| Exact method name | `core_course_get_enrolled_courses_by_timeline_classification` |
| Exact payload confirmed? | Yes — verified in DevTools |
| Pagination behavior | Uses offset and limit; edge cases TBD |
| Course filtering/classification | classification: "all" confirmed |
| Failure behavior | Partially verified |

### Sanitized sample response

> Illustrative shape based on the previously inspected response. Replace example values with anonymized observations and keep only fields actually returned by the LMS.

```json
[
  {
    "error": false,
    "data": {
      "courses": [
        {
          "id": 900001,
          "fullname": "<COURSE_NAME>",
          "shortname": "<COURSE_SHORTNAME>",
          "summary": "<SUMMARY>",
          "startdate": 0,
          "enddate": 0,
          "visible": true,
          "progress": 85,
          "viewurl": "https://example.invalid/course/view.php?id=900001"
        }
      ]
    }
  }
]
```

### Data mapping

| Moodle response field | MCP output field | Type | Optional? |
| --- | --- | --- | --- |
| `id` | `id` | number | No |
| `fullname` | `name` | string | No |
| `shortname` | `shortName` | string | Yes |
| `summary` | `summary` | string | Yes |
| `startdate` | `startDate` | ISO 8601 string | Yes |
| `enddate` | `endDate` | ISO 8601 string | Yes |
| `progress` | `progress` | number | Yes |
| `viewurl` | `url` | string | Yes |

**Normalized example (illustrative, not a captured record):**

```json
{
  "id": 900001,
  "name": "Example course",
  "shortName": "EXAMPLE",
  "progress": 85,
  "startDate": null,
  "endDate": null,
  "url": "https://example.invalid/course/view.php?id=900001"
}
```

## 5. Error handling contract

Record sanitized real responses in the table below. Do not assume failure always produces a non-2xx HTTP status; Moodle may return API-level errors in JSON.

| Case | Observed HTTP status | Observed body/error fields | Internal error type |
| --- | --- | --- | --- |
| Missing MoodleSession | `200` | `errorcode: servicerequireslogin` | `AUTH_REQUIRED` |
| Missing MoodleSession, retained sesskey | `200` | `errorcode: servicerequireslogin` | `AUTH_REQUIRED` |
| Authentication expired | `200` | `errorcode: invalidsesskey` | `AUTH_REQUIRED` / `AUTH_SESSION_EXPIRED` |
| Invalid sesskey | `200` | ``errorcode: invalidsesskey`` | `INVALID_SESSION_KEY` |
| Missing sesskey | `200` | ``errorcode: missingparam`` | `MISSING_SESSION_KEY` |
| Unsupported Moodle method | `200` | `errorcode: "invalidrecord"; root JSON object` | `MOODLE_API_ERROR` |
| Network timeout | n/a | `TimeoutError: signal timed out` | `NETWORK_TIMEOUT` |
| Server/unexpected response | `TBD` | `TBD` | `MOODLE_RESPONSE_ERROR` |

The console `fetch` observation does not establish whether the missing `sesskey` caused `servicerequireslogin`.

**Expected behavior:** Handle failures without exposing raw credentials or sensitive LMS HTML in logs returned to the AI client.

## 6. Proposed TypeScript contract (for HAN-10)

```ts
interface MoodleConfig {
  baseUrl: string;
  // Secrets are loaded from a local, non-committed source.
}

interface MoodleAjaxRequest<TArgs> {
  index: number;
  methodname: string;
  args: TArgs;
}

interface MoodleAjaxResponse<TResult> {
  error: boolean;
  data?: TResult;
  exception?: string | object;
  errorcode?: string;
  message?: string;
}

interface MoodleClient {
  call<TArgs, TResult>(
    method: string,
    args: TArgs
  ): Promise<TResult>;
}
```

> The error fields above are provisional. Update the TypeScript types after recording the LMS's actual error response contract.

## 7. Login authentication flow

- **Login endpoint:** `POST /login/index.php`
- **Content-Type:** `application/x-www-form-urlencoded`
- **Payload:** `logintoken`, `username`, `password`
- **Login response:** `303 See Other`
- **Redirect chain:**
  1. `/login/index.php`
  2. `/login/index.php?testsession=<REDACTED>`
  3. `/`
- **Session cookie:** `MoodleSession`
- **Session cookie rotation:** Observed during login
- **Authentication verified after redirect:** `Yes — Authenticated homepage reached; enrolled-courses API returned successfully`
- **sesskey retrieval:** `window.M?.cfg?.sesskey` (available on the authenticated LMS page)

**Conclusion:** Moodle uses form-based authentication followed by a session verification redirect. The authenticated session is then used to access Moodle AJAX APIs.

## 8. Security checklist

- [ ] Read-only tools for the MVP
- [ ] Authorization limited to the current student's accessible courses/resources
- [ ] No credentials embedded in Markdown, issues, tests, commits, or screenshots
- [ ] Local credentials loaded securely; `.env` excluded via `.gitignore` if used
- [ ] Logs redact cookie values, `sesskey`, tokens, and private user data
- [ ] Failed or expired sessions produce actionable errors
- [ ] Prefer official Moodle Web Services and permitted authentication when available
- [ ] Review LMS rules before automating requests

Example `.env.example` (placeholders only):

```dotenv
MOODLE_BASE_URL=https://lms.fit.hanu.vn
MOODLE_SESSION=<SET_LOCALLY_DO_NOT_COMMIT>
MOODLE_SESSKEY=<SET_LOCALLY_DO_NOT_COMMIT>
```

## 9. Open questions

- [ ] Is an official Moodle REST/Web Service API enabled for students?
- [ ] Which cookies, query parameters, and headers are actually required?
- [ ] How is `sesskey` obtained and rotated?
- [ ] Does LMS login use SSO?
- [ ] What triggers session expiration?
- [ ] Can requests be batched, and what is the result ordering?
- [ ] How should rate limits, timeouts, and retries be handled?
- [ ] Are all required read-only methods permitted for this account?

## 9. Definition of done

- [ ] One sanitized **real** enrolled-courses request/response recorded
- [ ] Exact `Payload` structure confirmed in DevTools
- [ ] Request method, endpoint, and necessary headers documented
- [ ] Session cookie and `sesskey` requirements verified
- [ ] Session expiry/failure response documented
- [ ] Raw LMS errors mapped to safe MCP-facing errors
- [ ] No sensitive values in this file or in Linear
- [ ] Sufficient contract documented to implement `MoodleClient` in HAN-10
