/**
 * Dynamic Tool Registry
 * Advanced tool registry with auto-discovery, plugins, feature flags, and event system
 */

import { z } from 'zod';
import { EventEmitter } from 'events';
import {
  EnhancedTool,
  SimpleTool,
  ToolCategory,
  ToolPriority,
  ToolGroup,
  ToolPlugin,
  ToolRegistryEvent,
  ToolRegistryEventHandler,
  ToolExecutionContext,
  ToolExecutionResult,
  RegisteredMiddleware,
} from './enhanced-tool.types.js';
import { MiddlewarePipeline } from './middleware-pipeline.js';
import { fromSimpleTool } from './tool-builder.js';
import { ILogger, Result, ResultUtil } from '../interfaces/core-abstractions.js';

// ============================================
// FEATURE FLAG EVALUATOR
// ============================================

export interface FeatureFlagProvider {
  isEnabled(key: string): boolean;
  getEnvironment(): string;
  hasConfig(key: string): boolean;
}

/**
 * Default feature flag provider
 */
export class DefaultFeatureFlagProvider implements FeatureFlagProvider {
  private flags: Map<string, boolean> = new Map();
  private environment: string;
  private config: Map<string, unknown> = new Map();

  constructor(environment: string = 'development') {
    this.environment = environment;
  }

  setFlag(key: string, enabled: boolean): void {
    this.flags.set(key, enabled);
  }

  setConfig(key: string, value: unknown): void {
    this.config.set(key, value);
  }

  isEnabled(key: string): boolean {
    return this.flags.get(key) ?? true;
  }

  getEnvironment(): string {
    return this.environment;
  }

  hasConfig(key: string): boolean {
    return this.config.has(key);
  }
}

// ============================================
// DYNAMIC TOOL REGISTRY
// ============================================

export interface DynamicRegistryOptions {
  logger?: ILogger;
  featureFlagProvider?: FeatureFlagProvider;
  enableMetrics?: boolean;
}

/**
 * Dynamic tool registry with advanced features
 */
export class DynamicToolRegistry {
  private tools: Map<string, EnhancedTool> = new Map();
  private categories: Map<ToolCategory, Set<string>> = new Map();
  private tags: Map<string, Set<string>> = new Map();
  private plugins: Map<string, ToolPlugin> = new Map();
  private groups: Map<string, ToolGroup> = new Map();
  private disabledTools: Set<string> = new Set();
  private eventEmitter: EventEmitter = new EventEmitter();
  private middlewarePipeline: MiddlewarePipeline;

  private logger?: ILogger;
  private featureFlagProvider: FeatureFlagProvider;

  // Metrics
  private metrics = {
    totalRegistrations: 0,
    totalExecutions: 0,
    executionsByTool: new Map<string, number>(),
    errorsByTool: new Map<string, number>(),
  };

  constructor(options: DynamicRegistryOptions = {}) {
    this.logger = options.logger;
    this.featureFlagProvider = options.featureFlagProvider || new DefaultFeatureFlagProvider();
    this.middlewarePipeline = new MiddlewarePipeline(options.logger);
  }

  // ============================================
  // TOOL REGISTRATION
  // ============================================

  /**
   * Register an enhanced tool
   */
  register(tool: EnhancedTool): this {
    // Check feature flags
    if (!this.isToolEnabled(tool)) {
      this.logger?.debug(`Tool ${tool.name} disabled by feature flags`);
      return this;
    }

    // Handle duplicate registration
    if (this.tools.has(tool.name)) {
      this.logger?.warn(`Tool ${tool.name} already registered, overwriting`);
    }

    this.tools.set(tool.name, tool);
    this.indexTool(tool);
    this.metrics.totalRegistrations++;

    this.emit({ type: 'tool:registered', tool });
    this.logger?.debug(`Registered tool: ${tool.name}`, {
      category: tool.category,
      priority: tool.priority,
    });

    return this;
  }

  /**
   * Register a simple tool (auto-converts to enhanced)
   */
  registerSimple(tool: SimpleTool): this {
    return this.register(fromSimpleTool(tool));
  }

  /**
   * Register multiple tools at once
   */
  registerMany(tools: (EnhancedTool | SimpleTool)[]): this {
    for (const tool of tools) {
      if ('metadata' in tool) {
        this.register(tool as EnhancedTool);
      } else {
        this.registerSimple(tool as SimpleTool);
      }
    }
    return this;
  }

  /**
   * Register a tool group
   */
  registerGroup(group: ToolGroup): this {
    if (!group.enabled) {
      this.logger?.debug(`Tool group ${group.name} is disabled, skipping`);
      return this;
    }

    // Check dependencies
    if (group.dependencies) {
      for (const dep of group.dependencies) {
        if (!this.groups.has(dep)) {
          this.logger?.warn(`Tool group ${group.name} depends on ${dep} which is not registered`);
        }
      }
    }

    this.groups.set(group.name, group);

    // Register all tools in the group
    for (const tool of group.tools) {
      this.register(tool);
    }

    this.logger?.info(`Registered tool group: ${group.name}`, {
      toolCount: group.tools.length,
    });

    return this;
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;

    this.tools.delete(name);
    this.unindexTool(tool);

    this.emit({ type: 'tool:unregistered', toolName: name });
    return true;
  }

  // ============================================
  // PLUGIN SYSTEM
  // ============================================

  /**
   * Load a plugin
   */
  async loadPlugin(plugin: ToolPlugin): Promise<Result<void>> {
    try {
      // Check if already loaded
      if (this.plugins.has(plugin.manifest.id)) {
        return ResultUtil.fail(new Error(`Plugin ${plugin.manifest.id} already loaded`));
      }

      // Execute onLoad lifecycle hook
      if (plugin.lifecycle?.onLoad) {
        await plugin.lifecycle.onLoad();
      }

      // Register plugin tools
      for (const tool of plugin.tools) {
        this.register(tool);
      }

      // Register plugin middleware
      if (plugin.middleware) {
        for (const mw of plugin.middleware) {
          this.middlewarePipeline.use(mw.middleware, mw.config);
        }
      }

      this.plugins.set(plugin.manifest.id, plugin);

      // Execute onEnable lifecycle hook
      if (plugin.lifecycle?.onEnable) {
        await plugin.lifecycle.onEnable();
      }

      this.emit({ type: 'plugin:loaded', plugin });
      this.logger?.info(`Loaded plugin: ${plugin.manifest.name}`, {
        version: plugin.manifest.version,
        tools: plugin.tools.length,
      });

      return ResultUtil.ok(undefined);
    } catch (error) {
      return ResultUtil.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginId: string): Promise<Result<void>> {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        return ResultUtil.fail(new Error(`Plugin ${pluginId} not found`));
      }

      // Execute onDisable lifecycle hook
      if (plugin.lifecycle?.onDisable) {
        await plugin.lifecycle.onDisable();
      }

      // Unregister plugin tools
      for (const tool of plugin.tools) {
        this.unregister(tool.name);
      }

      // Remove plugin middleware
      if (plugin.middleware) {
        for (const mw of plugin.middleware) {
          this.middlewarePipeline.remove(mw.config.name);
        }
      }

      // Execute onUnload lifecycle hook
      if (plugin.lifecycle?.onUnload) {
        await plugin.lifecycle.onUnload();
      }

      this.plugins.delete(pluginId);

      this.emit({ type: 'plugin:unloaded', pluginId });
      return ResultUtil.ok(undefined);
    } catch (error) {
      return ResultUtil.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get loaded plugins
   */
  getPlugins(): ToolPlugin[] {
    return Array.from(this.plugins.values());
  }

  // ============================================
  // TOOL RETRIEVAL
  // ============================================

  /**
   * Get a tool by name
   */
  get(name: string): EnhancedTool | undefined {
    const tool = this.tools.get(name);
    if (tool && this.disabledTools.has(name)) {
      return undefined;
    }
    return tool;
  }

  /**
   * Check if a tool exists and is enabled
   */
  has(name: string): boolean {
    return this.tools.has(name) && !this.disabledTools.has(name);
  }

  /**
   * Get all enabled tools
   */
  getAll(): EnhancedTool[] {
    return Array.from(this.tools.values())
      .filter(tool => !this.disabledTools.has(tool.name));
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolCategory): EnhancedTool[] {
    const names = this.categories.get(category);
    if (!names) return [];

    return Array.from(names)
      .filter(name => !this.disabledTools.has(name))
      .map(name => this.tools.get(name)!)
      .filter(Boolean);
  }

  /**
   * Get tools by tag
   */
  getByTag(tag: string): EnhancedTool[] {
    const names = this.tags.get(tag);
    if (!names) return [];

    return Array.from(names)
      .filter(name => !this.disabledTools.has(name))
      .map(name => this.tools.get(name)!)
      .filter(Boolean);
  }

  /**
   * Search tools by name or description
   */
  search(query: string): EnhancedTool[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(
      tool =>
        tool.name.toLowerCase().includes(lowerQuery) ||
        tool.description.toLowerCase().includes(lowerQuery) ||
        tool.metadata.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get tools by priority
   */
  getByPriority(priority: ToolPriority): EnhancedTool[] {
    return this.getAll().filter(tool => tool.priority === priority);
  }

  /**
   * Get all categories
   */
  getCategories(): ToolCategory[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get all tags
   */
  getTags(): string[] {
    return Array.from(this.tags.keys());
  }

  /**
   * Get tool count
   */
  count(): number {
    return this.tools.size - this.disabledTools.size;
  }

  // ============================================
  // TOOL ENABLE/DISABLE
  // ============================================

  /**
   * Disable a tool at runtime
   */
  disable(name: string): boolean {
    if (!this.tools.has(name)) return false;
    this.disabledTools.add(name);
    this.emit({ type: 'tool:disabled', toolName: name });
    return true;
  }

  /**
   * Enable a previously disabled tool
   */
  enable(name: string): boolean {
    const wasDisabled = this.disabledTools.delete(name);
    if (wasDisabled) {
      this.emit({ type: 'tool:enabled', toolName: name });
    }
    return wasDisabled;
  }

  /**
   * Check if a tool is disabled
   */
  isDisabled(name: string): boolean {
    return this.disabledTools.has(name);
  }

  // ============================================
  // TOOL EXECUTION
  // ============================================

  /**
   * Execute a tool through the middleware pipeline
   */
  async execute<TArgs = unknown, TResult = unknown>(
    name: string,
    args: TArgs
  ): Promise<ToolExecutionResult<TResult>> {
    const tool = this.get(name) as EnhancedTool<TArgs, TResult> | undefined;

    if (!tool) {
      return {
        success: false,
        error: new Error(`Tool not found: ${name}`),
        duration: 0,
      };
    }

    // Validate input
    try {
      tool.inputSchema.parse(args);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: new Error(`Validation error: ${error.errors.map(e => e.message).join(', ')}`),
          duration: 0,
        };
      }
      throw error;
    }

    // Update metrics
    this.metrics.totalExecutions++;
    this.metrics.executionsByTool.set(
      name,
      (this.metrics.executionsByTool.get(name) || 0) + 1
    );

    // Execute through middleware pipeline
    const result = await this.middlewarePipeline.execute(
      tool,
      args,
      async (context) => {
        // Try main handler
        try {
          return await tool.handler(args, context);
        } catch (error) {
          // Try fallback handler if available
          if (tool.fallbackHandler) {
            this.logger?.warn(`Main handler failed, trying fallback for ${name}`);
            return await tool.fallbackHandler(args, context);
          }
          throw error;
        }
      }
    );

    // Update error metrics
    if (!result.success) {
      this.metrics.errorsByTool.set(
        name,
        (this.metrics.errorsByTool.get(name) || 0) + 1
      );
    }

    return result;
  }

  // ============================================
  // MIDDLEWARE
  // ============================================

  /**
   * Get the middleware pipeline
   */
  getMiddlewarePipeline(): MiddlewarePipeline {
    return this.middlewarePipeline;
  }

  // ============================================
  // EVENTS
  // ============================================

  /**
   * Subscribe to registry events
   */
  on(handler: ToolRegistryEventHandler): () => void {
    this.eventEmitter.on('event', handler);
    return () => this.eventEmitter.off('event', handler);
  }

  /**
   * Emit a registry event
   */
  private emit(event: ToolRegistryEvent): void {
    this.eventEmitter.emit('event', event);
  }

  // ============================================
  // METRICS
  // ============================================

  /**
   * Get registry metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      toolCount: this.count(),
      disabledCount: this.disabledTools.size,
      categoryCount: this.categories.size,
      pluginCount: this.plugins.size,
      groupCount: this.groups.size,
    };
  }

  // ============================================
  // EXPORT FOR MCP
  // ============================================

  /**
   * Export tools in MCP format for ListTools response
   */
  exportForMCP(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    const { zodToJsonSchema } = require('zod-to-json-schema');

    return this.getAll().map(tool => ({
      name: tool.name,
      description: this.buildDescription(tool),
      inputSchema: zodToJsonSchema(tool.inputSchema),
    }));
  }

  /**
   * Build enhanced description with metadata
   */
  private buildDescription(tool: EnhancedTool): string {
    let desc = tool.description;

    if (tool.metadata.deprecated) {
      desc = `[DEPRECATED] ${tool.metadata.deprecationMessage || ''} ${desc}`;
    }

    if (tool.metadata.experimental) {
      desc = `[EXPERIMENTAL] ${desc}`;
    }

    return desc;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private isToolEnabled(tool: EnhancedTool): boolean {
    if (!tool.featureFlags) return true;
    if (!tool.featureFlags.enabled) return false;

    // Check feature flag
    if (tool.featureFlags.featureKey) {
      if (!this.featureFlagProvider.isEnabled(tool.featureFlags.featureKey)) {
        return false;
      }
    }

    // Check environment
    if (tool.featureFlags.enabledEnvironments) {
      const env = this.featureFlagProvider.getEnvironment();
      if (!tool.featureFlags.enabledEnvironments.includes(env)) {
        return false;
      }
    }

    // Check required config
    if (tool.featureFlags.requiredConfig) {
      for (const key of tool.featureFlags.requiredConfig) {
        if (!this.featureFlagProvider.hasConfig(key)) {
          return false;
        }
      }
    }

    return true;
  }

  private indexTool(tool: EnhancedTool): void {
    // Index by category
    if (!this.categories.has(tool.category)) {
      this.categories.set(tool.category, new Set());
    }
    this.categories.get(tool.category)!.add(tool.name);

    // Index by tags
    for (const tag of tool.metadata.tags) {
      if (!this.tags.has(tag)) {
        this.tags.set(tag, new Set());
      }
      this.tags.get(tag)!.add(tool.name);
    }
  }

  private unindexTool(tool: EnhancedTool): void {
    // Remove from category index
    this.categories.get(tool.category)?.delete(tool.name);

    // Remove from tag index
    for (const tag of tool.metadata.tags) {
      this.tags.get(tag)?.delete(tool.name);
    }
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.categories.clear();
    this.tags.clear();
    this.disabledTools.clear();
  }
}

// ============================================
// AUTO-DISCOVERY
// ============================================

export interface DiscoveryOptions {
  patterns?: string[];
  excludePatterns?: string[];
  categories?: ToolCategory[];
  recursive?: boolean;
}

/**
 * Discover and load tools from directories
 * Note: This is a placeholder - actual implementation would use dynamic imports
 */
export async function discoverTools(
  directories: string[],
  options: DiscoveryOptions = {}
): Promise<EnhancedTool[]> {
  const tools: EnhancedTool[] = [];

  // In a real implementation, this would:
  // 1. Scan directories for .ts/.js files
  // 2. Dynamically import each file
  // 3. Look for exports that match tool interface
  // 4. Filter by patterns and categories

  // For now, return empty array - tools are registered manually
  return tools;
}
