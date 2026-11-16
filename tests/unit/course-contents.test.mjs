import assert from "node:assert/strict";
import test from "node:test";
import { parseCourseContents } from "../../dist/moodle/api/course-contents.js";
import { CourseContentService } from "../../dist/services/course-content.service.js";
import { MoodleClient } from "../../dist/moodle/client.js";
import { ManualSessionProvider } from "../../dist/moodle/auth/manual-session-provider.js";
import GetCourseContentsTool from "../../dist/tools/GetCourseContentsTool.js";

const baseUrl = "https://example.invalid/moodle";
const page = sections => `<body id="page-course-view-topics"><main id="region-main"><div class="course-content"><ul class="topics">${sections}</ul></div></main></body>`;
const module = (id, type = "resource", attributes = "", content) => `<li id="module-${id}" data-id="${id}" data-for="cmitem" class="activity activity-wrapper modtype_${type}" ${attributes}><div class="activity-item"><div class="activityname">${content ?? `<a href="${baseUrl}/mod/${type}/view.php?id=${id}&amp;sesskey=private"><span class="instancename">Module ${id} &amp; notes<span class="accesshide"> File</span></span></a>`}</div></div></li>`;
const section = (content, attributes = "") => `<li id="section-0" data-id="101" data-number="0" data-for="section" class="section course-section" ${attributes}><div data-for="section_title"><h3>General &amp; overview</h3></div><ul data-for="cmlist" class="section">${content}</ul></li>`;

test("course contents parse sections and accessible metadata without returning tokenized file URLs", () => {
  const result = parseCourseContents(page(section(module(42) + module(43, "assign"))), baseUrl);
  assert.deepEqual(result, [{ id: 101, number: 0, name: "General & overview", visible: true, modules: [
    { id: 42, name: "Module 42 & notes", type: "resource", url: `${baseUrl}/mod/resource/view.php?id=42`, visible: true },
    { id: 43, name: "Module 43 & notes", type: "assign", url: `${baseUrl}/mod/assign/view.php?id=43`, visible: true },
  ] }]);
  assert.doesNotMatch(JSON.stringify(result), /private|pluginfile/);
});

test("hidden, restricted, external and action-only resources are excluded", () => {
  const result = parseCourseContents(page(section(
    module(1, "resource", "hidden") + module(2, "resource", 'aria-hidden="true"') +
    module(3, "resource", "", '<span class="availabilityinfo">Restricted</span>') +
    module(4, "resource", "", '<a href="https://evil.invalid/mod/resource/view.php?id=4">External</a>') +
    module(5, "resource", "", `<a href="${baseUrl}/mod/resource/view.php?id=5&amp;action=delete">Delete</a>`) + module(6)
  ) + section(module(7), "hidden")), baseUrl);
  assert.deepEqual(result.flatMap(section => section.modules.map(module => module.id)), [6]);
});

test("unsupported pages fail explicitly while an authenticated empty course returns no sections", () => {
  assert.deepEqual(parseCourseContents(page(""), baseUrl), []);
  assert.throws(() => parseCourseContents('<body id="page-login-index">private</body>', baseUrl), error => error.code === "AUTH_REQUIRED");
  assert.throws(() => parseCourseContents('<body id="page-course-view-topics">private error</body>', baseUrl), error => error.code === "MOODLE_RESPONSE_ERROR" && !error.message.includes("private"));
});

test("course contents enforce enrollment and fetch only the course HTML page", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push(new URL(url));
    if (options.method === "POST") return Response.json([{ error: false, data: { courses: [{ id: 7, fullname: "Course" }], nextoffset: 0 } }]);
    return new Response(page(section(module(42))), { headers: { "content-type": "text/html" } });
  });
  const client = new MoodleClient({ baseUrl, authProvider: new ManualSessionProvider({ session: "test-session", sesskey: "test-key" }) });
  const service = new CourseContentService(client, baseUrl);
  const result = await service.getCourseContents(7);
  assert.equal(result.courseId, 7);
  assert.equal(result.sections[0].modules.length, 1);
  assert.equal(requests[1].pathname, "/moodle/course/view.php");
  assert.equal(requests.length, 2);
  await assert.rejects(service.getCourseContents(99), error => error.code === "COURSE_NOT_ENROLLED");
  assert.equal(requests.length, 3);
});

test("course contents schema requires a course ID and marks the tool read only", async () => {
  const tool = new GetCourseContentsTool();
  assert.equal(tool.name, "get_course_contents");
  assert.equal(tool.annotations.readOnlyHint, true);
  tool.execute = async () => assert.fail("invalid input must not execute");
  for (const input of [{}, { courseId: -1 }, { courseId: "7" }]) {
    assert.equal((await tool.toolCall({ params: { name: tool.name, arguments: input } })).isError, true);
  }
});
