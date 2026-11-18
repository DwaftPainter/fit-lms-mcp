import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { loadConfig } from "../config/env.js";
import { getAuthProvider } from "../moodle/auth/provider-factory.js";
import { MoodleClient } from "../moodle/client.js";
import { CourseContentService } from "../services/course-content.service.js";

class GetCourseAnnouncementsTool extends MCPTool<{ courseId: number; page?: number }> {
  name = "get_course_announcements";
  description = "Read up to 10 visible announcements from the Moodle Announcements forum in an enrolled course, one page at a time.";
  annotations = { readOnlyHint: true, destructiveHint: false };
  schema = z.object({
    courseId: z.number().int().positive().safe().describe("Enrolled course ID from get_my_courses"),
    page: z.number().int().nonnegative().safe().optional().describe("Zero-based page number. Defaults to 0."),
  });

  async execute(input: { courseId: number; page?: number }) {
    const config = loadConfig();
    const client = new MoodleClient({ baseUrl: config.baseUrl, authProvider: getAuthProvider(config), timeoutMs: config.timeoutMs });
    return new CourseContentService(client, config.baseUrl).getCourseAnnouncements(input.courseId, input.page);
  }
}

export default GetCourseAnnouncementsTool;
