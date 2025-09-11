/**
 * Extrusion Command Implementation
 * 
 * Provides a robust command for creating extrusions with:
 * - Full parameter support
 * - Automatic validation
 * - Fallback strategies
 * - Retry logic
 */

import { 
  Command, 
  ValidationResult, 
  ExtrusionParameters 
} from '../adapters/types.js';

export class ExtrusionCommand implements Command {
  name = 'CreateExtrusion';
  retryable = true;
  maxRetries = 3;
  timeout = 30000;
  fallback?: Command;
  
  constructor(
    public parameters: ExtrusionParameters,
    fallback?: Command
  ) {
    this.fallback = fallback || new ExtrusionMacroFallback(parameters);
  }
  
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate depth
    if (!this.parameters.depth || this.parameters.depth <= 0) {
      errors.push('Depth must be greater than 0');
    }
    if (this.parameters.depth > 1000) {
      warnings.push('Depth exceeds 1000mm - this may cause performance issues');
    }
    
    // Validate draft angle
    if (this.parameters.draft !== undefined) {
      if (Math.abs(this.parameters.draft) > 89) {
        errors.push('Draft angle must be between -89 and 89 degrees');
      }
    }
    
    // Validate thin feature parameters
    if (this.parameters.thinFeature) {
      if (!this.parameters.thinThickness || this.parameters.thinThickness <= 0) {
        errors.push('Thin thickness must be specified and greater than 0 when thin feature is enabled');
      }
    }
    
    // Validate both directions with depth2
    if (this.parameters.bothDirections && !this.parameters.depth2) {
      warnings.push('Both directions enabled but depth2 not specified - using same depth for both directions');
      this.parameters.depth2 = this.parameters.depth;
    }
    
    // Validate start/end conditions
    const validStartConditions = [0, 1, 2, 3, 4]; // Enum values
    const validEndConditions = [0, 1, 2, 3, 4, 5, 6]; // Enum values
    
    if (this.parameters.startCondition !== undefined && 
        !validStartConditions.includes(this.parameters.startCondition)) {
      errors.push('Invalid start condition');
    }
    
    if (this.parameters.endCondition !== undefined) {
      const endCondition = typeof this.parameters.endCondition === 'string' 
        ? parseInt(this.parameters.endCondition) 
        : this.parameters.endCondition;
      if (!validEndConditions.includes(endCondition)) {
        errors.push('Invalid end condition');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }
}

/**
 * Macro-based fallback for extrusion
 */
export class ExtrusionMacroFallback implements Command {
  name = 'ExecuteMacro';
  retryable = true;
  maxRetries = 2;
  timeout = 45000; // Longer timeout for macro execution
  
  constructor(private extrusionParams: ExtrusionParameters) {}
  
  get parameters(): Record<string, any> {
    return {
      macroType: 'CreateExtrusion',
      macroParams: this.extrusionParams
    };
  }
  
  validate(): ValidationResult {
    // Macro fallback has less strict validation
    const errors: string[] = [];
    
    if (!this.extrusionParams.depth || this.extrusionParams.depth <= 0) {
      errors.push('Depth must be greater than 0');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

/**
 * Builder for creating extrusion commands with fluent API
 */
export class ExtrusionCommandBuilder {
  private params: ExtrusionParameters = {
    depth: 25 // Default 25mm
  };
  
  depth(value: number): this {
    this.params.depth = value;
    return this;
  }
  
  reverse(value: boolean = true): this {
    this.params.reverse = value;
    return this;
  }
  
  bothDirections(value: boolean = true, depth2?: number): this {
    this.params.bothDirections = value;
    if (depth2 !== undefined) {
      this.params.depth2 = depth2;
    }
    return this;
  }
  
  draft(angle: number, outward: boolean = false, whileExtruding: boolean = false): this {
    this.params.draft = angle;
    this.params.draftOutward = outward;
    this.params.draftWhileExtruding = whileExtruding;
    return this;
  }
  
  offset(distance: number, reverse: boolean = false): this {
    this.params.offsetDistance = distance;
    this.params.offsetReverse = reverse;
    return this;
  }
  
  thinFeature(thickness: number, type: 'OneSide' | 'TwoSide' | 'MidPlane' = 'OneSide'): this {
    this.params.thinFeature = true;
    this.params.thinThickness = thickness;
    this.params.thinType = type;
    return this;
  }
  
  capEnds(thickness: number): this {
    this.params.capEnds = true;
    this.params.capThickness = thickness;
    return this;
  }
  
  merge(value: boolean = true): this {
    this.params.merge = value;
    return this;
  }
  
  flipSideToCut(value: boolean = true): this {
    this.params.flipSideToCut = value;
    return this;
  }
  
  startCondition(condition: 'SketchPlane' | 'Surface' | 'Face' | 'Plane' | 'Offset'): this {
    const conditionMap = {
      'SketchPlane': 0,
      'Surface': 1,
      'Face': 2,
      'Plane': 3,
      'Offset': 4
    };
    this.params.startCondition = conditionMap[condition];
    return this;
  }
  
  endCondition(condition: 'Blind' | 'ThroughAll' | 'UpToNext' | 'UpToVertex' | 'UpToSurface' | 'OffsetFromSurface' | 'MidPlane'): this {
    const conditionMap = {
      'Blind': 0,
      'ThroughAll': 1,
      'UpToNext': 2,
      'UpToVertex': 3,
      'UpToSurface': 4,
      'OffsetFromSurface': 5,
      'MidPlane': 6
    };
    this.params.endCondition = conditionMap[condition];
    return this;
  }
  
  translateSurface(value: boolean = true): this {
    this.params.translateSurface = value;
    return this;
  }
  
  build(): ExtrusionCommand {
    return new ExtrusionCommand({ ...this.params });
  }
}

/**
 * Factory function for common extrusion types
 */
export class ExtrusionFactory {
  static simpleExtrusion(depth: number): ExtrusionCommand {
    return new ExtrusionCommandBuilder()
      .depth(depth)
      .build();
  }
  
  static cutExtrusion(depth: number): ExtrusionCommand {
    return new ExtrusionCommandBuilder()
      .depth(depth)
      .flipSideToCut(true)
      .merge(false)
      .build();
  }
  
  static thinExtrusion(depth: number, thickness: number): ExtrusionCommand {
    return new ExtrusionCommandBuilder()
      .depth(depth)
      .thinFeature(thickness)
      .build();
  }
  
  static draftedExtrusion(depth: number, draftAngle: number): ExtrusionCommand {
    return new ExtrusionCommandBuilder()
      .depth(depth)
      .draft(draftAngle, true)
      .build();
  }
  
  static midPlaneExtrusion(totalDepth: number): ExtrusionCommand {
    return new ExtrusionCommandBuilder()
      .depth(totalDepth / 2)
      .bothDirections(true, totalDepth / 2)
      .endCondition('MidPlane')
      .build();
  }
  
  static throughAllExtrusion(): ExtrusionCommand {
    return new ExtrusionCommandBuilder()
      .depth(1) // Depth ignored for through all
      .endCondition('ThroughAll')
      .build();
  }
}