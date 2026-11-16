import assert from "node:assert/strict";
import test from "node:test";
import { MoodleClient } from "../../dist/moodle/client.js";
import { ManualSessionProvider } from "../../dist/moodle/auth/manual-session-provider.js";

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
