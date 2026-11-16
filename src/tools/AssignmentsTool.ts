import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { loadConfig } from "../config/env.js";
import { ManualSessionProvider } from "../moodle/auth/manual-session-provider.js";
import { MoodleClient } from "../moodle/client.js";
import { AssignmentInput, AssignmentService } from "../services/assignment.service.js";

class AssignmentsTool extends MCPTool<AssignmentInput> {
  name = "assignments";
  description = "List visible assignments in enrolled courses using authenticated Moodle assignment index pages; optionally filter by courseId. Does not infer submission status or dates.";
  schema = z.object({ courseId: z.number().int().positive().optional().describe("Only assignments in this enrolled course") });

  async execute(input: AssignmentInput) {
    const config = loadConfig();
    const client = new MoodleClient({ baseUrl: config.baseUrl, authProvider: ManualSessionProvider.fromConfig(config), timeoutMs: config.timeoutMs });
    return new AssignmentService(client, config.baseUrl).getAssignments(input);
  }
}

export default AssignmentsTool;
