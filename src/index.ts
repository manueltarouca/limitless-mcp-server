import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport as ServerStdioTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import readline from 'readline/promises';

const LIMITLESS_API_BASE = 'https://api.limitless.ai';
const LIMITLESS_API_KEY = process.env.LIMITLESS_API_KEY;
if (!LIMITLESS_API_KEY) {
  console.error('Missing LIMITLESS_API_KEY in environment variables');
  process.exit(1);
}

/**
 * Helper function to perform HTTP GET requests using fetch.
 * It appends query parameters if provided.
 */
async function makeLimitlessRequest<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  if (params) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        qs.append(key, String(value));
      }
    }
    url = `${url}?${qs.toString()}`;
  }
  const headers = {
    'X-API-KEY': `${LIMITLESS_API_KEY}`,
    'Content-Type': 'application/json',
  };
  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Request failed: ${response.status} ${errorText}`);
  }
  return (await response.json()) as T;
}

/* =================== SERVER CODE (GET endpoints only) =================== */

// Schema for GET /v1/lifelogs query parameters
const getLifelogsSchema = {
  timezone: z.string().optional(),
  date: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  cursor: z.string().optional(),
  direction: z.enum(['asc', 'desc']).optional().default('desc'),
  includeMarkdown: z.boolean().optional().default(true),
  includeHeadings: z.boolean().optional().default(true),
  limit: z.number().optional(),
};

async function runServer() {
  const server = new McpServer({
    name: 'Limitless Lifelog Server',
    version: '1.0.0',
  });

  // Tool: getLifelogs
  server.tool('getLifelogs', 'Retrieve a list of lifelogs.', getLifelogsSchema, async (params) => {
    try {
      const lifelogs = await makeLimitlessRequest<any>(`${LIMITLESS_API_BASE}/v1/lifelogs`, params);
      return { content: [{ type: 'text', text: JSON.stringify(lifelogs, null, 2) }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: `Error fetching lifelogs: ${error.message}` }], isError: true };
    }
  });

  const transport = new ServerStdioTransport();
  await server.connect(transport);
  console.error('MCP Server running on stdio');
}

/* =================== CLIENT CODE =================== */

async function runClient() {
  const __filename = fileURLToPath(import.meta.url);
  const client = new Client({ name: 'lifelog-client', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [__filename, 'server'],
    env: { LIMITLESS_API_KEY: `${LIMITLESS_API_KEY}` },
  });
  await client.connect(transport);
  const toolsResponse = await client.listTools();
  console.log(
    'Connected. Available tools:',
    toolsResponse.tools.map((tool) => tool.name)
  );

  try {
    // Call the "getLifelogs" tool with no parameters.
    const response = await client.callTool({
      name: 'getLifelogs',
      arguments: {},
    });
    console.log('Response from getLifelogs:', JSON.stringify(response, null, 2));
  } catch (error: any) {
    console.error('Error:', error.message);
  }
  await client.close();
}

async function runInteractiveClient() {
  const __filename = fileURLToPath(import.meta.url);
  const client = new Client({ name: 'lifelog-client', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [__filename, 'server'],
    env: { LIMITLESS_API_KEY: `${LIMITLESS_API_KEY}` },
  });
  await client.connect(transport);
  const toolsResponse = await client.listTools();
  console.log(
    'Connected. Available tools:',
    toolsResponse.tools.map((t) => t.name)
  );
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const toolName = await rl.question("Enter tool name (or 'quit'): ");
      if (toolName.toLowerCase() === 'quit') break;
      const paramsInput = await rl.question('Enter JSON parameters (or {}): ');
      let params = {};
      try {
        params = JSON.parse(paramsInput || '{}');
      } catch (e) {
        console.error('Invalid JSON. Try again.');
        continue;
      }
      try {
        const response = await client.callTool({ name: toolName, arguments: params });
        console.log('Response:', JSON.stringify(response, null, 2));
      } catch (error: any) {
        console.error('Error:', error.message);
      }
    }
  } finally {
    rl.close();
  }
  await client.close();
}

/* =================== MODE SELECTION =================== */

const mode = process.argv[2];
if (mode === 'server') {
  runServer().catch((err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
} else if (mode === 'client') {
  runClient().catch((err) => {
    console.error('Client error:', err);
    process.exit(1);
  });
} else if (mode === 'interactive') {
  runInteractiveClient().catch((err) => {
    console.error('Interactive client error:', err);
    process.exit(1);
  });
} else {
  console.error('Usage: node build/index.js [server|client|interactive]');
  process.exit(1);
}
