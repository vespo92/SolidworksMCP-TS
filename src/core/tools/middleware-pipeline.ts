/**
 * Middleware Pipeline for Tool Execution
 * Provides cross-cutting concerns like logging, caching, rate limiting, etc.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  EnhancedTool,
  ToolMiddleware,
  MiddlewareConfig,
  RegisteredMiddleware,
  ToolExecutionContext,
  ToolExecutionResult,
} from './enhanced-tool.types.js';
import { Result, ResultUtil, ILogger } from '../interfaces/core-abstractions.js';

// ============================================
// MIDDLEWARE PIPELINE
// ============================================

/**
 * Middleware pipeline that executes middleware in order
 */
export class MiddlewarePipeline {
  private middleware: RegisteredMiddleware[] = [];
  private logger?: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger;
  }

  /**
   * Add middleware to the pipeline
   */
  use(middleware: ToolMiddleware, config?: Partial<MiddlewareConfig>): this {
    const fullConfig: MiddlewareConfig = {
      name: config?.name || `middleware-${this.middleware.length}`,
      priority: config?.priority ?? this.middleware.length,
      enabled: config?.enabled ?? true,
      toolFilter: config?.toolFilter,
    };

    this.middleware.push({ config: fullConfig, middleware });
    this.sortMiddleware();

    this.logger?.debug(`Added middleware: ${fullConfig.name}`, {
      priority: fullConfig.priority,
    });

    return this;
  }

  /**
   * Remove middleware by name
   */
  remove(name: string): boolean {
    const index = this.middleware.findIndex(m => m.config.name === name);
    if (index !== -1) {
      this.middleware.splice(index, 1);
      this.logger?.debug(`Removed middleware: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Enable/disable middleware by name
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const mw = this.middleware.find(m => m.config.name === name);
    if (mw) {
      mw.config.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Get all registered middleware
   */
  getMiddleware(): RegisteredMiddleware[] {
    return [...this.middleware];
  }

  /**
   * Execute tool through the middleware pipeline
   */
  async execute<TArgs, TResult>(
    tool: EnhancedTool<TArgs, TResult>,
    args: TArgs,
    baseHandler: (context: ToolExecutionContext<TArgs>) => Promise<TResult>
  ): Promise<ToolExecutionResult<TResult>> {
    const startTime = new Date();

    // Create execution context
    const context: ToolExecutionContext<TArgs> = {
      toolName: tool.name,
      args,
      startTime,
      requestId: uuidv4(),
      metadata: {
        category: tool.category,
        priority: tool.priority,
      },
    };

    // Filter applicable middleware for this tool
    const applicableMiddleware = this.middleware.filter(
      m => m.config.enabled && (!m.config.toolFilter || m.config.toolFilter(tool as any))
    );

    // Build the middleware chain
    let index = 0;

    const executeNext = async (): Promise<ToolExecutionResult<TResult>> => {
      // If we've exhausted middleware, execute the actual handler
      if (index >= applicableMiddleware.length) {
        return this.executeHandler(tool, context, baseHandler);
      }

      const current = applicableMiddleware[index++];
      return current.middleware(context as any, executeNext as any) as Promise<ToolExecutionResult<TResult>>;
    };

    try {
      return await executeNext();
    } catch (error) {
      const duration = Date.now() - startTime.getTime();
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
      };
    }
  }

  /**
   * Execute the actual tool handler with lifecycle hooks
   */
  private async executeHandler<TArgs, TResult>(
    tool: EnhancedTool<TArgs, TResult>,
    context: ToolExecutionContext<TArgs>,
    baseHandler: (context: ToolExecutionContext<TArgs>) => Promise<TResult>
  ): Promise<ToolExecutionResult<TResult>> {
    const startTime = context.startTime.getTime();

    try {
      // Execute beforeExecute hook
      if (tool.hooks?.beforeExecute) {
        const hookResult = await tool.hooks.beforeExecute(context);
        if (!hookResult.success) {
          throw new Error(`beforeExecute hook failed: ${hookResult.error}`);
        }
      }

      // Execute the actual handler
      const result = await baseHandler(context);

      // Execute afterExecute hook
      if (tool.hooks?.afterExecute) {
        await tool.hooks.afterExecute(context, result);
      }

      const duration = Date.now() - startTime;

      const executionResult: ToolExecutionResult<TResult> = {
        success: true,
        data: result,
        duration,
      };

      // Execute finally hook
      if (tool.hooks?.finally) {
        await tool.hooks.finally(context, executionResult);
      }

      return executionResult;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Execute onError hook
      if (tool.hooks?.onError) {
        await tool.hooks.onError(context, err);
      }

      const duration = Date.now() - startTime;

      const executionResult: ToolExecutionResult<TResult> = {
        success: false,
        error: err,
        duration,
      };

      // Execute finally hook
      if (tool.hooks?.finally) {
        await tool.hooks.finally(context, executionResult);
      }

      return executionResult;
    }
  }

  private sortMiddleware(): void {
    this.middleware.sort((a, b) => a.config.priority - b.config.priority);
  }
}

// ============================================
// BUILT-IN MIDDLEWARE
// ============================================

/**
 * Logging middleware - logs tool execution
 */
export function createLoggingMiddleware(logger: ILogger): ToolMiddleware {
  return async (context, next) => {
    logger.debug(`Tool execution started: ${context.toolName}`, {
      requestId: context.requestId,
      args: context.args,
    });

    const result = await next();

    if (result.success) {
      logger.info(`Tool execution completed: ${context.toolName}`, {
        requestId: context.requestId,
        duration: result.duration,
      });
    } else {
      logger.error(`Tool execution failed: ${context.toolName}`, result.error, {
        requestId: context.requestId,
        duration: result.duration,
      });
    }

    return result;
  };
}

/**
 * Timing middleware - adds timing metadata
 */
export function createTimingMiddleware(): ToolMiddleware {
  return async (context, next) => {
    const start = process.hrtime.bigint();
    const result = await next();
    const end = process.hrtime.bigint();

    return {
      ...result,
      metadata: {
        ...result.metadata,
        timingNs: Number(end - start),
        timingMs: Number(end - start) / 1_000_000,
      },
    };
  };
}

/**
 * Retry middleware - retries failed operations
 */
export function createRetryMiddleware(
  maxRetries: number = 3,
  delayMs: number = 1000,
  retryableErrors?: string[]
): ToolMiddleware {
  return async (context, next) => {
    let lastResult: ToolExecutionResult;
    let attempt = 0;

    while (attempt < maxRetries) {
      lastResult = await next();

      if (lastResult.success) {
        return {
          ...lastResult,
          metadata: {
            ...lastResult.metadata,
            retryAttempts: attempt,
          },
        };
      }

      // Check if error is retryable
      if (retryableErrors && lastResult.error) {
        const isRetryable = retryableErrors.some(
          errType => lastResult.error!.message.includes(errType)
        );
        if (!isRetryable) {
          return lastResult;
        }
      }

      attempt++;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }

    return {
      ...lastResult!,
      metadata: {
        ...lastResult!.metadata,
        retryAttempts: attempt,
        retriesExhausted: true,
      },
    };
  };
}

/**
 * Cache middleware - caches tool results
 */
export function createCacheMiddleware(
  cache: Map<string, { result: ToolExecutionResult; expiry: number }>,
  ttlMs: number = 60000,
  keyGenerator?: (context: ToolExecutionContext) => string
): ToolMiddleware {
  const generateKey = keyGenerator || ((ctx: ToolExecutionContext) =>
    `${ctx.toolName}:${JSON.stringify(ctx.args)}`
  );

  return async (context, next) => {
    const key = generateKey(context);
    const now = Date.now();

    // Check cache
    const cached = cache.get(key);
    if (cached && cached.expiry > now) {
      return {
        ...cached.result,
        fromCache: true,
        metadata: {
          ...cached.result.metadata,
          cacheHit: true,
          cacheKey: key,
        },
      };
    }

    // Execute and cache result
    const result = await next();

    if (result.success) {
      cache.set(key, {
        result,
        expiry: now + ttlMs,
      });
    }

    return {
      ...result,
      fromCache: false,
      metadata: {
        ...result.metadata,
        cacheHit: false,
        cacheKey: key,
      },
    };
  };
}

/**
 * Rate limiting middleware
 */
export function createRateLimitMiddleware(
  maxRequests: number,
  windowMs: number
): ToolMiddleware {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return async (context, next) => {
    const key = context.toolName;
    const now = Date.now();
    const entry = requests.get(key);

    if (entry && entry.resetTime > now) {
      if (entry.count >= maxRequests) {
        return {
          success: false,
          error: new Error(`Rate limit exceeded for tool: ${context.toolName}`),
          duration: 0,
          metadata: {
            rateLimited: true,
            retryAfter: entry.resetTime - now,
          },
        };
      }
      entry.count++;
    } else {
      requests.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
    }

    return next();
  };
}

/**
 * Validation middleware - validates inputs and outputs
 */
export function createValidationMiddleware(): ToolMiddleware {
  return async (context, next) => {
    // Input validation is typically done before middleware
    // This middleware can add additional validation or output validation

    const result = await next();

    return {
      ...result,
      metadata: {
        ...result.metadata,
        validated: true,
      },
    };
  };
}

/**
 * Metrics middleware - collects execution metrics
 */
export function createMetricsMiddleware(
  metricsCollector: {
    increment: (name: string, tags?: Record<string, string>) => void;
    timing: (name: string, duration: number, tags?: Record<string, string>) => void;
  }
): ToolMiddleware {
  return async (context, next) => {
    const tags = {
      tool: context.toolName,
      category: String(context.metadata.category),
    };

    metricsCollector.increment('tool.execution.started', tags);

    const result = await next();

    metricsCollector.timing('tool.execution.duration', result.duration, tags);

    if (result.success) {
      metricsCollector.increment('tool.execution.success', tags);
    } else {
      metricsCollector.increment('tool.execution.failure', tags);
    }

    return result;
  };
}

/**
 * Circuit breaker middleware - prevents cascading failures
 */
export function createCircuitBreakerMiddleware(
  threshold: number = 5,
  resetTimeMs: number = 30000
): ToolMiddleware {
  const state = new Map<string, {
    failures: number;
    lastFailure: number;
    open: boolean;
  }>();

  return async (context, next) => {
    const key = context.toolName;
    const now = Date.now();
    const toolState = state.get(key) || { failures: 0, lastFailure: 0, open: false };

    // Check if circuit is open
    if (toolState.open) {
      if (now - toolState.lastFailure > resetTimeMs) {
        // Try to close the circuit (half-open state)
        toolState.open = false;
        toolState.failures = 0;
      } else {
        return {
          success: false,
          error: new Error(`Circuit breaker open for tool: ${context.toolName}`),
          duration: 0,
          metadata: {
            circuitBreakerOpen: true,
            retryAfter: resetTimeMs - (now - toolState.lastFailure),
          },
        };
      }
    }

    const result = await next();

    if (!result.success) {
      toolState.failures++;
      toolState.lastFailure = now;

      if (toolState.failures >= threshold) {
        toolState.open = true;
      }
    } else {
      toolState.failures = 0;
    }

    state.set(key, toolState);

    return {
      ...result,
      metadata: {
        ...result.metadata,
        circuitBreakerFailures: toolState.failures,
      },
    };
  };
}

/**
 * Macro recording middleware - records tool calls for macro export
 */
export function createMacroRecordingMiddleware(
  recorder: {
    isRecording: () => boolean;
    record: (toolName: string, args: unknown) => void;
  }
): ToolMiddleware {
  return async (context, next) => {
    const result = await next();

    if (result.success && recorder.isRecording()) {
      recorder.record(context.toolName, context.args);
    }

    return {
      ...result,
      metadata: {
        ...result.metadata,
        macroRecorded: recorder.isRecording(),
      },
    };
  };
}
