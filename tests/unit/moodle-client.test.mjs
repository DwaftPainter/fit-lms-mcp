import assert from "node:assert/strict";
import test from "node:test";
import { MoodleClient } from "../../dist/moodle/client.js";
import { ManualSessionProvider } from "../../dist/moodle/auth/manual-session-provider.js";
import { CourseService } from "../../dist/services/course.service.js";

const clientFor = (credentials = { session: "test-session", sesskey: "test-key" }) => new MoodleClient({
  baseUrl: "https://example.invalid/moodle", authProvider: new ManualSessionProvider(credentials),
});

test("batch calls assign stable indexes and unwrap data in caller order", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(new URL(url).pathname, "/moodle/lib/ajax/service.php");
    assert.equal(new URL(url).searchParams.get("sesskey"), "test-key");
    assert.equal(options.headers.Cookie, "MoodleSession=test-session");
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "manual");
    assert.deepEqual(JSON.parse(options.body), [
      { index: 0, methodname: "core_test_first", args: { id: 7 } },
      { index: 1, methodname: "core_test_second", args: {} },
    ]);
    return Response.json([{ error: false, data: { id: 7 } }, { error: false, data: "{\"nested\":true}" }]);
  });
  assert.deepEqual(await clientFor().callBatch([{ method: "core_test_first", args: { id: 7 } }, { method: "core_test_second", args: {} }]), [{ id: 7 }, '{"nested":true}']);
});

test("empty batches perform no network request", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("empty batch must not fetch"));
  assert.deepEqual(await clientFor().callBatch([]), []);
});

test("batch errors identify the failing call without returning partial success", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json([
    { error: false, data: 7 },
    { error: true, exception: { errorcode: "nopermissions", message: "private response test-session test-key" } },
  ]));
  await assert.rejects(clientFor().callBatch([{ method: "core_test_first", args: {} }, { method: "core_test_second", args: {} }]), error => {
    assert.equal(error.code, "MOODLE_API_ERROR");
    assert.equal(error.requestIndex, 1);
    assert.equal(error.errorcode, "nopermissions");
    assert.doesNotMatch(JSON.stringify(error) + error.message, /private|test-session|test-key/);
    return true;
  });
});

test("root Moodle errors and errors inside HTTP failures retain their typed code", async (t) => {
  for (const [payload, status, expected] of [
    [{ error: "private", errorcode: "invalidrecord" }, 200, "MOODLE_API_ERROR"],
    [{ error: "private", errorcode: "invalidsesskey" }, 500, "INVALID_SESSION_KEY"],
    [[{ error: true, exception: { errorcode: "servicerequireslogin", message: "private" } }], 200, "AUTH_REQUIRED"],
    [[{ error: true, exception: { errorcode: "missingparam", message: "private courseid missing" } }], 200, "MOODLE_API_ERROR"],
  ]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload, { status }));
    await assert.rejects(clientFor().call("core_test_method", {}), error => error.code === expected && !error.message.includes("private"));
  }
});

test("invalid envelopes and mismatched batch sizes fail with response errors", async (t) => {
  for (const payload of [[], [null], [{}], [{ error: false }], [{ error: "false", data: 7 }], [{ error: false, data: 1 }, { error: false, data: 2 }], { unexpected: true }]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    await assert.rejects(clientFor().call("core_test_method", {}), error => error.code === "MOODLE_RESPONSE_ERROR");
  }
});

test("malformed JSON and private HTML never escape through client errors", async (t) => {
  for (const body of ['{"broken":', '<html>private test-session test-key</html>']) {
    t.mock.method(globalThis, "fetch", async () => new Response(body));
    await assert.rejects(clientFor().call("core_test_method", {}), error => error.code === "MOODLE_RESPONSE_ERROR" && !/private|test-session|test-key/.test(error.message));
  }
});

test("network and HTTP failures remain distinct and discard raw diagnostics", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("private test-session test-key"); });
  await assert.rejects(clientFor().call("core_test_method", {}), error => error.code === "NETWORK_ERROR" && !error.message.includes("private"));
  t.mock.method(globalThis, "fetch", async () => new Response("private", { status: 503 }));
  await assert.rejects(clientFor().call("core_test_method", {}), error => error.code === "MOODLE_HTTP_ERROR" && !error.message.includes("private"));
});

test("missing sesskey is diagnosed locally and cookie injection is rejected before fetching", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("invalid credentials must not fetch"));
  await assert.rejects(clientFor({ session: "test-session", sesskey: "" }).call("core_test_method", {}), error => error.code === "MISSING_SESSION_KEY");
  await assert.rejects(clientFor({ session: "session; other=injected", sesskey: "test-key" }).call("core_test_method", {}), error => error.code === "AUTH_REQUIRED");
  await assert.rejects(clientFor({ session: "test-session", sesskey: "invalid\nkey" }).call("core_test_method", {}), error => error.code === "INVALID_SESSION_KEY");
});

test("oversized declared and streamed responses fail before data reaches adapters", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { headers: { "content-length": String(9 * 1024 * 1024) } }));
  await assert.rejects(clientFor().call("core_test_method", {}), error => error.code === "MOODLE_RESPONSE_ERROR");
  t.mock.method(globalThis, "fetch", async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1)));
  await assert.rejects(clientFor().call("core_test_method", {}), error => error.code === "MOODLE_RESPONSE_ERROR");
});

test("invalid client URLs fail without echoing private input", () => {
  for (const baseUrl of ["private invalid URL", "https://private:secret@example.invalid", "https://example.invalid?token=private"]) {
    assert.throws(() => new MoodleClient({ baseUrl, authProvider: {} }), error => error.code === "INVALID_CONFIG" && !/private|secret/.test(error.message));
  }
});

test("course URLs are normalized to the configured LMS without server-supplied credentials", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json([{ error: false, data: { courses: [{ id: 7, fullname: "Course", viewurl: "https://evil.invalid/course/view.php?id=7&sesskey=private" }], nextoffset: 0 } }]));
  const [course] = await new CourseService(clientFor()).getMyCourses();
  assert.equal(course.url, "https://example.invalid/moodle/course/view.php?id=7");
});

test("remote error codes cannot echo configured credentials", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json([{ error: true, exception: { errorcode: "test-session", message: "test-key", stacktrace: "private" } }]));
  await assert.rejects(clientFor().call("core_test_method", {}), error => {
    assert.equal(error.code, "MOODLE_API_ERROR");
    assert.doesNotMatch(JSON.stringify(error) + error.message, /test-session|test-key|private/);
    return true;
  });
});

test("AJAX timeout covers reading a delayed response body", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => new Response(new ReadableStream({
    start(controller) {
      const timer = setTimeout(() => {
        controller.enqueue(new TextEncoder().encode('[{"error":false,"data":{}}]'));
        controller.close();
      }, 80);
      options.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        controller.error(new DOMException("Request aborted", "AbortError"));
      }, { once: true });
    },
  }), { headers: { "content-type": "application/json" } }));
  const client = new MoodleClient({
    baseUrl: "https://example.invalid", timeoutMs: 10,
    authProvider: new ManualSessionProvider({ session: "test-session", sesskey: "test-key" }),
  });
  await assert.rejects(client.call("core_calendar_get_action_events_by_timesort", {}), error => error.code === "NETWORK_TIMEOUT");
});

test("AJAX refuses redirects instead of forwarding the session cookie", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.redirect, "manual");
    return new Response(null, { status: 303, headers: { location: "https://evil.invalid" } });
  });
  const client = new MoodleClient({
    baseUrl: "https://example.invalid",
    authProvider: new ManualSessionProvider({ session: "test-session", sesskey: "test-key" }),
  });
  await assert.rejects(client.call("core_calendar_get_action_events_by_timesort", {}), error => error.code === "AUTH_REQUIRED");
});
