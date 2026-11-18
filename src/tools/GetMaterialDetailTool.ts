import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { loadConfig } from "../config/env.js";
import { getAuthProvider } from "../moodle/auth/provider-factory.js";
import { MoodleClient } from "../moodle/client.js";
import { CourseContentService } from "../services/course-content.service.js";

class GetMaterialDetailTool extends MCPTool<{ courseId: number; courseModuleId: number }> {
  name = "get_material_detail";
  description = "Read details for a visible File, Folder, Page or URL from get_course_contents. Returns Moodle file links without downloading files or opening external links.";
  annotations = { readOnlyHint: true, destructiveHint: false };
  schema = z.object({
    courseId: z.number().int().positive().safe().describe("Enrolled course ID from get_my_courses"),
    courseModuleId: z.number().int().positive().safe().describe("Material module ID from get_course_contents"),
  });

  async execute(input: { courseId: number; courseModuleId: number }) {
    const config = loadConfig();
    const client = new MoodleClient({ baseUrl: config.baseUrl, authProvider: getAuthProvider(config), timeoutMs: config.timeoutMs });
    return new CourseContentService(client, config.baseUrl).getMaterialDetail(input.courseId, input.courseModuleId);
  }
}

export default GetMaterialDetailTool;
