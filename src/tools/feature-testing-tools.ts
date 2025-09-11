/**
 * Comprehensive Feature Testing Tools
 * 
 * These tools verify that all SolidWorks features work correctly
 * with the new dynamic adapter architecture.
 */

import { z } from 'zod';
import { SolidWorksAPIRefactored } from '../solidworks/api-refactored.js';
import { EnhancedWinAxAdapter } from '../adapters/winax-adapter-enhanced.js';
import { FeatureComplexityAnalyzer } from '../adapters/feature-complexity-analyzer.js';
import { 
  CreateExtrusionCommand,
  ExtrusionParameters,
  RevolveParameters,
  SweepParameters,
  LoftParameters
} from '../adapters/types.js';
import { ExtrusionFactory } from '../commands/extrusion-command.js';

/**
 * Test all features comprehensively
 */
export const featureTestingTools = [
  {
    name: 'test_all_features',
    description: 'Test all feature creation methods with various complexity levels',
    inputSchema: z.object({
      runFullTest: z.boolean().default(true),
      testExtrusion: z.boolean().default(true),
      testRevolve: z.boolean().default(true),
      testSweep: z.boolean().default(true),
      testLoft: z.boolean().default(true),
      testPatterns: z.boolean().default(true),
      testFilletChamfer: z.boolean().default(true),
    }),
    execute: async (args: any) => {
      const api = new SolidWorksAPIRefactored({
        type: 'winax-enhanced'
      });
      
      await api.connect();
      const results: any[] = [];
      
      try {
        // Test Extrusion Features
        if (args.testExtrusion) {
          results.push(await testExtrusionFeatures(api));
        }
        
        // Test Revolve Features
        if (args.testRevolve) {
          results.push(await testRevolveFeatures(api));
        }
        
        // Test Sweep Features
        if (args.testSweep) {
          results.push(await testSweepFeatures(api));
        }
        
        // Test Loft Features
        if (args.testLoft) {
          results.push(await testLoftFeatures(api));
        }
        
        // Test Pattern Features
        if (args.testPatterns) {
          results.push(await testPatternFeatures(api));
        }
        
        // Test Fillet/Chamfer Features
        if (args.testFilletChamfer) {
          results.push(await testFilletChamferFeatures(api));
        }
        
        // Generate summary report
        const summary = generateTestSummary(results);
        
        return {
          success: true,
          summary,
          details: results
        };
        
      } finally {
        await api.disconnect();
      }
    }
  },
  
  {
    name: 'test_feature_complexity',
    description: 'Analyze feature complexity and verify correct routing',
    inputSchema: z.object({
      featureType: z.enum(['extrusion', 'revolve', 'sweep', 'loft']),
      parameters: z.record(z.any())
    }),
    execute: async (args: any) => {
      let analysis: any;
      
      switch (args.featureType) {
        case 'extrusion':
          analysis = FeatureComplexityAnalyzer.analyzeExtrusion(args.parameters);
          break;
        case 'revolve':
          analysis = FeatureComplexityAnalyzer.analyzeRevolve(args.parameters);
          break;
        case 'sweep':
          analysis = FeatureComplexityAnalyzer.analyzeSweep(args.parameters);
          break;
        case 'loft':
          analysis = FeatureComplexityAnalyzer.analyzeLoft(args.parameters);
          break;
      }
      
      const recommendation = FeatureComplexityAnalyzer.getRecommendedApproach(
        args.featureType, 
        args.parameters
      );
      
      return {
        analysis,
        recommendation,
        willUseMacro: analysis.requiresMacro,
        parameterCount: analysis.parameterCount,
        complexity: analysis.complexity
      };
    }
  },
  
  {
    name: 'test_extrusion_edge_cases',
    description: 'Test extrusion with edge case parameters',
    inputSchema: z.object({
      testCase: z.enum([
        'minimal',
        'maxSimple',
        'minComplex',
        'maxComplex',
        'asymmetric',
        'thinWithCaps',
        'multiDirection'
      ]).optional()
    }),
    execute: async (args: any) => {
      const api = new SolidWorksAPIRefactored();
      await api.connect();
      
      const testCases = getExtrusionTestCases();
      const casesToRun = args.testCase ? [testCases[args.testCase as keyof typeof testCases]] : Object.values(testCases);
      const results: any[] = [];
      
      try {
        for (const testCase of casesToRun) {
          const startTime = Date.now();
          
          try {
            const result = await api.createExtrusion(testCase.params);
            results.push({
              name: testCase.name,
              success: true,
              feature: result.name,
              duration: Date.now() - startTime,
              complexity: FeatureComplexityAnalyzer.analyzeExtrusion(testCase.params),
              usedMacro: testCase.params.depth2 !== undefined || testCase.params.thinFeature
            });
          } catch (error) {
            results.push({
              name: testCase.name,
              success: false,
              error: error?.toString(),
              duration: Date.now() - startTime
            });
          }
        }
        
        return {
          totalTests: results.length,
          passed: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          averageDuration: results.reduce((acc, r) => acc + r.duration, 0) / results.length,
          results
        };
        
      } finally {
        await api.disconnect();
      }
    }
  },
  
  {
    name: 'test_revolve_variations',
    description: 'Test revolve feature with various parameter combinations',
    inputSchema: z.object({
      testSimple: z.boolean().default(true),
      testWithThin: z.boolean().default(true),
      testBothDirections: z.boolean().default(true)
    }),
    execute: async (args: any) => {
      const api = new SolidWorksAPIRefactored();
      await api.connect();
      
      const results: any[] = [];
      
      try {
        // Create a sketch for revolve
        await api.createPart();
        await api.createSketch('Front');
        await api.addLine(50, 0, 0, 50, 100, 0);
        await api.addLine(50, 100, 0, 100, 100, 0);
        await api.addLine(100, 100, 0, 100, 0, 0);
        await api.addLine(100, 0, 0, 50, 0, 0);
        await api.exitSketch();
        
        // Test simple revolve
        if (args.testSimple) {
          const params: RevolveParameters = {
            angle: 270,
            merge: true
          };
          
          const analysis = FeatureComplexityAnalyzer.analyzeRevolve(params);
          const result = await api.createRevolve(params);
          
          results.push({
            test: 'Simple Revolve',
            success: true,
            feature: result.name,
            complexity: analysis.complexity,
            usedMacro: analysis.requiresMacro
          });
        }
        
        // Test revolve with thin feature
        if (args.testWithThin) {
          const params: RevolveParameters = {
            angle: 180,
            thinFeature: true,
            thinThickness: 2,
            merge: true
          };
          
          const analysis = FeatureComplexityAnalyzer.analyzeRevolve(params);
          const result = await api.createRevolve(params);
          
          results.push({
            test: 'Thin Revolve',
            success: true,
            feature: result.name,
            complexity: analysis.complexity,
            usedMacro: analysis.requiresMacro
          });
        }
        
        // Test both directions revolve
        if (args.testBothDirections) {
          const params: RevolveParameters = {
            angle: 360,
            direction: 'Both',
            merge: true
          };
          
          const analysis = FeatureComplexityAnalyzer.analyzeRevolve(params);
          const result = await api.createRevolve(params);
          
          results.push({
            test: 'Both Directions Revolve',
            success: true,
            feature: result.name,
            complexity: analysis.complexity,
            usedMacro: analysis.requiresMacro
          });
        }
        
        return {
          success: true,
          results
        };
        
      } catch (error) {
        return {
          success: false,
          error: error?.toString(),
          results
        };
      } finally {
        await api.disconnect();
      }
    }
  },
  
  {
    name: 'test_adapter_metrics',
    description: 'Get adapter performance metrics',
    inputSchema: z.object({}),
    execute: async () => {
      const adapter = new EnhancedWinAxAdapter();
      await adapter.connect();
      
      try {
        const health = await adapter.healthCheck();
        const performanceMetrics = FeatureComplexityAnalyzer.getPerformanceMetrics();
        
        return {
          adapterHealth: health,
          featureMetrics: performanceMetrics,
          recommendations: {
            directCOM: `${performanceMetrics.directCOM.length} features can use direct COM`,
            macroRequired: `${performanceMetrics.macroRequired.length} features require macro fallback`,
            borderline: `${performanceMetrics.borderline.length} features are at the parameter limit`
          }
        };
      } finally {
        await adapter.disconnect();
      }
    }
  },
  
  {
    name: 'benchmark_feature_creation',
    description: 'Benchmark feature creation performance',
    inputSchema: z.object({
      iterations: z.number().default(5),
      featureType: z.enum(['extrusion', 'revolve', 'sweep', 'loft']).default('extrusion')
    }),
    execute: async (args: any) => {
      const api = new SolidWorksAPIRefactored();
      await api.connect();
      
      const results = {
        directCOM: [] as number[],
        macroFallback: [] as number[]
      };
      
      try {
        await api.createPart();
        
        for (let i = 0; i < args.iterations; i++) {
          // Test simple feature (direct COM)
          await api.createSketch('Front');
          await api.addRectangle(0, 0, 50, 50);
          await api.exitSketch();
          
          const simpleStart = Date.now();
          await api.createExtrusion({ depth: 25 });
          results.directCOM.push(Date.now() - simpleStart);
          
          // Test complex feature (macro fallback)
          await api.createSketch('Top');
          await api.addCircle(25, 25, 20);
          await api.exitSketch();
          
          const complexStart = Date.now();
          await api.createExtrusion({
            depth: 30,
            bothDirections: true,
            depth2: 20,
            draft: 5,
            thinFeature: true,
            thinThickness: 2,
            capEnds: true,
            capThickness: 1
          });
          results.macroFallback.push(Date.now() - complexStart);
        }
        
        return {
          iterations: args.iterations,
          directCOM: {
            average: results.directCOM.reduce((a, b) => a + b, 0) / results.directCOM.length,
            min: Math.min(...results.directCOM),
            max: Math.max(...results.directCOM),
            times: results.directCOM
          },
          macroFallback: {
            average: results.macroFallback.reduce((a, b) => a + b, 0) / results.macroFallback.length,
            min: Math.min(...results.macroFallback),
            max: Math.max(...results.macroFallback),
            times: results.macroFallback
          },
          speedRatio: (
            results.directCOM.reduce((a, b) => a + b, 0) / 
            results.macroFallback.reduce((a, b) => a + b, 0)
          ).toFixed(2)
        };
        
      } finally {
        await api.disconnect();
      }
    }
  }
];

// Helper functions

async function testExtrusionFeatures(api: SolidWorksAPIRefactored) {
  const results: any[] = [];
  
  // Test simple extrusion
  await api.createPart();
  await api.createSketch('Front');
  await api.addRectangle(0, 0, 100, 100);
  await api.exitSketch();
  
  const simple = await api.createExtrusion({ depth: 50 });
  results.push({ type: 'Simple Extrusion', success: true, feature: simple.name });
  
  // Test complex extrusion
  await api.createSketch('Top');
  await api.addCircle(50, 50, 30);
  await api.exitSketch();
  
  const complex = await api.createExtrusion({
    depth: 25,
    bothDirections: true,
    depth2: 15,
    draft: 3,
    thinFeature: true,
    thinThickness: 2
  });
  results.push({ type: 'Complex Extrusion', success: true, feature: complex.name });
  
  return {
    feature: 'Extrusion',
    tests: results.length,
    passed: results.filter(r => r.success).length,
    results
  };
}

async function testRevolveFeatures(api: SolidWorksAPIRefactored) {
  const results: any[] = [];
  
  await api.createPart();
  await api.createSketch('Front');
  await api.addLine(50, 0, 0, 50, 50, 0);
  await api.addLine(50, 50, 0, 100, 50, 0);
  await api.addLine(100, 50, 0, 100, 0, 0);
  await api.addLine(100, 0, 0, 50, 0, 0);
  await api.exitSketch();
  
  const revolve = await api.createRevolve({ angle: 270 });
  results.push({ type: 'Simple Revolve', success: true, feature: revolve.name });
  
  return {
    feature: 'Revolve',
    tests: results.length,
    passed: results.filter(r => r.success).length,
    results
  };
}

async function testSweepFeatures(api: SolidWorksAPIRefactored) {
  const results: any[] = [];
  
  await api.createPart();
  
  // Create profile
  await api.createSketch('Front');
  await api.addCircle(0, 0, 10);
  await api.exitSketch();
  const profile = 'Sketch1';
  
  // Create path
  await api.createSketch('Top');
  await api.addLine(0, 0, 0, 100, 0, 0);
  await api.addLine(100, 0, 0, 100, 100, 0);
  await api.exitSketch();
  const path = 'Sketch2';
  
  const sweep = await api.createSweep({ profileSketch: profile, pathSketch: path });
  results.push({ type: 'Simple Sweep', success: true, feature: sweep.name });
  
  return {
    feature: 'Sweep',
    tests: results.length,
    passed: results.filter(r => r.success).length,
    results
  };
}

async function testLoftFeatures(api: SolidWorksAPIRefactored) {
  const results: any[] = [];
  
  await api.createPart();
  
  // Create first profile
  await api.createSketch('Front');
  await api.addRectangle(0, 0, 50, 50);
  await api.exitSketch();
  
  // Create second profile
  await api.createSketch('Front');
  // Offset the sketch plane here
  await api.addCircle(25, 25, 15);
  await api.exitSketch();
  
  const loft = await api.createLoft({ 
    profiles: ['Sketch1', 'Sketch2'],
    merge: true 
  });
  results.push({ type: 'Simple Loft', success: true, feature: loft.name });
  
  return {
    feature: 'Loft',
    tests: results.length,
    passed: results.filter(r => r.success).length,
    results
  };
}

async function testPatternFeatures(api: SolidWorksAPIRefactored) {
  // Pattern tests would go here
  return {
    feature: 'Patterns',
    tests: 0,
    passed: 0,
    results: []
  };
}

async function testFilletChamferFeatures(api: SolidWorksAPIRefactored) {
  // Fillet/Chamfer tests would go here
  return {
    feature: 'Fillet/Chamfer',
    tests: 0,
    passed: 0,
    results: []
  };
}

function generateTestSummary(results: any[]) {
  const totalTests = results.reduce((acc, r) => acc + r.tests, 0);
  const totalPassed = results.reduce((acc, r) => acc + r.passed, 0);
  
  return {
    totalFeatureTypes: results.length,
    totalTests,
    totalPassed,
    totalFailed: totalTests - totalPassed,
    successRate: ((totalPassed / totalTests) * 100).toFixed(2) + '%',
    featureResults: results.map(r => ({
      feature: r.feature,
      successRate: ((r.passed / r.tests) * 100).toFixed(2) + '%'
    }))
  };
}

function getExtrusionTestCases() {
  return {
    minimal: {
      name: 'Minimal Parameters',
      params: { depth: 25 } as ExtrusionParameters
    },
    maxSimple: {
      name: 'Maximum Simple (12 params)',
      params: {
        depth: 50,
        reverse: true,
        draft: 5,
        merge: true,
        flipSideToCut: false,
        startCondition: 0,
        endCondition: 0
      } as ExtrusionParameters
    },
    minComplex: {
      name: 'Minimum Complex (13 params)',
      params: {
        depth: 30,
        bothDirections: true,
        depth2: 20,
        draft: 3,
        merge: true
      } as ExtrusionParameters
    },
    maxComplex: {
      name: 'Maximum Complex',
      params: {
        depth: 40,
        reverse: false,
        bothDirections: true,
        depth2: 35,
        draft: 5,
        draftOutward: true,
        draftWhileExtruding: true,
        thinFeature: true,
        thinThickness: 3,
        thinType: 'TwoSide',
        capEnds: true,
        capThickness: 2,
        merge: true,
        flipSideToCut: false,
        startCondition: 0,
        endCondition: 'Blind'
      } as ExtrusionParameters
    },
    asymmetric: {
      name: 'Asymmetric Both Directions',
      params: {
        depth: 60,
        bothDirections: true,
        depth2: 20,
        merge: true
      } as ExtrusionParameters
    },
    thinWithCaps: {
      name: 'Thin Feature with Caps',
      params: {
        depth: 45,
        thinFeature: true,
        thinThickness: 2.5,
        thinType: 'OneSide',
        capEnds: true,
        capThickness: 1.5,
        merge: true
      } as ExtrusionParameters
    },
    multiDirection: {
      name: 'Multi-Direction with Draft',
      params: {
        depth: 35,
        bothDirections: true,
        depth2: 25,
        draft: 7,
        draftOutward: true,
        merge: false
      } as ExtrusionParameters
    }
  };
}