import assert from "node:assert/strict";
import test from "node:test";
import GetCourseAssignmentsTool from "../../dist/tools/GetCourseAssignmentsTool.js";
import GetUpcomingDeadlinesTool from "../../dist/tools/GetUpcomingDeadlinesTool.js";
import { DeadlineService } from "../../dist/services/deadline.service.js";
import { AssignmentService } from "../../dist/services/assignment.service.js";

test("canonical assignment tool requires a positive course ID and advertises read-only access", async () => {
  const tool = new GetCourseAssignmentsTool();
  assert.equal(tool.name, "get_course_assignments");
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.deepEqual(tool.inputSchema.required, ["courseId"]);
  let calls = 0;
  tool.execute = async () => { calls++; return []; };
  for (const arguments_ of [{}, { courseId: 0 }, { courseId: -1 }, { courseId: 1.1 }, { courseId: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.equal((await tool.toolCall({ params: { name: tool.name, arguments: arguments_ } })).isError, true);
  }
  assert.notEqual((await tool.toolCall({ params: { name: tool.name, arguments: { courseId: 7 } } })).isError, true);
  assert.equal(calls, 1);
});

test("canonical assignments expose id/name while preserving explicit course-module identity", async () => {
  const service = new AssignmentService({}, "https://example.invalid");
  service.getAssignments = async () => [{ courseModuleId: 42, title: "Assignment", courseId: 7, courseName: "Course", url: "https://example.invalid/mod/assign/view.php?id=42" }];
  const [assignment] = await service.getCourseAssignments(7);
  assert.equal(assignment.id, 42);
  assert.equal(assignment.idType, "courseModule");
  assert.equal(assignment.name, "Assignment");
  assert.equal(assignment.courseId, 7);
  assert.equal(assignment.dueDate, undefined);
});

test("canonical deadline schema defaults to seven days and rejects invalid look-ahead periods", async () => {
  const tool = new GetUpcomingDeadlinesTool();
  assert.equal(tool.name, "get_upcoming_deadlines");
  assert.equal(tool.annotations.readOnlyHint, true);
  let input;
  tool.execute = async args => { input = args; return []; };
  assert.notEqual((await tool.toolCall({ params: { name: tool.name, arguments: {} } })).isError, true);
  assert.deepEqual(input, { daysAhead: 7, includePast: false });
  for (const daysAhead of [0, -1, 1.2, 366]) {
    assert.equal((await tool.toolCall({ params: { name: tool.name, arguments: { daysAhead } } })).isError, true);
  }
});

test("canonical deadlines apply the seven-day window and expose a verified assignment identifier", async (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-11-16T00:00:00Z"));
  const service = new DeadlineService({}, "https://example.invalid");
  let bounds;
  service.getDeadlines = async input => {
    bounds = input;
    return [{ eventId: 11, title: "Assignment", courseId: 7, courseName: "Course", dueDate: "2026-11-17T00:00:00Z", url: "https://example.invalid/mod/assign/view.php?id=42" }];
  };
  const [deadline] = await service.getUpcomingDeadlines();
  assert.deepEqual(bounds, { from: "2026-11-16T00:00:00.000Z", to: "2026-11-23T00:00:00.000Z", courseId: undefined });
  assert.equal(deadline.courseModuleId, 42);
  await service.getUpcomingDeadlines({ daysAhead: 2, includePast: true, courseId: 7 });
  assert.deepEqual(bounds, { from: "1970-01-01T00:00:00.000Z", to: "2026-11-18T00:00:00.000Z", courseId: 7 });
});
