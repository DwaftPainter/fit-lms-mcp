import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { loadConfig } from "../config/env.js";
import { ManualSessionProvider } from "../moodle/auth/manual-session-provider.js";
import { MoodleClient } from "../moodle/client.js";
import { CourseContentService } from "../services/course-content.service.js";

class GetCourseContentsTool extends MCPTool<{ courseId: number }> {
  name = "get_course_contents";
  description = "Get visible sections, activities and resource metadata in an enrolled course. Excludes hidden or inaccessible resources and does not download files.";
  annotations = { readOnlyHint: true, destructiveHint: false };
  schema = z.object({ courseId: z.number().int().positive().safe().describe("Enrolled course ID from get_my_courses") });

  async execute(input: { courseId: number }) {
    const config = loadConfig();
    const client = new MoodleClient({ baseUrl: config.baseUrl, authProvider: ManualSessionProvider.fromConfig(config), timeoutMs: config.timeoutMs });
    return new CourseContentService(client, config.baseUrl).getCourseContents(input.courseId);
  }
}

export default GetCourseContentsTool;
