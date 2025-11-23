# Dynamic Architecture Guide

This document describes the new dynamic architecture for the SolidWorks MCP Server, featuring a plugin system, middleware pipeline, feature flags, and enhanced tool definitions.

## Overview

The dynamic architecture provides:

- **Plugin System**: Load/unload tool plugins at runtime
- **Middleware Pipeline**: Cross-cutting concerns (logging, caching, rate limiting)
- **Feature Flags**: Enable/disable tools based on environment or configuration
- **Enhanced Tool Definitions**: Rich metadata, lifecycle hooks, and fallback handlers
- **Schema Builder**: DRY schema definitions with reusable components
- **Auto-Discovery**: Automatic tool loading from directories

## Quick Start

### Running the Dynamic Server

```bash
# Development
npm run dev:dynamic

# Production
npm run start:dynamic
```

### Configuration

Set environment variables:

```bash
# Enable/disable plugins
ENABLE_PLUGINS=true

# Plugin directories (comma-separated)
PLUGIN_DIRS=./plugins,./custom-plugins

# Circuit breaker settings
ENABLE_CIRCUIT_BREAKER=true
CIRCUIT_BREAKER_THRESHOLD=5

# Retry settings
ENABLE_RETRY=true
MAX_RETRIES=3

# Environment
NODE_ENV=production
```

## Creating Tools

### Using the Tool Builder

The fluent tool builder provides a clean API for defining tools:

```typescript
import { defineTool, DimensionSchemas, ToolPriority } from 'solidworks-mcp-server/tools';
import { z } from 'zod';

const myTool = defineTool()
  .name('my_tool')
  .description('Description of what the tool does')
  .input(z.object({
    depth: DimensionSchemas.length,
    reverse: z.boolean().default(false),
  }))
  .category('modeling')
  .priority(ToolPriority.Normal)
  .version('1.0.0')
  .tags('feature', 'extrusion')
  .requiresActiveModel()
  .modelTypes('part', 'assembly')
  .example({
    name: 'Basic usage',
    description: 'Create a 50mm extrusion',
    input: { depth: 50 },
  })
  .handler(async (args, context) => {
    // Implementation
    return { success: true, depth: args.depth };
  })
  .build();
```

### Tool Properties

| Property | Description |
|----------|-------------|
| `name` | Unique tool identifier |
| `description` | Human-readable description |
| `inputSchema` | Zod schema for validation |
| `category` | Tool category (modeling, sketch, etc.) |
| `priority` | Execution priority (Critical, High, Normal, Low, Experimental) |
| `metadata` | Version, author, tags, examples, deprecation info |
| `capabilities` | Requirements (SolidWorks, active model, etc.) |
| `featureFlags` | Enable/disable based on flags |
| `hooks` | Lifecycle hooks (beforeExecute, afterExecute, onError) |
| `handler` | Main execution function |
| `fallbackHandler` | Fallback for complex operations (e.g., VBA macro) |

### Lifecycle Hooks

```typescript
defineTool()
  .beforeExecute(async (context) => {
    console.log('Starting execution...');
    return ResultUtil.ok(undefined);
  })
  .afterExecute(async (context, result) => {
    console.log('Completed:', result);
    return ResultUtil.ok(undefined);
  })
  .onError(async (context, error) => {
    console.error('Error:', error);
    return ResultUtil.ok(undefined);
  })
  // ...
```

### Fallback Handlers

For complex operations that may exceed COM parameter limits:

```typescript
defineTool()
  .comParameters(15) // Flags as complex operation
  .handler(async (args, context) => {
    // Primary COM-based implementation
  })
  .fallback(async (args, context) => {
    // VBA macro fallback for complex operations
  })
  .build();
```

## Schema Builder

### Reusable Schema Components

```typescript
import {
  DimensionSchemas,
  GeometrySchemas,
  FileSchemas,
  NamingSchemas,
  OptionSchemas,
  PresetSchemas,
} from 'solidworks-mcp-server/tools';

// Dimensions
DimensionSchemas.length        // Positive length in mm
DimensionSchemas.angle         // Angle 0-360
DimensionSchemas.draftAngle    // Draft angle -89.9 to 89.9

// Geometry
GeometrySchemas.point2D        // { x, y }
GeometrySchemas.point3D        // { x, y, z }
GeometrySchemas.line2D         // { start, end }
GeometrySchemas.circle         // { center, radius }

// Files
FileSchemas.solidWorksFile     // .sldprt, .sldasm, .slddrw
FileSchemas.exportFormat       // STEP, IGES, STL, etc.

// Naming
NamingSchemas.dimensionName    // "D1@Sketch1" format
NamingSchemas.planeName        // Front, Right, Top, etc.

// Options
OptionSchemas.boolFalse        // Boolean default false
OptionSchemas.direction        // normal, reverse, both
OptionSchemas.endCondition     // Blind, ThroughAll, etc.

// Presets
PresetSchemas.extrusion        // Complete extrusion schema
PresetSchemas.export           // Complete export schema
```

### Fluent Schema Builder

```typescript
import { schema } from 'solidworks-mcp-server/tools';

const mySchema = schema()
  .positiveNumber('depth', 'Extrusion depth')
  .boolean('reverse', false, 'Reverse direction')
  .optionalNumber('draft', 0, 'Draft angle')
  .plane('plane')
  .build();
```

## Creating Plugins

### Plugin Structure

```typescript
// plugins/my-plugin/index.ts
import {
  defineTool,
  createPlugin,
  createManifest,
  ToolPlugin,
} from 'solidworks-mcp-server/tools';

const tool1 = defineTool()
  .name('plugin_tool_1')
  // ...
  .build();

const tool2 = defineTool()
  .name('plugin_tool_2')
  // ...
  .build();

export const plugin: ToolPlugin = createPlugin(
  createManifest('my-plugin', 'My Plugin', '1.0.0', 'Plugin description'),
  [tool1, tool2],
  {
    onLoad: async () => {
      console.log('Plugin loaded');
    },
    onUnload: async () => {
      console.log('Plugin unloaded');
    },
  }
);

export default plugin;
```

### Plugin Manifest

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": "Author Name",
  "license": "MIT",
  "minServerVersion": "3.0.0",
  "dependencies": {
    "other-plugin": "^1.0.0"
  }
}
```

### Tool Groups

Organize related tools into groups:

```typescript
import { defineToolGroup } from 'solidworks-mcp-server/tools';

const modelingGroup = defineToolGroup()
  .name('modeling-tools')
  .description('Core modeling operations')
  .category('modeling')
  .version('1.0.0')
  .tools(extrudeTool, revolveTool, sweepTool)
  .dependsOn('sketch-tools') // Depends on another group
  .build();
```

## Middleware Pipeline

### Built-in Middleware

```typescript
import {
  createLoggingMiddleware,
  createTimingMiddleware,
  createRetryMiddleware,
  createCacheMiddleware,
  createRateLimitMiddleware,
  createCircuitBreakerMiddleware,
  createMetricsMiddleware,
} from 'solidworks-mcp-server/tools';
```

### Using Middleware

```typescript
const registry = new DynamicToolRegistry({ logger });
const pipeline = registry.getMiddlewarePipeline();

// Add middleware with priority (lower = earlier)
pipeline.use(
  createLoggingMiddleware(logger),
  { name: 'logging', priority: 0, enabled: true }
);

pipeline.use(
  createCacheMiddleware(cacheMap, 60000),
  { name: 'caching', priority: 10, enabled: true }
);

pipeline.use(
  createCircuitBreakerMiddleware(5, 30000),
  { name: 'circuit-breaker', priority: 20, enabled: true }
);
```

### Custom Middleware

```typescript
import { ToolMiddleware } from 'solidworks-mcp-server/tools';

const customMiddleware: ToolMiddleware = async (context, next) => {
  console.log(`Executing tool: ${context.toolName}`);

  const result = await next();

  console.log(`Result: ${result.success ? 'success' : 'failure'}`);

  return {
    ...result,
    metadata: {
      ...result.metadata,
      customField: 'value',
    },
  };
};

pipeline.use(customMiddleware, {
  name: 'custom',
  priority: 50,
  enabled: true,
  toolFilter: (tool) => tool.category === 'modeling', // Only for modeling tools
});
```

## Feature Flags

### Provider Interface

```typescript
interface FeatureFlagProvider {
  isEnabled(key: string): boolean;
  getEnvironment(): string;
  hasConfig(key: string): boolean;
}
```

### Using Feature Flags

```typescript
const featureFlags = new DefaultFeatureFlagProvider('production');
featureFlags.setFlag('experimental-features', false);
featureFlags.setConfig('api-key', 'xxx');

const registry = new DynamicToolRegistry({
  featureFlagProvider: featureFlags,
});

// Tool with feature flag
const experimentalTool = defineTool()
  .name('experimental_tool')
  .featureFlag('experimental-features')
  .environments('development', 'staging') // Only in these environments
  .requiresConfig('api-key') // Requires this config to be present
  // ...
  .build();
```

## Dynamic Registry

### API Reference

```typescript
const registry = new DynamicToolRegistry({ logger, featureFlagProvider });

// Registration
registry.register(tool);
registry.registerSimple(simpleTool);
registry.registerMany([tool1, tool2]);
registry.registerGroup(toolGroup);

// Plugin management
await registry.loadPlugin(plugin);
await registry.unloadPlugin('plugin-id');

// Retrieval
registry.get('tool_name');
registry.getAll();
registry.getByCategory('modeling');
registry.getByTag('feature');
registry.search('extrude');

// Enable/disable
registry.disable('tool_name');
registry.enable('tool_name');
registry.isDisabled('tool_name');

// Execution
const result = await registry.execute('tool_name', args);

// Metrics
registry.getMetrics();

// Events
const unsubscribe = registry.on((event) => {
  console.log('Event:', event.type);
});
```

### Events

```typescript
type ToolRegistryEvent =
  | { type: 'tool:registered'; tool: EnhancedTool }
  | { type: 'tool:unregistered'; toolName: string }
  | { type: 'tool:enabled'; toolName: string }
  | { type: 'tool:disabled'; toolName: string }
  | { type: 'plugin:loaded'; plugin: ToolPlugin }
  | { type: 'plugin:unloaded'; pluginId: string }
  | { type: 'middleware:added'; config: MiddlewareConfig }
  | { type: 'middleware:removed'; name: string };
```

## Migration from Simple Tools

Existing simple tools can be automatically upgraded:

```typescript
import { upgradeTools } from 'solidworks-mcp-server/tools';
import { modelingTools } from './tools/modeling';

// Upgrade simple tools to enhanced tools
const enhancedTools = upgradeTools(modelingTools, 'modeling');

registry.registerMany(enhancedTools);
```

## Best Practices

1. **Use Categories**: Organize tools into logical categories
2. **Add Metadata**: Include version, tags, and examples
3. **Define Capabilities**: Specify requirements accurately
4. **Use Schema Builder**: DRY schema definitions
5. **Add Fallbacks**: Provide VBA fallbacks for complex operations
6. **Monitor Metrics**: Track tool execution metrics
7. **Use Feature Flags**: Control tool availability per environment
8. **Write Plugins**: Package related tools as plugins

## Directory Structure

```
src/
├── core/
│   └── tools/
│       ├── enhanced-tool.types.ts  # Type definitions
│       ├── schema-builder.ts       # Schema utilities
│       ├── tool-builder.ts         # Tool builder
│       ├── middleware-pipeline.ts  # Middleware system
│       ├── dynamic-registry.ts     # Dynamic registry
│       ├── plugin-loader.ts        # Plugin loader
│       └── index.ts                # Exports
├── plugins/
│   ├── modeling-enhanced/
│   │   └── index.ts
│   └── sketch-tools/
│       └── index.ts
└── index.dynamic.ts                # Dynamic server entry
```

## Comparison: Simple vs Enhanced Tools

| Aspect | Simple Tool | Enhanced Tool |
|--------|-------------|---------------|
| Metadata | Name, description | Version, author, tags, examples |
| Validation | Input schema | Input + output schemas |
| Lifecycle | None | beforeExecute, afterExecute, onError |
| Fallback | None | Automatic VBA fallback |
| Feature Flags | None | Full support |
| Middleware | None | Full pipeline |
| Metrics | None | Built-in tracking |
| Categories | Optional | Required |
| Priority | None | Configurable |
