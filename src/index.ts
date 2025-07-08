#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import dotenv from 'dotenv';

// Import our tools
import { modelingTools } from './tools/modeling.js';
import { drawingTools } from './tools/drawing.js';
import { exportTools } from './tools/export.js';
import { vbaTools } from './tools/vba.js';
import { analysisTools } from './tools/analysis.js';
import { SolidWorksAPI } from './solidworks/api.js';

dotenv.config();

// Initialize SolidWorks API
const swApi = new SolidWorksAPI();

// Create MCP server
const server = new Server(
  {
    name: 'mcp-server-solidworks',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Combine all tools
const allTools = [
  ...modelingTools,
  ...drawingTools,
  ...exportTools,
  ...vbaTools,
  ...analysisTools,
];

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  const tool = allTools.find(t => t.name === name);
  if (!tool) {
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Tool "${name}" not found`
    );
  }

  try {
    // Validate input
    const validatedArgs = tool.inputSchema.parse(args);
    
    // Ensure SolidWorks connection
    if (!swApi.isConnected()) {
      await swApi.connect();
    }
    
    // Execute tool
    const result = await tool.handler(validatedArgs, swApi);
    
    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }
    throw error;
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    await swApi.disconnect();
    await server.close();
    process.exit(0);
  });
}

main().catch(console.error);