/**
 * Sketch Tools Plugin
 * Comprehensive sketch operations with the new dynamic tool system
 */

import { z } from 'zod';
import {
  defineTool,
  defineToolGroup,
  createPlugin,
  createManifest,
  DimensionSchemas,
  GeometrySchemas,
  NamingSchemas,
  OptionSchemas,
  ToolPlugin,
  ToolPriority,
} from '../../core/tools/index.js';

// ============================================
// SKETCH CREATION TOOLS
// ============================================

const createSketchTool = defineTool()
  .name('sketch_create')
  .description('Create a new sketch on a plane or face')
  .input(z.object({
    plane: NamingSchemas.planeName.describe('Reference plane or face'),
    name: z.string().optional().describe('Custom sketch name'),
    offset: DimensionSchemas.lengthOrZero.optional().describe('Offset from plane'),
  }))
  .category('sketch')
  .priority(ToolPriority.High)
  .version('1.0.0')
  .tags('create', 'plane', 'face')
  .requiresActiveModel()
  .modelTypes('part', 'assembly')
  .example({
    name: 'Create sketch on front plane',
    description: 'Create a new sketch on the front plane',
    input: { plane: 'Front Plane' },
  })
  .handler(async (args) => {
    return {
      success: true,
      sketchName: args.name || 'Sketch1',
      plane: args.plane,
      message: `Created sketch on ${args.plane}`,
    };
  })
  .build();

const editSketchTool = defineTool()
  .name('sketch_edit')
  .description('Enter edit mode for an existing sketch')
  .input(z.object({
    name: z.string().describe('Name of the sketch to edit'),
  }))
  .category('sketch')
  .priority(ToolPriority.Normal)
  .tags('edit', 'modify')
  .requiresActiveModel()
  .handler(async (args) => {
    return {
      success: true,
      sketchName: args.name,
      message: `Editing sketch: ${args.name}`,
    };
  })
  .build();

const exitSketchTool = defineTool()
  .name('sketch_exit')
  .description('Exit the current sketch edit mode')
  .input(z.object({
    rebuild: OptionSchemas.boolTrue.describe('Rebuild model after exiting'),
  }))
  .category('sketch')
  .priority(ToolPriority.Normal)
  .tags('exit', 'close')
  .requiresActiveModel()
  .requiresActiveSketch()
  .handler(async (args) => {
    return {
      success: true,
      rebuilt: args.rebuild,
      message: 'Exited sketch edit mode',
    };
  })
  .build();

// ============================================
// SKETCH GEOMETRY TOOLS
// ============================================

const addLineTool = defineTool()
  .name('sketch_add_line')
  .description('Add a line to the current sketch')
  .input(z.object({
    start: GeometrySchemas.point2D.describe('Start point'),
    end: GeometrySchemas.point2D.describe('End point'),
    construction: OptionSchemas.boolFalse.describe('Create as construction geometry'),
  }))
  .category('sketch')
  .priority(ToolPriority.Normal)
  .tags('line', 'geometry', 'draw')
  .requiresActiveModel()
  .requiresActiveSketch()
  .example({
    name: 'Horizontal line',
    description: 'Draw a horizontal line',
    input: {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
    },
  })
  .handler(async (args) => {
    const length = Math.sqrt(
      Math.pow(args.end.x - args.start.x, 2) +
      Math.pow(args.end.y - args.start.y, 2)
    );
    return {
      success: true,
      entityType: 'line',
      length,
      construction: args.construction,
      message: `Added line (length: ${length.toFixed(2)}mm)`,
    };
  })
  .build();

const addRectangleTool = defineTool()
  .name('sketch_add_rectangle')
  .description('Add a rectangle to the current sketch')
  .input(z.object({
    corner1: GeometrySchemas.point2D.describe('First corner'),
    corner2: GeometrySchemas.point2D.describe('Opposite corner'),
    type: z.enum(['corner', 'center', '3-point']).default('corner').describe('Rectangle type'),
    construction: OptionSchemas.boolFalse,
  }))
  .category('sketch')
  .priority(ToolPriority.Normal)
  .tags('rectangle', 'geometry', 'draw')
  .requiresActiveModel()
  .requiresActiveSketch()
  .example({
    name: 'Simple rectangle',
    description: 'Draw a 100x50 rectangle from origin',
    input: {
      corner1: { x: 0, y: 0 },
      corner2: { x: 100, y: 50 },
    },
  })
  .handler(async (args) => {
    const width = Math.abs(args.corner2.x - args.corner1.x);
    const height = Math.abs(args.corner2.y - args.corner1.y);
    return {
      success: true,
      entityType: 'rectangle',
      width,
      height,
      type: args.type,
      message: `Added rectangle (${width.toFixed(2)} x ${height.toFixed(2)}mm)`,
    };
  })
  .build();

const addCircleTool = defineTool()
  .name('sketch_add_circle')
  .description('Add a circle to the current sketch')
  .input(z.object({
    center: GeometrySchemas.point2D.describe('Center point'),
    radius: DimensionSchemas.length.describe('Circle radius'),
    construction: OptionSchemas.boolFalse,
  }))
  .category('sketch')
  .priority(ToolPriority.Normal)
  .tags('circle', 'geometry', 'draw')
  .requiresActiveModel()
  .requiresActiveSketch()
  .handler(async (args) => {
    return {
      success: true,
      entityType: 'circle',
      radius: args.radius,
      diameter: args.radius * 2,
      circumference: 2 * Math.PI * args.radius,
      message: `Added circle (radius: ${args.radius}mm)`,
    };
  })
  .build();

const addArcTool = defineTool()
  .name('sketch_add_arc')
  .description('Add an arc to the current sketch')
  .input(z.object({
    type: z.enum(['centerpoint', '3-point', 'tangent']).default('centerpoint'),
    center: GeometrySchemas.point2D.optional().describe('Center (for centerpoint arc)'),
    radius: DimensionSchemas.length.optional().describe('Radius (for centerpoint arc)'),
    startAngle: DimensionSchemas.angle.optional(),
    endAngle: DimensionSchemas.angle.optional(),
    point1: GeometrySchemas.point2D.optional().describe('First point (for 3-point arc)'),
    point2: GeometrySchemas.point2D.optional().describe('Second point (for 3-point arc)'),
    point3: GeometrySchemas.point2D.optional().describe('Third point (for 3-point arc)'),
    construction: OptionSchemas.boolFalse,
  }))
  .category('sketch')
  .priority(ToolPriority.Normal)
  .tags('arc', 'geometry', 'draw', 'curve')
  .requiresActiveModel()
  .requiresActiveSketch()
  .handler(async (args) => {
    return {
      success: true,
      entityType: 'arc',
      arcType: args.type,
      message: `Added ${args.type} arc`,
    };
  })
  .build();

const addSplineTool = defineTool()
  .name('sketch_add_spline')
  .description('Add a spline curve to the current sketch')
  .input(z.object({
    points: z.array(GeometrySchemas.point2D).min(2).describe('Control points'),
    closed: OptionSchemas.boolFalse.describe('Create closed spline'),
    construction: OptionSchemas.boolFalse,
  }))
  .category('sketch')
  .priority(ToolPriority.Normal)
  .tags('spline', 'curve', 'geometry', 'draw')
  .requiresActiveModel()
  .requiresActiveSketch()
  .handler(async (args) => {
    return {
      success: true,
      entityType: 'spline',
      pointCount: args.points.length,
      closed: args.closed,
      message: `Added spline with ${args.points.length} control points`,
    };
  })
  .build();

// ============================================
// SKETCH CONSTRAINT TOOLS
// ============================================

const addConstraintTool = defineTool()
  .name('sketch_add_constraint')
  .description('Add a geometric constraint to sketch entities')
  .input(z.object({
    type: z.enum([
      'horizontal', 'vertical', 'coincident', 'concentric',
      'tangent', 'perpendicular', 'parallel', 'equal',
      'symmetric', 'midpoint', 'fix', 'pierce', 'merge'
    ]).describe('Constraint type'),
    entities: z.array(z.string()).min(1).max(2).describe('Entity names to constrain'),
    referencePoint: GeometrySchemas.point2D.optional().describe('Reference point (for some constraints)'),
  }))
  .category('sketch')
  .priority(ToolPriority.Normal)
  .tags('constraint', 'relation', 'geometric')
  .requiresActiveModel()
  .requiresActiveSketch()
  .handler(async (args) => {
    return {
      success: true,
      constraintType: args.type,
      entities: args.entities,
      message: `Added ${args.type} constraint`,
    };
  })
  .build();

const addDimensionTool = defineTool()
  .name('sketch_add_dimension')
  .description('Add a dimension to sketch entities')
  .input(z.object({
    type: z.enum(['linear', 'radial', 'diameter', 'angular']).default('linear'),
    value: z.number().describe('Dimension value'),
    entities: z.array(z.string()).min(1).max(2).describe('Entity names to dimension'),
    position: GeometrySchemas.point2D.optional().describe('Dimension text position'),
    driven: OptionSchemas.boolFalse.describe('Create as driven dimension'),
  }))
  .category('sketch')
  .priority(ToolPriority.Normal)
  .tags('dimension', 'measure', 'constrain')
  .requiresActiveModel()
  .requiresActiveSketch()
  .handler(async (args) => {
    return {
      success: true,
      dimensionType: args.type,
      value: args.value,
      driven: args.driven,
      message: `Added ${args.type} dimension: ${args.value}`,
    };
  })
  .build();

// ============================================
// SKETCH UTILITY TOOLS
// ============================================

const mirrorEntitiesTool = defineTool()
  .name('sketch_mirror')
  .description('Mirror sketch entities about a line')
  .input(z.object({
    entities: z.array(z.string()).min(1).describe('Entities to mirror'),
    mirrorLine: z.string().describe('Line to mirror about'),
    copy: OptionSchemas.boolTrue.describe('Keep original entities'),
  }))
  .category('sketch')
  .priority(ToolPriority.Normal)
  .tags('mirror', 'copy', 'transform')
  .requiresActiveModel()
  .requiresActiveSketch()
  .handler(async (args) => {
    return {
      success: true,
      mirrored: args.entities.length,
      kept: args.copy,
      message: `Mirrored ${args.entities.length} entities`,
    };
  })
  .build();

const trimEntityTool = defineTool()
  .name('sketch_trim')
  .description('Trim a sketch entity at intersections')
  .input(z.object({
    entity: z.string().describe('Entity to trim'),
    trimType: z.enum(['power', 'corner', 'inside', 'outside']).default('power'),
    keepSide: z.enum(['near', 'far']).optional().describe('Side to keep'),
  }))
  .category('sketch')
  .priority(ToolPriority.Normal)
  .tags('trim', 'modify', 'cut')
  .requiresActiveModel()
  .requiresActiveSketch()
  .handler(async (args) => {
    return {
      success: true,
      entity: args.entity,
      trimType: args.trimType,
      message: `Trimmed entity: ${args.entity}`,
    };
  })
  .build();

const offsetEntityTool = defineTool()
  .name('sketch_offset')
  .description('Create an offset of sketch entities')
  .input(z.object({
    entities: z.array(z.string()).min(1).describe('Entities to offset'),
    distance: DimensionSchemas.length.describe('Offset distance'),
    reverse: OptionSchemas.boolFalse.describe('Reverse offset direction'),
    bidirectional: OptionSchemas.boolFalse.describe('Offset in both directions'),
    cap: OptionSchemas.boolTrue.describe('Cap open ends'),
  }))
  .category('sketch')
  .priority(ToolPriority.Normal)
  .tags('offset', 'copy', 'parallel')
  .requiresActiveModel()
  .requiresActiveSketch()
  .handler(async (args) => {
    return {
      success: true,
      offset: args.distance,
      entities: args.entities.length,
      message: `Created offset at ${args.distance}mm`,
    };
  })
  .build();

// ============================================
// TOOL GROUP & PLUGIN EXPORT
// ============================================

const sketchToolsGroup = defineToolGroup()
  .name('sketch-tools')
  .description('Comprehensive sketch creation and editing tools')
  .category('sketch')
  .version('1.0.0')
  .tools(
    createSketchTool,
    editSketchTool,
    exitSketchTool,
    addLineTool,
    addRectangleTool,
    addCircleTool,
    addArcTool,
    addSplineTool,
    addConstraintTool,
    addDimensionTool,
    mirrorEntitiesTool,
    trimEntityTool,
    offsetEntityTool
  )
  .build();

export const plugin: ToolPlugin = createPlugin(
  createManifest(
    'sketch-tools',
    'Sketch Tools Plugin',
    '1.0.0',
    'Comprehensive tools for sketch creation, geometry, constraints, and utilities'
  ),
  sketchToolsGroup.tools,
  {
    onLoad: async () => {
      console.log('Sketch Tools Plugin loaded with', sketchToolsGroup.tools.length, 'tools');
    },
  }
);

export default plugin;

// Export individual tools for direct use
export {
  createSketchTool,
  editSketchTool,
  exitSketchTool,
  addLineTool,
  addRectangleTool,
  addCircleTool,
  addArcTool,
  addSplineTool,
  addConstraintTool,
  addDimensionTool,
  mirrorEntitiesTool,
  trimEntityTool,
  offsetEntityTool,
  sketchToolsGroup,
};
