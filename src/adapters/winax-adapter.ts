/**
 * Enhanced WinAx Adapter for SolidWorks COM Integration
 * 
 * This adapter wraps the existing winax-based SolidWorksAPI with:
 * - Parameter limitation workarounds
 * - Automatic fallback to macro execution for complex operations
 * - Robust error handling and retry logic
 * - Connection health monitoring
 */

// @ts-ignore
import winax from 'winax';
import { 
  ISolidWorksAdapter, 
  Command, 
  AdapterResult, 
  AdapterHealth,
  ExtrusionParameters,
  RevolveParameters,
  SweepParameters,
  LoftParameters,
  MassProperties,
  ValidationResult
} from './types.js';
import { SolidWorksModel, SolidWorksFeature } from '../solidworks/types.js';
import { logger } from '../utils/logger.js';
import { MacroGenerator } from './macro-generator.js';
import path from 'path';
import fs from 'fs/promises';

export class WinAxAdapter implements ISolidWorksAdapter {
  private swApp: any = null;
  private currentModel: any = null;
  private connected: boolean = false;
  private errorCount: number = 0;
  private successCount: number = 0;
  private lastHealthCheck: Date = new Date();
  private responseTimings: number[] = [];
  private macroGenerator: MacroGenerator;
  private tempMacroPath: string;
  
  constructor() {
    this.macroGenerator = new MacroGenerator();
    this.tempMacroPath = path.join(process.env.TEMP || '/tmp', 'solidworks_mcp_macros');
  }
  
  async connect(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Ensure temp macro directory exists
      await fs.mkdir(this.tempMacroPath, { recursive: true });
      
      // Try primary connection method
      try {
        // @ts-ignore
        this.swApp = new winax.Object('SldWorks.Application');
      } catch (error) {
        // Try alternative connection method
        // @ts-ignore
        this.swApp = winax.Object('SldWorks.Application');
      }
      
      if (!this.swApp) {
        throw new Error('Failed to create SolidWorks COM object');
      }
      
      // Make SolidWorks visible
      this.swApp.Visible = true;
      
      // Verify connection by getting process ID
      try {
        const processId = this.swApp.GetProcessID();
        if (processId > 0) {
          this.connected = true;
          this.successCount++;
          logger.info(`Connected to SolidWorks (PID: ${processId})`);
        }
      } catch (e) {
        // GetProcessID might not be available, assume connected
        this.connected = true;
        this.successCount++;
        logger.info('Connected to SolidWorks');
      }
      
      const duration = Date.now() - startTime;
      this.responseTimings.push(duration);
      
    } catch (error) {
      this.errorCount++;
      this.connected = false;
      logger.error('Failed to connect to SolidWorks', error);
      throw new Error(`Failed to connect to SolidWorks: ${error}`);
    }
  }
  
  async disconnect(): Promise<void> {
    try {
      if (this.currentModel) {
        this.currentModel = null;
      }
      
      if (this.swApp) {
        // Don't close SolidWorks, just disconnect
        this.swApp = null;
      }
      
      this.connected = false;
      logger.info('Disconnected from SolidWorks');
      
    } catch (error) {
      logger.error('Error during disconnect', error);
      throw error;
    }
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  async healthCheck(): Promise<AdapterHealth> {
    const startTime = Date.now();
    let healthy = false;
    let connectionStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
    
    try {
      if (this.swApp) {
        // Try to get active document or process ID
        try {
          const processId = this.swApp.GetProcessID();
          if (processId > 0) {
            healthy = true;
            connectionStatus = 'connected';
          }
        } catch (e) {
          // Try alternative health check
          try {
            const docCount = this.swApp.GetDocumentCount();
            healthy = true;
            connectionStatus = 'connected';
          } catch (e2) {
            connectionStatus = 'error';
          }
        }
      }
    } catch (error) {
      connectionStatus = 'error';
      this.errorCount++;
    }
    
    const duration = Date.now() - startTime;
    this.responseTimings.push(duration);
    
    // Keep only last 100 timings
    if (this.responseTimings.length > 100) {
      this.responseTimings = this.responseTimings.slice(-100);
    }
    
    const avgResponseTime = this.responseTimings.length > 0
      ? this.responseTimings.reduce((a, b) => a + b, 0) / this.responseTimings.length
      : 0;
    
    this.lastHealthCheck = new Date();
    
    return {
      healthy,
      lastCheck: this.lastHealthCheck,
      errorCount: this.errorCount,
      successCount: this.successCount,
      averageResponseTime: avgResponseTime,
      connectionStatus
    };
  }
  
  async execute<T>(command: Command): Promise<AdapterResult<T>> {
    const startTime = Date.now();
    
    try {
      // Validate command
      const validation = command.validate();
      if (!validation.valid) {
        throw new Error(`Command validation failed: ${validation.errors?.join(', ')}`);
      }
      
      // Execute based on command name
      let result: any;
      
      switch (command.name) {
        case 'CreateExtrusion':
          result = await this.createExtrusion(command.parameters as ExtrusionParameters);
          break;
          
        case 'CreateRevolve':
          result = await this.createRevolve(command.parameters as RevolveParameters);
          break;
          
        case 'OpenModel':
          result = await this.openModel(command.parameters.filePath);
          break;
          
        case 'CloseModel':
          result = await this.closeModel(command.parameters.save);
          break;
          
        case 'CreatePart':
          result = await this.createPart();
          break;
          
        case 'ExportFile':
          result = await this.exportFile(command.parameters.filePath, command.parameters.format);
          break;
          
        default:
          // Try generic method execution
          result = await this.executeRaw(command.name, Object.values(command.parameters));
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.successCount++;
      this.responseTimings.push(duration);
      
      return {
        success: true,
        data: result as T,
        timing: {
          start: startTime,
          end: endTime,
          duration
        }
      };
      
    } catch (error) {
      this.errorCount++;
      
      // Try fallback if available
      if (command.fallback) {
        logger.info(`Executing fallback for ${command.name}`);
        return this.execute(command.fallback);
      }
      
      const endTime = Date.now();
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timing: {
          start: startTime,
          end: endTime,
          duration: endTime - startTime
        }
      };
    }
  }
  
  async executeRaw(method: string, args: any[]): Promise<any> {
    if (!this.swApp) {
      throw new Error('Not connected to SolidWorks');
    }
    
    try {
      // Get the target object (app or current model)
      const target = this.currentModel || this.swApp;
      
      // Try to execute the method
      if (typeof target[method] === 'function') {
        return target[method](...args);
      } else {
        throw new Error(`Method ${method} not found`);
      }
    } catch (error) {
      logger.error(`Failed to execute raw method: ${method}`, error);
      throw error;
    }
  }
  
  async openModel(filePath: string): Promise<SolidWorksModel> {
    if (!this.swApp) throw new Error('Not connected to SolidWorks');
    
    const errors = { value: 0 };
    const warnings = { value: 0 };
    
    // Determine file type from extension
    const ext = filePath.toLowerCase().split('.').pop();
    let docType = 1; // swDocPART
    if (ext === 'sldasm') docType = 2; // swDocASSEMBLY
    if (ext === 'slddrw') docType = 3; // swDocDRAWING
    
    this.currentModel = this.swApp.OpenDoc6(
      filePath,
      docType,
      1, // swOpenDocOptions_Silent
      '',
      errors,
      warnings
    );
    
    if (!this.currentModel) {
      throw new Error(`Failed to open model: ${filePath}`);
    }
    
    return {
      path: filePath,
      name: this.currentModel.GetTitle(),
      type: (['Part', 'Assembly', 'Drawing'][docType - 1] as 'Part' | 'Assembly' | 'Drawing'),
      isActive: true,
    };
  }
  
  async closeModel(save: boolean = false): Promise<void> {
    if (!this.currentModel) return;
    
    if (save) {
      try {
        this.currentModel.Save3(1, 0, 0); // swSaveAsOptions_Silent
      } catch (e) {
        // Try alternative save
        this.currentModel.Save();
      }
    }
    
    const modelTitle = this.currentModel.GetTitle();
    if (this.swApp && modelTitle) {
      this.swApp.CloseDoc(modelTitle);
    }
    
    this.currentModel = null;
  }
  
  async createPart(): Promise<SolidWorksModel> {
    if (!this.swApp) throw new Error('Not connected to SolidWorks');
    
    this.currentModel = this.swApp.NewPart();
    
    if (!this.currentModel) {
      // Fallback to template-based creation
      const template = this.swApp.GetUserPreferenceStringValue(8) || '';
      this.currentModel = this.swApp.NewDocument(template, 0, 0, 0);
    }
    
    return {
      path: '',
      name: this.currentModel.GetTitle(),
      type: 'Part',
      isActive: true,
    };
  }
  
  async createAssembly(): Promise<SolidWorksModel> {
    if (!this.swApp) throw new Error('Not connected to SolidWorks');
    
    this.currentModel = this.swApp.NewAssembly();
    
    return {
      path: '',
      name: this.currentModel.GetTitle(),
      type: 'Assembly',
      isActive: true,
    };
  }
  
  async createDrawing(): Promise<SolidWorksModel> {
    if (!this.swApp) throw new Error('Not connected to SolidWorks');
    
    this.currentModel = this.swApp.NewDrawing();
    
    return {
      path: '',
      name: this.currentModel.GetTitle(),
      type: 'Drawing',
      isActive: true,
    };
  }
  
  async createExtrusion(params: ExtrusionParameters): Promise<SolidWorksFeature> {
    if (!this.currentModel) throw new Error('No active model');
    
    // Check if we need to use macro fallback for complex parameters
    const needsMacroFallback = this.requiresMacroFallback(params);
    
    if (needsMacroFallback) {
      logger.info('Using macro fallback for extrusion due to parameter complexity');
      return this.createExtrusionViaMacro(params);
    }
    
    try {
      // Use simplified parameters for direct COM call
      const featureMgr = this.currentModel.FeatureManager;
      
      // Exit sketch mode if active
      const sketchMgr = this.currentModel.SketchManager;
      if (sketchMgr.ActiveSketch) {
        sketchMgr.InsertSketch(true);
      }
      
      // Clear selections
      this.currentModel.ClearSelection2(true);
      
      // Select sketch
      this.selectSketchForExtrusion();
      
      // Convert depth to meters
      const depthInMeters = params.depth / 1000;
      
      // Try simple extrusion with limited parameters
      let feature = null;
      
      try {
        // Method 1: Try with minimal parameters using array
        const args = [
          true,                    // Single direction
          params.reverse || false, // Flip
          false,                   // Dir (both directions)
          0,                       // T1 (blind)
          0,                       // T2
          depthInMeters,          // D1 (depth)
          0,                       // D2
          false,                   // Dchk1
          false,                   // Dchk2
          false,                   // Ddir1
          false,                   // Ddir2
          params.draft || 0,       // Dang1
          0                        // Dang2
        ];
        
        // Try direct call with spread operator
        feature = featureMgr.FeatureExtrusion(...args);
        
      } catch (e) {
        logger.warn('Direct extrusion failed, trying alternative method');
        
        // Method 2: Try FeatureExtrusion2 if available
        try {
          feature = featureMgr.FeatureExtrusion2(
            true,                    // Sd
            params.reverse || false, // Flip
            false,                   // Dir
            0,                       // T1
            0,                       // T2
            depthInMeters,          // D1
            0,                       // D2
            false,                   // Dchk1
            false,                   // Dchk2
            false,                   // Ddir1
            false                    // Ddir2
          );
        } catch (e2) {
          // Method 3: Use macro fallback
          logger.warn('All direct methods failed, using macro fallback');
          return this.createExtrusionViaMacro(params);
        }
      }
      
      if (!feature) {
        throw new Error('Failed to create extrusion feature');
      }
      
      // Clear selections and rebuild
      this.currentModel.ClearSelection2(true);
      this.currentModel.EditRebuild3();
      
      return {
        name: feature.Name || 'Boss-Extrude1',
        type: 'Extrusion',
        suppressed: false,
      };
      
    } catch (error) {
      logger.error('Extrusion failed', error);
      
      // Final fallback to macro
      return this.createExtrusionViaMacro(params);
    }
  }
  
  private requiresMacroFallback(params: ExtrusionParameters): boolean {
    // Check if parameters exceed what direct COM can handle
    const complexParams = [
      'draftWhileExtruding',
      'offsetDistance',
      'offsetReverse',
      'translateSurface',
      'flipSideToCut',
      'startCondition',
      'endCondition',
      'thinFeature',
      'thinThickness'
    ];
    
    return complexParams.some(param => params[param as keyof ExtrusionParameters] !== undefined);
  }
  
  private async createExtrusionViaMacro(params: ExtrusionParameters): Promise<SolidWorksFeature> {
    // Generate VBA macro for complex extrusion
    const macroCode = this.macroGenerator.generateExtrusionMacro(params);
    
    // Save macro to temp file
    const macroPath = path.join(this.tempMacroPath, `extrusion_${Date.now()}.swp`);
    await fs.writeFile(macroPath, macroCode);
    
    try {
      // Execute the macro
      const result = this.swApp.RunMacro2(
        macroPath,
        'Module1',
        'CreateExtrusion',
        1, // swRunMacroOption
        0  // error
      );
      
      // Get the last feature created
      const feature = this.currentModel.FeatureByPositionReverse(0);
      
      return {
        name: feature?.Name || 'Boss-Extrude1',
        type: 'Extrusion',
        suppressed: false,
      };
      
    } finally {
      // Clean up temp macro file
      try {
        await fs.unlink(macroPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
  
  private selectSketchForExtrusion(): boolean {
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
        // Try next name
      }
    }
    
    // Try to select the last sketch feature
    try {
      const featureCount = this.currentModel.GetFeatureCount();
      for (let i = 0; i < Math.min(10, featureCount); i++) {
        const feat = this.currentModel.FeatureByPositionReverse(i);
        if (feat) {
          const typeName = feat.GetTypeName2();
          if (typeName && typeName.toLowerCase().includes('sketch')) {
            feat.Select2(false, 0);
            return true;
          }
        }
      }
    } catch (e) {
      // Failed to select sketch
    }
    
    return false;
  }
  
  async createRevolve(params: RevolveParameters): Promise<SolidWorksFeature> {
    if (!this.currentModel) throw new Error('No active model');
    
    // For revolve, we'll use macro fallback for now
    const macroCode = this.macroGenerator.generateRevolveMacro(params);
    const macroPath = path.join(this.tempMacroPath, `revolve_${Date.now()}.swp`);
    await fs.writeFile(macroPath, macroCode);
    
    try {
      this.swApp.RunMacro2(macroPath, 'Module1', 'CreateRevolve', 1, 0);
      const feature = this.currentModel.FeatureByPositionReverse(0);
      
      return {
        name: feature?.Name || 'Revolve1',
        type: 'Revolution',
        suppressed: false,
      };
    } finally {
      await fs.unlink(macroPath).catch(() => {});
    }
  }
  
  async createSweep(params: SweepParameters): Promise<SolidWorksFeature> {
    if (!this.currentModel) throw new Error('No active model');
    
    const macroCode = this.macroGenerator.generateSweepMacro(params);
    const macroPath = path.join(this.tempMacroPath, `sweep_${Date.now()}.swp`);
    await fs.writeFile(macroPath, macroCode);
    
    try {
      this.swApp.RunMacro2(macroPath, 'Module1', 'CreateSweep', 1, 0);
      const feature = this.currentModel.FeatureByPositionReverse(0);
      
      return {
        name: feature?.Name || 'Sweep1',
        type: 'Sweep',
        suppressed: false,
      };
    } finally {
      await fs.unlink(macroPath).catch(() => {});
    }
  }
  
  async createLoft(params: LoftParameters): Promise<SolidWorksFeature> {
    if (!this.currentModel) throw new Error('No active model');
    
    const macroCode = this.macroGenerator.generateLoftMacro(params);
    const macroPath = path.join(this.tempMacroPath, `loft_${Date.now()}.swp`);
    await fs.writeFile(macroPath, macroCode);
    
    try {
      this.swApp.RunMacro2(macroPath, 'Module1', 'CreateLoft', 1, 0);
      const feature = this.currentModel.FeatureByPositionReverse(0);
      
      return {
        name: feature?.Name || 'Loft1',
        type: 'Loft',
        suppressed: false,
      };
    } finally {
      await fs.unlink(macroPath).catch(() => {});
    }
  }
  
  async createSketch(plane: string): Promise<string> {
    if (!this.currentModel) throw new Error('No active model');
    
    const sketchMgr = this.currentModel.SketchManager;
    const ext = this.currentModel.Extension;
    
    // Select the plane
    const selected = ext.SelectByID2(plane, 'PLANE', 0, 0, 0, false, 0, null, 0);
    if (!selected) {
      throw new Error(`Failed to select plane: ${plane}`);
    }
    
    // Insert sketch
    sketchMgr.InsertSketch(true);
    const sketchName = sketchMgr.ActiveSketch?.Name || `Sketch${Date.now()}`;
    
    return sketchName;
  }
  
  async addLine(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    if (!this.currentModel) throw new Error('No active model');
    
    const sketchMgr = this.currentModel.SketchManager;
    const line = sketchMgr.CreateLine(
      x1 / 1000, y1 / 1000, 0,
      x2 / 1000, y2 / 1000, 0
    );
    
    if (!line) {
      throw new Error('Failed to create line');
    }
  }
  
  async addCircle(centerX: number, centerY: number, radius: number): Promise<void> {
    if (!this.currentModel) throw new Error('No active model');
    
    const sketchMgr = this.currentModel.SketchManager;
    const circle = sketchMgr.CreateCircle(
      centerX / 1000, centerY / 1000, 0,
      radius / 1000
    );
    
    if (!circle) {
      throw new Error('Failed to create circle');
    }
  }
  
  async addRectangle(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    if (!this.currentModel) throw new Error('No active model');
    
    const sketchMgr = this.currentModel.SketchManager;
    
    // Create four lines for rectangle
    await this.addLine(x1, y1, x2, y1);
    await this.addLine(x2, y1, x2, y2);
    await this.addLine(x2, y2, x1, y2);
    await this.addLine(x1, y2, x1, y1);
  }
  
  async exitSketch(): Promise<void> {
    if (!this.currentModel) throw new Error('No active model');
    
    const sketchMgr = this.currentModel.SketchManager;
    sketchMgr.InsertSketch(true);
  }
  
  async getMassProperties(): Promise<MassProperties> {
    if (!this.currentModel) throw new Error('No active model');
    
    const ext = this.currentModel.Extension;
    const massProps = ext.CreateMassProperty();
    
    if (!massProps) {
      throw new Error('Failed to create mass property object');
    }
    
    // Update mass properties
    massProps.Update();
    
    const com = massProps.CenterOfMass;
    
    return {
      mass: massProps.Mass,
      volume: massProps.Volume,
      surfaceArea: massProps.SurfaceArea,
      centerOfMass: {
        x: com[0] * 1000, // Convert to mm
        y: com[1] * 1000,
        z: com[2] * 1000,
      },
      density: massProps.Density,
      momentsOfInertia: {
        Ixx: massProps.MomentOfInertia[0],
        Iyy: massProps.MomentOfInertia[4],
        Izz: massProps.MomentOfInertia[8],
        Ixy: massProps.MomentOfInertia[1],
        Iyz: massProps.MomentOfInertia[5],
        Ixz: massProps.MomentOfInertia[2],
      }
    };
  }
  
  async exportFile(filePath: string, format: string): Promise<void> {
    if (!this.currentModel) throw new Error('No active model');
    
    const ext = format.toLowerCase();
    let success = false;
    
    switch(ext) {
      case 'step':
      case 'stp':
      case 'iges':
      case 'igs':
      case 'stl':
      case 'pdf':
      case 'dxf':
      case 'dwg':
        success = this.currentModel.SaveAs3(filePath, 0, 2);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
    
    if (!success) {
      throw new Error(`Failed to export to ${format}`);
    }
  }
  
  async getDimension(name: string): Promise<number> {
    if (!this.currentModel) throw new Error('No active model');
    
    const dimension = this.currentModel.Parameter(name);
    if (!dimension) {
      throw new Error(`Dimension ${name} not found`);
    }
    
    return dimension.SystemValue * 1000; // Convert to mm
  }
  
  async setDimension(name: string, value: number): Promise<void> {
    if (!this.currentModel) throw new Error('No active model');
    
    const dimension = this.currentModel.Parameter(name);
    if (!dimension) {
      throw new Error(`Dimension ${name} not found`);
    }
    
    dimension.SystemValue = value / 1000; // Convert to meters
    this.currentModel.EditRebuild3();
  }
  
  // Helper to ensure current model is synced
  private ensureCurrentModel(): void {
    if (!this.swApp) return;
    
    try {
      const activeDoc = this.swApp.ActiveDoc;
      if (activeDoc && activeDoc !== this.currentModel) {
        this.currentModel = activeDoc;
      }
    } catch (e) {
      // ActiveDoc might not be available
    }
  }
}

/**
 * Factory function to create WinAx adapter
 */
export async function createWinAxAdapter(): Promise<WinAxAdapter> {
  const adapter = new WinAxAdapter();
  await adapter.connect();
  return adapter;
}