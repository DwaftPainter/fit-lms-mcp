import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { loadConfig } from "../config/env.js";
import { getAuthProvider } from "../moodle/auth/provider-factory.js";
import { MoodleClient } from "../moodle/client.js";
import { AssignmentService } from "../services/assignment.service.js";

class GetAssignmentDetailTool extends MCPTool<{ courseModuleId: number }> {
  name = "get_assignment_detail";
  description = "Get detailed information about an assignment, including submission status, grading status, due date, time remaining, and instructions.";
  annotations = { readOnlyHint: true, destructiveHint: false };
  schema = z.object({
    courseModuleId: z.number().int().positive().safe().describe("Course module ID of the assignment (from get_course_assignments or get_upcoming_deadlines)"),
  });

  async execute(input: { courseModuleId: number }) {
    const config = loadConfig();
    const client = new MoodleClient({ baseUrl: config.baseUrl, authProvider: getAuthProvider(config), timeoutMs: config.timeoutMs });
    return new AssignmentService(client, config.baseUrl).getAssignmentDetail(input.courseModuleId);
  }
}

export default GetAssignmentDetailTool;
