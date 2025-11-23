/**
 * Core Tools Module
 * Export all tool-related types, builders, and utilities
 */

// Types and interfaces
export * from './enhanced-tool.types.js';

// Schema builder
export {
  DimensionSchemas,
  GeometrySchemas,
  FileSchemas,
  NamingSchemas,
  OptionSchemas,
  PresetSchemas,
  SchemaBuilder,
  schema,
  extendSchema,
  makeOptional,
  pickFields,
} from './schema-builder.js';

// Tool builder
export {
  ToolBuilder,
  ToolGroupBuilder,
  defineTool,
  defineToolGroup,
  fromSimpleTool,
  upgradeTools,
  defineReadTool,
  defineModelTool,
  defineSketchTool,
  defineExportTool,
} from './tool-builder.js';

// Middleware pipeline
export {
  MiddlewarePipeline,
  createLoggingMiddleware,
  createTimingMiddleware,
  createRetryMiddleware,
  createCacheMiddleware,
  createRateLimitMiddleware,
  createValidationMiddleware,
  createMetricsMiddleware,
  createCircuitBreakerMiddleware,
  createMacroRecordingMiddleware,
} from './middleware-pipeline.js';

// Dynamic registry
export {
  DynamicToolRegistry,
  DynamicRegistryOptions,
  DefaultFeatureFlagProvider,
  FeatureFlagProvider,
  discoverTools,
  DiscoveryOptions,
} from './dynamic-registry.js';

// Plugin loader
export {
  PluginLoader,
  PluginLoaderOptions,
  createPlugin,
  createManifest,
} from './plugin-loader.js';
