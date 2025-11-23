/**
 * Schema Builder Utilities
 * Provides reusable schema components for DRY tool definitions
 */

import { z } from 'zod';

// ============================================
// COMMON SCHEMA PRIMITIVES
// ============================================

/**
 * Common dimension schemas
 */
export const DimensionSchemas = {
  /** Positive length in mm */
  length: z.number().positive().describe('Length in mm'),

  /** Positive or zero length in mm */
  lengthOrZero: z.number().min(0).describe('Length in mm (0 or positive)'),

  /** Angle in degrees (0-360) */
  angle: z.number().min(0).max(360).describe('Angle in degrees'),

  /** Angle in degrees (-360 to 360) */
  signedAngle: z.number().min(-360).max(360).describe('Angle in degrees'),

  /** Draft angle (-89.9 to 89.9 degrees) */
  draftAngle: z.number().min(-89.9).max(89.9).describe('Draft angle in degrees'),

  /** Percentage (0-100) */
  percentage: z.number().min(0).max(100).describe('Percentage (0-100)'),

  /** Scale factor (positive number) */
  scaleFactor: z.number().positive().describe('Scale factor'),

  /** Coordinate value (can be negative) */
  coordinate: z.number().describe('Coordinate value in mm'),
};

/**
 * Common geometric schemas
 */
export const GeometrySchemas = {
  /** 2D point */
  point2D: z.object({
    x: DimensionSchemas.coordinate,
    y: DimensionSchemas.coordinate,
  }).describe('2D point coordinates'),

  /** 3D point */
  point3D: z.object({
    x: DimensionSchemas.coordinate,
    y: DimensionSchemas.coordinate,
    z: DimensionSchemas.coordinate,
  }).describe('3D point coordinates'),

  /** 3D vector (direction) */
  vector3D: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }).describe('3D direction vector'),

  /** Bounding box */
  boundingBox: z.object({
    min: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    }),
    max: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    }),
  }).describe('3D bounding box'),

  /** Line definition (2D) */
  line2D: z.object({
    start: z.object({ x: z.number(), y: z.number() }),
    end: z.object({ x: z.number(), y: z.number() }),
  }).describe('2D line from start to end'),

  /** Circle/arc definition */
  circle: z.object({
    center: z.object({ x: z.number(), y: z.number() }),
    radius: DimensionSchemas.length,
  }).describe('Circle with center and radius'),

  /** Arc definition */
  arc: z.object({
    center: z.object({ x: z.number(), y: z.number() }),
    radius: DimensionSchemas.length,
    startAngle: DimensionSchemas.angle,
    endAngle: DimensionSchemas.angle,
  }).describe('Arc with center, radius, and angles'),
};

/**
 * Common file/path schemas
 */
export const FileSchemas = {
  /** File path */
  filePath: z.string().min(1).describe('Full file path'),

  /** SolidWorks file path */
  solidWorksFile: z.string()
    .regex(/\.(sldprt|sldasm|slddrw)$/i, 'Must be a SolidWorks file (.sldprt, .sldasm, .slddrw)')
    .describe('Path to SolidWorks file'),

  /** Part file path */
  partFile: z.string()
    .regex(/\.sldprt$/i, 'Must be a SolidWorks part file (.sldprt)')
    .describe('Path to SolidWorks part file'),

  /** Assembly file path */
  assemblyFile: z.string()
    .regex(/\.sldasm$/i, 'Must be a SolidWorks assembly file (.sldasm)')
    .describe('Path to SolidWorks assembly file'),

  /** Drawing file path */
  drawingFile: z.string()
    .regex(/\.slddrw$/i, 'Must be a SolidWorks drawing file (.slddrw)')
    .describe('Path to SolidWorks drawing file'),

  /** Export format */
  exportFormat: z.enum(['STEP', 'IGES', 'STL', 'DXF', 'DWG', 'PDF', 'JPEG', 'PNG', 'TIFF', 'PARASOLID', 'OBJ', '3MF'])
    .describe('Export file format'),
};

/**
 * Common naming schemas
 */
export const NamingSchemas = {
  /** Feature name */
  featureName: z.string().min(1).max(64).describe('Feature name'),

  /** Sketch name */
  sketchName: z.string().min(1).max(64).describe('Sketch name'),

  /** Dimension name (e.g., "D1@Sketch1") */
  dimensionName: z.string()
    .regex(/^[A-Za-z0-9_]+@[A-Za-z0-9_]+$/, 'Must be in format "Name@Feature"')
    .describe('Dimension name in format "D1@Sketch1"'),

  /** Configuration name */
  configurationName: z.string().min(1).max(128).describe('Configuration name'),

  /** Plane name */
  planeName: z.enum(['Front', 'Right', 'Top', 'Front Plane', 'Right Plane', 'Top Plane'])
    .or(z.string().min(1))
    .describe('Reference plane name'),
};

/**
 * Common option schemas
 */
export const OptionSchemas = {
  /** Boolean with default false */
  boolFalse: z.boolean().default(false),

  /** Boolean with default true */
  boolTrue: z.boolean().default(true),

  /** Direction enum */
  direction: z.enum(['normal', 'reverse', 'both']).default('normal')
    .describe('Feature direction'),

  /** End condition */
  endCondition: z.enum([
    'Blind',
    'ThroughAll',
    'ThroughAllBoth',
    'UpToVertex',
    'UpToSurface',
    'UpToBody',
    'MidPlane',
    'OffsetFromSurface',
  ]).describe('Feature end condition'),

  /** Merge result option for boolean operations */
  mergeResult: z.boolean().default(true)
    .describe('Merge result with existing bodies'),
};

// ============================================
// SCHEMA BUILDER CLASS
// ============================================

/**
 * Fluent schema builder for tool input schemas
 */
export class SchemaBuilder<T extends z.ZodRawShape = z.ZodRawShape> {
  private shape: T;

  constructor(initialShape: T = {} as T) {
    this.shape = initialShape;
  }

  /**
   * Add a field to the schema
   */
  field<K extends string, S extends z.ZodTypeAny>(
    name: K,
    schema: S
  ): SchemaBuilder<T & { [P in K]: S }> {
    return new SchemaBuilder({
      ...this.shape,
      [name]: schema,
    } as T & { [P in K]: S });
  }

  /**
   * Add a required string field
   */
  requiredString(name: string, description: string): SchemaBuilder<T & { [K in typeof name]: z.ZodString }> {
    return this.field(name, z.string().min(1).describe(description));
  }

  /**
   * Add an optional string field
   */
  optionalString(name: string, description: string): SchemaBuilder<T & { [K in typeof name]: z.ZodOptional<z.ZodString> }> {
    return this.field(name, z.string().optional().describe(description));
  }

  /**
   * Add a required number field
   */
  requiredNumber(name: string, description: string): SchemaBuilder<T & { [K in typeof name]: z.ZodNumber }> {
    return this.field(name, z.number().describe(description));
  }

  /**
   * Add a positive number field (for dimensions)
   */
  positiveNumber(name: string, description: string): SchemaBuilder<T & { [K in typeof name]: z.ZodNumber }> {
    return this.field(name, z.number().positive().describe(description));
  }

  /**
   * Add an optional number with default
   */
  optionalNumber(name: string, defaultValue: number, description: string): SchemaBuilder<T & { [K in typeof name]: z.ZodDefault<z.ZodNumber> }> {
    return this.field(name, z.number().default(defaultValue).describe(description));
  }

  /**
   * Add a boolean with default
   */
  boolean(name: string, defaultValue: boolean, description: string): SchemaBuilder<T & { [K in typeof name]: z.ZodDefault<z.ZodBoolean> }> {
    return this.field(name, z.boolean().default(defaultValue).describe(description));
  }

  /**
   * Add a file path field
   */
  filePath(name: string, description: string): SchemaBuilder<T & { [K in typeof name]: z.ZodString }> {
    return this.field(name, FileSchemas.filePath.describe(description));
  }

  /**
   * Add a SolidWorks file path field
   */
  solidWorksFile(name: string): SchemaBuilder<T & { [K in typeof name]: z.ZodString }> {
    return this.field(name, FileSchemas.solidWorksFile);
  }

  /**
   * Add a dimension name field
   */
  dimensionName(name: string = 'dimensionName'): SchemaBuilder<T & { [K in typeof name]: z.ZodString }> {
    return this.field(name, NamingSchemas.dimensionName);
  }

  /**
   * Add a 3D point field
   */
  point3D(name: string): SchemaBuilder<T & { [K in typeof name]: typeof GeometrySchemas.point3D }> {
    return this.field(name, GeometrySchemas.point3D);
  }

  /**
   * Add a 2D point field
   */
  point2D(name: string): SchemaBuilder<T & { [K in typeof name]: typeof GeometrySchemas.point2D }> {
    return this.field(name, GeometrySchemas.point2D);
  }

  /**
   * Add plane selection field
   */
  plane(name: string = 'plane'): SchemaBuilder<T & { [K in typeof name]: z.ZodUnion<[z.ZodEnum<["Front", "Right", "Top", "Front Plane", "Right Plane", "Top Plane"]>, z.ZodString]> }> {
    return this.field(name, NamingSchemas.planeName);
  }

  /**
   * Add export format field
   */
  exportFormat(name: string = 'format'): SchemaBuilder<T & { [K in typeof name]: typeof FileSchemas.exportFormat }> {
    return this.field(name, FileSchemas.exportFormat);
  }

  /**
   * Build the final Zod schema
   */
  build(): z.ZodObject<T> {
    return z.object(this.shape);
  }
}

/**
 * Create a new schema builder
 */
export function schema(): SchemaBuilder {
  return new SchemaBuilder();
}

// ============================================
// PRESET SCHEMAS
// ============================================

/**
 * Common preset schemas for frequent operations
 */
export const PresetSchemas = {
  /** Empty schema (no parameters) */
  empty: z.object({}),

  /** Open model */
  openModel: z.object({
    path: FileSchemas.solidWorksFile,
  }),

  /** Save model */
  saveModel: z.object({
    path: FileSchemas.filePath.optional().describe('Save path (optional for existing files)'),
  }),

  /** Close model */
  closeModel: z.object({
    save: OptionSchemas.boolFalse.describe('Save before closing'),
  }),

  /** Basic extrusion */
  extrusion: z.object({
    depth: DimensionSchemas.length.describe('Extrusion depth'),
    reverse: OptionSchemas.boolFalse.describe('Reverse direction'),
    draft: DimensionSchemas.draftAngle.optional().describe('Draft angle'),
    draftOutward: OptionSchemas.boolFalse.describe('Draft outward'),
  }),

  /** Basic revolve */
  revolve: z.object({
    angle: DimensionSchemas.angle.describe('Revolve angle'),
    axis: z.string().optional().describe('Axis for revolve'),
    reverse: OptionSchemas.boolFalse.describe('Reverse direction'),
  }),

  /** Dimension operation */
  dimension: z.object({
    name: NamingSchemas.dimensionName,
    value: z.number().describe('Dimension value in mm'),
  }),

  /** Export operation */
  export: z.object({
    path: FileSchemas.filePath.describe('Export file path'),
    format: FileSchemas.exportFormat,
    overwrite: OptionSchemas.boolFalse.describe('Overwrite existing file'),
  }),

  /** Sketch creation */
  createSketch: z.object({
    plane: NamingSchemas.planeName,
    name: NamingSchemas.sketchName.optional(),
  }),

  /** Feature suppression */
  suppressFeature: z.object({
    name: NamingSchemas.featureName,
    suppress: OptionSchemas.boolTrue.describe('Suppress (true) or unsuppress (false)'),
  }),

  /** Configuration switch */
  switchConfiguration: z.object({
    name: NamingSchemas.configurationName,
    rebuild: OptionSchemas.boolTrue.describe('Rebuild after switching'),
  }),
};

// ============================================
// SCHEMA UTILITIES
// ============================================

/**
 * Extend a preset schema with additional fields
 */
export function extendSchema<T extends z.ZodRawShape, U extends z.ZodRawShape>(
  base: z.ZodObject<T>,
  extension: U
): z.ZodObject<T & U> {
  return base.extend(extension) as z.ZodObject<T & U>;
}

/**
 * Make all fields optional
 */
export function makeOptional<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K]> }> {
  return schema.partial() as z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K]> }>;
}

/**
 * Pick specific fields from a schema
 */
export function pickFields<T extends z.ZodRawShape, K extends keyof T>(
  schema: z.ZodObject<T>,
  keys: K[]
): z.ZodObject<Pick<T, K>> {
  const pickObj: Record<string, true> = {};
  for (const key of keys) {
    pickObj[key as string] = true;
  }
  return schema.pick(pickObj as any) as z.ZodObject<Pick<T, K>>;
}
