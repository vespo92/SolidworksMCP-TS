/**
 * Tool Registry Service
 * Manages and provides access to all available tools
 */

import { z } from 'zod';
import { ILogger } from '../../core/interfaces/core-abstractions.js';

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (args: any) => Promise<any> | any;
  category?: string;
  tags?: string[];
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private categories: Map<string, Set<string>> = new Map();

  constructor(private logger: ILogger) {}

  /**
   * Register a new tool
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      this.logger.warn(`Tool ${tool.name} is already registered, overwriting`);
    }

    this.tools.set(tool.name, tool);

    // Add to category index
    if (tool.category) {
      if (!this.categories.has(tool.category)) {
        this.categories.set(tool.category, new Set());
      }
      this.categories.get(tool.category)!.add(tool.name);
    }

    this.logger.debug(`Registered tool: ${tool.name}`, {
      category: tool.category,
      tags: tool.tags
    });
  }

  /**
   * Get a tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): Tool[] {
    const toolNames = this.categories.get(category);
    if (!toolNames) return [];

    return Array.from(toolNames)
      .map(name => this.tools.get(name))
      .filter((tool): tool is Tool => tool !== undefined);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get the number of registered tools
   */
  count(): number {
    return this.tools.size;
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.categories.clear();
  }
}