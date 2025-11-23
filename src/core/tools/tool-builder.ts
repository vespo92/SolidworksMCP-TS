/**
 * Tool Builder - Fluent API for creating enhanced tools
 * Provides a clean, declarative way to define tools with full metadata
 */

import { z } from 'zod';
import {
  EnhancedTool,
  SimpleTool,
  ToolCategory,
  ToolPriority,
  ToolMetadata,
  ToolCapabilities,
  ToolFeatureFlags,
  ToolLifecycleHooks,
  ToolExecutionContext,
  ToolExample,
  ToolGroup,
} from './enhanced-tool.types.js';

// ============================================
// TOOL BUILDER CLASS
// ============================================

/**
 * Fluent builder for creating enhanced tools
 */
export class ToolBuilder<TArgs = unknown, TResult = unknown> {
  private _name: string = '';
  private _description: string = '';
  private _inputSchema: z.ZodSchema<TArgs> | null = null;
  private _outputSchema?: z.ZodSchema<TResult>;
  private _category: ToolCategory = 'utility';
  private _priority: ToolPriority = ToolPriority.Normal;

  private _metadata: ToolMetadata = {
    version: '1.0.0',
    tags: [],
  };

  private _capabilities: ToolCapabilities = {
    requiresSolidWorks: true,
    requiresActiveModel: false,
  };

  private _featureFlags?: ToolFeatureFlags;
  private _hooks?: ToolLifecycleHooks<TArgs, TResult>;
  private _handler?: (args: TArgs, context: ToolExecutionContext<TArgs>) => Promise<TResult>;
  private _fallbackHandler?: (args: TArgs, context: ToolExecutionContext<TArgs>) => Promise<TResult>;

  /**
   * Set the tool name
   */
  name(name: string): this {
    this._name = name;
    return this;
  }

  /**
   * Set the tool description
   */
  description(description: string): this {
    this._description = description;
    return this;
  }

  /**
   * Set the input schema
   */
  input<T>(schema: z.ZodSchema<T>): ToolBuilder<T, TResult> {
    const builder = this as unknown as ToolBuilder<T, TResult>;
    builder._inputSchema = schema as unknown as z.ZodSchema<T>;
    return builder;
  }

  /**
   * Set the output schema (optional, for validation)
   */
  output<T>(schema: z.ZodSchema<T>): ToolBuilder<TArgs, T> {
    const builder = this as unknown as ToolBuilder<TArgs, T>;
    builder._outputSchema = schema;
    return builder;
  }

  /**
   * Set the category
   */
  category(category: ToolCategory): this {
    this._category = category;
    return this;
  }

  /**
   * Set the priority
   */
  priority(priority: ToolPriority): this {
    this._priority = priority;
    return this;
  }

  /**
   * Set the version
   */
  version(version: string): this {
    this._metadata.version = version;
    return this;
  }

  /**
   * Mark as deprecated
   */
  deprecated(message?: string): this {
    this._metadata.deprecated = true;
    this._metadata.deprecationMessage = message;
    return this;
  }

  /**
   * Mark as experimental
   */
  experimental(): this {
    this._metadata.experimental = true;
    this._priority = ToolPriority.Experimental;
    return this;
  }

  /**
   * Add tags
   */
  tags(...tags: string[]): this {
    this._metadata.tags.push(...tags);
    return this;
  }

  /**
   * Add related tools
   */
  relatedTo(...toolNames: string[]): this {
    this._metadata.relatedTools = toolNames;
    return this;
  }

  /**
   * Add documentation link
   */
  docs(url: string): this {
    this._metadata.documentation = url;
    return this;
  }

  /**
   * Add an example
   */
  example(example: ToolExample): this {
    if (!this._metadata.examples) {
      this._metadata.examples = [];
    }
    this._metadata.examples.push(example);
    return this;
  }

  /**
   * Set author
   */
  author(author: string): this {
    this._metadata.author = author;
    return this;
  }

  /**
   * Set since version
   */
  since(version: string): this {
    this._metadata.since = version;
    return this;
  }

  /**
   * Requires SolidWorks connection
   */
  requiresSolidWorks(required: boolean = true): this {
    this._capabilities.requiresSolidWorks = required;
    return this;
  }

  /**
   * Requires an active model
   */
  requiresActiveModel(required: boolean = true): this {
    this._capabilities.requiresActiveModel = required;
    return this;
  }

  /**
   * Requires an active sketch
   */
  requiresActiveSketch(required: boolean = true): this {
    this._capabilities.requiresActiveSketch = required;
    return this;
  }

  /**
   * Requires selection
   */
  requiresSelection(required: boolean = true): this {
    this._capabilities.requiresSelection = required;
    return this;
  }

  /**
   * Set compatible model types
   */
  modelTypes(...types: ('part' | 'assembly' | 'drawing')[]): this {
    this._capabilities.modelTypes = types;
    return this;
  }

  /**
   * Set minimum SolidWorks version
   */
  minVersion(version: string): this {
    this._capabilities.minVersion = version;
    return this;
  }

  /**
   * Set COM parameter count (for intelligent routing)
   */
  comParameters(count: number): this {
    this._capabilities.comParameters = count;
    return this;
  }

  /**
   * Configure feature flags
   */
  featureFlag(key: string, enabled: boolean = true): this {
    this._featureFlags = {
      ...this._featureFlags,
      enabled,
      featureKey: key,
    };
    return this;
  }

  /**
   * Set required config keys
   */
  requiresConfig(...keys: string[]): this {
    if (!this._featureFlags) {
      this._featureFlags = { enabled: true };
    }
    this._featureFlags.requiredConfig = keys;
    return this;
  }

  /**
   * Limit to specific environments
   */
  environments(...envs: string[]): this {
    if (!this._featureFlags) {
      this._featureFlags = { enabled: true };
    }
    this._featureFlags.enabledEnvironments = envs;
    return this;
  }

  /**
   * Add lifecycle hooks
   */
  hooks(hooks: ToolLifecycleHooks<TArgs, TResult>): this {
    this._hooks = hooks;
    return this;
  }

  /**
   * Add a before execute hook
   */
  beforeExecute(
    fn: NonNullable<ToolLifecycleHooks<TArgs, TResult>['beforeExecute']>
  ): this {
    if (!this._hooks) this._hooks = {};
    this._hooks.beforeExecute = fn;
    return this;
  }

  /**
   * Add an after execute hook
   */
  afterExecute(
    fn: NonNullable<ToolLifecycleHooks<TArgs, TResult>['afterExecute']>
  ): this {
    if (!this._hooks) this._hooks = {};
    this._hooks.afterExecute = fn;
    return this;
  }

  /**
   * Add an error handler hook
   */
  onError(
    fn: NonNullable<ToolLifecycleHooks<TArgs, TResult>['onError']>
  ): this {
    if (!this._hooks) this._hooks = {};
    this._hooks.onError = fn;
    return this;
  }

  /**
   * Set the main handler
   */
  handler(
    fn: (args: TArgs, context: ToolExecutionContext<TArgs>) => Promise<TResult>
  ): this {
    this._handler = fn;
    return this;
  }

  /**
   * Set a synchronous handler (will be wrapped in Promise)
   */
  syncHandler(fn: (args: TArgs) => TResult): this {
    this._handler = async (args) => fn(args);
    return this;
  }

  /**
   * Set the fallback handler (e.g., VBA macro for complex operations)
   */
  fallback(
    fn: (args: TArgs, context: ToolExecutionContext<TArgs>) => Promise<TResult>
  ): this {
    this._fallbackHandler = fn;
    return this;
  }

  /**
   * Build the enhanced tool
   */
  build(): EnhancedTool<TArgs, TResult> {
    // Validation
    if (!this._name) {
      throw new Error('Tool name is required');
    }
    if (!this._description) {
      throw new Error('Tool description is required');
    }
    if (!this._inputSchema) {
      throw new Error('Tool input schema is required');
    }
    if (!this._handler) {
      throw new Error('Tool handler is required');
    }

    return {
      name: this._name,
      description: this._description,
      inputSchema: this._inputSchema,
      outputSchema: this._outputSchema,
      category: this._category,
      priority: this._priority,
      metadata: this._metadata,
      capabilities: this._capabilities,
      featureFlags: this._featureFlags,
      hooks: this._hooks,
      handler: this._handler,
      fallbackHandler: this._fallbackHandler,
    };
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a new tool builder
 */
export function defineTool(): ToolBuilder {
  return new ToolBuilder();
}

/**
 * Create an enhanced tool from a simple tool definition
 */
export function fromSimpleTool<TArgs, TResult>(
  simple: SimpleTool<TArgs, TResult>
): EnhancedTool<TArgs, TResult> {
  return defineTool()
    .name(simple.name)
    .description(simple.description)
    .input(simple.inputSchema)
    .category(simple.category || 'utility')
    .tags(...(simple.tags || []))
    .handler(async (args) => simple.handler(args))
    .build() as EnhancedTool<TArgs, TResult>;
}

/**
 * Convert an array of simple tools to enhanced tools
 */
export function upgradeTools<TArgs, TResult>(
  tools: SimpleTool<TArgs, TResult>[],
  defaultCategory?: ToolCategory
): EnhancedTool<TArgs, TResult>[] {
  return tools.map(tool => {
    const enhanced = fromSimpleTool(tool);
    if (defaultCategory && !tool.category) {
      (enhanced as EnhancedTool<TArgs, TResult>).category = defaultCategory;
    }
    return enhanced;
  });
}

// ============================================
// TOOL GROUP BUILDER
// ============================================

/**
 * Builder for creating tool groups
 */
export class ToolGroupBuilder {
  private _name: string = '';
  private _description: string = '';
  private _category: ToolCategory = 'utility';
  private _version: string = '1.0.0';
  private _tools: EnhancedTool<any, any>[] = [];
  private _enabled: boolean = true;
  private _dependencies: string[] = [];

  name(name: string): this {
    this._name = name;
    return this;
  }

  description(description: string): this {
    this._description = description;
    return this;
  }

  category(category: ToolCategory): this {
    this._category = category;
    return this;
  }

  version(version: string): this {
    this._version = version;
    return this;
  }

  enabled(enabled: boolean): this {
    this._enabled = enabled;
    return this;
  }

  dependsOn(...groupNames: string[]): this {
    this._dependencies.push(...groupNames);
    return this;
  }

  /**
   * Add a single tool
   */
  tool(tool: EnhancedTool<any, any>): this {
    this._tools.push(tool);
    return this;
  }

  /**
   * Add multiple tools
   */
  tools(...tools: EnhancedTool<any, any>[]): this {
    this._tools.push(...tools);
    return this;
  }

  /**
   * Define and add a tool inline
   */
  defineTool(configure: (builder: ToolBuilder) => ToolBuilder): this {
    const builder = new ToolBuilder();
    const tool = configure(builder).category(this._category).build();
    this._tools.push(tool);
    return this;
  }

  build(): ToolGroup {
    if (!this._name) {
      throw new Error('Tool group name is required');
    }
    if (!this._description) {
      throw new Error('Tool group description is required');
    }

    return {
      name: this._name,
      description: this._description,
      category: this._category,
      version: this._version,
      tools: this._tools,
      enabled: this._enabled,
      dependencies: this._dependencies.length > 0 ? this._dependencies : undefined,
    };
  }
}

/**
 * Create a new tool group builder
 */
export function defineToolGroup(): ToolGroupBuilder {
  return new ToolGroupBuilder();
}

// ============================================
// QUICK TOOL HELPERS
// ============================================

/**
 * Create a simple read-only tool (no SolidWorks modification)
 */
export function defineReadTool<TArgs, TResult>(
  name: string,
  description: string,
  inputSchema: z.ZodSchema<TArgs>,
  handler: (args: TArgs) => Promise<TResult> | TResult
): EnhancedTool<TArgs, TResult> {
  return defineTool()
    .name(name)
    .description(description)
    .input(inputSchema)
    .category('utility')
    .tags('read-only')
    .handler(async (args) => handler(args))
    .build() as EnhancedTool<TArgs, TResult>;
}

/**
 * Create a model operation tool
 */
export function defineModelTool<TArgs, TResult>(
  name: string,
  description: string,
  inputSchema: z.ZodSchema<TArgs>,
  handler: (args: TArgs, context: ToolExecutionContext<TArgs>) => Promise<TResult>
): EnhancedTool<TArgs, TResult> {
  return defineTool()
    .name(name)
    .description(description)
    .input(inputSchema)
    .category('modeling')
    .requiresActiveModel()
    .handler(handler)
    .build() as EnhancedTool<TArgs, TResult>;
}

/**
 * Create a sketch operation tool
 */
export function defineSketchTool<TArgs, TResult>(
  name: string,
  description: string,
  inputSchema: z.ZodSchema<TArgs>,
  handler: (args: TArgs, context: ToolExecutionContext<TArgs>) => Promise<TResult>
): EnhancedTool<TArgs, TResult> {
  return defineTool()
    .name(name)
    .description(description)
    .input(inputSchema)
    .category('sketch')
    .requiresActiveModel()
    .requiresActiveSketch()
    .handler(handler)
    .build() as EnhancedTool<TArgs, TResult>;
}

/**
 * Create an export tool
 */
export function defineExportTool<TArgs, TResult>(
  name: string,
  description: string,
  inputSchema: z.ZodSchema<TArgs>,
  handler: (args: TArgs, context: ToolExecutionContext<TArgs>) => Promise<TResult>
): EnhancedTool<TArgs, TResult> {
  return defineTool()
    .name(name)
    .description(description)
    .input(inputSchema)
    .category('export')
    .requiresActiveModel()
    .handler(handler)
    .build() as EnhancedTool<TArgs, TResult>;
}
