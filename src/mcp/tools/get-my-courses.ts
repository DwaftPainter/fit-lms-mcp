import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { loadConfig } from "../../config/env.js";
import { getAuthProvider } from "../../moodle/auth/provider-factory.js";
import { MoodleClient } from "../../moodle/client.js";
import { CourseService } from "../../services/course.service.js";

interface GetMyCoursesInput {
  classification?: "all" | "inprogress" | "future" | "past";
}

const schema = z.object({
  classification: z
    .enum(["all", "inprogress", "future", "past"])
    .optional()
    .default("all")
    .describe("Filter courses by timeline classification (default: 'all')"),
});

export class GetMyCoursesTool extends MCPTool<GetMyCoursesInput> {
  name = "get_my_courses";
  annotations = { readOnlyHint: true, destructiveHint: false };
  description = "Get the list of enrolled courses for the authenticated student";
  schema = schema;

  async execute(input: GetMyCoursesInput) {
    const config = loadConfig();
    const authProvider = getAuthProvider(config);
    const client = new MoodleClient({
      baseUrl: config.baseUrl,
      authProvider,
      timeoutMs: config.timeoutMs,
    });
    const courseService = new CourseService(client);
    return await courseService.getMyCourses(input.classification ?? "all");
  }
}

export default GetMyCoursesTool;
