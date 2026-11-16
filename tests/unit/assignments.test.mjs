import assert from "node:assert/strict";
import test from "node:test";
import { AssignmentService } from "../../dist/services/assignment.service.js";
import AssignmentsTool from "../../dist/tools/AssignmentsTool.js";
import { MoodleClient } from "../../dist/moodle/client.js";
import { ManualSessionProvider } from "../../dist/moodle/auth/manual-session-provider.js";

const baseUrl = "https://example.invalid/moodle";
// Synthetic Moodle markup; no student data or credentials are captured here.
const html = content => `<!doctype html><html><body id="page-mod-assign-index"><main id="region-main">${content}</main></body></html>`;
const table = `<table class="generaltable"><tr><th>Assignment</th></tr>
  <tr><td><a href="${baseUrl}/mod/assign/view.php?id=42&amp;sesskey=private">Lab &amp; <span>report</span></a></td></tr>
  <tr><td><a href="${baseUrl}/mod/assign/view.php?id=42">Duplicate</a></td></tr>
  <tr><td><a href="https://evil.invalid/mod/assign/view.php?id=43">External</a></td></tr>
  <tr><td><a href="${baseUrl}/mod/assign/view.php?id=44&amp;action=delete">Delete</a></td></tr>
  <tr><td><a href="${baseUrl}/mod/assign/view.php?id=45">Second assignment</a></td></tr></table>`;

function setup(t, responses) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: new URL(url), options });
    assert.equal(options.headers.Cookie, "MoodleSession=test-session");
    assert.ok(responses.length, "unexpected extra request");
    return responses.shift();
  });
  const client = new MoodleClient({ baseUrl, authProvider: new ManualSessionProvider({ session: "test-session", sesskey: "test-key" }) });
  return { service: new AssignmentService(client, baseUrl), client, requests };
}
const courses = (items = [{ id: 7, fullname: "Example course" }], nextoffset = 0) => Response.json([{ error: false, data: { courses: items, nextoffset } }]);
const page = content => new Response(content, { headers: { "content-type": "text/html; charset=utf-8" } });

test("assignments list enrolled course activities without relying on calendar events", async (t) => {
  const { service, requests } = setup(t, [courses(), page(html(table))]);
  assert.deepEqual(await service.getAssignments(), [
    { courseModuleId: 42, title: "Lab & report", courseId: 7, courseName: "Example course", url: `${baseUrl}/mod/assign/view.php?id=42` },
    { courseModuleId: 45, title: "Second assignment", courseId: 7, courseName: "Example course", url: `${baseUrl}/mod/assign/view.php?id=45` },
  ]);
  assert.equal(requests[1].url.pathname, "/moodle/mod/assign/index.php");
  assert.equal(requests[1].url.search, "?id=7");
  assert.equal(requests[1].options.redirect, "manual");
});

test("assignments follow course pagination and can select a course on a later page", async (t) => {
  const { service, requests } = setup(t, [
    courses([{ id: 7, fullname: "First course" }], 1),
    courses([{ id: 8, fullname: "Second course" }], 2), courses([], 2),
    page(html(table)),
  ]);
  const result = await service.getAssignments({ courseId: 8 });
  assert.equal(result.length, 2);
  assert.equal(result[0].courseId, 8);
  assert.equal(requests[3].url.search, "?id=8");
});

test("assignments reject a course outside enrollments without fetching HTML", async (t) => {
  const { service, requests } = setup(t, [courses()]);
  await assert.rejects(service.getAssignments({ courseId: 99 }), error => error.code === "COURSE_NOT_ENROLLED");
  assert.equal(requests.length, 1);
});

test("assignments handle no enrolled courses and an authenticated empty index", async (t) => {
  const { service } = setup(t, [courses([]), courses(), page(html('<div class="alert alert-info">No activities</div><div class="continuebutton"></div>'))]);
  assert.deepEqual(await service.getAssignments(), []);
  assert.deepEqual(await service.getAssignments(), []);
});

test("assignments reject login redirects without following them or leaking credentials", async (t) => {
  const { service } = setup(t, [courses(), new Response(null, { status: 303, headers: { location: "https://evil.invalid/login?secret=private" } })]);
  await assert.rejects(service.getAssignments(), error => error.code === "AUTH_REQUIRED" && !error.message.includes("private"));
});

test("assignments distinguish login HTML and unexpected pages from an empty index", async (t) => {
  const { service } = setup(t, [
    courses(), page('<body id="page-login-index"><form id="login"></form></body>'),
    courses(), page(html('<div>Unexpected private error</div>')),
  ]);
  await assert.rejects(service.getAssignments(), error => error.code === "AUTH_REQUIRED");
  await assert.rejects(service.getAssignments(), error => error.code === "MOODLE_RESPONSE_ERROR" && !error.message.includes("private"));
});

test("assignments fail when course pagination stalls instead of omitting courses", async (t) => {
  const { service } = setup(t, [courses([{ id: 7, fullname: "First course" }], 1), courses([{ id: 8, fullname: "Second course" }], 1)]);
  await assert.rejects(service.getAssignments(), error => error.code === "MOODLE_PAGINATION_ERROR");
});

test("assignments reject malformed course data before constructing an HTML request", async (t) => {
  const { service, requests } = setup(t, [courses([{ id: "private value", fullname: "Course" }])]);
  await assert.rejects(service.getAssignments(), error => error.code === "MOODLE_RESPONSE_ERROR" && !error.message.includes("private value"));
  assert.equal(requests.length, 1);
});

test("assignment tool rejects invalid course IDs before executing", async () => {
  const tool = new AssignmentsTool();
  let calls = 0;
  tool.execute = async () => { calls++; return []; };
  for (const args of [{ courseId: -1 }, { courseId: "7" }, { courseId: 1.5 }]) {
    assert.equal((await tool.toolCall({ params: { name: tool.name, arguments: args } })).isError, true);
  }
  assert.notEqual((await tool.toolCall({ params: { name: tool.name, arguments: {} } })).isError, true);
  assert.equal(calls, 1);
});
