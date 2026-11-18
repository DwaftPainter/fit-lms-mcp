import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { loadConfig } from "../config/env.js";
import { getAuthProvider } from "../moodle/auth/provider-factory.js";
import { MoodleClient } from "../moodle/client.js";
import { CourseContentService } from "../services/course-content.service.js";
import { getCourseMetadataCache } from "../services/course-metadata-cache.js";

interface GetCourseContentsInput {
  courseId: number;
  bypassCache?: boolean;
}

class GetCourseContentsTool extends MCPTool<GetCourseContentsInput> {
  name = "get_course_contents";
  description = "Get visible sections, activities and resource metadata in an enrolled course. Excludes hidden or inaccessible resources and does not download files.";
  annotations = { readOnlyHint: true, destructiveHint: false };
  schema = z.object({
    courseId: z.number().int().positive().safe().describe("Enrolled course ID from get_my_courses"),
    bypassCache: z.boolean().optional().describe("Fetch fresh course contents from Moodle"),
  });

  async execute(input: GetCourseContentsInput) {
    const config = loadConfig();
    return getCourseMetadataCache(config).contents.getOrLoad(input.courseId, () => {
      const client = new MoodleClient({ baseUrl: config.baseUrl, authProvider: getAuthProvider(config), timeoutMs: config.timeoutMs });
      return new CourseContentService(client, config.baseUrl).getCourseContents(input.courseId);
    }, input.bypassCache);
  }
}

export default GetCourseContentsTool;
