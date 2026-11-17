import { loadConfig } from "./config/env.js";
import { createServer } from "./mcp/server.js";

loadConfig();

const server = createServer();
server.start();
