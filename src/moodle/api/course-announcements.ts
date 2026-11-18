import { parse, parseFragment } from "parse5";
import { z } from "zod";
import { ANNOUNCEMENTS_PAGE_SIZE, type MoodleClient } from "../client.js";
import { MoodleError } from "../errors.js";
import { attr, hasClass, readableText, visibleElements } from "../html.js";

interface Discussion {
  id: number;
  forumId: number;
}

export interface CourseAnnouncement {
  id: number;
  title: string;
  messageText: string;
  author?: string;
  postedAt?: string;
  url: string;
}

const discussionPostsSchema = z.object({
  courseid: z.number(),
  forumid: z.number(),
  posts: z.array(z.object({
    discussionid: z.number(),
    hasparent: z.boolean(),
    isdeleted: z.boolean(),
    capabilities: z.object({ view: z.boolean().nullable() }),
    subject: z.string(),
    message: z.string(),
    author: z.object({ fullname: z.string() }).nullish(),
    timecreated: z.number().int().min(0).max(253402300799).nullish(),
  })),
});

const responseError = () => new MoodleError("Unrecognized Moodle forum response", "MOODLE_RESPONSE_ERROR");

export function parseAnnouncementsForum(html: string, baseUrl: string): Discussion[] | null {
  const document = visibleElements(parse(html));
  const body = document.find(element => element.tagName === "body");
  const main = document.find(element => attr(element, "id") === "region-main");
  if (!body || attr(body, "id") !== "page-mod-forum-view" || !main) throw responseError();
  if (!hasClass(body, "forumtype-news")) return null;

  const discussions = new Map<number, Discussion>();
  const forumUrl = new URL(`${baseUrl}/mod/forum/view.php`);
  const discussionPath = new URL("discuss.php", forumUrl).pathname;
  const table = visibleElements(main).find(element => element.tagName === "table" && hasClass(element, "discussion-list"));
  if (!table) return [];
  for (const row of visibleElements(table)) {
    if (attr(row, "data-region") !== "discussion-list-item") continue;
    const id = Number(attr(row, "data-discussionid"));
    const forumId = Number(attr(row, "data-forumid"));
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(forumId) || forumId <= 0) continue;
    const topic = visibleElements(row).find(element => hasClass(element, "topic"));
    const hasDiscussionLink = topic && visibleElements(topic).some(element => {
      const href = attr(element, "href");
      if (element.tagName !== "a" || !href) return false;
      try {
        const url = new URL(href, forumUrl);
        return url.origin === forumUrl.origin && !url.username && !url.password &&
          url.pathname === discussionPath && url.search === `?d=${id}`;
      } catch {
        return false;
      }
    });
    if (hasDiscussionLink) discussions.set(id, { id, forumId });
  }
  return [...discussions.values()].slice(0, ANNOUNCEMENTS_PAGE_SIZE);
}

export async function fetchCourseAnnouncements(client: MoodleClient, courseId: number, discussions: Discussion[], baseUrl: string): Promise<CourseAnnouncement[]> {
  if (!discussions.length) return [];
  const responses = await client.callBatch(discussions.map(({ id }) => ({
    method: "mod_forum_get_discussion_posts",
    args: { discussionid: id },
  })));
  return discussions.flatMap(({ id, forumId }, index) => {
    const result = discussionPostsSchema.safeParse(responses[index]);
    if (!result.success || result.data.courseid !== courseId || result.data.forumid !== forumId) throw responseError();
    const post = result.data.posts.find(item => item.discussionid === id && !item.hasparent && !item.isdeleted && item.capabilities.view === true);
    if (!post) return [];
    return [{
      id,
      title: post.subject,
      messageText: readableText(parseFragment(post.message)),
      author: post.author?.fullname || undefined,
      postedAt: post.timecreated ? new Date(post.timecreated * 1000).toISOString() : undefined,
      url: `${baseUrl}/mod/forum/discuss.php?d=${id}`,
    }];
  });
}
