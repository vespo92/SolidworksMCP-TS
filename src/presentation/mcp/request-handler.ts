/**
 * MCP Request Handler
 * Handles incoming MCP requests and routes them appropriately
 */

import { 
  CallToolRequest,
  ListToolsResult,
  CallToolResult
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { 
  ILogger,
  ResultUtil,
  DomainError
} from '../../core/interfaces/core-abstractions.js';

import { ToolRegistry } from '../../application/services/tool-registry.js';
import { CommandBus } from '../../application/services/command-bus.js';
import { QueryBus } from '../../application/services/query-bus.js';
import { ErrorTransformer } from '../transformers/error-transformer.js';
import { ResponseTransformer } from '../transformers/response-transformer.js';

export interface MCPRequestHandlerConfig {
  logger: ILogger;
  toolRegistry: ToolRegistry;
  commandBus: CommandBus;
  queryBus: QueryBus;
  errorTransformer: ErrorTransformer;
  responseTransformer: ResponseTransformer;
}

export class MCPRequestHandler {
  private logger: ILogger;
  private toolRegistry: ToolRegistry;
  private commandBus: CommandBus;
  private queryBus: QueryBus;
  private errorTransformer: ErrorTransformer;
  private responseTransformer: ResponseTransformer;

  constructor(config: MCPRequestHandlerConfig) {
    this.logger = config.logger;
    this.toolRegistry = config.toolRegistry;
    this.commandBus = config.commandBus;
    this.queryBus = config.queryBus;
    this.errorTransformer = config.errorTransformer;
    this.responseTransformer = config.responseTransformer;
  }

  /**
   * Handle list tools request
   */
  async handleListTools(): Promise<ListToolsResult> {
    try {
      const tools = this.toolRegistry.getAll();
      
      const toolDescriptions = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema)
      }));

      this.logger.debug(`Listed ${tools.length} tools`);

      return {
        tools: toolDescriptions
      };
    } catch (error) {
      this.logger.error('Failed to list tools', error as Error);
      throw this.errorTransformer.transform(error);
    }
  }

  /**
   * Handle call tool request
   */
  async handleCallTool(request: CallToolRequest): Promise<CallToolResult> {
    const startTime = Date.now();
    const { name, arguments: args } = request;

    try {
      this.logger.info(`Executing tool: ${name}`, { args });

      // Get the tool
      const tool = this.toolRegistry.get(name);
      if (!tool) {
        throw new Error(`Tool not found: ${name}`);
      }

      // Validate input
      const validationResult = tool.inputSchema.safeParse(args);
      if (!validationResult.success) {
        throw new Error(`Invalid input: ${validationResult.error.message}`);
      }

      // Execute the tool
      const result = await tool.handler(validationResult.data);

      // Transform the response
      const transformedResult = this.responseTransformer.transform(result);

      const duration = Date.now() - startTime;
      this.logger.info(`Tool executed successfully: ${name}`, { 
        duration,
        hasContent: !!transformedResult.content,
        isError: !!transformedResult.isError
      });

      return transformedResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Tool execution failed: ${name}`, error as Error, { duration });
      
      // Transform error to MCP format
      const mcpError = this.errorTransformer.transform(error);
      
      return {
        content: [
          {
            type: 'text',
            text: mcpError.message
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Validate tool request
   */
  private validateToolRequest(request: CallToolRequest): void {
    if (!request.name) {
      throw new Error('Tool name is required');
    }

    if (!this.toolRegistry.has(request.name)) {
      throw new Error(`Unknown tool: ${request.name}`);
    }
  }
}