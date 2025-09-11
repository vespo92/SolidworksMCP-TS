/**
 * Refactored Modeling Tools using Adapter Architecture
 * 
 * This enhanced version provides:
 * - Full parameter support for all modeling operations
 * - Automatic fallback to macros for complex operations
 * - Robust error handling with circuit breaker
 * - Detailed validation and helpful error messages
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { SolidWorksAPIRefactored } from '../solidworks/api-refactored.js';
import { ExtrusionFactory } from '../commands/extrusion-command.js';
import { logger } from '../utils/logger.js';

// Enhanced parameter schemas with full options

const CreateExtrusionSchema = z.object({
  depth: z.number().positive().describe('Extrusion depth in mm'),
  reverse: z.boolean().optional().describe('Reverse extrusion direction'),
  bothDirections: z.boolean().optional().describe('Extrude in both directions'),
  draft: z.number().optional().describe('Draft angle in degrees'),
  draftOutward: z.boolean().optional().describe('Draft outward from sketch'),
  draftWhileExtruding: z.boolean().optional().describe('Apply draft while extruding'),
  offsetDistance: z.number().optional().describe('Offset distance from sketch plane'),
  offsetReverse: z.boolean().optional().describe('Reverse offset direction'),
  translateSurface: z.boolean().optional().describe('Translate surface'),
  merge: z.boolean().optional().default(true).describe('Merge with existing bodies'),
  flipSideToCut: z.boolean().optional().describe('Flip side for cut extrusion'),
  startCondition: z.enum(['SketchPlane', 'Surface', 'Face', 'Plane', 'Offset']).optional(),
  endCondition: z.enum(['Blind', 'ThroughAll', 'UpToNext', 'UpToVertex', 'UpToSurface', 'OffsetFromSurface', 'MidPlane']).optional(),
  depth2: z.number().optional().describe('Second direction depth for both directions'),
  draft2: z.number().optional().describe('Second direction draft angle'),
  thinFeature: z.boolean().optional().describe('Create thin feature'),
  thinThickness: z.number().optional().describe('Thin feature wall thickness'),
  thinType: z.enum(['OneSide', 'TwoSide', 'MidPlane']).optional(),
  capEnds: z.boolean().optional().describe('Cap ends of thin feature'),
  capThickness: z.number().optional().describe('Cap thickness')
});

const CreateRevoluteSchema = z.object({
  angle: z.number().min(-360).max(360).describe('Revolution angle in degrees'),
  axis: z.string().optional().describe('Axis name or selection'),
  direction: z.enum(['Forward', 'Reverse', 'Both']).optional().default('Forward'),
  merge: z.boolean().optional().default(true),
  thinFeature: z.boolean().optional(),
  thinThickness: z.number().optional()
});

const CreateSweepSchema = z.object({
  profileSketch: z.string().describe('Name of profile sketch'),
  pathSketch: z.string().describe('Name of path sketch'),
  twistAngle: z.number().optional().describe('Twist angle along path'),
  merge: z.boolean().optional().default(true),
  thinFeature: z.boolean().optional(),
  thinThickness: z.number().optional()
});

const CreateLoftSchema = z.object({
  profiles: z.array(z.string()).min(2).describe('Array of profile sketch names'),
  guideCurves: z.array(z.string()).optional().describe('Optional guide curve sketches'),
  startTangency: z.string().optional(),
  endTangency: z.string().optional(),
  merge: z.boolean().optional().default(true),
  close: z.boolean().optional().describe('Close the loft'),
  thinFeature: z.boolean().optional(),
  thinThickness: z.number().optional()
});

const CreateFilletSchema = z.object({
  edges: z.array(z.string()).min(1).describe('Edge selections'),
  radius: z.number().positive().describe('Fillet radius in mm'),
  type: z.enum(['Constant', 'Variable', 'Face']).optional().default('Constant'),
  overflow: z.enum(['Default', 'KeepEdge', 'KeepSurface']).optional()
});

const CreateChamferSchema = z.object({
  edges: z.array(z.string()).min(1).describe('Edge selections'),
  distance: z.number().positive().describe('Chamfer distance in mm'),
  angle: z.number().optional().describe('Chamfer angle in degrees'),
  type: z.enum(['Distance', 'DistanceAngle', 'TwoDistances', 'EqualDistance']).optional(),
  distance2: z.number().optional().describe('Second distance for two distances type')
});

const CreatePatternSchema = z.object({
  type: z.enum(['Linear', 'Circular', 'Curve', 'Table', 'Sketch']),
  feature: z.string().describe('Feature to pattern'),
  count: z.number().min(2).describe('Number of instances'),
  spacing: z.number().optional().describe('Spacing between instances (linear)'),
  angle: z.number().optional().describe('Total angle (circular)'),
  axis: z.string().optional().describe('Axis for circular pattern'),
  direction2: z.boolean().optional().describe('Use second direction (linear)'),
  count2: z.number().optional().describe('Count in second direction'),
  spacing2: z.number().optional().describe('Spacing in second direction')
});

const CreateMirrorSchema = z.object({
  features: z.array(z.string()).min(1).describe('Features to mirror'),
  plane: z.string().describe('Mirror plane'),
  merge: z.boolean().optional().default(true),
  copyBodies: z.boolean().optional().describe('Copy bodies instead of features')
});

const CreateHoleSchema = z.object({
  type: z.enum(['Simple', 'Tapered', 'Counterbore', 'Countersink', 'Thread']),
  diameter: z.number().positive().describe('Hole diameter in mm'),
  depth: z.number().positive().describe('Hole depth in mm'),
  x: z.number().describe('X position'),
  y: z.number().describe('Y position'),
  threadSpec: z.string().optional().describe('Thread specification (e.g., M10x1.5)'),
  counterboreDiameter: z.number().optional(),
  counterboreDepth: z.number().optional(),
  countersinkAngle: z.number().optional().default(90),
  taperAngle: z.number().optional()
});

const CreateShellSchema = z.object({
  thickness: z.number().positive().describe('Shell thickness in mm'),
  faces: z.array(z.string()).optional().describe('Faces to remove'),
  outward: z.boolean().optional().default(false).describe('Shell outward')
});

const CreateRibSchema = z.object({
  sketch: z.string().describe('Rib profile sketch'),
  thickness: z.number().positive().describe('Rib thickness in mm'),
  flip: z.boolean().optional().describe('Flip rib direction'),
  draft: z.number().optional().describe('Draft angle'),
  draftOutward: z.boolean().optional()
});

/**
 * Enhanced modeling tools with full parameter support
 */
export const modelingToolsRefactored = [
  {
    name: 'create_extrusion_advanced',
    description: 'Create an extrusion with full parameter support including draft, thin features, and complex end conditions',
    inputSchema: zodToJsonSchema(CreateExtrusionSchema),
    execute: async (api: SolidWorksAPIRefactored, args: z.infer<typeof CreateExtrusionSchema>) => {
      try {
        const params = CreateExtrusionSchema.parse(args);
        
        // Log parameters for debugging
        logger.info('Creating advanced extrusion with parameters:', params);
        
        // Use the builder for complex configurations
        const builder = api.createExtrusionBuilder()
          .depth(params.depth);
        
        if (params.reverse) builder.reverse(params.reverse);
        if (params.bothDirections) builder.bothDirections(params.bothDirections, params.depth2);
        if (params.draft) builder.draft(params.draft, params.draftOutward, params.draftWhileExtruding);
        if (params.offsetDistance) builder.offset(params.offsetDistance, params.offsetReverse);
        if (params.thinFeature && params.thinThickness) {
          builder.thinFeature(params.thinThickness, params.thinType as any || 'OneSide');
        }
        if (params.capEnds && params.capThickness) builder.capEnds(params.capThickness);
        if (params.merge !== undefined) builder.merge(params.merge);
        if (params.flipSideToCut) builder.flipSideToCut(params.flipSideToCut);
        if (params.startCondition) builder.startCondition(params.startCondition);
        if (params.endCondition) builder.endCondition(params.endCondition);
        if (params.translateSurface) builder.translateSurface(params.translateSurface);
        
        const feature = await api.executeExtrusionCommand(builder);
        
        return {
          success: true,
          featureName: feature.name,
          featureType: feature.type,
          message: 'Advanced extrusion created successfully with all parameters'
        };
      } catch (error) {
        logger.error('Failed to create advanced extrusion:', error);
        throw error;
      }
    }
  },
  
  {
    name: 'create_simple_extrusion',
    description: 'Create a simple extrusion with basic parameters',
    inputSchema: zodToJsonSchema(z.object({
      depth: z.number().positive().describe('Extrusion depth in mm'),
      reverse: z.boolean().optional().describe('Reverse direction'),
      draft: z.number().optional().describe('Draft angle in degrees')
    })),
    execute: async (api: SolidWorksAPIRefactored, args: any) => {
      const feature = await api.createExtrusion(
        args.depth,
        args.draft || 0,
        args.reverse || false
      );
      
      return {
        success: true,
        featureName: feature.name,
        featureType: feature.type
      };
    }
  },
  
  {
    name: 'create_cut_extrusion',
    description: 'Create a cut extrusion to remove material',
    inputSchema: zodToJsonSchema(z.object({
      depth: z.number().positive().describe('Cut depth in mm'),
      throughAll: z.boolean().optional().describe('Cut through all')
    })),
    execute: async (api: SolidWorksAPIRefactored, args: any) => {
      const command = args.throughAll
        ? ExtrusionFactory.throughAllExtrusion()
        : ExtrusionFactory.cutExtrusion(args.depth);
      
      const result = await api.ensureAdapter().execute(command);
      
      if (!result.success) {
        throw new Error(result.error || 'Cut extrusion failed');
      }
      
      return {
        success: true,
        featureName: (result.data as any).name || 'Cut-Extrude1',
        featureType: 'Cut-Extrude'
      };
    }
  },
  
  {
    name: 'create_thin_extrusion',
    description: 'Create a thin-walled extrusion',
    inputSchema: zodToJsonSchema(z.object({
      depth: z.number().positive().describe('Extrusion depth in mm'),
      thickness: z.number().positive().describe('Wall thickness in mm'),
      type: z.enum(['OneSide', 'TwoSide', 'MidPlane']).optional()
    })),
    execute: async (api: SolidWorksAPIRefactored, args: any) => {
      const builder = api.createExtrusionBuilder()
        .depth(args.depth)
        .thinFeature(args.thickness, args.type || 'OneSide');
      
      const feature = await api.executeExtrusionCommand(builder);
      
      return {
        success: true,
        featureName: feature.name,
        featureType: 'Thin-Extrude'
      };
    }
  },
  
  {
    name: 'create_midplane_extrusion',
    description: 'Create an extrusion symmetric about the sketch plane',
    inputSchema: zodToJsonSchema(z.object({
      totalDepth: z.number().positive().describe('Total extrusion depth in mm')
    })),
    execute: async (api: SolidWorksAPIRefactored, args: any) => {
      const command = ExtrusionFactory.midPlaneExtrusion(args.totalDepth);
      const result = await api.ensureAdapter().execute(command);
      
      if (!result.success) {
        throw new Error(result.error || 'Midplane extrusion failed');
      }
      
      return {
        success: true,
        featureName: (result.data as any).name || 'Extrude1',
        featureType: 'MidPlane-Extrude'
      };
    }
  },
  
  {
    name: 'create_revolve',
    description: 'Create a revolved feature',
    inputSchema: zodToJsonSchema(CreateRevoluteSchema),
    execute: async (api: SolidWorksAPIRefactored, args: z.infer<typeof CreateRevoluteSchema>) => {
      const params = CreateRevoluteSchema.parse(args);
      const adapter = api.ensureAdapter();
      
      const feature = await adapter.createRevolve({
        angle: params.angle,
        axis: params.axis,
        direction: params.direction === 'Reverse' ? 1 : params.direction === 'Both' ? 2 : 0,
        merge: params.merge,
        thinFeature: params.thinFeature,
        thinThickness: params.thinThickness
      });
      
      return {
        success: true,
        featureName: feature.name,
        featureType: feature.type
      };
    }
  },
  
  {
    name: 'create_sweep',
    description: 'Create a swept feature along a path',
    inputSchema: zodToJsonSchema(CreateSweepSchema),
    execute: async (api: SolidWorksAPIRefactored, args: z.infer<typeof CreateSweepSchema>) => {
      const params = CreateSweepSchema.parse(args);
      const adapter = api.ensureAdapter();
      
      const feature = await adapter.createSweep(params);
      
      return {
        success: true,
        featureName: feature.name,
        featureType: feature.type
      };
    }
  },
  
  {
    name: 'create_loft',
    description: 'Create a lofted feature between profiles',
    inputSchema: zodToJsonSchema(CreateLoftSchema),
    execute: async (api: SolidWorksAPIRefactored, args: z.infer<typeof CreateLoftSchema>) => {
      const params = CreateLoftSchema.parse(args);
      const adapter = api.ensureAdapter();
      
      const feature = await adapter.createLoft(params);
      
      return {
        success: true,
        featureName: feature.name,
        featureType: feature.type
      };
    }
  },
  
  {
    name: 'test_extrusion_all_parameters',
    description: 'Test extrusion with all possible parameters to verify the adapter architecture',
    inputSchema: zodToJsonSchema(z.object({
      runTest: z.boolean().describe('Run the comprehensive test')
    })),
    execute: async (api: SolidWorksAPIRefactored, args: any) => {
      if (!args.runTest) {
        return { success: false, message: 'Test not run' };
      }
      
      const testResults = [];
      
      // Test 1: Simple extrusion
      try {
        const simple = await api.createExtrusion(25);
        testResults.push({ test: 'Simple extrusion', success: true, feature: simple.name });
      } catch (e) {
        testResults.push({ test: 'Simple extrusion', success: false, error: String(e) });
      }
      
      // Test 2: Extrusion with draft
      try {
        const drafted = ExtrusionFactory.draftedExtrusion(30, 5);
        const result = await api.ensureAdapter().execute(drafted);
        testResults.push({ test: 'Drafted extrusion', success: result.success, feature: (result.data as any)?.name || 'Extrude1' });
      } catch (e) {
        testResults.push({ test: 'Drafted extrusion', success: false, error: String(e) });
      }
      
      // Test 3: Thin extrusion
      try {
        const thin = ExtrusionFactory.thinExtrusion(20, 2);
        const result = await api.ensureAdapter().execute(thin);
        testResults.push({ test: 'Thin extrusion', success: result.success, feature: (result.data as any)?.name || 'Extrude1' });
      } catch (e) {
        testResults.push({ test: 'Thin extrusion', success: false, error: String(e) });
      }
      
      // Test 4: Complex extrusion with all parameters
      try {
        const complex = await api.executeExtrusionCommand(
          api.createExtrusionBuilder()
            .depth(50)
            .bothDirections(true, 30)
            .draft(3, true, true)
            .thinFeature(1.5, 'TwoSide')
            .capEnds(2)
            .offset(5, false)
            .translateSurface(false)
            .merge(true)
            .endCondition('Blind')
        );
        testResults.push({ test: 'Complex extrusion (all params)', success: true, feature: complex.name });
      } catch (e) {
        testResults.push({ test: 'Complex extrusion (all params)', success: false, error: String(e) });
      }
      
      const successCount = testResults.filter(r => r.success).length;
      const totalCount = testResults.length;
      
      return {
        success: successCount === totalCount,
        message: `Extrusion tests completed: ${successCount}/${totalCount} passed`,
        results: testResults,
        adapterInfo: {
          type: api.config?.type || 'unknown',
          circuitBreakerEnabled: api.config?.enableCircuitBreaker || false,
          connectionPoolEnabled: api.config?.enableConnectionPool || false
        }
      };
    }
  }
];