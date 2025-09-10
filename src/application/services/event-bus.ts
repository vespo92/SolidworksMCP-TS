/**
 * Event Bus Implementation
 * Handles event publishing and subscription
 */

import { 
  IEventBus,
  IEvent,
  IEventHandler,
  Result,
  ResultUtil,
  ILogger 
} from '../../core/interfaces/core-abstractions.js';

export class EventBus implements IEventBus {
  private handlers: Map<string, Set<IEventHandler>> = new Map();

  constructor(private logger: ILogger) {}

  /**
   * Publish an event to all registered handlers
   */
  async publish(event: IEvent): Promise<Result<void>> {
    try {
      const handlers = this.handlers.get(event.type);
      if (!handlers || handlers.size === 0) {
        this.logger.debug(`No handlers for event type: ${event.type}`);
        return ResultUtil.ok(undefined);
      }

      this.logger.debug(`Publishing event: ${event.type}`, { 
        eventId: event.id,
        handlerCount: handlers.size 
      });

      const promises: Promise<Result<void>>[] = [];
      for (const handler of handlers) {
        if (handler.canHandle(event)) {
          promises.push(handler.handle(event));
        }
      }

      const results = await Promise.allSettled(promises);
      
      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );

      if (failures.length > 0) {
        this.logger.warn(`Some event handlers failed for: ${event.type}`, {
          failures: failures.map(f => f.reason)
        });
      }

      return ResultUtil.ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to publish event: ${event.type}`, error as Error);
      return ResultUtil.fail(error as Error);
    }
  }

  /**
   * Subscribe to an event type
   */
  subscribe(eventType: string, handler: IEventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
    this.logger.debug(`Subscribed to event: ${eventType}`);
  }

  /**
   * Unsubscribe from an event type
   */
  unsubscribe(eventType: string, handler: IEventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
      this.logger.debug(`Unsubscribed from event: ${eventType}`);
    }
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.handlers.clear();
  }

  /**
   * Get the number of handlers for an event type
   */
  getHandlerCount(eventType: string): number {
    const handlers = this.handlers.get(eventType);
    return handlers ? handlers.size : 0;
  }
}