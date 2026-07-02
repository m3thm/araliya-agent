// Wraps a single MCP server connection over Streamable HTTP (the
// transport remote MCP servers like Kapruka's use), lists its tools,
// converts them to OpenAI-compatible function definitions (the shape
// OpenRouter's chat completions endpoint expects), and executes tool
// calls on demand. This is the only file that knows MCP exists —
// server.ts just calls listToolsForOpenAI() / callTool().
//
// Every network-touching step is wrapped in withTimeout() and logged
// with elapsed time. Without this, a slow or stuck remote MCP server
// just hangs the request forever with zero signal in the terminal —
// these logs are what let you tell "still connecting" apart from
// "actually frozen" apart from "the model is just being slow."

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { withTimeout } from "./withTimeout.js";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? "https://mcp.kapruka.com/mcp";
const CONNECT_TIMEOUT_MS = 15_000;
const LIST_TOOLS_TIMEOUT_MS = 10_000;
const CALL_TOOL_TIMEOUT_MS = 20_000;

export interface OpenAIToolDef {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Resolves $ref pointers inside a JSON Schema using the $defs map.
 * Does a shallow one-hop resolution — enough for the Kapruka MCP
 * schema pattern (properties.params.$ref → $defs.X).
 */
function resolveRef(
  value: unknown,
  defs: Record<string, unknown>
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveRef(item, defs));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$ref === "string") {
      const refPath = obj.$ref.replace("#/$defs/", "");
      const resolved = defs[refPath];
      if (resolved && typeof resolved === "object") {
        // Merge the resolved definition back — preserve any local overrides
        return { ...(resolved as Record<string, unknown>) };
      }
    }
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = resolveRef(val, defs);
    }
    return result;
  }
  return value;
}

/**
 * Kapruka's MCP tools wrap their actual arguments inside a `params`
 * object (e.g. {params: {q: "..."}}). This function detects that
 * pattern and unwraps it, so the model sees flat arguments like
 * {q: "..."} instead of the nesting + $ref clutter.
 *
 * It also resolves any $ref pointers from $defs for models that
 * don't handle JSON Schema references natively.
 */
function flattenToolParameters(
  rawSchema: Record<string, unknown>
): Record<string, unknown> {
  const defs = (rawSchema.$defs ?? {}) as Record<string, unknown>;
  let schema = resolveRef(rawSchema, defs) as Record<string, unknown>;

  // Check if the only required property is "params" and it has a resolved
  // object type underneath — that's the Kapruka pattern we unwrap.
  const props = schema.properties as Record<string, unknown> | undefined;
  const required = schema.required as string[] | undefined;
  if (
    props &&
    required?.length === 1 &&
    required[0] === "params" &&
    props.params &&
    typeof props.params === "object"
  ) {
    const inner = props.params as Record<string, unknown>;
    if (inner.properties && typeof inner.properties === "object") {
      schema = {
        type: "object",
        properties: inner.properties,
        required: inner.required as string[] | undefined,
      };
    }
  }

  // Strip $defs — resolved references are inlined, so these are clutter
  delete schema.$defs;
  // Strip title too — some models get confused by redundant metadata
  delete (schema as Record<string, unknown>).title;

  // Remove response_format from the model-facing schema — we always
  // inject `response_format: "json"` in callTool() so the model
  // doesn't need to think about it.
  const flatProps = schema.properties as Record<string, unknown> | undefined;
  if (flatProps && typeof flatProps.response_format !== "undefined") {
    delete flatProps.response_format;
  }

  return schema;
}

class McpClientWrapper {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  // Swap MCP_SERVER_URL in .env to point at a different remote MCP
  // server later — nothing else in the backend needs to change.
  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    const startedAt = Date.now();
    console.log(`[mcp] connecting to ${MCP_SERVER_URL}...`);

    this.connecting = withTimeout(
      (async () => {
        const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
        const client = new Client({ name: "gift-concierge-backend", version: "0.1.0" }, {
          capabilities: {},
        });
        await client.connect(transport);
        return client;
      })(),
      CONNECT_TIMEOUT_MS,
      "MCP connect"
    )
      .then((client) => {
        console.log(`[mcp] connected in ${Date.now() - startedAt}ms`);
        this.client = client;
        return client;
      })
      .catch((error) => {
        // Let the next call retry instead of caching a failed connection.
        this.connecting = null;
        console.error(`[mcp] connect failed after ${Date.now() - startedAt}ms:`, error.message);
        throw error;
      });

    return this.connecting;
  }

  /**
   * Lists tools from the server, optionally restricted to an allow-list
   * of tool names. Phase 2's checkout flow needs more of Kapruka's tools
   * than search alone, so the allow-list is passed in by the caller
   * rather than hardcoded here.
   *
   * The returned schemas are flattened so the model sees clean
   * argument names without $ref/params wrapping.
   */
  async listToolsForOpenAI(allowedNames?: string[]): Promise<OpenAIToolDef[]> {
    const client = await this.connect();

    const startedAt = Date.now();
    const { tools } = await withTimeout(client.listTools(), LIST_TOOLS_TIMEOUT_MS, "MCP listTools");
    console.log(`[mcp] listTools returned ${tools.length} tool(s) in ${Date.now() - startedAt}ms`);

    const filtered = allowedNames
      ? tools.filter((tool) => allowedNames.includes(tool.name))
      : tools;

    return filtered.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: flattenToolParameters(tool.inputSchema as Record<string, unknown>),
      },
    }));
  }

  /**
   * Calls an MCP tool. Kapruka's tools expect their arguments nested
   * under a `params` key, so we automatically wrap them here.
   * This keeps the model-facing schema flat while sending the
   * correct shape to the server.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const client = await this.connect();

    // Kapruka's input schemas are wrapped in {params: {...}}.
    // The model was given a flat schema (no params wrapper),
    // so we add the wrapper here.
    // We also always request JSON output so the frontend can
    // parse products from the response reliably.
    const mcpArgs = { params: { ...args, response_format: "json" } };

    const startedAt = Date.now();
    console.log(`[mcp] calling ${name} with`, mcpArgs);
    const result = await withTimeout(
      client.callTool({ name, arguments: mcpArgs }),
      CALL_TOOL_TIMEOUT_MS,
      `MCP callTool(${name})`
    );
    console.log(`[mcp] ${name} returned in ${Date.now() - startedAt}ms`);

    const content = result.content as Array<{ type: string; text?: string }>;
    const textBlock = content.find((block) => block.type === "text");
    return textBlock?.text ?? "";
  }
}

export const mcpClient = new McpClientWrapper();