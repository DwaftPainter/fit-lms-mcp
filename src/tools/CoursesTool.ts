import { MCPTool, MCPInput } from "mcp-framework";
import { z } from "zod";

interface CoursesInput {
  message: string;
}

const schema = z.object({
  message: z.string().describe("Message to process"),
});

class CoursesTool extends MCPTool<CoursesInput> {
  name = "courses";
  description = "Courses tool description";
  schema = schema;

  async execute(input: CoursesInput) {
    return `Processed: ${input.message}`;
  }
}

export default CoursesTool;