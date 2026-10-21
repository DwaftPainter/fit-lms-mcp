import { MCPServer, MCPServerConfig } from "mcp-framework";
import GetMyCoursesTool from "./tools/get-my-courses.js";

export function createServer(config?: MCPServerConfig): MCPServer {
  const server = new MCPServer({
    name: "hanu-lms-mcp",
    version: "0.0.1",
    ...config,
  });

  server.addTool(GetMyCoursesTool);

  return server;
}

export default createServer;
