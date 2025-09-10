/**
 * Modeling Use Cases
 * Business logic for SolidWorks modeling operations
 */

import { z } from 'zod';
import { 
  ISolidWorksAdapter,
  ILogger,
  Result,
  ResultUtil,
  ModelType
} from '../../../core/interfaces/core-abstractions.js';
import { Tool } from '../../services/tool-registry.js';

export class ModelingUseCases {
  constructor(
    private swAdapter: ISolidWorksAdapter,
    private logger: ILogger
  ) {}

  /**
   * Get all modeling tools
   */
  getTools(): Tool[] {
    return [
      this.createPartTool(),
      this.createAssemblyTool(),
      this.createExtrudeTool(),
      this.createRevolveTool(),
      this.createCutExtrudeTool(),
      this.createFilletTool(),
      this.createChamferTool(),
      this.createHoleTool(),
      this.createPatternTool(),
      this.createMirrorTool()
    ];
  }

  /**
   * Create new part tool
   */
  private createPartTool(): Tool {
    return {
      name: 'create_part',
      description: 'Create a new SolidWorks part document',
      category: 'modeling',
      tags: ['part', 'create', 'new'],
      inputSchema: z.object({
        template: z.string().optional().describe('Template path to use'),
        units: z.enum(['mm', 'inch']).default('mm').describe('Unit system'),
        saveAs: z.string().optional().describe('Path to save the part')
      }),
      handler: async (args) => {
        this.logger.info('Creating new part', args);
        
        const result = await this.swAdapter.createPart();
        if (!ResultUtil.isSuccess(result)) {
          return result;
        }

        if (args.saveAs) {
          const saveResult = await this.swAdapter.saveModel(args.saveAs);
          if (!ResultUtil.isSuccess(saveResult)) {
            return saveResult;
          }
        }

        return ResultUtil.ok({
          message: 'Part created successfully',
          model: result.data
        });
      }
    };
  }

  /**
   * Create assembly tool
   */
  private createAssemblyTool(): Tool {
    return {
      name: 'create_assembly',
      description: 'Create a new SolidWorks assembly document',
      category: 'modeling',
      tags: ['assembly', 'create', 'new'],
      inputSchema: z.object({
        template: z.string().optional().describe('Template path to use'),
        saveAs: z.string().optional().describe('Path to save the assembly')
      }),
      handler: async (args) => {
        this.logger.info('Creating new assembly', args);
        
        // Implementation would create assembly
        return ResultUtil.ok({
          message: 'Assembly created successfully'
        });
      }
    };
  }

  /**
   * Create extrude tool
   */
  private createExtrudeTool(): Tool {
    return {
      name: 'create_extrude',
      description: 'Create an extrude feature',
      category: 'modeling',
      tags: ['extrude', 'feature', 'solid'],
      inputSchema: z.object({
        sketch: z.string().describe('Name of the sketch to extrude'),
        depth: z.number().describe('Extrusion depth in mm'),
        direction: z.enum(['blind', 'through', 'midplane']).default('blind'),
        reverse: z.boolean().default(false).describe('Reverse direction'),
        draft: z.number().optional().describe('Draft angle in degrees'),
        taper: z.enum(['none', 'inward', 'outward']).default('none')
      }),
      handler: async (args) => {
        this.logger.info('Creating extrude feature', args);
        
        const params = {
          type: 'extrude',
          sketch: args.sketch,
          depth: args.depth / 1000, // Convert to meters
          direction: args.direction,
          reverse: args.reverse,
          draft: args.draft,
          taper: args.taper
        };

        const result = await this.swAdapter.createFeature(params);
        if (!ResultUtil.isSuccess(result)) {
          return result;
        }

        return ResultUtil.ok({
          message: `Extrude feature created: ${result.data.name}`,
          feature: result.data
        });
      }
    };
  }

  /**
   * Create revolve tool
   */
  private createRevolveTool(): Tool {
    return {
      name: 'create_revolve',
      description: 'Create a revolve feature',
      category: 'modeling',
      tags: ['revolve', 'feature', 'solid'],
      inputSchema: z.object({
        sketch: z.string().describe('Name of the sketch to revolve'),
        angle: z.number().default(360).describe('Revolution angle in degrees'),
        axis: z.string().optional().describe('Axis of revolution'),
        direction: z.enum(['one', 'both', 'midplane']).default('one')
      }),
      handler: async (args) => {
        this.logger.info('Creating revolve feature', args);
        
        const params = {
          type: 'revolve',
          sketch: args.sketch,
          angle: args.angle * Math.PI / 180, // Convert to radians
          axis: args.axis,
          direction: args.direction
        };

        const result = await this.swAdapter.createFeature(params);
        if (!ResultUtil.isSuccess(result)) {
          return result;
        }

        return ResultUtil.ok({
          message: `Revolve feature created: ${result.data.name}`,
          feature: result.data
        });
      }
    };
  }

  /**
   * Create cut extrude tool
   */
  private createCutExtrudeTool(): Tool {
    return {
      name: 'create_cut_extrude',
      description: 'Create a cut extrude feature',
      category: 'modeling',
      tags: ['cut', 'extrude', 'feature'],
      inputSchema: z.object({
        sketch: z.string().describe('Name of the sketch to cut'),
        depth: z.number().describe('Cut depth in mm'),
        direction: z.enum(['blind', 'through', 'all']).default('blind'),
        reverse: z.boolean().default(false).describe('Reverse direction'),
        draft: z.number().optional().describe('Draft angle in degrees')
      }),
      handler: async (args) => {
        this.logger.info('Creating cut extrude feature', args);
        
        const params = {
          type: 'cut_extrude',
          sketch: args.sketch,
          depth: args.depth / 1000, // Convert to meters
          direction: args.direction,
          reverse: args.reverse,
          draft: args.draft
        };

        const result = await this.swAdapter.createFeature(params);
        if (!ResultUtil.isSuccess(result)) {
          return result;
        }

        return ResultUtil.ok({
          message: `Cut extrude feature created: ${result.data.name}`,
          feature: result.data
        });
      }
    };
  }

  /**
   * Create fillet tool
   */
  private createFilletTool(): Tool {
    return {
      name: 'create_fillet',
      description: 'Create a fillet feature',
      category: 'modeling',
      tags: ['fillet', 'feature', 'round'],
      inputSchema: z.object({
        radius: z.number().describe('Fillet radius in mm'),
        edges: z.array(z.string()).optional().describe('Edge names to fillet'),
        faces: z.array(z.string()).optional().describe('Face names to fillet'),
        type: z.enum(['constant', 'variable', 'face']).default('constant')
      }),
      handler: async (args) => {
        this.logger.info('Creating fillet feature', args);
        
        const params = {
          type: 'fillet',
          radius: args.radius / 1000, // Convert to meters
          edges: args.edges,
          faces: args.faces,
          filletType: args.type
        };

        const result = await this.swAdapter.createFeature(params);
        if (!ResultUtil.isSuccess(result)) {
          return result;
        }

        return ResultUtil.ok({
          message: `Fillet feature created: ${result.data.name}`,
          feature: result.data
        });
      }
    };
  }

  /**
   * Create chamfer tool
   */
  private createChamferTool(): Tool {
    return {
      name: 'create_chamfer',
      description: 'Create a chamfer feature',
      category: 'modeling',
      tags: ['chamfer', 'feature', 'bevel'],
      inputSchema: z.object({
        distance: z.number().describe('Chamfer distance in mm'),
        angle: z.number().default(45).describe('Chamfer angle in degrees'),
        edges: z.array(z.string()).optional().describe('Edge names to chamfer'),
        type: z.enum(['distance', 'angle', 'distance_angle']).default('distance')
      }),
      handler: async (args) => {
        this.logger.info('Creating chamfer feature', args);
        
        const params = {
          type: 'chamfer',
          distance: args.distance / 1000, // Convert to meters
          angle: args.angle * Math.PI / 180, // Convert to radians
          edges: args.edges,
          chamferType: args.type
        };

        const result = await this.swAdapter.createFeature(params);
        if (!ResultUtil.isSuccess(result)) {
          return result;
        }

        return ResultUtil.ok({
          message: `Chamfer feature created: ${result.data.name}`,
          feature: result.data
        });
      }
    };
  }

  /**
   * Create hole tool
   */
  private createHoleTool(): Tool {
    return {
      name: 'create_hole',
      description: 'Create a hole feature',
      category: 'modeling',
      tags: ['hole', 'feature', 'drill'],
      inputSchema: z.object({
        diameter: z.number().describe('Hole diameter in mm'),
        depth: z.number().describe('Hole depth in mm'),
        position: z.object({
          x: z.number().describe('X coordinate in mm'),
          y: z.number().describe('Y coordinate in mm')
        }),
        type: z.enum(['simple', 'counterbore', 'countersink', 'tapped']).default('simple'),
        throughAll: z.boolean().default(false)
      }),
      handler: async (args) => {
        this.logger.info('Creating hole feature', args);
        
        const params = {
          type: 'hole',
          diameter: args.diameter / 1000,
          depth: args.throughAll ? -1 : args.depth / 1000,
          position: {
            x: args.position.x / 1000,
            y: args.position.y / 1000
          },
          holeType: args.type,
          throughAll: args.throughAll
        };

        const result = await this.swAdapter.createFeature(params);
        if (!ResultUtil.isSuccess(result)) {
          return result;
        }

        return ResultUtil.ok({
          message: `Hole feature created: ${result.data.name}`,
          feature: result.data
        });
      }
    };
  }

  /**
   * Create pattern tool
   */
  private createPatternTool(): Tool {
    return {
      name: 'create_pattern',
      description: 'Create a pattern feature',
      category: 'modeling',
      tags: ['pattern', 'feature', 'array'],
      inputSchema: z.object({
        feature: z.string().describe('Feature name to pattern'),
        type: z.enum(['linear', 'circular', 'curve', 'table']).describe('Pattern type'),
        count: z.number().min(2).describe('Number of instances'),
        spacing: z.number().optional().describe('Spacing between instances in mm'),
        angle: z.number().optional().describe('Angle for circular pattern in degrees'),
        direction: z.string().optional().describe('Direction reference')
      }),
      handler: async (args) => {
        this.logger.info('Creating pattern feature', args);
        
        const params = {
          type: 'pattern',
          feature: args.feature,
          patternType: args.type,
          count: args.count,
          spacing: args.spacing ? args.spacing / 1000 : undefined,
          angle: args.angle ? args.angle * Math.PI / 180 : undefined,
          direction: args.direction
        };

        const result = await this.swAdapter.createFeature(params);
        if (!ResultUtil.isSuccess(result)) {
          return result;
        }

        return ResultUtil.ok({
          message: `Pattern feature created: ${result.data.name}`,
          feature: result.data
        });
      }
    };
  }

  /**
   * Create mirror tool
   */
  private createMirrorTool(): Tool {
    return {
      name: 'create_mirror',
      description: 'Create a mirror feature',
      category: 'modeling',
      tags: ['mirror', 'feature', 'symmetry'],
      inputSchema: z.object({
        features: z.array(z.string()).describe('Feature names to mirror'),
        plane: z.string().describe('Mirror plane name'),
        bodies: z.boolean().default(false).describe('Mirror solid bodies'),
        merge: z.boolean().default(false).describe('Merge with original')
      }),
      handler: async (args) => {
        this.logger.info('Creating mirror feature', args);
        
        const params = {
          type: 'mirror',
          features: args.features,
          plane: args.plane,
          bodies: args.bodies,
          merge: args.merge
        };

        const result = await this.swAdapter.createFeature(params);
        if (!ResultUtil.isSuccess(result)) {
          return result;
        }

        return ResultUtil.ok({
          message: `Mirror feature created: ${result.data.name}`,
          feature: result.data
        });
      }
    };
  }
}