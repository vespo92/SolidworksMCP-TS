/**
 * Query Bus Implementation
 * Handles query execution for read operations
 */

import { 
  IQuery, 
  Result, 
  ResultUtil,
  ILogger 
} from '../../core/interfaces/core-abstractions.js';

export interface QueryHandler<TParams = unknown, TResult = unknown> {
  handle(params: TParams): Promise<Result<TResult>>;
}

export class QueryBus {
  private handlers: Map<string, QueryHandler> = new Map();

  constructor(private logger: ILogger) {}

  /**
   * Register a query handler
   */
  register<TParams, TResult>(
    queryName: string,
    handler: QueryHandler<TParams, TResult>
  ): void {
    if (this.handlers.has(queryName)) {
      this.logger.warn(`Query handler ${queryName} is already registered`);
    }
    this.handlers.set(queryName, handler);
    this.logger.debug(`Registered query handler: ${queryName}`);
  }

  /**
   * Execute a query
   */
  async execute<TParams, TResult>(
    queryName: string,
    params: TParams
  ): Promise<Result<TResult>> {
    try {
      const handler = this.handlers.get(queryName);
      if (!handler) {
        return ResultUtil.fail(
          new Error(`No handler registered for query: ${queryName}`)
        );
      }

      this.logger.debug(`Executing query: ${queryName}`, { params });
      const result = await handler.handle(params);

      if (ResultUtil.isSuccess(result)) {
        this.logger.debug(`Query executed successfully: ${queryName}`);
      } else {
        this.logger.warn(`Query failed: ${queryName}`, { error: result.error });
      }

      return result;
    } catch (error) {
      this.logger.error(`Unexpected error executing query: ${queryName}`, error as Error);
      return ResultUtil.fail(error as Error);
    }
  }

  /**
   * Check if a handler is registered
   */
  hasHandler(queryName: string): boolean {
    return this.handlers.has(queryName);
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
  }
}