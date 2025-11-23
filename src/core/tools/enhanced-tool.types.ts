/**
 * Enhanced Tool Types and Interfaces
 * Provides a more dynamic and extensible tool definition system
 */

import { z } from 'zod';
import { Result } from '../interfaces/core-abstractions.js';

// ============================================
// TOOL METADATA
// ============================================

/**
 * Tool category definitions for organization
 */
export type ToolCategory =
  | 'modeling'
  | 'sketch'
  | 'drawing'
  | 'analysis'
  | 'export'
  | 'import'
  | 'macro'
  | 'pdm'
  | 'assembly'
  | 'configuration'
  | 'diagnostics'
  | 'utility';

/**
 * Tool execution priority
 */
export enum ToolPriority {
  Critical = 0,   // Must execute, no fallback
  High = 1,       // Important, prefer this implementation
  Normal = 2,     // Standard priority
  Low = 3,        // Fallback option
  Experimental = 4 // Testing/experimental features
}

/**
 * Tool capability requirements
 */
export interface ToolCapabilities {
  requiresSolidWorks: boolean;
  requiresActiveModel: boolean;
  requiresActiveSketch?: boolean;
  requiresSelection?: boolean;
  modelTypes?: ('part' | 'assembly' | 'drawing')[];
  minVersion?: string;
  comParameters?: number; // For intelligent routing
}

/**
 * Tool metadata for discovery and documentation
 */
export interface ToolMetadata {
  version: string;
  author?: string;
  deprecated?: boolean;
  deprecationMessage?: string;
  experimental?: boolean;
  since?: string;
  tags: string[];
  examples?: ToolExample[];
  relatedTools?: string[];
  documentation?: string;
}

/**
 * Tool example for documentation
 */
export interface ToolExample {
  name: string;
  description: string;
  input: Record<string, unknown>;
  expectedOutput?: string;
}

/**
 * Feature flag configuration for tools
 */
export interface ToolFeatureFlags {
  enabled: boolean;
  enabledEnvironments?: string[];
  requiredConfig?: string[];
  featureKey?: string;
}

// ============================================
// TOOL LIFECYCLE HOOKS
// ============================================

/**
 * Tool execution context passed to handlers
 */
export interface ToolExecutionContext<TArgs = unknown> {
  toolName: string;
  args: TArgs;
  startTime: Date;
  requestId: string;
  userId?: string;
  sessionId?: string;
  metadata: Record<string, unknown>;
}

/**
 * Tool execution result with timing and metadata
 */
export interface ToolExecutionResult<TResult = unknown> {
  success: boolean;
  data?: TResult;
  error?: Error;
  duration: number;
  fromCache?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Lifecycle hooks for tool execution
 */
export interface ToolLifecycleHooks<TArgs = unknown, TResult = unknown> {
  /** Called before validation */
  beforeValidate?: (context: ToolExecutionContext<unknown>) => Promise<Result<void>>;

  /** Called after validation, before execution */
  beforeExecute?: (context: ToolExecutionContext<TArgs>) => Promise<Result<void>>;

  /** Called after successful execution */
  afterExecute?: (context: ToolExecutionContext<TArgs>, result: TResult) => Promise<Result<void>>;

  /** Called when an error occurs */
  onError?: (context: ToolExecutionContext<TArgs>, error: Error) => Promise<Result<void>>;

  /** Called after execution completes (success or failure) */
  finally?: (context: ToolExecutionContext<TArgs>, result: ToolExecutionResult<TResult>) => Promise<void>;
}

// ============================================
// ENHANCED TOOL INTERFACE
// ============================================

/**
 * Enhanced tool definition with full metadata and capabilities
 */
export interface EnhancedTool<TArgs = unknown, TResult = unknown> {
  // Core identification
  name: string;
  description: string;

  // Validation schema
  inputSchema: z.ZodSchema<TArgs>;
  outputSchema?: z.ZodSchema<TResult>;

  // Organization
  category: ToolCategory;
  priority: ToolPriority;

  // Metadata
  metadata: ToolMetadata;

  // Requirements
  capabilities: ToolCapabilities;

  // Feature flags
  featureFlags?: ToolFeatureFlags;

  // Lifecycle hooks
  hooks?: ToolLifecycleHooks<TArgs, TResult>;

  // The actual handler
  handler: (args: TArgs, context: ToolExecutionContext<TArgs>) => Promise<TResult>;

  // Optional fallback handler (e.g., VBA macro for complex operations)
  fallbackHandler?: (args: TArgs, context: ToolExecutionContext<TArgs>) => Promise<TResult>;
}

/**
 * Simplified tool definition for quick tool creation
 */
export interface SimpleTool<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<TArgs>;
  handler: (args: TArgs) => Promise<TResult> | TResult;
  category?: ToolCategory;
  tags?: string[];
}

// ============================================
// TOOL GROUP DEFINITION
// ============================================

/**
 * Tool group for organizing related tools
 */
export interface ToolGroup {
  name: string;
  description: string;
  category: ToolCategory;
  version: string;
  tools: EnhancedTool[];
  enabled?: boolean;
  dependencies?: string[];
}

// ============================================
// MIDDLEWARE TYPES
// ============================================

/**
 * Middleware function type for tool execution
 */
export type ToolMiddleware<TArgs = unknown, TResult = unknown> = (
  context: ToolExecutionContext<TArgs>,
  next: () => Promise<ToolExecutionResult<TResult>>
) => Promise<ToolExecutionResult<TResult>>;

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  name: string;
  priority: number;
  enabled: boolean;
  toolFilter?: (tool: EnhancedTool) => boolean;
}

/**
 * Registered middleware with config
 */
export interface RegisteredMiddleware<TArgs = unknown, TResult = unknown> {
  config: MiddlewareConfig;
  middleware: ToolMiddleware<TArgs, TResult>;
}

// ============================================
// PLUGIN TYPES
// ============================================

/**
 * Plugin manifest for tool plugins
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  minServerVersion?: string;
  maxServerVersion?: string;
}

/**
 * Plugin lifecycle hooks
 */
export interface PluginLifecycle {
  onLoad?: () => Promise<void>;
  onUnload?: () => Promise<void>;
  onEnable?: () => Promise<void>;
  onDisable?: () => Promise<void>;
}

/**
 * Tool plugin interface
 */
export interface ToolPlugin {
  manifest: PluginManifest;
  lifecycle?: PluginLifecycle;
  tools: EnhancedTool[];
  middleware?: RegisteredMiddleware[];
  config?: Record<string, unknown>;
}

// ============================================
// REGISTRY EVENTS
// ============================================

/**
 * Events emitted by the tool registry
 */
export type ToolRegistryEvent =
  | { type: 'tool:registered'; tool: EnhancedTool }
  | { type: 'tool:unregistered'; toolName: string }
  | { type: 'tool:enabled'; toolName: string }
  | { type: 'tool:disabled'; toolName: string }
  | { type: 'plugin:loaded'; plugin: ToolPlugin }
  | { type: 'plugin:unloaded'; pluginId: string }
  | { type: 'middleware:added'; config: MiddlewareConfig }
  | { type: 'middleware:removed'; name: string };

/**
 * Event handler for registry events
 */
export type ToolRegistryEventHandler = (event: ToolRegistryEvent) => void;
