/**
 * Refactored Modeling Tools
 * Example of how to refactor existing tools using clean architecture
 */

import { z } from 'zod';
import {
  Result,
  ResultUtil,
  ICommand,
  ILogger,
  InvalidOperationError,
  ValidationError,
} from './core-abstractions';
import {
  ISolidWorksAdapter,
  ISolidWorksModel,
  ISolidWorksFeature,
  ModelType,
} from './core-abstractions';
import {
  SwDocumentType,
  SwEndCondition,
  SwRebuildOptions,
  ConversionFactors,
} from './solidworks-constants';

// ============================================
// INPUT VALIDATION SCHEMAS
// ============================================

const OpenModelSchema = z.object({
  path: z.string().min(1).refine(
    (path) => path.match(/\.(sldprt|sldasm|slddrw)$/i),
    'Invalid SolidWorks file extension'
  ),
});

const CreateExtrusionSchema = z.object({
  depth: z.number().positive().describe('Extrusion depth in mm'),
  draft: z.number().min(0).max(89).default(0).describe('Draft angle in degrees'),
  reverse: z.boolean().default(false).describe('Reverse direction'),
});

const SetDimensionSchema = z.object({
  name: z.string().min(1).describe('Dimension name (e.g., "D1@Sketch1")'),
  value: z.number().describe('New value in mm'),
});

const CloseModelSchema = z.object({
  save: z.boolean().default(false).describe('Save before closing'),
});

const RebuildModelSchema = z.object({
  force: z.boolean().default(false).describe('Force rebuild even if not needed'),
  topLevelOnly: z.boolean().default(false).describe('Rebuild only top level'),
});

// ============================================
// USE CASE: OPEN MODEL
// ============================================

export class OpenModelCommand implements ICommand<z.infer<typeof OpenModelSchema>, ISolidWorksModel> {
  constructor(
    private readonly adapter: ISolidWorksAdapter,
    private readonly logger?: ILogger
  ) {}

  validate(params: unknown): Result<void> {
    const result = OpenModelSchema.safeParse(params);
    
    if (!result.success) {
      return ResultUtil.fail(
        new ValidationError('Invalid parameters for open model', {
          errors: result.error.errors,
        })
      );
    }

    return ResultUtil.ok(undefined);
  }

  async canExecute(params: z.infer<typeof OpenModelSchema>): Promise<Result<boolean>> {
    // Check if adapter is connected
    if (!this.adapter.isConnected()) {
      return ResultUtil.ok(false);
    }

    // Check if file exists (would require file system check)
    // For now, assume we can execute if connected
    return ResultUtil.ok(true);
  }

  async execute(params: z.infer<typeof OpenModelSchema>): Promise<Result<ISolidWorksModel>> {
    // Validate input
    const validationResult = this.validate(params);
    if (ResultUtil.isFailure(validationResult)) {
      return ResultUtil.fail(validationResult.error);
    }

    // Check if we can execute
    const canExecuteResult = await this.canExecute(params);
    if (ResultUtil.isFailure(canExecuteResult)) {
      return ResultUtil.fail(canExecuteResult.error);
    }
    if (!canExecuteResult.data) {
      return ResultUtil.fail(
        new InvalidOperationError('Cannot execute open model command')
      );
    }

    // Log operation start
    this.logger?.info('Opening model', { path: params.path });

    // Execute the operation
    const result = await this.adapter.openModel(params.path);

    // Log result
    if (ResultUtil.isSuccess(result)) {
      this.logger?.info('Model opened successfully', {
        path: params.path,
        type: result.data.type,
        name: result.data.name,
      });
    } else {
      this.logger?.error('Failed to open model', result.error, {
        path: params.path,
      });
    }

    return result;
  }
}

// ============================================
// USE CASE: CREATE PART
// ============================================

export class CreatePartCommand implements ICommand<void, ISolidWorksModel> {
  constructor(
    private readonly adapter: ISolidWorksAdapter,
    private readonly logger?: ILogger
  ) {}

  validate(params: unknown): Result<void> {
    return ResultUtil.ok(undefined);
  }

  async canExecute(): Promise<Result<boolean>> {
    return ResultUtil.ok(this.adapter.isConnected());
  }

  async execute(): Promise<Result<ISolidWorksModel>> {
    const canExecuteResult = await this.canExecute();
    if (ResultUtil.isFailure(canExecuteResult)) {
      return ResultUtil.fail(canExecuteResult.error);
    }
    if (!canExecuteResult.data) {
      return ResultUtil.fail(
        new InvalidOperationError('Cannot execute create part command')
      );
    }

    this.logger?.info('Creating new part');

    const result = await this.adapter.createPart();

    if (ResultUtil.isSuccess(result)) {
      this.logger?.info('Part created successfully', {
        name: result.data.name,
      });
    } else {
      this.logger?.error('Failed to create part', result.error);
    }

    return result;
  }
}

// ============================================
// USE CASE: CLOSE MODEL
// ============================================

export class CloseModelCommand implements ICommand<z.infer<typeof CloseModelSchema>, void> {
  constructor(
    private readonly adapter: ISolidWorksAdapter,
    private readonly logger?: ILogger
  ) {}

  validate(params: unknown): Result<void> {
    const result = CloseModelSchema.safeParse(params);
    
    if (!result.success) {
      return ResultUtil.fail(
        new ValidationError('Invalid parameters for close model', {
          errors: result.error.errors,
        })
      );
    }

    return ResultUtil.ok(undefined);
  }

  async canExecute(params: z.infer<typeof CloseModelSchema>): Promise<Result<boolean>> {
    if (!this.adapter.isConnected()) {
      return ResultUtil.ok(false);
    }

    const currentModel = this.adapter.getCurrentModel();
    if (ResultUtil.isFailure(currentModel)) {
      return ResultUtil.ok(false);
    }

    return ResultUtil.ok(currentModel.data !== null);
  }

  async execute(params: z.infer<typeof CloseModelSchema>): Promise<Result<void>> {
    const validationResult = this.validate(params);
    if (ResultUtil.isFailure(validationResult)) {
      return ResultUtil.fail(validationResult.error);
    }

    const canExecuteResult = await this.canExecute(params);
    if (ResultUtil.isFailure(canExecuteResult)) {
      return ResultUtil.fail(canExecuteResult.error);
    }
    if (!canExecuteResult.data) {
      return ResultUtil.fail(
        new InvalidOperationError('No model open to close')
      );
    }

    // Get model info before closing
    const modelResult = this.adapter.getCurrentModel();
    const modelName = ResultUtil.isSuccess(modelResult) && modelResult.data
      ? modelResult.data.name
      : 'Unknown';

    this.logger?.info('Closing model', { 
      name: modelName,
      save: params.save 
    });

    const result = await this.adapter.closeModel(params.save);

    if (ResultUtil.isSuccess(result)) {
      this.logger?.info('Model closed successfully', { 
        name: modelName 
      });
    } else {
      this.logger?.error('Failed to close model', result.error, {
        name: modelName,
      });
    }

    return result;
  }
}

// ============================================
// USE CASE: CREATE EXTRUSION
// ============================================

export class CreateExtrusionCommand implements ICommand<z.infer<typeof CreateExtrusionSchema>, ISolidWorksFeature> {
  constructor(
    private readonly adapter: ISolidWorksAdapter,
    private readonly logger?: ILogger
  ) {}

  validate(params: unknown): Result<void> {
    const result = CreateExtrusionSchema.safeParse(params);
    
    if (!result.success) {
      return ResultUtil.fail(
        new ValidationError('Invalid parameters for create extrusion', {
          errors: result.error.errors,
        })
      );
    }

    return ResultUtil.ok(undefined);
  }

  async canExecute(params: z.infer<typeof CreateExtrusionSchema>): Promise<Result<boolean>> {
    if (!this.adapter.isConnected()) {
      return ResultUtil.ok(false);
    }

    const currentModel = this.adapter.getCurrentModel();
    if (ResultUtil.isFailure(currentModel)) {
      return ResultUtil.ok(false);
    }

    // Can only extrude in parts
    if (!currentModel.data || currentModel.data.type !== ModelType.Part) {
      return ResultUtil.ok(false);
    }

    // TODO: Check if a sketch is selected
    return ResultUtil.ok(true);
  }

  async execute(params: z.infer<typeof CreateExtrusionSchema>): Promise<Result<ISolidWorksFeature>> {
    const validationResult = this.validate(params);
    if (ResultUtil.isFailure(validationResult)) {
      return ResultUtil.fail(validationResult.error);
    }

    const canExecuteResult = await this.canExecute(params);
    if (ResultUtil.isFailure(canExecuteResult)) {
      return ResultUtil.fail(canExecuteResult.error);
    }
    if (!canExecuteResult.data) {
      return ResultUtil.fail(
        new InvalidOperationError('Cannot create extrusion. Ensure a sketch is selected in a part document.')
      );
    }

    this.logger?.info('Creating extrusion', params);

    const result = await this.adapter.createFeature({
      type: 'extrusion',
      depth: params.depth,
      draft: params.draft,
      reverse: params.reverse,
    });

    if (ResultUtil.isSuccess(result)) {
      this.logger?.info('Extrusion created successfully', {
        name: result.data.name,
        type: result.data.type,
      });
    } else {
      this.logger?.error('Failed to create extrusion', result.error, params);
    }

    return result;
  }
}

// ============================================
// USE CASE: SET DIMENSION
// ============================================

export class SetDimensionCommand implements ICommand<z.infer<typeof SetDimensionSchema>, void> {
  constructor(
    private readonly adapter: ISolidWorksAdapter,
    private readonly logger?: ILogger
  ) {}

  validate(params: unknown): Result<void> {
    const result = SetDimensionSchema.safeParse(params);
    
    if (!result.success) {
      return ResultUtil.fail(
        new ValidationError('Invalid parameters for set dimension', {
          errors: result.error.errors,
        })
      );
    }

    return ResultUtil.ok(undefined);
  }

  async canExecute(params: z.infer<typeof SetDimensionSchema>): Promise<Result<boolean>> {
    if (!this.adapter.isConnected()) {
      return ResultUtil.ok(false);
    }

    const currentModel = this.adapter.getCurrentModel();
    if (ResultUtil.isFailure(currentModel)) {
      return ResultUtil.ok(false);
    }

    return ResultUtil.ok(currentModel.data !== null);
  }

  async execute(params: z.infer<typeof SetDimensionSchema>): Promise<Result<void>> {
    const validationResult = this.validate(params);
    if (ResultUtil.isFailure(validationResult)) {
      return ResultUtil.fail(validationResult.error);
    }

    const canExecuteResult = await this.canExecute(params);
    if (ResultUtil.isFailure(canExecuteResult)) {
      return ResultUtil.fail(canExecuteResult.error);
    }
    if (!canExecuteResult.data) {
      return ResultUtil.fail(
        new InvalidOperationError('No model open to set dimension')
      );
    }

    this.logger?.info('Setting dimension', params);

    const result = await this.adapter.setDimension(params.name, params.value);

    if (ResultUtil.isSuccess(result)) {
      this.logger?.info('Dimension set successfully', params);
    } else {
      this.logger?.error('Failed to set dimension', result.error, params);
    }

    return result;
  }
}

// ============================================
// TOOL FACTORY
// ============================================

export class ModelingToolFactory {
  constructor(
    private readonly adapter: ISolidWorksAdapter,
    private readonly logger?: ILogger
  ) {}

  /**
   * Create all modeling tools
   */
  createTools() {
    return {
      openModel: new OpenModelCommand(this.adapter, this.logger),
      createPart: new CreatePartCommand(this.adapter, this.logger),
      closeModel: new CloseModelCommand(this.adapter, this.logger),
      createExtrusion: new CreateExtrusionCommand(this.adapter, this.logger),
      setDimension: new SetDimensionCommand(this.adapter, this.logger),
    };
  }

  /**
   * Convert commands to MCP tool format
   */
  toMCPTools() {
    const commands = this.createTools();
    
    return [
      {
        name: 'solidworks:open_model',
        description: 'Open a SolidWorks part, assembly, or drawing file',
        inputSchema: OpenModelSchema,
        handler: async (args: unknown) => {
          const result = await commands.openModel.execute(args as any);
          if (ResultUtil.isFailure(result)) {
            throw result.error;
          }
          return result.data;
        },
      },
      {
        name: 'solidworks:create_part',
        description: 'Create a new SolidWorks part document',
        inputSchema: z.object({}),
        handler: async () => {
          const result = await commands.createPart.execute();
          if (ResultUtil.isFailure(result)) {
            throw result.error;
          }
          return result.data;
        },
      },
      {
        name: 'solidworks:close_model',
        description: 'Close the current model with option to save',
        inputSchema: CloseModelSchema,
        handler: async (args: unknown) => {
          const result = await commands.closeModel.execute(args as any);
          if (ResultUtil.isFailure(result)) {
            throw result.error;
          }
          return 'Model closed successfully';
        },
      },
      {
        name: 'solidworks:create_extrusion',
        description: 'Create an extrusion feature',
        inputSchema: CreateExtrusionSchema,
        handler: async (args: unknown) => {
          const result = await commands.createExtrusion.execute(args as any);
          if (ResultUtil.isFailure(result)) {
            throw result.error;
          }
          return result.data;
        },
      },
      {
        name: 'solidworks:set_dimension',
        description: 'Set the value of a dimension',
        inputSchema: SetDimensionSchema,
        handler: async (args: unknown) => {
          const result = await commands.setDimension.execute(args as any);
          if (ResultUtil.isFailure(result)) {
            throw result.error;
          }
          return 'Dimension set successfully';
        },
      },
    ];
  }
}

// ============================================
// USAGE EXAMPLE
// ============================================

/**
 * Example of how to use the refactored tools
 */
export async function exampleUsage() {
  // 1. Create configuration
  const { configManager } = await import('./configuration-manager');
  await configManager.reload();

  // 2. Create logger
  const logger: ILogger = {
    debug: (msg, ctx) => console.debug(msg, ctx),
    info: (msg, ctx) => console.info(msg, ctx),
    warn: (msg, ctx) => console.warn(msg, ctx),
    error: (msg, err, ctx) => console.error(msg, err, ctx),
    fatal: (msg, err, ctx) => console.error('FATAL:', msg, err, ctx),
  };

  // 3. Create adapter
  const { SolidWorksAdapter } = await import('./solidworks-adapter');
  const adapter = new SolidWorksAdapter({
    logger,
    retryAttempts: configManager.get<number>('connection.retryAttempts'),
    retryDelay: configManager.get<number>('connection.retryDelay'),
  });

  // 4. Connect to SolidWorks
  const connectResult = await adapter.connect();
  if (ResultUtil.isFailure(connectResult)) {
    console.error('Failed to connect:', connectResult.error);
    return;
  }

  // 5. Create tool factory
  const factory = new ModelingToolFactory(adapter, logger);
  const tools = factory.createTools();

  // 6. Use a tool
  const openResult = await tools.openModel.execute({
    path: 'C:\\Models\\example.sldprt',
  });

  if (ResultUtil.isSuccess(openResult)) {
    console.log('Model opened:', openResult.data);
    
    // Set a dimension
    const dimResult = await tools.setDimension.execute({
      name: 'D1@Sketch1',
      value: 50,
    });
    
    if (ResultUtil.isSuccess(dimResult)) {
      console.log('Dimension set successfully');
    }
    
    // Close the model
    await tools.closeModel.execute({ save: true });
  }

  // 7. Disconnect
  await adapter.disconnect();
}

// ============================================
// MIGRATION HELPER
// ============================================

/**
 * Helper to migrate from old tool format to new format
 */
export function migrateOldTool(oldTool: any) {
  // Extract the handler function
  const oldHandler = oldTool.handler;
  
  // Create a wrapper command
  class MigratedCommand implements ICommand {
    validate(params: unknown): Result<void> {
      if (oldTool.inputSchema) {
        const result = oldTool.inputSchema.safeParse(params);
        if (!result.success) {
          return ResultUtil.fail(
            new ValidationError('Validation failed', { errors: result.error.errors })
          );
        }
      }
      return ResultUtil.ok(undefined);
    }

    async canExecute(params: unknown): Promise<Result<boolean>> {
      // Assume we can execute if validation passes
      const validationResult = this.validate(params);
      return ResultUtil.ok(ResultUtil.isSuccess(validationResult));
    }

    async execute(params: unknown): Promise<Result<any>> {
      try {
        // Call old handler with swApi parameter
        const result = await oldHandler(params, /* need swApi here */);
        return ResultUtil.ok(result);
      } catch (error) {
        return ResultUtil.fail(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  }

  return new MigratedCommand();
}
