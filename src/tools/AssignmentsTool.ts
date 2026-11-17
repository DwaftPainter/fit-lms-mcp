import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { loadConfig } from "../config/env.js";
import { getAuthProvider } from "../moodle/auth/provider-factory.js";
import { MoodleClient } from "../moodle/client.js";
import { AssignmentInput, AssignmentService } from "../services/assignment.service.js";

class AssignmentsTool extends MCPTool<AssignmentInput> {
  name = "assignments";
  description = "List visible assignments in enrolled courses using authenticated Moodle assignment index pages; optionally filter by courseId. Does not infer submission status or dates.";
  schema = z.object({ courseId: z.number().int().positive().optional().describe("Only assignments in this enrolled course") });

  async execute(input: AssignmentInput) {
    const config = loadConfig();
    const client = new MoodleClient({ baseUrl: config.baseUrl, authProvider: getAuthProvider(config), timeoutMs: config.timeoutMs });
    return new AssignmentService(client, config.baseUrl).getAssignments(input);
  }
}

export default AssignmentsTool;
