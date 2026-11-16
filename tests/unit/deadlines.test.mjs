import assert from "node:assert/strict";
import test from "node:test";
import { DeadlineService } from "../../dist/services/deadline.service.js";
import DeadlinesTool from "../../dist/tools/DeadlinesTool.js";
import { MoodleClient } from "../../dist/moodle/client.js";
import { ManualSessionProvider } from "../../dist/moodle/auth/manual-session-provider.js";

const baseUrl = "https://example.invalid/moodle";
const event = (id, overrides = {}) => ({
  id, name: `Deadline ${id}`, activityname: `Assignment ${id}`,
  modulename: "assign", eventtype: "due", timesort: 1800000000,
  timestart: 1800000100, course: { id: 7, fullname: "Example course" },
  action: { url: `${baseUrl}/mod/assign/view.php?id=42&sesskey=secret` },
  ...overrides,
});

function setup(t, pages) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const [request] = JSON.parse(options.body);
    requests.push(request);
    assert.equal(options.headers.Cookie, "MoodleSession=test-session");
    assert.equal(new URL(url).origin, new URL(baseUrl).origin);
    assert.ok(pages.length, "unexpected extra request");
    const data = pages.shift();
    return Response.json([{ error: false, data }]);
  });
  const client = new MoodleClient({ baseUrl, authProvider: new ManualSessionProvider({ session: "test-session", sesskey: "test-key" }) });
  return { service: new DeadlineService(client, baseUrl), requests };
}

test("deadlines traverse tied timestamps, deduplicate overlap, filter and normalize actual due dates", async (t) => {
  const { service, requests } = setup(t, [
    { events: [event(10), event(11, { modulename: "quiz" })] },
    { events: [event(10), event(12, { timesort: 1800000001, course: { id: 8, fullname: "Other course" } }), event(13, { timesort: 1800000002 })] },
    { events: [] },
  ]);
  const result = await service.getDeadlines({ from: "2027-01-15T08:01:40+00:00", to: "2027-01-15T08:01:40Z", courseId: 7 });
  assert.deepEqual(result, [10, 13].map(eventId => ({
    eventId, title: `Assignment ${eventId}`, courseId: 7, courseName: "Example course",
    dueDate: "2027-01-15T08:01:40.000Z", url: `${baseUrl}/mod/assign/view.php?id=42`,
  })));
  assert.equal(requests[0].methodname, "core_calendar_get_action_events_by_timesort");
  assert.deepEqual(requests.map(r => [r.args.timesortfrom, r.args.aftereventid]), [[0, 0], [1800000000, 11], [1800000002, 13]]);
});

test("deadlines skip missing dates and unrelated events and strip unsafe view URLs", async (t) => {
  const { service } = setup(t, [{ events: [
    event(1, { timestart: 0 }), event(2, { timestart: null }),
    event(3, { timestart: undefined }), event(4, { eventtype: "open" }),
    event(5, { action: { url: "https://evil.invalid/mod/assign/view.php?id=5" }, viewurl: `${baseUrl}/mod/assign/view.php?id=5#private` }),
    event(6, { action: { url: `${baseUrl}/mod/assign/view.php?id=6&action=delete` } }),
  ] }, { events: [] }]);
  const result = await service.getDeadlines({ from: "2020-01-01T00:00:00Z" });
  assert.equal(result.length, 2);
  assert.equal(result[0].url, `${baseUrl}/mod/assign/view.php?id=5`);
  assert.equal(result[1].url, null);
});

test("deadlines return empty results and default to upcoming dates", async (t) => {
  const { service } = setup(t, [{ events: [event(1, { timestart: 1 })] }, { events: [] }]);
  assert.deepEqual(await service.getDeadlines(), []);
});

test("deadlines fail instead of returning a silently truncated list when pagination stalls", async (t) => {
  const { service } = setup(t, [{ events: [event(1)] }, { events: [event(1)] }]);
  await assert.rejects(service.getDeadlines(), error => error.code === "MOODLE_PAGINATION_ERROR");
});

test("deadlines reject malformed responses without echoing response data", async (t) => {
  const { service } = setup(t, [{ events: [{ id: "private response", timesort: 4 }] }]);
  await assert.rejects(service.getDeadlines(), error => error.code === "MOODLE_RESPONSE_ERROR" && !error.message.includes("private response"));
});

test("deadlines reject reversed date ranges without making requests", async (t) => {
  const { service, requests } = setup(t, []);
  await assert.rejects(service.getDeadlines({ from: "2027-02-01T00:00:00Z", to: "2027-01-01T00:00:00Z" }), error => error.code === "INVALID_DATE_RANGE");
  assert.equal(requests.length, 0);
});

test("deadline tool validates date formats and course IDs before executing", async () => {
  const tool = new DeadlinesTool();
  let calls = 0;
  tool.execute = async () => { calls++; return []; };
  for (const args of [
    { from: "tomorrow" }, { from: "2027-01-01T00:00:00" }, { courseId: -1 },
  ]) {
    const result = await tool.toolCall({ params: { name: tool.name, arguments: args } });
    assert.equal(result.isError, true);
  }
  assert.equal(calls, 0);
  const result = await tool.toolCall({ params: { name: tool.name, arguments: {} } });
  assert.notEqual(result.isError, true);
  assert.equal(calls, 1);
});
