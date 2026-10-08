import { MCPTool, MCPInput } from "mcp-framework";
import { z } from "zod";

interface DeadlinesInput {
    message: string;
}

const schema = z.object({
    message: z.string().describe("Message to process")
});

class DeadlinesTool extends MCPTool<DeadlinesInput> {
    name = "deadlines";
    description = "Deadlines tool description";
    schema = schema;

    async execute(input: DeadlinesInput) {
        return `Processed: ${input.message}`;
    }
}

export default DeadlinesTool;
