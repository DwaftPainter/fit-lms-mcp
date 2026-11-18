import assert from "node:assert/strict";
import test from "node:test";
import { CourseContentService } from "../../dist/services/course-content.service.js";
import { parseMaterialDetail } from "../../dist/moodle/api/material-detail.js";

const baseUrl = "https://lms.example.test/moodle";
const coursePage = modules => `<body id="page-course-view-topics"><main id="region-main"><div class="course-content">
  <ul><li data-for="section" data-number="0"><ul>${modules}</ul></li></ul></div></main>`;
const moduleItem = (id, type, options = {}) => `<li class="activity modtype_${type}" data-id="${id}" ${options.hidden ? "hidden" : ""}>
  <a href="${baseUrl}/mod/${type}/view.php?id=${id}${options.query ?? ""}">Module ${id}</a></li>`;
const activityPage = (type, content, classes = "") => `<body id="page-mod-${type}-view" class="${classes}"><main id="region-main">${content}</main>`;
const service = client => new CourseContentService({
  getCoursePage: async () => coursePage(""),
  call: async () => ({ courses: [{ id: 7, fullname: "Example course" }], nextoffset: 0 }),
  ...client,
}, baseUrl);

test("reads only visible posts that start a discussion in the course's news forum", async () => {
  const forumRequests = [];
  const result = await service({
    getCoursePage: async () => coursePage(moduleItem(10, "forum", { hidden: true }) + moduleItem(11, "forum") + moduleItem(12, "forum")),
    getForumPage: async (id, page) => {
      forumRequests.push([id, page]);
      if (id === 11) return activityPage("forum", "", "forumtype-general");
      return activityPage("forum", `<div id="discussion-list-test" data-cmid="12"><table class="discussion-list"><tbody>
        <tr data-region="discussion-list-item" data-discussionid="80" data-forumid="17"><th class="topic">
          <a href="${baseUrl}/mod/forum/discuss.php?d=80">Exam schedule</a></th></tr>
        <tr class="dimmed_text" data-region="discussion-list-item" data-discussionid="81" data-forumid="17"><th class="topic">
          <a href="${baseUrl}/mod/forum/discuss.php?d=81">Hidden</a></th></tr>
        <tr data-region="discussion-list-item" data-discussionid="82" data-forumid="17"><th class="topic">
          <a href="https://offsite.example.test/mod/forum/discuss.php?d=82">External</a></th></tr>
      </tbody></table></div>`, "forumtype-news");
    },
    callBatch: async requests => {
      assert.deepEqual(requests, [{ method: "mod_forum_get_discussion_posts", args: { discussionid: 80 } }]);
      return [{ courseid: 7, forumid: 17, posts: [
        { discussionid: 80, hasparent: true, isdeleted: false, capabilities: { view: true }, subject: "Reply", message: "A reply" },
        { discussionid: 80, hasparent: false, isdeleted: false, capabilities: { view: true }, subject: "Exam schedule", author: { fullname: "Example instructor" }, timecreated: 1795000000, message: "<p>Room A &amp; B.</p><p>Bring your ID.</p><script>hidden</script>" },
      ] }];
    },
  }).getCourseAnnouncements(7, 1);
  assert.deepEqual(forumRequests, [[11, 1], [12, 1]]);
  assert.deepEqual(result, [{
    id: 80, title: "Exam schedule", messageText: "Room A & B. Bring your ID.", author: "Example instructor",
    postedAt: new Date(1795000000 * 1000).toISOString(), url: `${baseUrl}/mod/forum/discuss.php?d=80`,
  }]);
});

test("returns no announcements for a course with an empty news forum", async () => {
  const empty = await service({
    getCoursePage: async () => coursePage(moduleItem(12, "forum")),
    getForumPage: async () => activityPage("forum", '<div id="discussion-list-test" data-cmid="12"><div class="forumnodiscuss">No announcements</div></div>', "forumtype-news"),
  }).getCourseAnnouncements(7);
  assert.deepEqual(empty, []);
});

test("file and folder details only expose their Moodle file metadata", () => {
  const file = `${baseUrl}/pluginfile.php/8/mod_resource/content/1/Exam%20guide.pdf`;
  const result = parseMaterialDetail(activityPage("resource", `<div id="intro">Guide description</div><div class="resourceworkaround">
    <a href="${file}?forcedownload=1&amp;sesskey=private">Download</a><a href="https://offsite.example.test/pluginfile.php/8/mod_resource/content/1/external.pdf">External</a></div>`), "resource", baseUrl);
  assert.deepEqual(result, { description: "Guide description", files: [{ name: "Exam guide.pdf", url: `${file}?forcedownload=1` }] });
  const folderPath = `/9/mod_folder/content/0/Week%201/Slides.pdf`;
  const folder = parseMaterialDetail(activityPage("folder", `<div id="folder_tree0"><a href="${baseUrl}/pluginfile.php?file=${folderPath}&amp;token=private">Slides</a>
    <div hidden><a href="${baseUrl}/pluginfile.php/9/mod_folder/content/0/Hidden.pdf">Hidden</a></div></div>`), "folder", baseUrl);
  assert.deepEqual(folder, { files: [{ name: "Slides.pdf", url: `${baseUrl}/pluginfile.php?file=%2F9%2Fmod_folder%2Fcontent%2F0%2FWeek+1%2FSlides.pdf` }] });
});

test("page and URL details select the visible content without visiting linked URLs", () => {
  const page = parseMaterialDetail(activityPage("page", '<div class="activity-description">Overview</div><div class="generalbox center clearfix"><p>Read <b>chapter one</b>.</p><p>Then review.</p><div hidden>Private</div></div>'), "page", baseUrl);
  assert.deepEqual(page, { description: "Overview", contentText: "Read chapter one. Then review." });
  const link = parseMaterialDetail(activityPage("url", '<div id="intro"><div class="mediaplugin"><a href="https://other.example.test/">Reference</a></div></div><div class="urlworkaround"><a href="javascript:alert(1)">Bad link</a><a href="https://example.net/notes?topic=1&amp;sesskey=private">Notes</a></div>'), "url", baseUrl);
  assert.deepEqual(link, { description: "Reference", targetUrl: "https://example.net/notes?topic=1" });
});

test("rejects announcement data returned for a different course or forum", async () => {
  const content = service({
    getCoursePage: async () => coursePage(moduleItem(12, "forum")),
    getForumPage: async () => activityPage("forum", `<table class="discussion-list"><tbody>
      <tr data-region="discussion-list-item" data-discussionid="80" data-forumid="17"><th class="topic">
        <a href="discuss.php?d=80">Exam schedule</a></th></tr></tbody></table>`, "forumtype-news"),
    callBatch: async () => [{ courseid: 8, forumid: 17, posts: [] }],
  });
  await assert.rejects(content.getCourseAnnouncements(7), { code: "MOODLE_RESPONSE_ERROR" });
});

test("validates course and material IDs and verifies enrollment and visibility before loading details", async () => {
  const content = service({
    getCoursePage: async () => coursePage(moduleItem(12, "resource", { hidden: true }) + moduleItem(13, "resource", { query: "&amp;redirect=1" }) + moduleItem(14, "assign")),
    getMaterialPage: async (type, id) => {
      assert.deepEqual([type, id], ["resource", 13]);
      return activityPage("resource", '<div class="resourceworkaround"></div>');
    },
  });
  await assert.rejects(content.getCourseAnnouncements(0), { code: "INVALID_REQUEST" });
  await assert.rejects(content.getCourseAnnouncements(9), { code: "COURSE_NOT_ENROLLED" });
  await assert.rejects(content.getMaterialDetail(7, -1), { code: "INVALID_REQUEST" });
  await assert.rejects(content.getMaterialDetail(9, 13), { code: "COURSE_NOT_ENROLLED" });
  await assert.rejects(content.getMaterialDetail(7, 12), { code: "MATERIAL_NOT_AVAILABLE" });
  await assert.rejects(content.getMaterialDetail(7, 14), { code: "MATERIAL_NOT_AVAILABLE" });
  assert.deepEqual(await content.getMaterialDetail(7, 13), {
    id: 13, courseId: 7, name: "Module 13", type: "resource", url: `${baseUrl}/mod/resource/view.php?id=13`, files: [],
  });
});
