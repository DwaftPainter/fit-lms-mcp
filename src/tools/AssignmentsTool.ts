import { MCPTool, MCPInput } from "mcp-framework";
import { z } from "zod";

interface AssignmentsInput {
    message: string;
}

const schema = z.object({
    message: z.string().describe("Message to process")
});

class AssignmentsTool extends MCPTool<AssignmentsInput> {
    name = "assignments";
    description = "Assignments tool description";
    schema = schema;

    async execute(input: AssignmentsInput) {
        return `Processed: ${input.message}`;
    }
}

export default AssignmentsTool;
