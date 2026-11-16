import { MCPTool } from "mcp-framework";
import { loadConfig } from "../config/env.js";
import { ManualSessionProvider } from "../moodle/auth/manual-session-provider.js";
import { MoodleClient } from "../moodle/client.js";
import { DeadlineInput, DeadlineService, deadlineInputSchema } from "../services/deadline.service.js";

class DeadlinesTool extends MCPTool<DeadlineInput> {
  name = "deadlines";
  description = "Get assignment due events from the student's Moodle calendar; defaults to upcoming deadlines. Calendar events may not cover every assignment.";
  schema = deadlineInputSchema;

  async execute(input: DeadlineInput) {
    const config = loadConfig();
    const client = new MoodleClient({
      baseUrl: config.baseUrl,
      authProvider: ManualSessionProvider.fromConfig(config),
      timeoutMs: config.timeoutMs,
    });
    return new DeadlineService(client, config.baseUrl).getDeadlines(input);
  }
}

export default DeadlinesTool;
