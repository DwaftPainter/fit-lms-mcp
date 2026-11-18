import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("stdio MCP executes canonical and compatibility tools against a local Moodle server", { timeout: 20000 }, async (t) => {
  let expired = false;
  let empty = false;
  let requests = 0;
  const server = createServer(async (request, response) => {
    requests++;
    assert.equal(request.headers.cookie, "MoodleSession=synthetic-session");
    if (expired) {
      if (request.method === "POST") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify([{ error: true, exception: { errorcode: "servicerequireslogin", message: "Private synthetic-session synthetic-key", stacktrace: "Private server trace" } }]));
      } else {
        response.statusCode = 302;
        response.setHeader("location", `${baseUrl}/login/index.php`);
        response.end();
      }
      return;
    }
    const url = new URL(request.url, baseUrl);
    if (url.pathname.endsWith("/mod/assign/index.php")) {
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><body id="page-mod-assign-index"><main id="region-main"><table class="generaltable"><tr><td><a href="${baseUrl}/mod/assign/view.php?id=42">Example assignment</a></td></tr></table></main></body>`);
      return;
    }
    if (url.pathname.endsWith("/mod/assign/view.php")) {
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><body id="page-mod-assign-view"><main id="region-main"><h2>Example assignment</h2><div class="generalbox" id="intro"><p>Instructions</p></div><table class="generaltable"><tr><th>Submission status</th><td>Submitted for grading</td></tr></table></main></body>`);
      return;
    }
    if (url.pathname.endsWith("/course/view.php")) {
      response.setHeader("content-type", "text/html");
      response.end(`<body id="page-course-view-topics"><main id="region-main"><div class="course-content"><ul class="topics"><li class="section course-section" data-for="section" data-id="101" data-number="0"><div data-for="section_title"><h3>General</h3></div><ul>
        <li id="module-42" data-id="42" class="activity modtype_assign"><a href="${baseUrl}/mod/assign/view.php?id=42"><span class="instancename">Example assignment</span></a></li>
        <li id="module-43" data-id="43" class="activity modtype_forum"><a href="${baseUrl}/mod/forum/view.php?id=43">Announcements</a></li>
        <li id="module-44" data-id="44" class="activity modtype_resource"><a href="${baseUrl}/mod/resource/view.php?id=44&amp;redirect=1">Exam guide</a></li>
      </ul></li></ul></div></main></body>`);
      return;
    }
    if (url.pathname.endsWith("/mod/forum/view.php")) {
      assert.equal(url.searchParams.get("s"), "10");
      const rows = url.searchParams.get("page") === "0" ? `<table class="discussion-list"><tbody>
        <tr data-region="discussion-list-item" data-discussionid="80" data-forumid="18"><th class="topic"><a href="discuss.php?d=80">Exam announcement</a></th></tr>
      </tbody></table>` : '<div class="forumnodiscuss">No announcements</div>';
      response.setHeader("content-type", "text/html");
      response.end(`<body id="page-mod-forum-view" class="forumtype-news"><main id="region-main">${rows}</main>`);
      return;
    }
    if (url.pathname.endsWith("/mod/resource/view.php")) {
      assert.equal(url.searchParams.get("forceview"), "1");
      response.setHeader("content-type", "text/html");
      response.end(`<body id="page-mod-resource-view"><main id="region-main"><div class="resourceworkaround"><a href="${baseUrl}/pluginfile.php/8/mod_resource/content/1/exam.pdf">Download</a></div></main>`);
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
    } else if (call.methodname === "mod_forum_get_discussion_posts") {
      assert.deepEqual(call.args, { discussionid: 80 });
      data = { courseid: 7, forumid: 18, posts: [{ discussionid: 80, hasparent: false, isdeleted: false, capabilities: { view: true }, subject: "Exam announcement", message: "<p>Check the guide.</p>" }] };
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
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ["assignments", "deadlines", "get_assignment_detail", "get_course_announcements", "get_course_assignments", "get_course_contents", "get_material_detail", "get_my_courses", "get_upcoming_deadlines"]);
  assert.equal(tools.tools.find(tool => tool.name === "deadlines").inputSchema.properties.from.type, "string");
  for (const [name, args] of [["get_my_courses", {}], ["assignments", { courseId: 7 }], ["deadlines", { from: "2020-01-01T00:00:00Z" }]]) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.length, 1);
    assert.equal(name === "get_my_courses" ? data[0].id : data[0].courseId, 7);
  }
  for (const name of ["get_course_assignments", "get_upcoming_deadlines", "get_course_contents", "get_assignment_detail"]) {
    const result = await client.callTool({
      name,
      arguments: name === "get_upcoming_deadlines" ? {} : name === "get_assignment_detail" ? { courseModuleId: 42 } : { courseId: 7 }
    });
    assert.notEqual(result.isError, true);
    const data = JSON.parse(result.content[0].text);
    if (name === "get_course_contents") {
      assert.equal(data.courseId, 7);
      assert.equal(data.sections[0].modules[0].id, 42);
    } else if (name === "get_assignment_detail") {
      assert.equal(data.id, 42);
      assert.equal(data.name, "Example assignment");
      assert.equal(data.submissionStatus, "Submitted for grading");
    } else {
      assert.equal(data.length, 1);
      assert.equal(name === "get_course_assignments" ? data[0].id : data[0].courseModuleId, 42);
    }
  }
  for (const [name, args, coldRequests] of [["get_my_courses", {}, 1], ["get_course_contents", { courseId: 7 }, 2]]) {
    const requestsBeforeHit = requests;
    const cached = await client.callTool({ name, arguments: args });
    assert.notEqual(cached.isError, true);
    assert.equal(requests, requestsBeforeHit, `${name} should serve a warm read without contacting Moodle`);
    const refreshed = await client.callTool({ name, arguments: { ...args, bypassCache: true } });
    assert.notEqual(refreshed.isError, true);
    assert.deepEqual(refreshed.content, cached.content);
    assert.equal(requests, requestsBeforeHit + coldRequests, `${name} should contact Moodle on bypass`);
    await client.callTool({ name, arguments: args });
    assert.equal(requests, requestsBeforeHit + coldRequests, `${name} should cache the refreshed value`);
  }
  const beforeFilteredCourses = requests;
  await client.callTool({ name: "get_my_courses", arguments: { classification: "past" } });
  assert.equal(requests, beforeFilteredCourses + 1, "another classification should use its own cache entry");

  const announcements = await client.callTool({ name: "get_course_announcements", arguments: { courseId: 7 } });
  assert.notEqual(announcements.isError, true);
  assert.deepEqual(JSON.parse(announcements.content[0].text), [{
    id: 80, title: "Exam announcement", messageText: "Check the guide.", url: `${baseUrl}/mod/forum/discuss.php?d=80`,
  }]);
  const nextPage = await client.callTool({ name: "get_course_announcements", arguments: { courseId: 7, page: 1 } });
  assert.notEqual(nextPage.isError, true);
  assert.deepEqual(JSON.parse(nextPage.content[0].text), []);
  const material = await client.callTool({ name: "get_material_detail", arguments: { courseId: 7, courseModuleId: 44 } });
  assert.notEqual(material.isError, true);
  assert.deepEqual(JSON.parse(material.content[0].text), {
    id: 44, courseId: 7, name: "Exam guide", type: "resource", url: `${baseUrl}/mod/resource/view.php?id=44`,
    files: [{ name: "exam.pdf", url: `${baseUrl}/pluginfile.php/8/mod_resource/content/1/exam.pdf` }],
  });
  const before = requests;
  const invalid = await client.callTool({ name: "deadlines", arguments: { from: "not-a-date" } });
  assert.equal(invalid.isError, true);
  const invalidPage = await client.callTool({ name: "get_course_announcements", arguments: { courseId: 7, page: -1 } });
  assert.equal(invalidPage.isError, true);
  const invalidModule = await client.callTool({ name: "get_material_detail", arguments: { courseId: 7, courseModuleId: "44" } });
  assert.equal(invalidModule.isError, true);
  const invalidBypass = await client.callTool({ name: "get_course_contents", arguments: { courseId: 7, bypassCache: "true" } });
  assert.equal(invalidBypass.isError, true);
  assert.equal(requests, before);
  empty = true;
  for (const name of ["get_my_courses", "assignments", "deadlines", "get_upcoming_deadlines"]) {
    const result = await client.callTool({ name, arguments: name === "get_my_courses" ? { bypassCache: true } : {} });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), []);
  }
  for (const name of ["get_course_assignments", "get_course_contents", "get_course_announcements", "get_material_detail"]) {
    const result = await client.callTool({ name, arguments: {
      get_material_detail: { courseId: 7, courseModuleId: 44 }, get_course_contents: { courseId: 7, bypassCache: true },
    }[name] ?? { courseId: 7 } });
    assert.equal(result.isError, true, "a selected course absent from enrollment must fail explicitly");
  }
  expired = true;
  for (const name of ["get_my_courses", "assignments", "deadlines", "get_upcoming_deadlines", "get_course_assignments", "get_course_contents", "get_assignment_detail", "get_course_announcements", "get_material_detail"]) {
    const result = await client.callTool({
      name,
      arguments: {
        get_course_assignments: { courseId: 7 }, get_course_contents: { courseId: 7, bypassCache: true }, get_assignment_detail: { courseModuleId: 42 },
        get_course_announcements: { courseId: 7 }, get_material_detail: { courseId: 7, courseModuleId: 44 },
        get_my_courses: { bypassCache: true },
      }[name] ?? {},
    });
    assert.equal(result.isError, true);
    assert.ok(!JSON.stringify(result).includes("synthetic-session"));
    assert.ok(!JSON.stringify(result).includes("synthetic-key"));
    assert.ok(!JSON.stringify(result).includes("Private"));
  }
});
