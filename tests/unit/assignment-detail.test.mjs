import assert from "node:assert/strict";
import test from "node:test";
import { parseAssignmentDetail } from "../../dist/moodle/api/assignment-detail.js";
import { AssignmentService } from "../../dist/services/assignment.service.js";
import GetAssignmentDetailTool from "../../dist/tools/GetAssignmentDetailTool.js";
import { MoodleClient } from "../../dist/moodle/client.js";
import { ManualSessionProvider } from "../../dist/moodle/auth/manual-session-provider.js";
import { MoodleAuthError, MoodleError } from "../../dist/moodle/errors.js";

const baseUrl = "https://example.invalid/moodle";

const htmlPage = (content, bodyId = "page-mod-assign-view") =>
  `<!doctype html><html><body id="${bodyId}"><main id="region-main">${content}</main></body></html>`;

const standardTable = `
  <table class="generaltable submissionstatustable">
    <tbody>
      <tr>
        <th class="cell c0">Submission status</th>
        <td class="cell c1 submissionstatussubmitted">Submitted for grading</td>
      </tr>
      <tr>
        <th class="cell c0">Grading status</th>
        <td class="cell c1">Not graded</td>
      </tr>
      <tr>
        <th class="cell c0">Due date</th>
        <td class="cell c1">Sunday, 22 November 2026, 11:59 PM</td>
      </tr>
      <tr>
        <th class="cell c0">Time remaining</th>
        <td class="cell c1">5 days 4 hours</td>
      </tr>
      <tr>
        <th class="cell c0">Last modified</th>
        <td class="cell c1">Sunday, 15 November 2026, 8:12 PM</td>
      </tr>
      <tr>
        <th class="cell c0">Cut-off date</th>
        <td class="cell c1">Monday, 23 November 2026, 11:59 PM</td>
      </tr>
    </tbody>
  </table>
`;

const sampleContent = `
  <h2>Final Project Submission Box</h2>
  <div class="generalbox" id="intro">
    <p>Please submit your final project archive (.zip) and report (.pdf).</p>
  </div>
  ${standardTable}
`;

test("parseAssignmentDetail parses full assignment page with submission table", () => {
  const result = parseAssignmentDetail(htmlPage(sampleContent), baseUrl, 101);

  assert.equal(result.id, 101);
  assert.equal(result.idType, "courseModule");
  assert.equal(result.name, "Final Project Submission Box");
  assert.equal(result.url, `${baseUrl}/mod/assign/view.php?id=101`);
  assert.equal(result.introText, "Please submit your final project archive (.zip) and report (.pdf).");
  assert.equal(result.submissionStatus, "Submitted for grading");
  assert.equal(result.gradingStatus, "Not graded");
  assert.equal(result.dueDate, "2026-11-22T16:59:00.000Z");
  assert.equal(result.timeRemaining, "5 days 4 hours");
  assert.equal(result.lastModified, "2026-11-15T13:12:00.000Z");
  assert.equal(result.cutoffDate, "2026-11-23T16:59:00.000Z");
});

test("parseAssignmentDetail handles assignments without a submission table gracefully", () => {
  const noTableContent = `
    <h2>Reading Assignment: Chapter 4</h2>
    <div class="activity-description">Read pages 50-80 before lecture.</div>
  `;
  const result = parseAssignmentDetail(htmlPage(noTableContent), baseUrl, 202);

  assert.equal(result.id, 202);
  assert.equal(result.name, "Reading Assignment: Chapter 4");
  assert.equal(result.introText, "Read pages 50-80 before lecture.");
  assert.equal(result.submissionStatus, undefined);
  assert.equal(result.dueDate, undefined);
});

test("parseAssignmentDetail handles draft status and overdue time remaining", () => {
  const draftContent = `
    <h2>Midterm Assignment</h2>
    <table class="generaltable">
      <tr>
        <th>Submission status</th>
        <td>Draft (not submitted)</td>
      </tr>
      <tr>
        <th>Grading status</th>
        <td>Graded</td>
      </tr>
      <tr>
        <th>Time remaining</th>
        <td>Assignment is overdue by: 2 hours</td>
      </tr>
    </table>
  `;
  const result = parseAssignmentDetail(htmlPage(draftContent), baseUrl, 303);

  assert.equal(result.submissionStatus, "Draft (not submitted)");
  assert.equal(result.gradingStatus, "Graded");
  assert.equal(result.timeRemaining, "Assignment is overdue by: 2 hours");
});

test("parseAssignmentDetail throws MoodleAuthError on login redirect", () => {
  assert.throws(
    () => parseAssignmentDetail(htmlPage("<div>Login please</div>", "page-login-index"), baseUrl, 101),
    MoodleAuthError
  );
});

test("parseAssignmentDetail throws MoodleError on unrecognized page structure", () => {
  assert.throws(
    () => parseAssignmentDetail(htmlPage("<div>Not an assignment</div>", "page-course-view"), baseUrl, 101),
    /Unrecognized Moodle assignment page/
  );
});

test("parseAssignmentDetail throws MoodleError on errorbox inside content", () => {
  const errorContent = `
    <h2>Assignment Error</h2>
    <div class="errorbox">You do not have permission to view this assignment.</div>
  `;
  assert.throws(
    () => parseAssignmentDetail(htmlPage(errorContent), baseUrl, 101),
    /Unexpected Moodle assignment page error/
  );
});

test("AssignmentService.getAssignmentDetail rejects non-positive or malformed courseModuleId", async () => {
  const client = new MoodleClient({ baseUrl, authProvider: new ManualSessionProvider({ session: "test", sesskey: "test" }) });
  const service = new AssignmentService(client, baseUrl);

  for (const invalidId of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      () => service.getAssignmentDetail(invalidId),
      { code: "INVALID_REQUEST" }
    );
  }
});

test("AssignmentService.getAssignmentDetail fetches and parses assignment detail", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: new URL(url), options });
    return new Response(htmlPage(sampleContent), { headers: { "content-type": "text/html; charset=utf-8" } });
  });

  const client = new MoodleClient({ baseUrl, authProvider: new ManualSessionProvider({ session: "test-session", sesskey: "test-key" }) });
  const service = new AssignmentService(client, baseUrl);

  const detail = await service.getAssignmentDetail(101);
  assert.equal(detail.id, 101);
  assert.equal(detail.name, "Final Project Submission Box");
  assert.equal(detail.submissionStatus, "Submitted for grading");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, "/moodle/mod/assign/view.php");
  assert.equal(requests[0].url.search, "?id=101");
});

test("GetAssignmentDetailTool validates schema and advertises read-only access", async () => {
  const tool = new GetAssignmentDetailTool();
  assert.equal(tool.name, "get_assignment_detail");
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
  assert.deepEqual(tool.inputSchema.required, ["courseModuleId"]);

  let calledWith;
  tool.execute = async (args) => {
    calledWith = args;
    return { id: args.courseModuleId };
  };

  // Valid invocation
  const success = await tool.toolCall({ params: { name: tool.name, arguments: { courseModuleId: 42 } } });
  assert.equal(success.isError, undefined);
  assert.deepEqual(calledWith, { courseModuleId: 42 });

  // Invalid invocations
  for (const args of [{}, { courseModuleId: 0 }, { courseModuleId: -5 }, { courseModuleId: "not-a-number" }]) {
    const failure = await tool.toolCall({ params: { name: tool.name, arguments: args } });
    assert.equal(failure.isError, true);
  }
});
