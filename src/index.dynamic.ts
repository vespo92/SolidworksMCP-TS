#!/usr/bin/env node

/**
 * SolidWorks MCP Server - Dynamic Architecture
 * Enhanced server with plugin system, middleware pipeline, and dynamic tool loading
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import dotenv from 'dotenv';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

// Core tools system
import {
  DynamicToolRegistry,
  DefaultFeatureFlagProvider,
  PluginLoader,
  createLoggingMiddleware,
  createTimingMiddleware,
  createRetryMiddleware,
  createCircuitBreakerMiddleware,
  createMacroRecordingMiddleware,
  upgradeTools,
} from './core/tools/index.js';

// Import logging
import { createLogger } from './infrastructure/logging/logger.js';
import { ILogger } from './core/interfaces/core-abstractions.js';

// Import existing tools (for migration)
import { modelingTools } from './tools/modeling.js';
import { drawingTools } from './tools/drawing.js';
import { exportTools } from './tools/export.js';
import { vbaTools } from './tools/vba.js';
import { analysisTools } from './tools/analysis.js';
import { sketchTools } from './tools/sketch.js';

// Import resources and state
import { ResourceStateStore } from './state/store.js';
import { MacroRecorder } from './macro/index.js';
import { SolidWorksAPI } from './solidworks/api.js';

dotenv.config();

// ============================================
// CONFIGURATION
// ============================================

const ConfigSchema = z.object({
  solidworksPath: z.string().optional(),
  enableMacroRecording: z.boolean().default(true),
  enablePDM: z.boolean().default(false),
  enablePlugins: z.boolean().default(true),
  pluginDirs: z.array(z.string()).default(['./plugins']),
  enableCircuitBreaker: z.boolean().default(true),
  circuitBreakerThreshold: z.number().default(5),
  enableRetry: z.boolean().default(true),
  maxRetries: z.number().default(3),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  stateFile: z.string().optional(),
});

type Config = z.infer<typeof ConfigSchema>;

// ============================================
// DYNAMIC MCP SERVER
// ============================================

class DynamicSolidWorksMCPServer {
  private server: Server;
  private api: SolidWorksAPI;
  private registry: DynamicToolRegistry;
  private pluginLoader: PluginLoader;
  private stateStore: ResourceStateStore;
  private macroRecorder: MacroRecorder;
  private config: Config;
  private logger: ILogger;

  constructor() {
    // Parse configuration
    this.config = ConfigSchema.parse({
      solidworksPath: process.env.SOLIDWORKS_PATH,
      enableMacroRecording: process.env.ENABLE_MACRO_RECORDING !== 'false',
      enablePDM: process.env.ENABLE_PDM === 'true',
      enablePlugins: process.env.ENABLE_PLUGINS !== 'false',
      pluginDirs: process.env.PLUGIN_DIRS?.split(',') || ['./plugins'],
      enableCircuitBreaker: process.env.ENABLE_CIRCUIT_BREAKER !== 'false',
      circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5'),
      enableRetry: process.env.ENABLE_RETRY !== 'false',
      maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
      environment: process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || 'info',
      stateFile: process.env.STATE_FILE,
    });

    // Initialize logger
    this.logger = createLogger({
      level: this.config.logLevel,
      service: 'solidworks-mcp-dynamic',
    });

    // Initialize components
    this.api = new SolidWorksAPI();
    this.stateStore = new ResourceStateStore(this.config.stateFile);
    this.macroRecorder = new MacroRecorder();

    // Initialize feature flags
    const featureFlags = new DefaultFeatureFlagProvider(this.config.environment);
    featureFlags.setFlag('pdm', this.config.enablePDM);
    featureFlags.setFlag('macroRecording', this.config.enableMacroRecording);

    // Initialize dynamic registry
    this.registry = new DynamicToolRegistry({
      logger: this.logger,
      featureFlagProvider: featureFlags,
    });

    // Initialize plugin loader
    this.pluginLoader = new PluginLoader({
      logger: this.logger,
      pluginDirs: this.config.pluginDirs,
    });

    // Create MCP server
    this.server = new Server(
      {
        name: 'solidworks-mcp-server-dynamic',
        version: packageJson.version,
        description: 'Dynamic SolidWorks MCP Server with plugin architecture',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    // Setup the server
    this.setupMiddleware();
    this.registerBuiltInTools();
    this.setupHandlers();
  }

  /**
   * Setup middleware pipeline
   */
  private setupMiddleware(): void {
    const pipeline = this.registry.getMiddlewarePipeline();

    // Add logging middleware
    pipeline.use(
      createLoggingMiddleware(this.logger),
      { name: 'logging', priority: 0, enabled: true }
    );

    // Add timing middleware
    pipeline.use(
      createTimingMiddleware(),
      { name: 'timing', priority: 1, enabled: true }
    );

    // Add circuit breaker if enabled
    if (this.config.enableCircuitBreaker) {
      pipeline.use(
        createCircuitBreakerMiddleware(this.config.circuitBreakerThreshold),
        { name: 'circuit-breaker', priority: 5, enabled: true }
      );
    }

    // Add retry middleware if enabled
    if (this.config.enableRetry) {
      pipeline.use(
        createRetryMiddleware(this.config.maxRetries, 1000, ['COM', 'Connection']),
        { name: 'retry', priority: 10, enabled: true }
      );
    }

    // Add macro recording middleware if enabled
    if (this.config.enableMacroRecording) {
      pipeline.use(
        createMacroRecordingMiddleware({
          isRecording: () => this.macroRecorder.isRecording(),
          record: (toolName, args) => {
            try {
              this.macroRecorder.recordAction(toolName, '', args as Record<string, any>);
            } catch {
              // Recording not in progress
            }
          },
        }),
        { name: 'macro-recording', priority: 100, enabled: true }
      );
    }

    this.logger.info('Middleware pipeline configured', {
      middleware: pipeline.getMiddleware().map(m => m.config.name),
    });
  }

  /**
   * Register built-in tools (migrated from existing tools)
   */
  private registerBuiltInTools(): void {
    // Upgrade existing simple tools to enhanced tools
    const enhancedModelingTools = upgradeTools(modelingTools as any, 'modeling');
    const enhancedDrawingTools = upgradeTools(drawingTools as any, 'drawing');
    const enhancedExportTools = upgradeTools(exportTools as any, 'export');
    const enhancedVbaTools = upgradeTools(vbaTools as any, 'macro');
    const enhancedAnalysisTools = upgradeTools(analysisTools as any, 'analysis');
    const enhancedSketchTools = upgradeTools(sketchTools as any, 'sketch');

    // Register all tools
    this.registry.registerMany([
      ...enhancedModelingTools,
      ...enhancedDrawingTools,
      ...enhancedExportTools,
      ...enhancedVbaTools,
      ...enhancedAnalysisTools,
      ...enhancedSketchTools,
    ]);

    // Register macro control tools
    this.registerMacroTools();

    this.logger.info('Built-in tools registered', {
      count: this.registry.count(),
      categories: this.registry.getCategories(),
    });
  }

  /**
   * Register macro recording tools
   */
  private registerMacroTools(): void {
    const { defineTool } = require('./core/tools/index.js');

    const macroStartTool = defineTool()
      .name('macro_start_recording')
      .description('Start recording a new macro')
      .input(z.object({
        name: z.string().describe('Macro name'),
        description: z.string().optional().describe('Macro description'),
      }))
      .category('macro')
      .tags('recording', 'automation')
      .requiresSolidWorks(false)
      .handler(async (args: { name: string; description?: string }) => {
        const id = this.macroRecorder.startRecording(args.name, args.description);
        return { macroId: id, status: 'recording' };
      })
      .build();

    const macroStopTool = defineTool()
      .name('macro_stop_recording')
      .description('Stop the current macro recording')
      .input(z.object({}))
      .category('macro')
      .tags('recording', 'automation')
      .requiresSolidWorks(false)
      .handler(async () => {
        const recording = this.macroRecorder.stopRecording();
        return recording || { error: 'No recording in progress' };
      })
      .build();

    const macroExportTool = defineTool()
      .name('macro_export_vba')
      .description('Export a recorded macro to VBA code')
      .input(z.object({
        macroId: z.string().describe('ID of the macro to export'),
      }))
      .category('macro')
      .tags('export', 'vba', 'automation')
      .requiresSolidWorks(false)
      .handler(async (args: { macroId: string }) => {
        const vbaCode = this.macroRecorder.exportToVBA(args.macroId);
        return { code: vbaCode };
      })
      .build();

    this.registry.register(macroStartTool);
    this.registry.register(macroStopTool);
    this.registry.register(macroExportTool);
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      return {
        tools: this.registry.exportForMCP(),
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logger.debug(`Tool execution request: ${name}`, { args });

      // Check if tool exists
      if (!this.registry.has(name)) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Tool "${name}" not found`
        );
      }

      try {
        // Ensure SolidWorks connection for tools that need it
        const tool = this.registry.get(name);
        if (tool?.capabilities.requiresSolidWorks && !this.api.isConnected()) {
          await this.api.connect();
        }

        // Execute through registry (includes middleware pipeline)
        const result = await this.registry.execute(name, args);

        if (!result.success) {
          throw result.error || new Error('Tool execution failed');
        }

        return {
          content: [
            {
              type: 'text',
              text: typeof result.data === 'string'
                ? result.data
                : JSON.stringify(result.data, null, 2),
            },
          ],
        };
      } catch (error) {
        this.logger.error(`Tool execution failed: ${name}`, error as Error);

        if (error instanceof z.ZodError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
          );
        }
        throw error;
      }
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, () => {
      const resources = this.stateStore.getAllStates();
      return {
        resources: resources.map(state => ({
          uri: `solidworks://${state.type}/${state.id}`,
          name: state.name,
          mimeType: 'application/json',
          description: `${state.type} resource: ${state.name}`,
        })),
      };
    });

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, (request) => {
      const { uri } = request.params;
      const match = uri.match(/^solidworks:\/\/([^/]+)\/(.+)$/);

      if (!match) {
        throw new McpError(ErrorCode.InvalidRequest, 'Invalid resource URI');
      }

      const [, , id] = match;
      const state = this.stateStore.getState(id);

      if (!state) {
        throw new McpError(ErrorCode.InvalidRequest, 'Resource not found');
      }

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(state, null, 2),
          },
        ],
      };
    });
  }

  /**
   * Load plugins
   */
  private async loadPlugins(): Promise<void> {
    if (!this.config.enablePlugins) {
      this.logger.info('Plugin loading disabled');
      return;
    }

    // Load plugins from configured directories
    await this.pluginLoader.loadAllIntoRegistry(this.registry);

    const loadedPlugins = this.pluginLoader.getLoadedPlugins();
    this.logger.info('Plugins loaded', {
      count: loadedPlugins.length,
      plugins: loadedPlugins.map(p => p.manifest.name),
    });
  }

  /**
   * Initialize and start the server
   */
  async start(): Promise<void> {
    try {
      // Load saved state
      await this.stateStore.load();
      this.logger.info('State store loaded', this.stateStore.getStatistics());

      // Load plugins
      await this.loadPlugins();

      // Log final tool count
      const metrics = this.registry.getMetrics();
      this.logger.info('Server ready', {
        version: packageJson.version,
        toolCount: metrics.toolCount,
        categoryCount: metrics.categoryCount,
        pluginCount: metrics.pluginCount,
        environment: this.config.environment,
      });

      // Start server with stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.logger.info('SolidWorks MCP Server (Dynamic) started');

      // Handle shutdown
      process.on('SIGINT', async () => {
        this.logger.info('Shutting down server...');
        await this.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        this.logger.info('Received SIGTERM, shutting down...');
        await this.shutdown();
        process.exit(0);
      });
    } catch (error) {
      this.logger.error('Failed to start server', error as Error);
      throw error;
    }
  }

  /**
   * Shutdown the server
   */
  async shutdown(): Promise<void> {
    this.logger.info('Starting server shutdown...');

    // Save state
    await this.stateStore.save();
    this.stateStore.stopAutoSave();

    // Clear macro recorder
    this.macroRecorder.clear();

    // Clear registry
    this.registry.clear();

    // Disconnect from SolidWorks
    if (this.api.isConnected()) {
      await this.api.disconnect();
    }

    this.logger.info('Server shutdown complete');
  }

  /**
   * Get the registry (for external access)
   */
  getRegistry(): DynamicToolRegistry {
    return this.registry;
  }

  /**
   * Get server metrics
   */
  getMetrics() {
    return {
      ...this.registry.getMetrics(),
      macroRecording: this.macroRecorder.isRecording(),
      connected: this.api.isConnected(),
    };
  }
}

// ============================================
// MAIN ENTRY POINT
// ============================================

async function main() {
  try {
    const server = new DynamicSolidWorksMCPServer();
    await server.start();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if this is the main module
main().catch((error) => {
  console.error('Failed to start SolidWorks MCP Server (Dynamic)', error);
  process.exit(1);
});

export { DynamicSolidWorksMCPServer };
