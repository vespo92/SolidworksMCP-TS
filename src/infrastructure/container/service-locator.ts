/**
 * Service Locator Implementation
 * Simple dependency injection container
 */

import { IServiceLocator } from '../../core/interfaces/core-abstractions.js';

export class ServiceLocator implements IServiceLocator {
  private services: Map<symbol | string, any> = new Map();
  private factories: Map<symbol | string, () => any> = new Map();

  register<T>(token: symbol | string, instanceOrFactory: T | (() => T)): void {
    if (typeof instanceOrFactory === 'function') {
      this.factories.set(token, instanceOrFactory as () => T);
    } else {
      this.services.set(token, instanceOrFactory);
    }
  }

  resolve<T>(token: symbol | string): T {
    // Check if we have a direct instance
    if (this.services.has(token)) {
      return this.services.get(token) as T;
    }

    // Check if we have a factory
    if (this.factories.has(token)) {
      const factory = this.factories.get(token)!;
      const instance = factory();
      this.services.set(token, instance);
      return instance as T;
    }

    throw new Error(`Service not found: ${String(token)}`);
  }

  has(token: symbol | string): boolean {
    return this.services.has(token) || this.factories.has(token);
  }

  reset(): void {
    this.services.clear();
    this.factories.clear();
  }
}