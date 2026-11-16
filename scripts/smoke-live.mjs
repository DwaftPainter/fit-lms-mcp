import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadConfig } from "../dist/config/env.js";
import { MoodleClient } from "../dist/moodle/client.js";
import { ManualSessionProvider } from "../dist/moodle/auth/manual-session-provider.js";

if (process.env.LMS_LIVE_SMOKE !== "1") {
  console.log("Live smoke disabled. Set LMS_LIVE_SMOKE=1 and supply local LMS credentials to opt in.");
  process.exit(0);
}

const mcp = new Client({ name: "hanu-authorized-smoke", version: "1.0.0" });
let currentCheck = "configuration";
try {
  const config = loadConfig();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)),
    stderr: "pipe",
  });
  transport.stderr?.resume();
  currentCheck = "MCP connection";
  await mcp.connect(transport);
  console.log(JSON.stringify({ check: "live-smoke", verifiedAt: new Date().toISOString(), credentialsRecorded: false, privateContentRecorded: false }));
  const { tools } = await mcp.listTools();
  const canonical = ["get_my_courses", "get_course_assignments", "get_upcoming_deadlines", "get_course_contents"];
  assert.ok(canonical.every(name => tools.some(tool => tool.name === name)));
  const call = async (name, args) => {
    currentCheck = name;
    const result = await mcp.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true);
    return JSON.parse(result.content.find(block => block.type === "text").text);
  };
  const courses = await call("get_my_courses", {});
  assert.ok(Array.isArray(courses));
  console.log(JSON.stringify({ check: "get_my_courses", passed: true, courses: courses.length }));
  let assignments = 0, sections = 0, modules = 0;
  for (const course of courses) {
    const items = await call("get_course_assignments", { courseId: course.id });
    assert.ok(Array.isArray(items));
    assert.ok(items.every(item => item.courseId === course.id && Number.isSafeInteger(item.id) && typeof item.name === "string"));
    assignments += items.length;
    const contents = await call("get_course_contents", { courseId: course.id });
    assert.equal(contents.courseId, course.id);
    assert.ok(Array.isArray(contents.sections));
    sections += contents.sections.length;
    modules += contents.sections.reduce((total, section) => total + section.modules.length, 0);
    assert.ok(contents.sections.every(section => section.visible && section.modules.every(module => module.visible)));
  }
  console.log(JSON.stringify({ check: "get_course_assignments", passed: true, coursesChecked: courses.length, assignments }));
  console.log(JSON.stringify({ check: "get_course_contents", passed: true, coursesChecked: courses.length, sections, modules }));
  const before = Date.now();
  const deadlines = await call("get_upcoming_deadlines", {});
  const after = Date.now();
  assert.ok(Array.isArray(deadlines));
  const dates = deadlines.map(deadline => Date.parse(deadline.dueDate));
  assert.ok(dates.every((date, index) => date >= before && date <= after + 7 * 86400000 && (index === 0 || date >= dates[index - 1])));
  console.log(JSON.stringify({ check: "get_upcoming_deadlines", passed: true, daysAhead: 7, deadlines: deadlines.length }));
  currentCheck = "batch";
  const client = new MoodleClient({ baseUrl: config.baseUrl, authProvider: ManualSessionProvider.fromConfig(config), timeoutMs: config.timeoutMs });
  const batch = await client.callBatch([
    { method: "core_course_get_enrolled_courses_by_timeline_classification", args: { offset: 0, limit: 50, classification: "all", sort: "fullname", customfieldname: "", customfieldvalue: "", searchvalue: "" } },
    { method: "core_calendar_get_action_events_by_timesort", args: { timesortfrom: 0, aftereventid: 0, limitnum: 2 } },
  ]);
  assert.equal(batch.length, 2);
  assert.ok(Array.isArray(batch[0].courses) && Array.isArray(batch[1].events));
  console.log(JSON.stringify({ check: "batch", passed: true, calls: batch.length }));
} catch (error) {
  // Do not print raw LMS data, credentials, URLs or remote error messages.
  console.error(JSON.stringify({ check: currentCheck, passed: false, code: typeof error.code === "string" && /^[A-Z_]+$/.test(error.code) ? error.code : "CHECK_FAILED" }));
  process.exitCode = 1;
} finally {
  await mcp.close();
}
