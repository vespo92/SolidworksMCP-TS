/**
 * SolidWorks COM Adapter Implementation
 * Clean architecture implementation with proper abstractions
 */

import winax from 'winax';
import {
  Result,
  ResultUtil,
  ISolidWorksAdapter,
  ISolidWorksModel,
  ISolidWorksFeature,
  ISolidWorksDimension,
  ModelType,
  ConnectionError,
  ModelNotFoundError,
  InvalidOperationError,
  COMError,
  ILogger,
} from './core-abstractions';

import {
  SwDocumentType,
  SwOpenDocOptions,
  SwSaveAsOptions,
  SwEndCondition,
  SwRebuildOptions,
  SwConstants,
  ConversionFactors,
  SwExportFormat,
  DefaultConfiguration,
} from './solidworks-constants';

/**
 * Configuration for the SolidWorks adapter
 */
export interface SolidWorksAdapterConfig {
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
  logger?: ILogger;
}

/**
 * COM Object wrapper for safe disposal
 */
class COMObject<T = any> {
  constructor(
    private object: T,
    private readonly logger?: ILogger
  ) {}

  get value(): T {
    return this.object;
  }

  dispose(): void {
    try {
      if (this.object) {
        // Release COM reference
        this.object = null as any;
      }
    } catch (error) {
      this.logger?.warn('Failed to dispose COM object', { error });
    }
  }
}

/**
 * Connection pool for managing SolidWorks connections
 */
class ConnectionPool {
  private connection: COMObject | null = null;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly logger?: ILogger;

  constructor(config: SolidWorksAdapterConfig) {
    this.maxRetries = config.retryAttempts ?? DefaultConfiguration.Connection.RetryAttempts;
    this.retryDelay = config.retryDelay ?? DefaultConfiguration.Connection.RetryDelay;
    this.logger = config.logger;
  }

  async getConnection(): Promise<Result<COMObject>> {
    if (this.connection) {
      return ResultUtil.ok(this.connection);
    }

    return this.createConnection();
  }

  private async createConnection(): Promise<Result<COMObject>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger?.debug(`Attempting to connect to SolidWorks (attempt ${attempt}/${this.maxRetries})`);
        
        // Try to create or get existing SolidWorks instance
        const swApp = await this.tryConnect();
        
        if (swApp) {
          swApp.Visible = true;
          this.connection = new COMObject(swApp, this.logger);
          this.logger?.info('Successfully connected to SolidWorks');
          return ResultUtil.ok(this.connection);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger?.warn(`Connection attempt ${attempt} failed`, { error: lastError });
        
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    return ResultUtil.fail(
      new ConnectionError(
        `Failed to connect to SolidWorks after ${this.maxRetries} attempts`,
        { lastError }
      )
    );
  }

  private async tryConnect(): Promise<any> {
    // Try different connection methods
    const connectionMethods = [
      () => new (winax as any).Object('SldWorks.Application'),
      () => (winax as any).Object('SldWorks.Application'),
      () => new (winax as any).Object('SldWorks.Application.24'), // Version specific
      () => (winax as any).GetObject('', 'SldWorks.Application'),
    ];

    for (const method of connectionMethods) {
      try {
        const app = method();
        if (app) return app;
      } catch {
        // Continue to next method
      }
    }

    throw new Error('All connection methods failed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  disconnect(): void {
    if (this.connection) {
      this.connection.dispose();
      this.connection = null;
      this.logger?.info('Disconnected from SolidWorks');
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}

/**
 * Model mapper to convert COM objects to domain models
 */
class ModelMapper {
  static toDomainModel(comModel: any, id?: string): ISolidWorksModel {
    const type = comModel.GetType();
    const typeMap: Record<number, ModelType> = {
      [SwDocumentType.Part]: ModelType.Part,
      [SwDocumentType.Assembly]: ModelType.Assembly,
      [SwDocumentType.Drawing]: ModelType.Drawing,
    };

    return {
      id: id || this.generateId(),
      path: comModel.GetPathName ? comModel.GetPathName() : '',
      name: comModel.GetTitle ? comModel.GetTitle() : 'Untitled',
      type: typeMap[type] || ModelType.Part,
      isActive: true,
      isDirty: comModel.GetSaveFlag ? comModel.GetSaveFlag() : false,
      metadata: {
        documentType: type,
        version: comModel.GetVersion ? comModel.GetVersion() : null,
      },
    };
  }

  static toFeature(comFeature: any): ISolidWorksFeature {
    return {
      id: this.generateId(),
      name: comFeature.Name || 'Unknown',
      type: comFeature.GetTypeName2 ? comFeature.GetTypeName2() : 'Unknown',
      suppressed: comFeature.IsSuppressed ? comFeature.IsSuppressed() : false,
      parameters: {
        definitionType: comFeature.GetDefinitionType ? comFeature.GetDefinitionType() : null,
      },
    };
  }

  static toDimension(name: string, value: number, feature: string): ISolidWorksDimension {
    return {
      name,
      value: value * ConversionFactors.MetersToMillimeters, // Convert to mm
      feature,
    };
  }

  private static generateId(): string {
    return `sw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Main SolidWorks Adapter implementation
 */
export class SolidWorksAdapter implements ISolidWorksAdapter {
  private readonly pool: ConnectionPool;
  private readonly logger?: ILogger;
  private currentModel: COMObject | null = null;

  constructor(config: SolidWorksAdapterConfig = {}) {
    this.pool = new ConnectionPool(config);
    this.logger = config.logger;
  }

  // ============================================
  // CONNECTION MANAGEMENT
  // ============================================

  async connect(): Promise<Result<void>> {
    const connectionResult = await this.pool.getConnection();
    
    if (ResultUtil.isFailure(connectionResult)) {
      return ResultUtil.fail(connectionResult.error);
    }

    return ResultUtil.ok(undefined);
  }

  async disconnect(): Promise<Result<void>> {
    try {
      if (this.currentModel) {
        this.currentModel.dispose();
        this.currentModel = null;
      }
      
      this.pool.disconnect();
      return ResultUtil.ok(undefined);
    } catch (error) {
      return ResultUtil.fail(
        new COMError('Failed to disconnect', { error })
      );
    }
  }

  isConnected(): boolean {
    return this.pool.isConnected();
  }

  // ============================================
  // MODEL OPERATIONS
  // ============================================

  async openModel(path: string): Promise<Result<ISolidWorksModel>> {
    const connectionResult = await this.pool.getConnection();
    if (ResultUtil.isFailure(connectionResult)) {
      return ResultUtil.fail(connectionResult.error);
    }

    try {
      const swApp = connectionResult.data.value;
      const docType = SwConstants.getDocumentTypeFromExtension(path);
      
      if (docType === SwDocumentType.None) {
        return ResultUtil.fail(
          new InvalidOperationError(`Unsupported file type: ${path}`)
        );
      }

      // Open the document with proper error handling
      const errors = { value: 0 };
      const warnings = { value: 0 };
      
      const model = await this.safeComCall(() => 
        swApp.OpenDoc6(
          path,
          docType,
          SwOpenDocOptions.Silent,
          '',
          errors,
          warnings
        )
      );

      if (!model) {
        return ResultUtil.fail(
          new ModelNotFoundError(`Failed to open model: ${path}`, {
            errors: errors.value,
            warnings: warnings.value,
          })
        );
      }

      this.currentModel = new COMObject(model, this.logger);
      const domainModel = ModelMapper.toDomainModel(model);
      
      this.logger?.info('Model opened successfully', { 
        path, 
        type: domainModel.type 
      });
      
      return ResultUtil.ok(domainModel);
    } catch (error) {
      return ResultUtil.fail(
        new COMError(`Failed to open model: ${path}`, { error })
      );
    }
  }

  async closeModel(save: boolean): Promise<Result<void>> {
    if (!this.currentModel) {
      return ResultUtil.ok(undefined);
    }

    try {
      const model = this.currentModel.value;
      
      if (save) {
        const saveResult = await this.saveModel();
        if (ResultUtil.isFailure(saveResult)) {
          this.logger?.warn('Failed to save model before closing', { 
            error: saveResult.error 
          });
        }
      }

      const title = await this.safeComCall(() => model.GetTitle());
      
      const connectionResult = await this.pool.getConnection();
      if (ResultUtil.isSuccess(connectionResult)) {
        const swApp = connectionResult.data.value;
        await this.safeComCall(() => swApp.CloseDoc(title));
      }

      this.currentModel.dispose();
      this.currentModel = null;
      
      this.logger?.info('Model closed', { title, saved: save });
      return ResultUtil.ok(undefined);
    } catch (error) {
      return ResultUtil.fail(
        new COMError('Failed to close model', { error })
      );
    }
  }

  async createPart(): Promise<Result<ISolidWorksModel>> {
    const connectionResult = await this.pool.getConnection();
    if (ResultUtil.isFailure(connectionResult)) {
      return ResultUtil.fail(connectionResult.error);
    }

    try {
      const swApp = connectionResult.data.value;
      
      // Try to create a new part
      const model = await this.safeComCall(() => swApp.NewPart());
      
      if (!model) {
        // Try with template
        const template = DefaultConfiguration.Templates.DefaultPartTemplate;
        const modelWithTemplate = await this.safeComCall(() => 
          swApp.NewDocument(template, 0, 0, 0)
        );
        
        if (!modelWithTemplate) {
          return ResultUtil.fail(
            new COMError('Failed to create new part')
          );
        }
        
        this.currentModel = new COMObject(modelWithTemplate, this.logger);
        return ResultUtil.ok(ModelMapper.toDomainModel(modelWithTemplate));
      }

      this.currentModel = new COMObject(model, this.logger);
      const domainModel = ModelMapper.toDomainModel(model);
      
      this.logger?.info('Part created successfully');
      return ResultUtil.ok(domainModel);
    } catch (error) {
      return ResultUtil.fail(
        new COMError('Failed to create part', { error })
      );
    }
  }

  getCurrentModel(): Result<ISolidWorksModel | null> {
    if (!this.currentModel) {
      return ResultUtil.ok(null);
    }

    try {
      const domainModel = ModelMapper.toDomainModel(this.currentModel.value);
      return ResultUtil.ok(domainModel);
    } catch (error) {
      return ResultUtil.fail(
        new COMError('Failed to get current model', { error })
      );
    }
  }

  async saveModel(path?: string): Promise<Result<void>> {
    if (!this.currentModel) {
      return ResultUtil.fail(
        new InvalidOperationError('No model open')
      );
    }

    try {
      const model = this.currentModel.value;
      
      if (path) {
        // Save as
        const success = await this.safeComCall(() => 
          model.SaveAs3(path, SwSaveAsOptions.Silent, 0)
        );
        
        if (!success) {
          return ResultUtil.fail(
            new COMError('Failed to save model to path', { path })
          );
        }
      } else {
        // Save
        const success = await this.safeComCall(() => 
          model.Save3(SwSaveAsOptions.Silent, 0, 0)
        );
        
        if (!success) {
          return ResultUtil.fail(
            new COMError('Failed to save model')
          );
        }
      }

      this.logger?.info('Model saved', { path });
      return ResultUtil.ok(undefined);
    } catch (error) {
      return ResultUtil.fail(
        new COMError('Failed to save model', { error })
      );
    }
  }

  // ============================================
  // FEATURE OPERATIONS
  // ============================================

  async createFeature(params: any): Promise<Result<ISolidWorksFeature>> {
    if (!this.currentModel) {
      return ResultUtil.fail(
        new InvalidOperationError('No model open')
      );
    }

    try {
      const model = this.currentModel.value;
      const featureMgr = model.FeatureManager;
      
      if (!featureMgr) {
        return ResultUtil.fail(
          new COMError('Cannot access FeatureManager')
        );
      }

      // Example: Create extrusion
      const { depth = 25, draft = 0, reverse = false } = params;
      
      const feature = await this.safeComCall(() =>
        featureMgr.FeatureExtrusion3(
          true,    // SingleEndedFeature
          reverse, // ReverseDirection
          false,   // UseDirection2
          SwEndCondition.Blind,
          SwEndCondition.Blind,
          depth * ConversionFactors.MillimetersToMeters,
          0.01,
          false,
          false,
          false,
          draft * ConversionFactors.DegreesToRadians,
          0,
          false,
          false,
          false,
          false,
          false,
          true,
          false
        )
      );

      if (!feature) {
        return ResultUtil.fail(
          new COMError('Failed to create feature')
        );
      }

      const domainFeature = ModelMapper.toFeature(feature);
      this.logger?.info('Feature created', { type: domainFeature.type });
      
      return ResultUtil.ok(domainFeature);
    } catch (error) {
      return ResultUtil.fail(
        new COMError('Failed to create feature', { error })
      );
    }
  }

  async getFeatures(): Promise<Result<ISolidWorksFeature[]>> {
    if (!this.currentModel) {
      return ResultUtil.fail(
        new InvalidOperationError('No model open')
      );
    }

    try {
      const model = this.currentModel.value;
      const features: ISolidWorksFeature[] = [];
      
      let feature = await this.safeComCall(() => model.FirstFeature());
      
      while (feature) {
        features.push(ModelMapper.toFeature(feature));
        feature = await this.safeComCall(() => feature.GetNextFeature());
      }

      this.logger?.debug('Retrieved features', { count: features.length });
      return ResultUtil.ok(features);
    } catch (error) {
      return ResultUtil.fail(
        new COMError('Failed to get features', { error })
      );
    }
  }

  async suppressFeature(name: string): Promise<Result<void>> {
    if (!this.currentModel) {
      return ResultUtil.fail(
        new InvalidOperationError('No model open')
      );
    }

    try {
      const model = this.currentModel.value;
      const feature = await this.safeComCall(() => 
        model.FeatureByName(name)
      );
      
      if (!feature) {
        return ResultUtil.fail(
          new InvalidOperationError(`Feature not found: ${name}`)
        );
      }

      const success = await this.safeComCall(() => 
        feature.SetSuppression2(0, 2, null) // 0 = suppressed
      );
      
      if (!success) {
        return ResultUtil.fail(
          new COMError(`Failed to suppress feature: ${name}`)
        );
      }

      // Rebuild after suppression
      await this.safeComCall(() => 
        model.EditRebuild3()
      );

      this.logger?.info('Feature suppressed', { name });
      return ResultUtil.ok(undefined);
    } catch (error) {
      return ResultUtil.fail(
        new COMError('Failed to suppress feature', { error })
      );
    }
  }

  // ============================================
  // DIMENSION OPERATIONS
  // ============================================

  async getDimension(name: string): Promise<Result<ISolidWorksDimension>> {
    if (!this.currentModel) {
      return ResultUtil.fail(
        new InvalidOperationError('No model open')
      );
    }

    try {
      const model = this.currentModel.value;
      const dimension = await this.safeComCall(() => 
        model.Parameter(name)
      );
      
      if (!dimension) {
        return ResultUtil.fail(
          new InvalidOperationError(`Dimension not found: ${name}`)
        );
      }

      const value = await this.safeComCall(() => 
        dimension.SystemValue
      );
      
      const feature = name.includes('@') ? name.split('@')[1] : 'Unknown';
      const domainDimension = ModelMapper.toDimension(name, value, feature);
      
      return ResultUtil.ok(domainDimension);
    } catch (error) {
      return ResultUtil.fail(
        new COMError('Failed to get dimension', { error })
      );
    }
  }

  async setDimension(name: string, value: number): Promise<Result<void>> {
    if (!this.currentModel) {
      return ResultUtil.fail(
        new InvalidOperationError('No model open')
      );
    }

    try {
      const model = this.currentModel.value;
      const dimension = await this.safeComCall(() => 
        model.Parameter(name)
      );
      
      if (!dimension) {
        return ResultUtil.fail(
          new InvalidOperationError(`Dimension not found: ${name}`)
        );
      }

      // Convert mm to meters for SolidWorks API
      await this.safeComCall(() => {
        dimension.SystemValue = value * ConversionFactors.MillimetersToMeters;
      });

      // Rebuild after dimension change
      await this.safeComCall(() => 
        model.ForceRebuild3(false)
      );

      this.logger?.info('Dimension set', { name, value });
      return ResultUtil.ok(undefined);
    } catch (error) {
      return ResultUtil.fail(
        new COMError('Failed to set dimension', { error })
      );
    }
  }

  async listDimensions(): Promise<Result<ISolidWorksDimension[]>> {
    if (!this.currentModel) {
      return ResultUtil.fail(
        new InvalidOperationError('No model open')
      );
    }

    try {
      const model = this.currentModel.value;
      const dimensions: ISolidWorksDimension[] = [];
      const processedNames = new Set<string>();

      let feature = await this.safeComCall(() => model.FirstFeature());
      
      while (feature) {
        try {
          const featName = await this.safeComCall(() => feature.Name);
          const dispDim = await this.safeComCall(() => 
            feature.GetFirstDisplayDimension()
          );
          
          let currentDim = dispDim;
          
          while (currentDim) {
            const dim = await this.safeComCall(() => 
              currentDim.GetDimension2(0)
            );
            
            if (dim) {
              const fullName = await this.safeComCall(() => 
                dim.FullName || dim.Name
              );
              
              if (fullName && !processedNames.has(fullName)) {
                processedNames.add(fullName);
                const value = await this.safeComCall(() => dim.SystemValue);
                dimensions.push(ModelMapper.toDimension(fullName, value, featName));
              }
            }
            
            currentDim = await this.safeComCall(() => 
              feature.GetNextDisplayDimension(currentDim)
            );
          }
        } catch {
          // Continue with next feature
        }
        
        feature = await this.safeComCall(() => feature.GetNextFeature());
      }

      this.logger?.debug('Retrieved dimensions', { count: dimensions.length });
      return ResultUtil.ok(dimensions);
    } catch (error) {
      return ResultUtil.fail(
        new COMError('Failed to list dimensions', { error })
      );
    }
  }

  // ============================================
  // EXPORT OPERATIONS
  // ============================================

  async exportModel(path: string, format: string): Promise<Result<void>> {
    if (!this.currentModel) {
      return ResultUtil.fail(
        new InvalidOperationError('No model open')
      );
    }

    try {
      const model = this.currentModel.value;
      
      // Ensure model is saved first
      const currentPath = await this.safeComCall(() => model.GetPathName());
      if (!currentPath || currentPath === '') {
        const saveResult = await this.saveModel(
          path.replace(/\.[^.]+$/, '.SLDPRT')
        );
        if (ResultUtil.isFailure(saveResult)) {
          return saveResult;
        }
      }

      // Export based on format
      const success = await this.safeComCall(() => 
        model.SaveAs3(path, 0, 1)
      );
      
      if (!success) {
        return ResultUtil.fail(
          new COMError(`Failed to export to ${format}`)
        );
      }

      this.logger?.info('Model exported', { path, format });
      return ResultUtil.ok(undefined);
    } catch (error) {
      return ResultUtil.fail(
        new COMError('Failed to export model', { error })
      );
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Safe COM call with error handling
   */
  private async safeComCall<T>(fn: () => T): Promise<T> {
    try {
      return fn();
    } catch (error) {
      this.logger?.error('COM call failed', error as Error);
      throw error;
    }
  }
}
