/**
 * Command Bus Implementation
 * Handles command execution with middleware support
 */

import { 
  ICommand, 
  Result, 
  ResultUtil,
  ILogger,
  IMiddleware
} from '../../core/interfaces/core-abstractions.js';

export interface CommandHandler<TParams = unknown, TResult = unknown> {
  handle(params: TParams): Promise<Result<TResult>>;
}

export class CommandBus {
  private handlers: Map<string, CommandHandler> = new Map();
  private middleware: IMiddleware[] = [];

  constructor(private logger: ILogger) {}

  /**
   * Register a command handler
   */
  register<TParams, TResult>(
    commandName: string,
    handler: CommandHandler<TParams, TResult>
  ): void {
    if (this.handlers.has(commandName)) {
      this.logger.warn(`Command handler ${commandName} is already registered`);
    }
    this.handlers.set(commandName, handler);
    this.logger.debug(`Registered command handler: ${commandName}`);
  }

  /**
   * Execute a command
   */
  async execute<TParams, TResult>(
    commandName: string,
    params: TParams
  ): Promise<Result<TResult>> {
    try {
      const handler = this.handlers.get(commandName);
      if (!handler) {
        return ResultUtil.fail(
          new Error(`No handler registered for command: ${commandName}`)
        );
      }

      // Apply middleware
      const context = { commandName, params, handler };
      const middlewareResult = await this.applyMiddleware(context);
      if (!ResultUtil.isSuccess(middlewareResult)) {
        return middlewareResult;
      }

      // Execute the command
      this.logger.debug(`Executing command: ${commandName}`, { params });
      const result = await handler.handle(params);

      if (ResultUtil.isSuccess(result)) {
        this.logger.debug(`Command executed successfully: ${commandName}`);
      } else {
        this.logger.warn(`Command failed: ${commandName}`, { error: result.error });
      }

      return result;
    } catch (error) {
      this.logger.error(`Unexpected error executing command: ${commandName}`, error as Error);
      return ResultUtil.fail(error as Error);
    }
  }

  /**
   * Add middleware
   */
  use(middleware: IMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Apply middleware chain
   */
  private async applyMiddleware(context: any): Promise<Result<void>> {
    let index = 0;

    const next = async (): Promise<Result<void>> => {
      if (index >= this.middleware.length) {
        return ResultUtil.ok(undefined);
      }

      const currentMiddleware = this.middleware[index++];
      return currentMiddleware.execute(context, next);
    };

    return next();
  }

  /**
   * Check if a handler is registered
   */
  hasHandler(commandName: string): boolean {
    return this.handlers.has(commandName);
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
    this.middleware = [];
  }
}