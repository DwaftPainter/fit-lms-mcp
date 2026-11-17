import { MCPTool } from "mcp-framework";
import { loadConfig } from "../config/env.js";
import { getAuthProvider } from "../moodle/auth/provider-factory.js";
import { MoodleClient } from "../moodle/client.js";
import { DeadlineService, UpcomingDeadlineInput, upcomingDeadlineInputSchema } from "../services/deadline.service.js";

class GetUpcomingDeadlinesTool extends MCPTool<UpcomingDeadlineInput> {
  name = "get_upcoming_deadlines";
  description = "Get assignment deadlines in the next 7 days by default, ordered by due date. Supports daysAhead, explicit from/to bounds, courseId and includePast. Calendar action events may not cover every assignment.";
  annotations = { readOnlyHint: true, destructiveHint: false };
  schema = upcomingDeadlineInputSchema;

  async execute(input: UpcomingDeadlineInput) {
    const config = loadConfig();
    const client = new MoodleClient({ baseUrl: config.baseUrl, authProvider: getAuthProvider(config), timeoutMs: config.timeoutMs });
    return new DeadlineService(client, config.baseUrl).getUpcomingDeadlines(input);
  }
}

export default GetUpcomingDeadlinesTool;
