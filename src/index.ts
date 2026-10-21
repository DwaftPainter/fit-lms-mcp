import { MCPServer } from "mcp-framework";
import { loadConfig } from "./config/env.js";

loadConfig();
const server = new MCPServer();

server.start();
