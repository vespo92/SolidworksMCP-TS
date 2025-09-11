/**
 * Feature Complexity Analyzer
 * 
 * Analyzes SolidWorks feature creation methods to determine
 * if they require macro fallback due to parameter count limitations.
 */

import { 
  ExtrusionParameters, 
  RevolveParameters, 
  SweepParameters, 
  LoftParameters 
} from './types.js';

/**
 * Feature method complexity information
 */
interface FeatureComplexity {
  method: string;
  parameterCount: number;
  requiresMacro: boolean;
  criticalParameters: string[];
}

/**
 * SolidWorks API method parameter counts
 * Based on SolidWorks 2025 API documentation
 */
export class FeatureComplexityAnalyzer {
  private static readonly PARAMETER_LIMIT = 12; // COM bridge limitation
  
  private static readonly FEATURE_COMPLEXITIES: Record<string, FeatureComplexity> = {
    // Extrusion features
    'FeatureExtrusion': {
      method: 'FeatureExtrusion',
      parameterCount: 13,
      requiresMacro: true,
      criticalParameters: ['depth', 'draft', 'bothDirections']
    },
    'FeatureExtrusion2': {
      method: 'FeatureExtrusion2',
      parameterCount: 16,
      requiresMacro: true,
      criticalParameters: ['depth', 'draft', 'bothDirections', 'thinFeature']
    },
    'FeatureExtrusion3': {
      method: 'FeatureExtrusion3',
      parameterCount: 23,
      requiresMacro: true,
      criticalParameters: ['depth', 'depth2', 'draft', 'thinFeature', 'capEnds']
    },
    
    // Revolve features
    'FeatureRevolve': {
      method: 'FeatureRevolve',
      parameterCount: 10,
      requiresMacro: false,
      criticalParameters: ['angle', 'direction']
    },
    'FeatureRevolve2': {
      method: 'FeatureRevolve2',
      parameterCount: 12,
      requiresMacro: false, // Right at the limit
      criticalParameters: ['angle', 'direction', 'thinFeature']
    },
    
    // Sweep features
    'FeatureSweep': {
      method: 'FeatureSweep',
      parameterCount: 14,
      requiresMacro: true,
      criticalParameters: ['profileSketch', 'pathSketch']
    },
    'FeatureSweep3': {
      method: 'FeatureSweep3',
      parameterCount: 20,
      requiresMacro: true,
      criticalParameters: ['profileSketch', 'pathSketch', 'twistAngle', 'thinFeature']
    },
    
    // Loft features
    'FeatureLoft': {
      method: 'FeatureLoft',
      parameterCount: 12,
      requiresMacro: false,
      criticalParameters: ['profiles', 'guides']
    },
    'FeatureLoft3': {
      method: 'FeatureLoft3',
      parameterCount: 15,
      requiresMacro: true,
      criticalParameters: ['profiles', 'guides', 'centerCurve', 'thinFeature']
    },
    
    // Pattern features
    'FeatureLinearPattern': {
      method: 'FeatureLinearPattern4',
      parameterCount: 18,
      requiresMacro: true,
      criticalParameters: ['direction1', 'spacing1', 'count1']
    },
    'FeatureCircularPattern': {
      method: 'FeatureCircularPattern4',
      parameterCount: 16,
      requiresMacro: true,
      criticalParameters: ['axis', 'angle', 'count']
    },
    
    // Fillet and Chamfer
    'FeatureFillet': {
      method: 'FeatureFillet3',
      parameterCount: 15,
      requiresMacro: true,
      criticalParameters: ['radius', 'edges', 'propagate']
    },
    'FeatureChamfer': {
      method: 'FeatureChamfer2',
      parameterCount: 13,
      requiresMacro: true,
      criticalParameters: ['distance', 'angle', 'edges']
    },
    
    // Mirror and Move/Copy
    'FeatureMirror': {
      method: 'FeatureMirror2',
      parameterCount: 8,
      requiresMacro: false,
      criticalParameters: ['mirrorPlane', 'features']
    },
    'FeatureMoveCopyBody': {
      method: 'FeatureMoveCopyBody2',
      parameterCount: 14,
      requiresMacro: true,
      criticalParameters: ['translation', 'rotation', 'copy']
    },
    
    // Sheet Metal features
    'FeatureSheetMetal': {
      method: 'FeatureSheetMetal5',
      parameterCount: 16,
      requiresMacro: true,
      criticalParameters: ['thickness', 'bendRadius', 'reliefType']
    },
    'FeatureEdgeFlange': {
      method: 'FeatureEdgeFlange3',
      parameterCount: 14,
      requiresMacro: true,
      criticalParameters: ['angle', 'flangeLength', 'edges']
    }
  };
  
  /**
   * Analyze extrusion parameters to determine if macro fallback is needed
   */
  static analyzeExtrusion(params: ExtrusionParameters): {
    requiresMacro: boolean;
    complexity: 'simple' | 'medium' | 'complex';
    parameterCount: number;
    reason?: string;
  } {
    let paramCount = 6; // Base parameters always present
    
    // Count additional parameters
    if (params.bothDirections) paramCount += 2;
    if (params.draft !== undefined && params.draft !== 0) paramCount += 2;
    if (params.thinFeature) paramCount += 4;
    if (params.capEnds) paramCount += 2;
    if (params.startCondition !== undefined) paramCount += 1;
    if (params.endCondition !== undefined) paramCount += 1;
    if (params.offsetDistance !== undefined) paramCount += 2;
    
    const requiresMacro = paramCount > this.PARAMETER_LIMIT;
    
    let complexity: 'simple' | 'medium' | 'complex';
    if (paramCount <= 8) complexity = 'simple';
    else if (paramCount <= 12) complexity = 'medium';
    else complexity = 'complex';
    
    return {
      requiresMacro,
      complexity,
      parameterCount: paramCount,
      reason: requiresMacro ? `Parameter count (${paramCount}) exceeds COM limit (${this.PARAMETER_LIMIT})` : undefined
    };
  }
  
  /**
   * Analyze revolve parameters
   */
  static analyzeRevolve(params: RevolveParameters): {
    requiresMacro: boolean;
    complexity: 'simple' | 'medium' | 'complex';
    parameterCount: number;
  } {
    let paramCount = 5; // Base parameters
    
    if (params.thinFeature) paramCount += 3;
    if (params.merge === false) paramCount += 1;
    if (params.direction && params.direction !== 0) paramCount += 1;
    
    // Revolve2 has exactly 12 parameters, so we're safe for most cases
    const requiresMacro = (params.thinFeature === true) && paramCount > this.PARAMETER_LIMIT;
    
    return {
      requiresMacro,
      complexity: paramCount <= 8 ? 'simple' : paramCount <= 12 ? 'medium' : 'complex',
      parameterCount: paramCount
    };
  }
  
  /**
   * Analyze sweep parameters - always complex
   */
  static analyzeSweep(params: SweepParameters): {
    requiresMacro: boolean;
    complexity: 'simple' | 'medium' | 'complex';
    parameterCount: number;
  } {
    // Sweep is always complex due to parameter count
    return {
      requiresMacro: true, // FeatureSweep has 14+ parameters
      complexity: 'complex',
      parameterCount: 14 + (params.thinFeature ? 3 : 0)
    };
  }
  
  /**
   * Analyze loft parameters
   */
  static analyzeLoft(params: LoftParameters): {
    requiresMacro: boolean;
    complexity: 'simple' | 'medium' | 'complex';
    parameterCount: number;
  } {
    const hasGuides = params.guides && params.guides.length > 0;
    const hasCenterCurve = params.centerCurve !== undefined;
    const hasThin = params.thinFeature === true;
    
    // FeatureLoft3 has 15+ parameters when using advanced options
    const requiresMacro = hasGuides || hasCenterCurve || hasThin;
    
    return {
      requiresMacro,
      complexity: requiresMacro ? 'complex' : 'medium',
      parameterCount: 12 + (hasGuides ? 2 : 0) + (hasCenterCurve ? 1 : 0) + (hasThin ? 3 : 0)
    };
  }
  
  /**
   * Get feature complexity info by method name
   */
  static getFeatureComplexity(methodName: string): FeatureComplexity | undefined {
    return this.FEATURE_COMPLEXITIES[methodName];
  }
  
  /**
   * Determine if a feature creation will succeed with direct COM call
   */
  static canUseDirectCOM(featureType: string, params: any): boolean {
    switch (featureType) {
      case 'extrusion':
        return !this.analyzeExtrusion(params).requiresMacro;
      case 'revolve':
        return !this.analyzeRevolve(params).requiresMacro;
      case 'sweep':
        return false; // Always requires macro
      case 'loft':
        return !this.analyzeLoft(params).requiresMacro;
      default:
        // For unknown features, check if we have complexity info
        const complexity = this.getFeatureComplexity(featureType);
        return complexity ? !complexity.requiresMacro : true;
    }
  }
  
  /**
   * Get recommended approach for feature creation
   */
  static getRecommendedApproach(featureType: string, params: any): {
    approach: 'direct' | 'macro' | 'simplified';
    reason: string;
    simplificationSuggestions?: string[];
  } {
    const canUseDirect = this.canUseDirectCOM(featureType, params);
    
    if (canUseDirect) {
      return {
        approach: 'direct',
        reason: 'Parameters within COM limit'
      };
    }
    
    // Check if we can simplify parameters to use direct COM
    const suggestions: string[] = [];
    
    if (featureType === 'extrusion' && params as ExtrusionParameters) {
      const extParams = params as ExtrusionParameters;
      if (extParams.thinFeature) {
        suggestions.push('Remove thin feature and use shell instead');
      }
      if (extParams.capEnds) {
        suggestions.push('Create caps as separate features');
      }
      if (extParams.bothDirections && extParams.depth2) {
        suggestions.push('Create as two separate extrusions');
      }
    }
    
    if (suggestions.length > 0) {
      return {
        approach: 'simplified',
        reason: 'Can simplify to use direct COM',
        simplificationSuggestions: suggestions
      };
    }
    
    return {
      approach: 'macro',
      reason: 'Parameters exceed COM limit, macro fallback required'
    };
  }
  
  /**
   * Generate performance metrics for feature creation methods
   */
  static getPerformanceMetrics(): {
    directCOM: string[];
    macroRequired: string[];
    borderline: string[];
  } {
    const directCOM: string[] = [];
    const macroRequired: string[] = [];
    const borderline: string[] = [];
    
    for (const [name, complexity] of Object.entries(this.FEATURE_COMPLEXITIES)) {
      if (complexity.parameterCount <= 10) {
        directCOM.push(name);
      } else if (complexity.parameterCount === 11 || complexity.parameterCount === 12) {
        borderline.push(name);
      } else {
        macroRequired.push(name);
      }
    }
    
    return { directCOM, macroRequired, borderline };
  }
}

/**
 * Feature optimization helper
 */
export class FeatureOptimizer {
  /**
   * Split complex extrusion into simpler operations
   */
  static splitComplexExtrusion(params: ExtrusionParameters): ExtrusionParameters[] {
    const operations: ExtrusionParameters[] = [];
    
    // If both directions, split into two
    if (params.bothDirections && params.depth2) {
      operations.push({
        depth: params.depth,
        reverse: params.reverse,
        draft: params.draft,
        merge: params.merge
      });
      
      operations.push({
        depth: params.depth2,
        reverse: !params.reverse,
        draft: params.draft,
        merge: true
      });
    } else {
      // Single direction but maybe with thin feature
      if (params.thinFeature) {
        // Create solid first, then shell
        operations.push({
          depth: params.depth,
          reverse: params.reverse,
          draft: params.draft,
          merge: params.merge
        });
        // Note: Shell operation would be added separately
      } else {
        operations.push(params);
      }
    }
    
    return operations;
  }
  
  /**
   * Optimize feature parameters for COM compatibility
   */
  static optimizeForCOM<T extends Record<string, any>>(
    featureType: string, 
    params: T
  ): { optimized: T; warnings: string[] } {
    const warnings: string[] = [];
    const optimized = { ...params };
    
    // Remove undefined and null values
    for (const key in optimized) {
      if (optimized[key] === undefined || optimized[key] === null) {
        delete optimized[key];
      }
    }
    
    // Feature-specific optimizations
    if (featureType === 'extrusion') {
      const extParams = optimized as unknown as ExtrusionParameters;
      
      // Warn about complex parameters
      if (extParams.thinFeature && extParams.capEnds) {
        warnings.push('Thin feature with caps requires macro fallback');
      }
      
      if (extParams.bothDirections && extParams.depth2 && extParams.depth2 !== extParams.depth) {
        warnings.push('Asymmetric both-directions extrusion requires macro fallback');
      }
    }
    
    return { optimized: optimized as T, warnings };
  }
}