// @ts-ignore - winax module doesn't have proper TypeScript definitions
import winax from 'winax';
import { SolidWorksModel, SolidWorksFeature } from './types.js';
import { logger } from '../utils/logger.js';

// Initialize winax to provide global ActiveXObject if available
try {
  // This makes ActiveXObject available globally in some winax versions
  if (typeof winax === 'object' && !((global as any).ActiveXObject)) {
    require('winax');
  }
} catch (e) {
  // Ignore initialization errors, we'll handle them in createCOMObject
}

// Create a robust COM object factory that works with multiple patterns
function createCOMObject(progId: string): any {
  try {
    // Method 1: Try winax.Object (standard API for winax 3.x)
    if (winax && (winax as any).Object) {
      logger.debug(`Creating COM object using winax.Object: ${progId}`);
      return new (winax as any).Object(progId);
    }
    
    // Method 2: Try global ActiveXObject (if winax made it global)
    if (typeof (global as any).ActiveXObject !== 'undefined') {
      logger.debug(`Creating COM object using global ActiveXObject: ${progId}`);
      return new (global as any).ActiveXObject(progId);
    }
    
    // Method 3: Direct winax call (some versions)
    if (typeof winax === 'function') {
      logger.debug(`Creating COM object using winax function: ${progId}`);
      return (winax as any)(progId);
    }
    
    // Method 4: Legacy support - if createActiveXObject was a custom wrapper
    if ((winax as any).createActiveXObject) {
      logger.debug(`Creating COM object using winax.createActiveXObject: ${progId}`);
      return (winax as any).createActiveXObject(progId);
    }
    
    throw new Error('No suitable COM object creation method found. Ensure winax is properly installed.');
  } catch (error) {
    logger.error(`Failed to create COM object ${progId}:`, error);
    throw error;
  }
}

// Export a compatibility function for legacy code
export const createActiveXObject = createCOMObject;

export class SolidWorksAPI {
  private swApp: any;
  private currentModel: any;
  
  constructor() {
    this.swApp = null;
    this.currentModel = null;
  }
  
  connect(): void {
    try {
      // Create or get running instance of SolidWorks
      // Use our robust COM object factory
      this.swApp = createCOMObject('SldWorks.Application');
      this.swApp.Visible = true;
      logger.info('Connected to SolidWorks');
    } catch (error) {
      throw new Error(`Failed to connect to SolidWorks: ${error}`);
    }
  }
  
  disconnect(): void {
    if (this.currentModel) {
      this.currentModel = null;
    }
    if (this.swApp) {
      // Don't close SolidWorks, just disconnect
      this.swApp = null;
    }
  }
  
  isConnected(): boolean {
    return this.swApp !== null;
  }
  
  // Model operations
  openModel(filePath: string): SolidWorksModel {
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
  
  closeModel(save: boolean = false): void {
    if (!this.currentModel) return;
    
    let modelTitle = '';
    try {
      // Safely get the title
      if (this.currentModel.GetTitle) {
        modelTitle = this.currentModel.GetTitle();
      } else if (this.currentModel.GetPathName) {
        modelTitle = this.currentModel.GetPathName();
      }
    } catch (e) {
      // If we can't get the title, continue anyway
      modelTitle = 'Unknown';
    }
    
    if (save) {
      try {
        this.currentModel.Save3(1, 0, 0); // swSaveAsOptions_Silent
      } catch (e) {
        // Save might fail if document is new and has no path
        try {
          // Try Save instead
          this.currentModel.Save();
        } catch (e2) {
          // Continue even if save fails
        }
      }
    }
    
    // Close using app method if title is available
    if (modelTitle && modelTitle !== 'Unknown' && this.swApp) {
      try {
        this.swApp.CloseDoc(modelTitle);
      } catch (e) {
        // Fallback: just clear the reference
      }
    }
    
    this.currentModel = null;
  }
  
  createPart(): SolidWorksModel {
    if (!this.swApp) throw new Error('Not connected to SolidWorks');
    
    // Create new part document
    this.currentModel = this.swApp.NewDocument(
      this.swApp.GetUserPreferenceStringValue(8), // swDefaultTemplatePart
      0,
      0,
      0
    );
    
    return {
      path: '',
      name: this.currentModel.GetTitle(),
      type: 'Part',
      isActive: true,
    };
  }
  
  // Macro support methods
  createSketch(params: any): any {
    if (!this.currentModel) throw new Error('No active model');
    
    const { plane = 'Front' } = params;
    const planeRef = this.currentModel.FeatureManager.GetPlane(plane);
    
    if (planeRef) {
      this.currentModel.SketchManager.InsertSketch(true);
      const sketchName = this.currentModel.SketchManager.ActiveSketch.Name;
      return { success: true, sketchId: sketchName };
    }
    
    return { success: false, error: 'Failed to create sketch' };
  }
  
  addLine(params: any): any {
    if (!this.currentModel) throw new Error('No active model');
    
    const { x1 = 0, y1 = 0, z1 = 0, x2 = 100, y2 = 0, z2 = 0 } = params;
    
    const line = this.currentModel.SketchManager.CreateLine(
      x1 / 1000, y1 / 1000, z1 / 1000,  // Convert mm to m
      x2 / 1000, y2 / 1000, z2 / 1000
    );
    
    if (line) {
      return { success: true, lineId: `line_${Date.now()}` };
    }
    
    return { success: false, error: 'Failed to create line' };
  }
  
  extrude(params: any): any {
    if (!this.currentModel) throw new Error('No active model');
    
    const { depth = 25, reverse = false, draft = 0 } = params;
    
    const feature = this.createExtrude(depth, draft, reverse);
    
    if (feature) {
      return { success: true, featureId: feature.name };
    }
    
    return { success: false, error: 'Failed to create extrusion' };
  }
  
  // Feature operations
  createExtrude(
    depth: number,
    draft: number = 0,
    reverse: boolean = false
  ): SolidWorksFeature {
    if (!this.currentModel) throw new Error('No model open');
    
    try {
      // Get the feature manager
      const featureMgr = this.currentModel.FeatureManager;
      if (!featureMgr) {
        throw new Error('Cannot access FeatureManager');
      }
      
      // Try different extrusion methods based on what's available
      let feature = null;
      
      try {
        // Method 1: Try FeatureExtrusion3 with all parameters
        feature = featureMgr.FeatureExtrusion3(
          true,    // SingleEndedFeature
          reverse, // ReverseDirection
          false,   // UseDirection2
          0,       // EndCondition1 (0 = blind)
          0,       // EndCondition2 
          depth / 1000, // Depth1 (convert mm to m)
          0.01,    // Depth2
          false,   // RevOffset1
          false,   // RevOffset2
          false,   // ThinFeature
          draft * Math.PI / 180, // DraftAngle1 (convert to radians)
          0,       // DraftAngle2
          false,   // DraftOutward1
          false,   // DraftOutward2
          false,   // DraftWhileDrag1
          false,   // DraftWhileDrag2
          false,   // ReverseOffset1Dir
          true,    // TranslateSurface1
          false,   // NormalToCurve
          0,       // StartCondition
          0,       // SketchPlane
          false    // FlipStartDirection
        );
      } catch (e) {
        // Method 2: Try FeatureExtrusion2 with fewer parameters
        try {
          feature = featureMgr.FeatureExtrusion2(
            true,    // SingleEndedFeature
            reverse, // ReverseDirection
            false,   // UseDirection2
            0,       // EndCondition1
            0,       // EndCondition2
            depth / 1000, // Depth1
            0.01,    // Depth2
            false,   // RevOffset1
            false,   // RevOffset2
            false,   // ThinFeature
            draft * Math.PI / 180, // DraftAngle1
            0,       // DraftAngle2
            false,   // DraftOutward1
            false    // DraftOutward2
          );
        } catch (e2) {
          // Method 3: Try the simplest FeatureExtrusion
          feature = featureMgr.FeatureExtrusion(
            true,
            reverse,
            0,
            depth / 1000,
            0,
            0,
            true,
            false,
            false,
            draft * Math.PI / 180,
            0,
            false,
            false
          );
        }
      }
      
      if (!feature) {
        throw new Error('Failed to create extrusion - ensure a sketch is selected');
      }
      
      return {
        name: feature.Name,
        type: 'Extrusion',
        suppressed: false,
      };
    } catch (error) {
      throw new Error(`Extrusion failed: ${error}`);
    }
  }
  
  // Dimension operations
  getDimension(name: string): number {
    if (!this.currentModel) throw new Error('No model open');
    
    const dimension = this.currentModel.Parameter(name);
    if (!dimension) {
      throw new Error(`Dimension "${name}" not found`);
    }
    
    return dimension.SystemValue * 1000; // Convert m to mm
  }
  
  setDimension(name: string, value: number): void {
    if (!this.currentModel) throw new Error('No model open');
    
    const dimension = this.currentModel.Parameter(name);
    if (!dimension) {
      throw new Error(`Dimension "${name}" not found`);
    }
    
    dimension.SystemValue = value / 1000; // Convert mm to m
    this.currentModel.EditRebuild3();
  }
  
  // Export operations
  exportFile(filePath: string, format: string): void {
    if (!this.currentModel) throw new Error('No model open');
    
    try {
      // Ensure the model is saved first
      const currentPath = this.currentModel.GetPathName();
      if (!currentPath || currentPath === '') {
        // Save the model first if it hasn't been saved
        const docType = this.currentModel.GetType();
        const ext = docType === 1 ? '.SLDPRT' : docType === 2 ? '.SLDASM' : '.SLDDRW';
        const tempPath = filePath.replace(/\.[^.]+$/, ext);
        this.currentModel.SaveAs3(tempPath, 0, 1);
      }
      
      const ext = format.toLowerCase();
      let success = false;
      
      // Try to get export data
      let exportData = null;
      try {
        exportData = this.swApp.GetExportFileData(1); // 1 = current config only
      } catch (e) {
        // Export data might not be available for all formats
      }
      
      switch(ext) {
        case 'step':
        case 'stp':
          if (exportData) {
            try {
              exportData.SetStep203(true); // Use STEP AP203
            } catch (e) {
              // Method might not exist
            }
          }
          // Try Extension.SaveAs first
          try {
            success = this.currentModel.Extension.SaveAs(
              filePath, 
              0, // version
              1, // options
              exportData,
              0, // errors
              0  // warnings
            );
          } catch (e) {
            // Fall back to SaveAs3
            success = this.currentModel.SaveAs3(filePath, 0, 1);
          }
          break;
          
        case 'iges':
        case 'igs':
          success = this.currentModel.SaveAs3(filePath, 0, 1);
          break;
          
        case 'stl':
          // STL specific - try SaveAs4 for STL options
          try {
            success = this.currentModel.SaveAs4(
              filePath,
              0, // Version
              1, // Options
              0, // Errors
              0  // Warnings
            );
          } catch (e) {
            success = this.currentModel.SaveAs3(filePath, 0, 1);
          }
          break;
          
        case 'pdf':
          // PDF export requires drawing
          const docType = this.currentModel.GetType();
          if (docType !== 3) { // 3 = swDocDRAWING
            throw new Error('PDF export requires a drawing document');
          }
          // Try ExportPdfData if available
          try {
            const pdfData = this.swApp.GetExportFileData(1);
            success = this.currentModel.SaveAs3(filePath, 0, 1);
          } catch (e) {
            success = this.currentModel.SaveAs3(filePath, 0, 1);
          }
          break;
          
        case 'dxf':
        case 'dwg':
          // DXF/DWG export
          success = this.currentModel.SaveAs3(filePath, 0, 1);
          break;
          
        default:
          // Try generic export
          success = this.currentModel.SaveAs3(filePath, 0, 1);
      }
      
      if (!success) {
        // Try one more time with SaveAs2
        try {
          success = this.currentModel.SaveAs2(filePath, 0, true, false);
        } catch (e) {
          throw new Error(`Failed to export to ${format}`);
        }
      }
      
      if (!success) {
        throw new Error(`Failed to export to ${format}`);
      }
    } catch (error) {
      throw new Error(`Export failed: ${error}`);
    }
  }
  
  // VBA operations
  runMacro(macroPath: string, moduleName: string, procedureName: string, args: any[] = []): any {
    if (!this.swApp) throw new Error('Not connected to SolidWorks');
    
    const result = this.swApp.RunMacro2(
      macroPath,
      moduleName,
      procedureName,
      1, // swRunMacroOption
      0  // error
    );
    
    return result;
  }
  
  // Mass properties
  getMassProperties(): any {
    this.ensureCurrentModel();
    if (!this.currentModel) throw new Error('No model open');
    
    // Check document type - mass properties only work for parts and assemblies
    const docType = this.currentModel.GetType();
    if (docType !== 1 && docType !== 2) { // 1=Part, 2=Assembly
      throw new Error('Mass properties only available for parts and assemblies');
    }
    
    try {
      // Get the modeler extension
      const modeler = this.currentModel.Extension;
      if (!modeler) {
        throw new Error('Cannot access model extension');
      }
      
      // Create mass property object
      let massProps = null;
      
      try {
        // Method 1: Try CreateMassProperty
        massProps = modeler.CreateMassProperty();
      } catch (e) {
        // Method 2: Try CreateMassProperty2
        try {
          massProps = modeler.CreateMassProperty2();
        } catch (e2) {
          // Method 3: Try getting it from the model directly
          massProps = this.currentModel.GetMassProperties();
        }
      }
      
      if (!massProps) {
        throw new Error('Failed to create mass property object');
      }
      
      // Update mass properties if method exists
      try {
        if (massProps.Update) {
          const success = massProps.Update();
          if (!success) {
            // Try recalculate
            if (massProps.Recalculate) {
              massProps.Recalculate();
            }
          }
        }
      } catch (e) {
        // Update might not be needed
      }
      
      // Get the values with error handling
      const result: any = {};
      
      try {
        result.mass = massProps.Mass;
      } catch (e) {
        result.mass = 0;
      }
      
      try {
        result.volume = massProps.Volume;
      } catch (e) {
        result.volume = 0;
      }
      
      try {
        result.surfaceArea = massProps.SurfaceArea;
      } catch (e) {
        result.surfaceArea = 0;
      }
      
      try {
        const com = massProps.CenterOfMass;
        if (com && Array.isArray(com) && com.length >= 3) {
          result.centerOfMass = {
            x: com[0] * 1000, // Convert to mm
            y: com[1] * 1000,
            z: com[2] * 1000,
          };
        } else {
          result.centerOfMass = { x: 0, y: 0, z: 0 };
        }
      } catch (e) {
        result.centerOfMass = { x: 0, y: 0, z: 0 };
      }
      
      try {
        result.density = massProps.Density;
      } catch (e) {
        result.density = 0;
      }
      
      try {
        const moi = massProps.MomentOfInertia;
        if (moi && Array.isArray(moi) && moi.length >= 9) {
          result.momentsOfInertia = {
            Ixx: moi[0],
            Ixy: moi[1],
            Ixz: moi[2],
            Iyx: moi[3],
            Iyy: moi[4],
            Iyz: moi[5],
            Izx: moi[6],
            Izy: moi[7],
            Izz: moi[8]
          };
        }
      } catch (e) {
        // Moments of inertia might not be available
      }
      
      return result;
    } catch (error) {
      throw new Error(`Failed to get mass properties: ${error}`);
    }
  }
  
  // Helper to ensure current model is set
  private ensureCurrentModel(): void {
    if (!this.currentModel && this.swApp) {
      // Try to get the active document
      try {
        this.currentModel = this.swApp.ActiveDoc;
      } catch (e) {
        // ActiveDoc might not be available
      }
    }
  }
  
  // Helper to get current model
  getCurrentModel(): any {
    return this.currentModel;
  }
  
  // Helper to get SolidWorks app
  getApp(): any {
    return this.swApp;
  }
}