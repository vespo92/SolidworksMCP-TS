/**
 * Enhanced WinAx Adapter with Intelligent Feature Creation
 * 
 * This adapter intelligently decides between direct COM calls and macro fallback
 * based on parameter complexity analysis for ALL SolidWorks features.
 */

import winax from 'winax';
import * as path from 'path';
import * as fs from 'fs/promises';
import { 
  ISolidWorksAdapter,
  Command,
  AdapterResult,
  AdapterHealth,
  ExtrusionParameters,
  RevolveParameters,
  SweepParameters,
  LoftParameters,
  MassProperties
} from './types.js';
import { SolidWorksModel, SolidWorksFeature } from '../solidworks/types.js';
import { MacroGenerator } from './macro-generator.js';
import { FeatureComplexityAnalyzer, FeatureOptimizer } from './feature-complexity-analyzer.js';
import { logger } from '../utils/logger.js';

export class EnhancedWinAxAdapter implements ISolidWorksAdapter {
  private swApp: any;
  private currentModel: any;
  private macroGenerator: MacroGenerator;
  private tempMacroPath: string;
  private metrics = {
    directCOMCalls: 0,
    macroFallbacks: 0,
    failures: 0,
    averageResponseTime: 0
  };
  
  constructor() {
    this.swApp = null;
    this.currentModel = null;
    this.macroGenerator = new MacroGenerator();
    this.tempMacroPath = process.env.TEMP || 'C:\\Temp';
  }
  
  // Connection Management
  async connect(): Promise<void> {
    try {
      this.swApp = new winax.Object('SldWorks.Application');
      this.swApp.Visible = true;
      logger.info('Connected to SolidWorks via Enhanced WinAx adapter');
    } catch (error) {
      logger.error('Failed to connect to SolidWorks', error);
      throw new Error(`Failed to connect to SolidWorks: ${error}`);
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.currentModel) {
      this.currentModel = null;
    }
    if (this.swApp) {
      this.swApp = null;
    }
    logger.info('Disconnected from SolidWorks');
  }
  
  isConnected(): boolean {
    return this.swApp !== null;
  }
  
  async healthCheck(): Promise<AdapterHealth> {
    const healthy = this.isConnected();
    return {
      healthy,
      lastCheck: new Date(),
      errorCount: this.metrics.failures,
      successCount: this.metrics.directCOMCalls + this.metrics.macroFallbacks,
      averageResponseTime: this.metrics.averageResponseTime,
      connectionStatus: healthy ? 'connected' : 'disconnected',
      metrics: {
        directCOMCalls: this.metrics.directCOMCalls,
        macroFallbacks: this.metrics.macroFallbacks,
        successRate: this.getSuccessRate()
      }
    };
  }
  
  private getSuccessRate(): number {
    const total = this.metrics.directCOMCalls + this.metrics.macroFallbacks + this.metrics.failures;
    if (total === 0) return 100;
    return ((this.metrics.directCOMCalls + this.metrics.macroFallbacks) / total) * 100;
  }
  
  // Feature Creation with Intelligent Fallback
  
  async createExtrusion(params: ExtrusionParameters): Promise<SolidWorksFeature> {
    if (!this.currentModel) throw new Error('No active model');
    
    const analysis = FeatureComplexityAnalyzer.analyzeExtrusion(params);
    logger.info(`Extrusion analysis: ${JSON.stringify(analysis)}`);
    
    if (!analysis.requiresMacro) {
      // Try direct COM call for simple extrusions
      try {
        return await this.createExtrusionDirect(params);
      } catch (error) {
        logger.warn('Direct extrusion failed, falling back to macro', error);
        return await this.createExtrusionViaMacro(params);
      }
    } else {
      // Complex extrusion - use macro directly
      logger.info(`Using macro fallback: ${analysis.reason}`);
      return await this.createExtrusionViaMacro(params);
    }
  }
  
  private async createExtrusionDirect(params: ExtrusionParameters): Promise<SolidWorksFeature> {
    const startTime = Date.now();
    
    try {
      // Select sketch
      this.selectSketchForFeature();
      
      // Simple extrusion with limited parameters (max 12)
      const feature = this.currentModel.FeatureManager.FeatureExtrusion2(
        true,                          // Sd
        params.reverse || false,       // Flip
        params.bothDirections || false,// Dir
        0,                             // T1 (blind)
        0,                             // T2
        params.depth / 1000,           // D1 (convert mm to m)
        0.0,                           // D2
        false,                         // Dchk1
        false,                         // Dchk2
        params.draft || 0,             // Dang1
        0,                             // Dang2
        false                          // OffsetReverse1
      );
      
      if (!feature) {
        throw new Error('FeatureExtrusion2 returned null');
      }
      
      this.metrics.directCOMCalls++;
      this.updateResponseTime(Date.now() - startTime);
      
      return {
        name: feature.Name || 'Boss-Extrude1',
        type: 'Extrusion',
        suppressed: false
      };
    } catch (error) {
      this.metrics.failures++;
      throw error;
    }
  }
  
  private async createExtrusionViaMacro(params: ExtrusionParameters): Promise<SolidWorksFeature> {
    const startTime = Date.now();
    
    const macroCode = this.macroGenerator.generateExtrusionMacro(params);
    const macroPath = path.join(this.tempMacroPath, `extrusion_${Date.now()}.swp`);
    
    await fs.writeFile(macroPath, macroCode);
    
    try {
      this.swApp.RunMacro2(macroPath, 'Module1', 'CreateExtrusion', 1, 0);
      const feature = this.currentModel.FeatureByPositionReverse(0);
      
      this.metrics.macroFallbacks++;
      this.updateResponseTime(Date.now() - startTime);
      
      return {
        name: feature?.Name || 'Boss-Extrude1',
        type: 'Extrusion',
        suppressed: false
      };
    } finally {
      await fs.unlink(macroPath).catch(() => {});
    }
  }
  
  async createRevolve(params: RevolveParameters): Promise<SolidWorksFeature> {
    if (!this.currentModel) throw new Error('No active model');
    
    const analysis = FeatureComplexityAnalyzer.analyzeRevolve(params);
    logger.info(`Revolve analysis: ${JSON.stringify(analysis)}`);
    
    if (!analysis.requiresMacro) {
      try {
        return await this.createRevolveDirect(params);
      } catch (error) {
        logger.warn('Direct revolve failed, falling back to macro', error);
        return await this.createRevolveViaMacro(params);
      }
    } else {
      return await this.createRevolveViaMacro(params);
    }
  }
  
  private async createRevolveDirect(params: RevolveParameters): Promise<SolidWorksFeature> {
    const startTime = Date.now();
    
    try {
      this.selectSketchForFeature();
      
      // FeatureRevolve2 has exactly 12 parameters - right at the limit
      const feature = this.currentModel.FeatureManager.FeatureRevolve2(
        true,                           // SingleDir
        params.direction === 'Reverse',// IsSolid
        params.direction === 'Both',   // IsThin
        false,                         // Cap
        false,                         // MakeThinFeature
        (params.angle * Math.PI) / 180,// Angle1
        0,                             // Angle2
        0,                             // OffsetDistance1
        0,                             // OffsetDistance2
        0,                             // OffsetReverse1
        0,                             // OffsetReverse2
        params.merge !== false         // Merge
      );
      
      if (!feature) {
        throw new Error('FeatureRevolve2 returned null');
      }
      
      this.metrics.directCOMCalls++;
      this.updateResponseTime(Date.now() - startTime);
      
      return {
        name: feature.Name || 'Revolve1',
        type: 'Revolution',
        suppressed: false
      };
    } catch (error) {
      this.metrics.failures++;
      throw error;
    }
  }
  
  private async createRevolveViaMacro(params: RevolveParameters): Promise<SolidWorksFeature> {
    const startTime = Date.now();
    
    const macroCode = this.macroGenerator.generateRevolveMacro(params);
    const macroPath = path.join(this.tempMacroPath, `revolve_${Date.now()}.swp`);
    
    await fs.writeFile(macroPath, macroCode);
    
    try {
      this.swApp.RunMacro2(macroPath, 'Module1', 'CreateRevolve', 1, 0);
      const feature = this.currentModel.FeatureByPositionReverse(0);
      
      this.metrics.macroFallbacks++;
      this.updateResponseTime(Date.now() - startTime);
      
      return {
        name: feature?.Name || 'Revolve1',
        type: 'Revolution',
        suppressed: false
      };
    } finally {
      await fs.unlink(macroPath).catch(() => {});
    }
  }
  
  async createSweep(params: SweepParameters): Promise<SolidWorksFeature> {
    if (!this.currentModel) throw new Error('No active model');
    
    // Sweep always requires macro due to high parameter count
    const analysis = FeatureComplexityAnalyzer.analyzeSweep(params);
    logger.info(`Sweep analysis: Always complex - ${analysis.parameterCount} parameters`);
    
    return await this.createSweepViaMacro(params);
  }
  
  private async createSweepViaMacro(params: SweepParameters): Promise<SolidWorksFeature> {
    const startTime = Date.now();
    
    const macroCode = this.macroGenerator.generateSweepMacro(params);
    const macroPath = path.join(this.tempMacroPath, `sweep_${Date.now()}.swp`);
    
    await fs.writeFile(macroPath, macroCode);
    
    try {
      this.swApp.RunMacro2(macroPath, 'Module1', 'CreateSweep', 1, 0);
      const feature = this.currentModel.FeatureByPositionReverse(0);
      
      this.metrics.macroFallbacks++;
      this.updateResponseTime(Date.now() - startTime);
      
      return {
        name: feature?.Name || 'Sweep1',
        type: 'Sweep',
        suppressed: false
      };
    } finally {
      await fs.unlink(macroPath).catch(() => {});
    }
  }
  
  async createLoft(params: LoftParameters): Promise<SolidWorksFeature> {
    if (!this.currentModel) throw new Error('No active model');
    
    const analysis = FeatureComplexityAnalyzer.analyzeLoft(params);
    logger.info(`Loft analysis: ${JSON.stringify(analysis)}`);
    
    if (!analysis.requiresMacro) {
      try {
        return await this.createLoftDirect(params);
      } catch (error) {
        logger.warn('Direct loft failed, falling back to macro', error);
        return await this.createLoftViaMacro(params);
      }
    } else {
      return await this.createLoftViaMacro(params);
    }
  }
  
  private async createLoftDirect(params: LoftParameters): Promise<SolidWorksFeature> {
    const startTime = Date.now();
    
    try {
      // Select profiles
      for (const profile of params.profiles) {
        this.currentModel.Extension.SelectByID2(
          profile, 'SKETCH', 0, 0, 0, true, 0, null, 0
        );
      }
      
      // Simple loft without guides (12 parameters max)
      const feature = this.currentModel.FeatureManager.InsertProtrusionBlend2(
        false,                    // Closed
        true,                     // KeepTangency
        false,                    // ForceNonRational
        true,                     // ThinFeature
        true,                     // UseFeatScope
        true,                     // AutoSelect
        params.profiles.length,   // NumberOfSections
        0,                        // StartConditions
        0,                        // EndConditions
        0,                        // StartTangentType
        0,                        // EndTangentType
        params.merge !== false    // Merge
      );
      
      if (!feature) {
        throw new Error('InsertProtrusionBlend2 returned null');
      }
      
      this.metrics.directCOMCalls++;
      this.updateResponseTime(Date.now() - startTime);
      
      return {
        name: feature.Name || 'Loft1',
        type: 'Loft',
        suppressed: false
      };
    } catch (error) {
      this.metrics.failures++;
      throw error;
    }
  }
  
  private async createLoftViaMacro(params: LoftParameters): Promise<SolidWorksFeature> {
    const startTime = Date.now();
    
    const macroCode = this.macroGenerator.generateLoftMacro(params);
    const macroPath = path.join(this.tempMacroPath, `loft_${Date.now()}.swp`);
    
    await fs.writeFile(macroPath, macroCode);
    
    try {
      this.swApp.RunMacro2(macroPath, 'Module1', 'CreateLoft', 1, 0);
      const feature = this.currentModel.FeatureByPositionReverse(0);
      
      this.metrics.macroFallbacks++;
      this.updateResponseTime(Date.now() - startTime);
      
      return {
        name: feature?.Name || 'Loft1',
        type: 'Loft',
        suppressed: false
      };
    } finally {
      await fs.unlink(macroPath).catch(() => {});
    }
  }
  
  // Helper Methods
  
  private selectSketchForFeature(): boolean {
    const ext = this.currentModel.Extension;
    const sketchNames = ['Sketch1', 'Sketch2', 'Sketch3', 'Sketch4', 'Sketch5'];
    
    for (const name of sketchNames) {
      try {
        const selected = ext.SelectByID2(name, 'SKETCH', 0, 0, 0, false, 0, null, 0);
        if (selected) {
          logger.info(`Selected sketch: ${name}`);
          return true;
        }
      } catch (e) {
        // Try next
      }
    }
    
    return false;
  }
  
  private updateResponseTime(duration: number): void {
    const total = this.metrics.directCOMCalls + this.metrics.macroFallbacks;
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (total - 1) + duration) / total;
  }
  
  // Standard adapter methods (implement remaining interface)
  
  async execute<T>(command: Command): Promise<AdapterResult<T>> {
    const startTime = Date.now();
    
    try {
      let result: any;
      
      // Route commands to appropriate methods
      switch (command.name) {
        case 'CreateExtrusion':
          result = await this.createExtrusion(command.parameters as ExtrusionParameters);
          break;
        case 'CreateRevolve':
          result = await this.createRevolve(command.parameters as RevolveParameters);
          break;
        case 'CreateSweep':
          result = await this.createSweep(command.parameters as SweepParameters);
          break;
        case 'CreateLoft':
          result = await this.createLoft(command.parameters as LoftParameters);
          break;
        default:
          result = await this.executeRaw(command.name, [command.parameters]);
      }
      
      return {
        success: true,
        data: result as T,
        timing: {
          start: new Date(startTime),
          end: new Date(),
          duration: Date.now() - startTime
        },
        metadata: {
          adapter: 'EnhancedWinAx',
          metrics: this.metrics
        }
      };
    } catch (error) {
      this.metrics.failures++;
      return {
        success: false,
        error: error?.toString() || 'Command execution failed',
        timing: {
          start: new Date(startTime),
          end: new Date(),
          duration: Date.now() - startTime
        }
      };
    }
  }
  
  async executeRaw(method: string, args: any[]): Promise<any> {
    if (!this.swApp) throw new Error('Not connected to SolidWorks');
    
    try {
      const target = this.currentModel || this.swApp;
      return target[method](...args);
    } catch (error) {
      logger.error(`Raw execution failed: ${method}`, error);
      throw error;
    }
  }
  
  // Model operations
  async openModel(filePath: string): Promise<SolidWorksModel> {
    if (!this.swApp) throw new Error('Not connected to SolidWorks');
    
    const errors = { value: 0 };
    const warnings = { value: 0 };
    
    const ext = filePath.toLowerCase().split('.').pop();
    let docType = 1; // swDocPART
    if (ext === 'sldasm') docType = 2; // swDocASSEMBLY
    if (ext === 'slddrw') docType = 3; // swDocDRAWING
    
    this.currentModel = this.swApp.OpenDoc6(
      filePath, docType, 1, '', errors, warnings
    );
    
    if (!this.currentModel) {
      throw new Error(`Failed to open model: ${filePath}`);
    }
    
    return {
      path: filePath,
      name: this.currentModel.GetTitle(),
      type: (['Part', 'Assembly', 'Drawing'][docType - 1] as 'Part' | 'Assembly' | 'Drawing'),
      isActive: true
    };
  }
  
  async closeModel(save?: boolean): Promise<void> {
    if (!this.currentModel) return;
    
    if (save) {
      this.currentModel.Save3(1, 0, 0);
    }
    
    const title = this.currentModel.GetTitle();
    this.swApp.CloseDoc(title);
    this.currentModel = null;
  }
  
  async createPart(): Promise<SolidWorksModel> {
    if (!this.swApp) throw new Error('Not connected to SolidWorks');
    
    this.currentModel = this.swApp.NewPart();
    
    return {
      path: '',
      name: this.currentModel.GetTitle(),
      type: 'Part',
      isActive: true
    };
  }
  
  async createAssembly(): Promise<SolidWorksModel> {
    if (!this.swApp) throw new Error('Not connected to SolidWorks');
    
    this.currentModel = this.swApp.NewAssembly();
    
    return {
      path: '',
      name: this.currentModel.GetTitle(),
      type: 'Assembly',
      isActive: true
    };
  }
  
  async createDrawing(): Promise<SolidWorksModel> {
    if (!this.swApp) throw new Error('Not connected to SolidWorks');
    
    this.currentModel = this.swApp.NewDrawing();
    
    return {
      path: '',
      name: this.currentModel.GetTitle(),
      type: 'Drawing',
      isActive: true
    };
  }
  
  // Sketch operations
  async createSketch(plane: string): Promise<string> {
    if (!this.currentModel) throw new Error('No active model');
    
    const ext = this.currentModel.Extension;
    ext.SelectByID2(plane + ' Plane', 'PLANE', 0, 0, 0, false, 0, null, 0);
    this.currentModel.SketchManager.InsertSketch(true);
    
    return this.currentModel.SketchManager.ActiveSketch.Name;
  }
  
  async addLine(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    if (!this.currentModel) throw new Error('No active model');
    
    this.currentModel.SketchManager.CreateLine(
      x1 / 1000, y1 / 1000, 0,
      x2 / 1000, y2 / 1000, 0
    );
  }
  
  async addCircle(centerX: number, centerY: number, radius: number): Promise<void> {
    if (!this.currentModel) throw new Error('No active model');
    
    this.currentModel.SketchManager.CreateCircle(
      centerX / 1000, centerY / 1000, 0,
      (centerX + radius) / 1000, centerY / 1000, 0
    );
  }
  
  async addRectangle(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    if (!this.currentModel) throw new Error('No active model');
    
    const sketchMgr = this.currentModel.SketchManager;
    sketchMgr.CreateLine(x1 / 1000, y1 / 1000, 0, x2 / 1000, y1 / 1000, 0);
    sketchMgr.CreateLine(x2 / 1000, y1 / 1000, 0, x2 / 1000, y2 / 1000, 0);
    sketchMgr.CreateLine(x2 / 1000, y2 / 1000, 0, x1 / 1000, y2 / 1000, 0);
    sketchMgr.CreateLine(x1 / 1000, y2 / 1000, 0, x1 / 1000, y1 / 1000, 0);
  }
  
  async exitSketch(): Promise<void> {
    if (!this.currentModel) throw new Error('No active model');
    
    this.currentModel.SketchManager.InsertSketch(false);
  }
  
  // Analysis operations
  async getMassProperties(): Promise<MassProperties> {
    if (!this.currentModel) throw new Error('No active model');
    
    const massProp = this.currentModel.Extension.CreateMassProperty();
    
    return {
      mass: massProp.Mass,
      volume: massProp.Volume,
      surfaceArea: massProp.SurfaceArea,
      centerOfMass: {
        x: massProp.CenterOfMass[0],
        y: massProp.CenterOfMass[1],
        z: massProp.CenterOfMass[2]
      },
      momentsOfInertia: {
        Ixx: massProp.MomentOfInertia[0],
        Iyy: massProp.MomentOfInertia[4],
        Izz: massProp.MomentOfInertia[8],
        Ixy: massProp.MomentOfInertia[1],
        Iyz: massProp.MomentOfInertia[5],
        Ixz: massProp.MomentOfInertia[2]
      }
    };
  }
  
  // Export operations
  async exportFile(filePath: string, format: string): Promise<void> {
    if (!this.currentModel) throw new Error('No active model');
    
    const formatMap: Record<string, number> = {
      'step': 203,
      'iges': 204,
      'stl': 216,
      'pdf': 217,
      'dwg': 218,
      'dxf': 219
    };
    
    const exportType = formatMap[format.toLowerCase()] || 203;
    
    const success = this.currentModel.Extension.SaveAs3(
      filePath,
      0,
      exportType,
      null,
      null,
      0,
      0
    );
    
    if (!success) {
      throw new Error(`Failed to export to ${format}`);
    }
  }
  
  // Dimension operations
  async getDimension(name: string): Promise<number> {
    if (!this.currentModel) throw new Error('No active model');
    
    const dim = this.currentModel.Parameter(name);
    if (!dim) {
      throw new Error(`Dimension ${name} not found`);
    }
    
    return dim.SystemValue * 1000; // Convert m to mm
  }
  
  async setDimension(name: string, value: number): Promise<void> {
    if (!this.currentModel) throw new Error('No active model');
    
    const dim = this.currentModel.Parameter(name);
    if (!dim) {
      throw new Error(`Dimension ${name} not found`);
    }
    
    dim.SystemValue = value / 1000; // Convert mm to m
    this.currentModel.EditRebuild3();
  }
}

/**
 * Factory function to create enhanced adapter
 */
export async function createEnhancedWinAxAdapter(): Promise<EnhancedWinAxAdapter> {
  const adapter = new EnhancedWinAxAdapter();
  await adapter.connect();
  return adapter;
}