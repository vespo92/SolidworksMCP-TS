/**
 * Refactored SolidWorks API using Adapter Architecture
 * 
 * This is a complete rewrite of the SolidWorks API that:
 * - Uses the adapter pattern for flexibility
 * - Provides automatic fallbacks for complex operations
 * - Includes circuit breaker for stability
 * - Supports connection pooling for performance
 * - Maintains backward compatibility with existing tools
 */

import { 
  ISolidWorksAdapter,
  AdapterConfig,
  ExtrusionParameters,
  MassProperties
} from '../adapters/types.js';
import { adapterFactory } from '../adapters/factory.js';
import { ExtrusionCommandBuilder } from '../commands/extrusion-command.js';
import { SolidWorksModel, SolidWorksFeature } from './types.js';
import { logger } from '../utils/logger.js';

export class SolidWorksAPIRefactored {
  private adapter: ISolidWorksAdapter | null = null;
  public config: AdapterConfig; // Made public for access from tools
  
  constructor(config?: Partial<AdapterConfig>) {
    this.config = {
      type: 'winax',
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
      enableRetry: true,
      maxRetries: 3,
      retryDelay: 1000,
      enableConnectionPool: false,
      poolSize: 3,
      enableMetrics: true,
      enableLogging: true,
      logLevel: 'info',
      ...config
    };
  }
  
  /**
   * Connect to SolidWorks using configured adapter
   */
  async connect(): Promise<void> {
    try {
      // Create adapter using factory
      this.adapter = await adapterFactory.createAdapter(this.config);
      logger.info('Connected to SolidWorks using refactored API');
    } catch (error) {
      logger.error('Failed to connect to SolidWorks', error);
      throw new Error(`Failed to connect to SolidWorks: ${error}`);
    }
  }
  
  /**
   * Disconnect from SolidWorks
   */
  async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
      logger.info('Disconnected from SolidWorks');
    }
  }
  
  /**
   * Check if connected to SolidWorks
   */
  isConnected(): boolean {
    return this.adapter?.isConnected() || false;
  }
  
  /**
   * Ensure adapter is available
   */
  public ensureAdapter(): ISolidWorksAdapter {
    if (!this.adapter) {
      throw new Error('Not connected to SolidWorks. Call connect() first.');
    }
    return this.adapter;
  }
  
  // Model operations
  
  async openModel(filePath: string): Promise<SolidWorksModel> {
    const adapter = this.ensureAdapter();
    return adapter.openModel(filePath);
  }
  
  async closeModel(save: boolean = false): Promise<void> {
    const adapter = this.ensureAdapter();
    return adapter.closeModel(save);
  }
  
  async createPart(): Promise<SolidWorksModel> {
    const adapter = this.ensureAdapter();
    return adapter.createPart();
  }
  
  async createAssembly(): Promise<SolidWorksModel> {
    const adapter = this.ensureAdapter();
    return adapter.createAssembly();
  }
  
  async createDrawing(): Promise<SolidWorksModel> {
    const adapter = this.ensureAdapter();
    return adapter.createDrawing();
  }
  
  // Feature operations with full parameter support
  
  async createExtrusion(
    depth: number,
    draft: number = 0,
    reverse: boolean = false,
    bothDirections: boolean = false,
    additionalParams?: Partial<ExtrusionParameters>
  ): Promise<SolidWorksFeature> {
    const adapter = this.ensureAdapter();
    
    // Build complete parameters
    const params: ExtrusionParameters = {
      depth,
      draft,
      reverse,
      bothDirections,
      ...additionalParams
    };
    
    // Use adapter which handles complex parameters automatically
    return adapter.createExtrusion(params);
  }
  
  /**
   * Create extrusion with builder pattern for complex configurations
   */
  createExtrusionBuilder(): ExtrusionCommandBuilder {
    return new ExtrusionCommandBuilder();
  }
  
  /**
   * Execute extrusion command from builder
   */
  async executeExtrusionCommand(builder: ExtrusionCommandBuilder): Promise<SolidWorksFeature> {
    const adapter = this.ensureAdapter();
    const command = builder.build();
    
    // Validate command
    const validation = command.validate();
    if (!validation.valid) {
      throw new Error(`Invalid extrusion parameters: ${validation.errors?.join(', ')}`);
    }
    
    // Execute through adapter
    const result = await adapter.execute<SolidWorksFeature>(command);
    
    if (!result.success) {
      throw new Error(result.error || 'Extrusion failed');
    }
    
    return result.data!;
  }
  
  // Sketch operations
  
  async createSketch(plane: string = 'Front'): Promise<{ success: boolean; sketchId: string }> {
    const adapter = this.ensureAdapter();
    const sketchId = await adapter.createSketch(plane);
    return { success: true, sketchId };
  }
  
  async addLine(params: {
    x1?: number;
    y1?: number;
    z1?: number;
    x2?: number;
    y2?: number;
    z2?: number;
  }): Promise<{ success: boolean; lineId: string }> {
    const adapter = this.ensureAdapter();
    const { x1 = 0, y1 = 0, x2 = 100, y2 = 0 } = params;
    await adapter.addLine(x1, y1, x2, y2);
    return { success: true, lineId: `line_${Date.now()}` };
  }
  
  async addCircle(params: {
    centerX?: number;
    centerY?: number;
    radius?: number;
  }): Promise<{ success: boolean; circleId: string }> {
    const adapter = this.ensureAdapter();
    const { centerX = 0, centerY = 0, radius = 50 } = params;
    await adapter.addCircle(centerX, centerY, radius);
    return { success: true, circleId: `circle_${Date.now()}` };
  }
  
  async addRectangle(params: {
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }): Promise<{ success: boolean; rectangleId: string }> {
    const adapter = this.ensureAdapter();
    const { x1 = 0, y1 = 0, x2 = 100, y2 = 50 } = params;
    await adapter.addRectangle(x1, y1, x2, y2);
    return { success: true, rectangleId: `rect_${Date.now()}` };
  }
  
  async exitSketch(): Promise<void> {
    const adapter = this.ensureAdapter();
    await adapter.exitSketch();
  }
  
  // Macro support for complex operations
  
  async extrude(params: any): Promise<{ success: boolean; featureId: string }> {
    const adapter = this.ensureAdapter();
    const { depth = 25, reverse = false, draft = 0 } = params;
    
    const feature = await adapter.createExtrusion({
      depth,
      reverse,
      draft
    });
    
    return { success: true, featureId: feature.name };
  }
  
  // Analysis operations
  
  async getMassProperties(): Promise<MassProperties> {
    const adapter = this.ensureAdapter();
    return adapter.getMassProperties();
  }
  
  // Dimension operations
  
  async getDimension(name: string): Promise<number> {
    const adapter = this.ensureAdapter();
    return adapter.getDimension(name);
  }
  
  async setDimension(name: string, value: number): Promise<void> {
    const adapter = this.ensureAdapter();
    await adapter.setDimension(name, value);
  }
  
  // Export operations
  
  async exportFile(filePath: string, format: string): Promise<void> {
    const adapter = this.ensureAdapter();
    await adapter.exportFile(filePath, format);
  }
  
  // VBA operations (maintained for compatibility)
  
  async runMacro(macroPath: string, moduleName: string, procedureName: string, args: any[] = []): Promise<any> {
    const adapter = this.ensureAdapter();
    return adapter.executeRaw('RunMacro2', [macroPath, moduleName, procedureName, 1, 0]);
  }
  
  // Helper methods for backward compatibility
  
  getCurrentModel(): any {
    // For backward compatibility with tools expecting direct model access
    logger.warn('Direct model access is deprecated. Use adapter methods instead.');
    return null;
  }
  
  getApp(): any {
    // For backward compatibility with tools expecting direct app access
    logger.warn('Direct app access is deprecated. Use adapter methods instead.');
    return null;
  }
  
  // Advanced configuration
  
  /**
   * Update adapter configuration at runtime
   */
  async updateConfig(config: Partial<AdapterConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    
    // Recreate adapter with new config
    if (this.adapter) {
      await this.disconnect();
      await this.connect();
    }
  }
  
  /**
   * Get adapter health status
   */
  async getHealth(): Promise<any> {
    if (!this.adapter) {
      return {
        healthy: false,
        connectionStatus: 'disconnected'
      };
    }
    
    return this.adapter.healthCheck();
  }
  
  /**
   * Get adapter statistics
   */
  async getStatistics(): Promise<any> {
    const health = await this.getHealth();
    const adapterHealth = await adapterFactory.healthCheckAll();
    
    return {
      currentHealth: health,
      adapterHealth: Array.from(adapterHealth.entries()).map(([key, value]) => ({
        adapter: key,
        ...value
      })),
      config: this.config
    };
  }
  
  /**
   * Create a batch operation context for performance
   */
  async createBatch(): Promise<BatchContext> {
    const adapter = this.ensureAdapter();
    return new BatchContext(adapter);
  }
}

/**
 * Batch operation context for executing multiple operations efficiently
 */
export class BatchContext {
  private operations: Array<() => Promise<any>> = [];
  
  constructor(private adapter: ISolidWorksAdapter) {}
  
  add<T>(operation: () => Promise<T>): this {
    this.operations.push(operation);
    return this;
  }
  
  async execute(): Promise<any[]> {
    const results = [];
    
    for (const op of this.operations) {
      try {
        const result = await op();
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error });
      }
    }
    
    return results;
  }
  
  async executeParallel(batchSize: number = 5): Promise<any[]> {
    const results = [];
    
    for (let i = 0; i < this.operations.length; i += batchSize) {
      const batch = this.operations.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch.map(op => op()));
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push({ success: true, data: result.value });
        } else {
          results.push({ success: false, error: result.reason });
        }
      }
    }
    
    return results;
  }
}

/**
 * Export both the refactored API and a compatibility wrapper
 */
export { SolidWorksAPIRefactored as SolidWorksAPI };

/**
 * Create a default instance for immediate use
 */
export const solidWorksAPI = new SolidWorksAPIRefactored();