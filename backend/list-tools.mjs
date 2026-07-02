import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_SERVER_URL = "https://mcp.kapruka.com/mcp";
const CONNECT_TIMEOUT_MS = 15000;

async function main() {
  console.log(`Connecting to ${MCP_SERVER_URL}...`);
  const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
  const client = new Client({ name: "gift-concierge-tool-list", version: "0.1.0" }, {
    capabilities: {},
  });

  // Set timeout for connection
  const connectPromise = client.connect(transport);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Connection timeout after ${CONNECT_TIMEOUT_MS}ms`)), CONNECT_TIMEOUT_MS)
  );

  await Promise.race([connectPromise, timeoutPromise]);
  console.log("Connected.");

  // List tools
  const { tools } = await client.listTools();
  console.log(`Found ${tools.length} tools:`);

  for (const tool of tools) {
    console.log(`\nTool: ${tool.name}`);
    console.log(`Description: ${tool.description || "(no description)"}`);
    console.log("Input Schema:");
    console.log(JSON.stringify(tool.inputSchema, null, 2));
  }

  // Cleanup
  await client.close();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});