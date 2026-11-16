import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { loadConfig } from "../config/env.js";
import { ManualSessionProvider } from "../moodle/auth/manual-session-provider.js";
import { MoodleClient } from "../moodle/client.js";
import { AssignmentService } from "../services/assignment.service.js";

class GetCourseAssignmentsTool extends MCPTool<{ courseId: number }> {
  name = "get_course_assignments";
  description = "List visible assignments in an enrolled course. IDs identify course modules. Unavailable optional dates and submission status are omitted.";
  annotations = { readOnlyHint: true, destructiveHint: false };
  schema = z.object({ courseId: z.number().int().positive().safe().describe("Enrolled course ID from get_my_courses") });

  async execute(input: { courseId: number }) {
    const config = loadConfig();
    const client = new MoodleClient({ baseUrl: config.baseUrl, authProvider: ManualSessionProvider.fromConfig(config), timeoutMs: config.timeoutMs });
    return new AssignmentService(client, config.baseUrl).getCourseAssignments(input.courseId);
  }
}

export default GetCourseAssignmentsTool;
