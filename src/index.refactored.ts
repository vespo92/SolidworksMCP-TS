#!/usr/bin/env node

/**
 * SolidWorks MCP Server - Clean Architecture Implementation
 * Production-ready, maintainable, and scalable MCP server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';

// Core imports
import { 
  ILogger,
  IServiceLocator,
  Result,
  ResultUtil,
  DomainError
} from './core/interfaces/core-abstractions.js';

// Infrastructure imports
import { ConfigurationManager } from './infrastructure/config/configuration-manager.js';
import { SolidWorksAdapter } from './infrastructure/solidworks/solidworks-adapter.js';
import { Logger } from './infrastructure/logging/logger.js';
import { ServiceLocator } from './infrastructure/container/service-locator.js';

// Application imports
import { ToolRegistry } from './application/services/tool-registry.js';
import { CommandBus } from './application/services/command-bus.js';
import { QueryBus } from './application/services/query-bus.js';
import { EventBus } from './application/services/event-bus.js';

// Presentation imports
import { MCPRequestHandler } from './presentation/mcp/request-handler.js';
import { ErrorTransformer } from './presentation/transformers/error-transformer.js';
import { ResponseTransformer } from './presentation/transformers/response-transformer.js';

// Use cases
import { ModelingUseCases } from './application/use-cases/modeling/index.js';
import { DrawingUseCases } from './application/use-cases/drawing/index.js';
import { ExportUseCases } from './application/use-cases/export/index.js';
import { AnalysisUseCases } from './application/use-cases/analysis/index.js';
import { MacroUseCases } from './application/use-cases/macro/index.js';

/**
 * Main application class implementing clean architecture
 */
class SolidWorksMCPApplication {
  private server: Server;
  private logger: ILogger;
  private config: ConfigurationManager;
  private serviceLocator: IServiceLocator;
  private swAdapter: SolidWorksAdapter;
  private toolRegistry: ToolRegistry;
  private commandBus: CommandBus;
  private queryBus: QueryBus;
  private eventBus: EventBus;
  private requestHandler: MCPRequestHandler;
  private isInitialized: boolean = false;

  constructor() {
    // Initialize core services
    this.initializeCore();
  }

  /**
   * Initialize core services and dependencies
   */
  private initializeCore(): void {
    try {
      // 1. Setup configuration
      this.config = new ConfigurationManager();
      const configResult = this.config.load();
      if (!ResultUtil.isSuccess(configResult)) {
        throw configResult.error;
      }

      // 2. Setup logging
      this.logger = new Logger(this.config.get('logging'));
      this.logger.info('Initializing SolidWorks MCP Server', { 
        version: this.config.get('version'),
        environment: this.config.get('environment')
      });

      // 3. Setup dependency injection container
      this.serviceLocator = new ServiceLocator();
      this.registerServices();

      // 4. Setup infrastructure
      this.swAdapter = new SolidWorksAdapter({
        logger: this.logger,
        ...this.config.get('connection')
      });

      // 5. Setup application services
      this.commandBus = new CommandBus(this.logger);
      this.queryBus = new QueryBus(this.logger);
      this.eventBus = new EventBus(this.logger);
      this.toolRegistry = new ToolRegistry(this.logger);

      // 6. Setup presentation layer
      this.requestHandler = new MCPRequestHandler({
        logger: this.logger,
        toolRegistry: this.toolRegistry,
        commandBus: this.commandBus,
        queryBus: this.queryBus,
        errorTransformer: new ErrorTransformer(),
        responseTransformer: new ResponseTransformer()
      });

      // 7. Create MCP server
      this.server = new Server(
        {
          name: 'solidworks-mcp-server',
          version: this.config.get('version') || '3.0.0',
          description: 'Clean Architecture SolidWorks MCP Server'
        },
        {
          capabilities: {
            tools: {},
            resources: {}
          }
        }
      );

      // 8. Register use cases
      this.registerUseCases();

      // 9. Setup request handlers
      this.setupHandlers();

      this.isInitialized = true;
      this.logger.info('SolidWorks MCP Server initialized successfully');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to initialize server: ${message}`);
      process.exit(1);
    }
  }

  /**
   * Register services in the dependency injection container
   */
  private registerServices(): void {
    this.serviceLocator.register('logger', this.logger);
    this.serviceLocator.register('config', this.config);
    this.serviceLocator.register('swAdapter', () => this.swAdapter);
    this.serviceLocator.register('eventBus', () => this.eventBus);
  }

  /**
   * Register all use cases
   */
  private registerUseCases(): void {
    const useCaseGroups = [
      { name: 'modeling', useCases: new ModelingUseCases(this.swAdapter, this.logger) },
      { name: 'drawing', useCases: new DrawingUseCases(this.swAdapter, this.logger) },
      { name: 'export', useCases: new ExportUseCases(this.swAdapter, this.logger) },
      { name: 'analysis', useCases: new AnalysisUseCases(this.swAdapter, this.logger) },
      { name: 'macro', useCases: new MacroUseCases(this.swAdapter, this.logger) }
    ];

    for (const group of useCaseGroups) {
      const tools = group.useCases.getTools();
      for (const tool of tools) {
        this.toolRegistry.register(tool);
        this.logger.debug(`Registered tool: ${tool.name}`, { group: group.name });
      }
    }

    this.logger.info(`Registered ${this.toolRegistry.count()} tools`);
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return this.requestHandler.handleListTools();
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.requestHandler.handleCallTool(request);
    });

    // Setup error handling
    this.server.onerror = (error) => {
      this.logger.error('Server error', error as Error);
      return this.handleError(error);
    };

    // Setup connection lifecycle
    this.server.onconnect = async () => {
      this.logger.info('Client connected');
      
      if (this.config.get('connection.autoConnect')) {
        const connectResult = await this.swAdapter.connect();
        if (!ResultUtil.isSuccess(connectResult)) {
          this.logger.warn('Failed to auto-connect to SolidWorks', connectResult.error);
        }
      }
    };

    this.server.ondisconnect = async () => {
      this.logger.info('Client disconnected');
      
      const disconnectResult = await this.swAdapter.disconnect();
      if (!ResultUtil.isSuccess(disconnectResult)) {
        this.logger.warn('Failed to disconnect from SolidWorks', disconnectResult.error);
      }
    };
  }

  /**
   * Handle errors with proper transformation
   */
  private handleError(error: unknown): McpError {
    if (error instanceof DomainError) {
      return new McpError(
        ErrorCode.InternalError,
        error.message,
        error.toJSON()
      );
    }

    if (error instanceof Error) {
      return new McpError(
        ErrorCode.InternalError,
        error.message
      );
    }

    return new McpError(
      ErrorCode.InternalError,
      'An unexpected error occurred'
    );
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Server not initialized');
    }

    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      this.logger.info('Server started successfully');
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
    } catch (error) {
      this.logger.fatal('Failed to start server', error as Error);
      throw error;
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Disconnect from SolidWorks
        await this.swAdapter.disconnect();
        
        // Close server
        await this.server.close();
        
        this.logger.info('Server shut down successfully');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown', error as Error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      this.logger.fatal('Uncaught exception', error);
      shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      this.logger.fatal('Unhandled rejection', new Error(String(reason)));
      shutdown('unhandledRejection');
    });
  }
}

// ============================================
// APPLICATION ENTRY POINT
// ============================================

async function main() {
  try {
    const app = new SolidWorksMCPApplication();
    await app.start();
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
main().catch(console.error);