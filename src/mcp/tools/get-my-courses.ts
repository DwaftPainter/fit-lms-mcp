import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { loadConfig } from "../../config/env.js";
import { getAuthProvider } from "../../moodle/auth/provider-factory.js";
import { MoodleClient } from "../../moodle/client.js";
import { getCourseMetadataCache } from "../../services/course-metadata-cache.js";
import { CourseService } from "../../services/course.service.js";

interface GetMyCoursesInput {
  classification?: "all" | "inprogress" | "future" | "past";
  bypassCache?: boolean;
}

const schema = z.object({
  classification: z
    .enum(["all", "inprogress", "future", "past"])
    .optional()
    .default("all")
    .describe("Filter courses by timeline classification (default: 'all')"),
  bypassCache: z.boolean().optional().describe("Fetch a fresh course list from Moodle"),
});

export class GetMyCoursesTool extends MCPTool<GetMyCoursesInput> {
  name = "get_my_courses";
  annotations = { readOnlyHint: true, destructiveHint: false };
  description = "Get the list of enrolled courses for the authenticated student";
  schema = schema;

  async execute(input: GetMyCoursesInput) {
    const config = loadConfig();
    const classification = input.classification ?? "all";
    return getCourseMetadataCache(config).courses.getOrLoad(classification, () => {
      const client = new MoodleClient({ baseUrl: config.baseUrl, authProvider: getAuthProvider(config), timeoutMs: config.timeoutMs });
      return new CourseService(client).getMyCourses(classification);
    }, input.bypassCache);
  }
}

export default GetMyCoursesTool;
