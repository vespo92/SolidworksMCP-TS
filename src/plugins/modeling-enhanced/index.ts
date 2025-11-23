/**
 * Enhanced Modeling Plugin
 * Demonstrates the new dynamic tool system with enhanced definitions
 */

import { z } from 'zod';
import {
  defineTool,
  defineToolGroup,
  createPlugin,
  createManifest,
  DimensionSchemas,
  OptionSchemas,
  PresetSchemas,
  schema,
  ToolPlugin,
  ToolPriority,
  ToolExecutionContext,
} from '../../core/tools/index.js';
import { ResultUtil } from '../../core/interfaces/core-abstractions.js';

// ============================================
// TOOL DEFINITIONS USING NEW BUILDER PATTERN
// ============================================

/**
 * Enhanced extrusion tool with full metadata
 */
const extrudeToolEnhanced = defineTool()
  .name('extrude_enhanced')
  .description('Create an extrusion feature with intelligent routing for complex operations')
  .input(z.object({
    depth: DimensionSchemas.length.describe('Extrusion depth'),
    reverse: OptionSchemas.boolFalse.describe('Reverse direction'),
    draft: DimensionSchemas.draftAngle.optional(),
    draftOutward: OptionSchemas.boolFalse,
    bothDirections: OptionSchemas.boolFalse.describe('Extrude in both directions'),
    depth2: DimensionSchemas.length.optional().describe('Depth for second direction (if bothDirections)'),
    thinFeature: OptionSchemas.boolFalse.describe('Create thin feature'),
    thinThickness: DimensionSchemas.length.optional().describe('Thin feature thickness'),
    capEnds: OptionSchemas.boolFalse.describe('Cap ends for thin features'),
    mergeResult: OptionSchemas.boolTrue.describe('Merge with existing bodies'),
  }))
  .category('modeling')
  .priority(ToolPriority.High)
  .version('2.0.0')
  .author('SolidWorks MCP Team')
  .since('1.0.0')
  .tags('feature', 'extrusion', 'boss', 'cut')
  .relatedTo('extrude_cut', 'extrude_thin', 'create_sketch')
  .requiresActiveModel()
  .requiresSelection()
  .modelTypes('part', 'assembly')
  .comParameters(15) // Complex operation - will trigger VBA fallback
  .example({
    name: 'Simple extrusion',
    description: 'Create a 50mm extrusion',
    input: { depth: 50 },
    expectedOutput: 'Created extrusion: Boss-Extrude1',
  })
  .example({
    name: 'Drafted extrusion',
    description: 'Create a drafted extrusion in both directions',
    input: { depth: 30, draft: 5, bothDirections: true, depth2: 20 },
    expectedOutput: 'Created extrusion: Boss-Extrude1 with draft',
  })
  .beforeExecute(async (context) => {
    console.log(`Starting extrusion with depth: ${(context.args as any).depth}`);
    return ResultUtil.ok(undefined);
  })
  .afterExecute(async (context, result) => {
    console.log(`Completed extrusion: ${result}`);
    return ResultUtil.ok(undefined);
  })
  .handler(async (args, context) => {
    // This is where the actual SolidWorks API call would happen
    // For now, return a simulated result
    return {
      success: true,
      featureName: 'Boss-Extrude1',
      depth: args.depth,
      message: `Created extrusion with depth ${args.depth}mm`,
    };
  })
  .fallback(async (args, context) => {
    // VBA macro fallback for complex operations
    console.log('Using VBA macro fallback for complex extrusion');
    return {
      success: true,
      featureName: 'Boss-Extrude1',
      depth: args.depth,
      message: `Created extrusion via VBA macro with depth ${args.depth}mm`,
      usedFallback: true,
    };
  })
  .build();

/**
 * Smart revolve tool
 */
const revolveToolEnhanced = defineTool()
  .name('revolve_enhanced')
  .description('Create a revolve feature around an axis')
  .input(z.object({
    angle: DimensionSchemas.angle.describe('Revolve angle (0-360)'),
    axis: z.enum(['centerline', 'edge', 'axis']).optional().describe('Axis type'),
    axisName: z.string().optional().describe('Name of axis feature'),
    reverse: OptionSchemas.boolFalse,
    bothDirections: OptionSchemas.boolFalse,
    angle2: DimensionSchemas.angle.optional(),
    thinFeature: OptionSchemas.boolFalse,
    thinThickness: DimensionSchemas.length.optional(),
    mergeResult: OptionSchemas.boolTrue,
  }))
  .category('modeling')
  .priority(ToolPriority.High)
  .version('2.0.0')
  .tags('feature', 'revolve', 'boss', 'cut', 'rotational')
  .relatedTo('revolve_cut', 'create_sketch', 'extrude_enhanced')
  .requiresActiveModel()
  .requiresSelection()
  .modelTypes('part')
  .comParameters(10)
  .example({
    name: 'Full revolve',
    description: 'Create a 360-degree revolve',
    input: { angle: 360 },
  })
  .handler(async (args, context) => {
    return {
      success: true,
      featureName: 'Revolve1',
      angle: args.angle,
      message: `Created revolve with angle ${args.angle}°`,
    };
  })
  .build();

/**
 * Smart dimension tool with validation
 */
const setDimensionEnhanced = defineTool()
  .name('set_dimension_enhanced')
  .description('Set a dimension value with validation and rebuild')
  .input(z.object({
    name: z.string()
      .regex(/^[A-Za-z0-9_]+@[A-Za-z0-9_]+$/)
      .describe('Dimension name in format "D1@FeatureName"'),
    value: z.number().describe('New dimension value'),
    rebuild: OptionSchemas.boolTrue.describe('Rebuild model after setting'),
    units: z.enum(['mm', 'in', 'ft', 'm']).default('mm').describe('Unit for the value'),
  }))
  .category('modeling')
  .priority(ToolPriority.Normal)
  .version('1.0.0')
  .tags('dimension', 'parameter', 'modify')
  .requiresActiveModel()
  .comParameters(3) // Simple operation
  .handler(async (args, context) => {
    // Convert units if needed
    let valueInMM = args.value;
    switch (args.units) {
      case 'in': valueInMM = args.value * 25.4; break;
      case 'ft': valueInMM = args.value * 304.8; break;
      case 'm': valueInMM = args.value * 1000; break;
    }

    return {
      success: true,
      dimension: args.name,
      oldValue: 0, // Would get from API
      newValue: valueInMM,
      message: `Set ${args.name} to ${args.value}${args.units}`,
    };
  })
  .build();

/**
 * Pattern tool for creating linear/circular patterns
 */
const createPatternTool = defineTool()
  .name('create_pattern')
  .description('Create a linear or circular pattern of features')
  .input(z.object({
    type: z.enum(['linear', 'circular']).describe('Pattern type'),
    features: z.array(z.string()).min(1).describe('Features to pattern'),
    // Linear pattern options
    direction1: z.object({
      spacing: DimensionSchemas.length,
      count: z.number().int().positive(),
      reverse: OptionSchemas.boolFalse,
    }).optional().describe('First direction for linear pattern'),
    direction2: z.object({
      spacing: DimensionSchemas.length,
      count: z.number().int().positive(),
      reverse: OptionSchemas.boolFalse,
    }).optional().describe('Second direction for linear pattern'),
    // Circular pattern options
    axis: z.string().optional().describe('Axis for circular pattern'),
    totalAngle: DimensionSchemas.angle.optional().describe('Total angle for circular pattern'),
    instanceCount: z.number().int().positive().optional().describe('Number of instances'),
    equalSpacing: OptionSchemas.boolTrue.describe('Use equal spacing'),
  }))
  .category('modeling')
  .priority(ToolPriority.Normal)
  .version('1.0.0')
  .tags('pattern', 'linear', 'circular', 'array')
  .requiresActiveModel()
  .modelTypes('part', 'assembly')
  .comParameters(12)
  .handler(async (args, context) => {
    const patternName = args.type === 'linear' ? 'LPattern1' : 'CirPattern1';
    return {
      success: true,
      patternName,
      type: args.type,
      featuresIncluded: args.features,
      message: `Created ${args.type} pattern: ${patternName}`,
    };
  })
  .build();

// ============================================
// TOOL GROUP
// ============================================

const modelingGroupEnhanced = defineToolGroup()
  .name('modeling-enhanced')
  .description('Enhanced modeling tools with intelligent routing and comprehensive options')
  .category('modeling')
  .version('2.0.0')
  .tools(
    extrudeToolEnhanced,
    revolveToolEnhanced,
    setDimensionEnhanced,
    createPatternTool
  )
  .build();

// ============================================
// PLUGIN EXPORT
// ============================================

const manifest = createManifest(
  'modeling-enhanced',
  'Enhanced Modeling Plugin',
  '2.0.0',
  'Advanced modeling tools with intelligent COM/VBA routing, comprehensive options, and full lifecycle support'
);

export const plugin: ToolPlugin = createPlugin(
  manifest,
  modelingGroupEnhanced.tools,
  {
    onLoad: async () => {
      console.log('Enhanced Modeling Plugin loaded');
    },
    onUnload: async () => {
      console.log('Enhanced Modeling Plugin unloaded');
    },
  }
);

// Also export individual tools for direct import
export {
  extrudeToolEnhanced,
  revolveToolEnhanced,
  setDimensionEnhanced,
  createPatternTool,
  modelingGroupEnhanced,
};

// Default export is the plugin
export default plugin;
