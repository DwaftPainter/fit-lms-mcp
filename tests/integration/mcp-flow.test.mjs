import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("stdio MCP executes all four canonical tools and compatibility tools against a local Moodle server", { timeout: 20000 }, async (t) => {
  let expired = false;
  let empty = false;
  let requests = 0;
  const server = createServer(async (request, response) => {
    requests++;
    assert.equal(request.headers.cookie, "MoodleSession=synthetic-session");
    const url = new URL(request.url, baseUrl);
    if (url.pathname.endsWith("/mod/assign/index.php")) {
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><body id="page-mod-assign-index"><main id="region-main"><table class="generaltable"><tr><td><a href="${baseUrl}/mod/assign/view.php?id=42">Example assignment</a></td></tr></table></main></body>`);
      return;
    }
    if (url.pathname.endsWith("/course/view.php")) {
      response.setHeader("content-type", "text/html");
      response.end(`<body id="page-course-view-topics"><main id="region-main"><div class="course-content"><ul class="topics"><li class="section course-section" data-for="section" data-id="101" data-number="0"><div data-for="section_title"><h3>General</h3></div><ul><li id="module-42" data-id="42" class="activity modtype_assign"><a href="${baseUrl}/mod/assign/view.php?id=42"><span class="instancename">Example assignment</span></a></li></ul></li></ul></div></main></body>`);
      return;
    }
    assert.equal(request.method, "POST");
    let body = "";
    for await (const chunk of request) body += chunk;
    const [call] = JSON.parse(body);
    response.setHeader("content-type", "application/json");
    if (expired) {
      response.end(JSON.stringify([{ error: true, exception: { errorcode: "servicerequireslogin", message: "Private synthetic-session synthetic-key", stacktrace: "Private server trace" } }]));
      return;
    }
    let data;
    if (call.methodname === "core_course_get_enrolled_courses_by_timeline_classification") {
      data = { courses: empty ? [] : [{ id: 7, fullname: "Example course" }], nextoffset: 0 };
    } else {
      assert.equal(call.methodname, "core_calendar_get_action_events_by_timesort");
      data = { events: empty || call.args.aftereventid ? [] : [{
        id: 11, name: "Example assignment due", activityname: "Example assignment",
        modulename: "assign", eventtype: "due", timesort: Math.floor(Date.now() / 1000) + 86400, timestart: Math.floor(Date.now() / 1000) + 86400,
        course: { id: 7, fullname: "Example course" }, url: `${baseUrl}/mod/assign/view.php?id=42`,
      }] };
    }
    response.end(JSON.stringify([{ error: false, data }]));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}/moodle`;
  const client = new Client({ name: "lms-integration-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../../dist/index.js", import.meta.url))],
    env: { LMS_BASE_URL: baseUrl, LMS_MOODLE_SESSION: "synthetic-session", LMS_MOODLE_SESSKEY: "synthetic-key", TIMEOUT_MS: "2000" },
    stderr: "pipe",
  });
  transport.stderr?.resume();
  t.after(async () => {
    await client.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ["assignments", "deadlines", "get_course_assignments", "get_course_contents", "get_my_courses", "get_upcoming_deadlines"]);
  assert.equal(tools.tools.find(tool => tool.name === "deadlines").inputSchema.properties.from.type, "string");
  for (const [name, args] of [["get_my_courses", {}], ["assignments", { courseId: 7 }], ["deadlines", { from: "2020-01-01T00:00:00Z" }]]) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.length, 1);
    assert.equal(name === "get_my_courses" ? data[0].id : data[0].courseId, 7);
  }
  for (const name of ["get_course_assignments", "get_upcoming_deadlines", "get_course_contents"]) {
    const result = await client.callTool({ name, arguments: name === "get_upcoming_deadlines" ? {} : { courseId: 7 } });
    assert.notEqual(result.isError, true);
    const data = JSON.parse(result.content[0].text);
    if (name === "get_course_contents") {
      assert.equal(data.courseId, 7);
      assert.equal(data.sections[0].modules[0].id, 42);
    } else {
      assert.equal(data.length, 1);
      assert.equal(name === "get_course_assignments" ? data[0].id : data[0].courseModuleId, 42);
    }
  }
  const before = requests;
  const invalid = await client.callTool({ name: "deadlines", arguments: { from: "not-a-date" } });
  assert.equal(invalid.isError, true);
  assert.equal(requests, before);
  empty = true;
  for (const name of ["get_my_courses", "assignments", "deadlines", "get_upcoming_deadlines"]) {
    const result = await client.callTool({ name, arguments: {} });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), []);
  }
  for (const name of ["get_course_assignments", "get_course_contents"]) {
    const result = await client.callTool({ name, arguments: { courseId: 7 } });
    assert.equal(result.isError, true, "a selected course absent from enrollment must fail explicitly");
  }
  expired = true;
  for (const name of ["get_my_courses", "assignments", "deadlines", "get_upcoming_deadlines", "get_course_assignments", "get_course_contents"]) {
    const result = await client.callTool({ name, arguments: name === "get_course_assignments" || name === "get_course_contents" ? { courseId: 7 } : {} });
    assert.equal(result.isError, true);
    assert.ok(!JSON.stringify(result).includes("synthetic-session"));
    assert.ok(!JSON.stringify(result).includes("synthetic-key"));
    assert.ok(!JSON.stringify(result).includes("Private"));
  }
});
