// @ts-ignore
import winax from 'winax';
import { SolidWorksModel, SolidWorksFeature } from './types.js';
import { logger } from '../utils/logger.js';

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
      // @ts-ignore
      this.swApp = new winax.Object('SldWorks.Application');
      this.swApp.Visible = true;
      logger.info('Connected to SolidWorks');
    } catch (error) {
      // Try alternative connection method
      try {
        // @ts-ignore
        this.swApp = winax.Object('SldWorks.Application');
        this.swApp.Visible = true;
        logger.info('Connected to SolidWorks (alternative method)');
      } catch (error2) {
        logger.error('Failed to connect to SolidWorks', error2);
        throw new Error(`Failed to connect to SolidWorks: ${error2}`);
      }
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
    
    // Ensure the opened model is set as active
    try {
      this.swApp.ActivateDoc2(this.currentModel.GetTitle(), false, errors);
    } catch (e) {
      // ActivateDoc2 might fail but model is still open
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
    
    // Create new part document - use NewPart() which works better
    this.currentModel = this.swApp.NewPart();
    
    if (!this.currentModel) {
      // Fallback to NewDocument if NewPart fails
      const template = this.swApp.GetUserPreferenceStringValue(8) || '';
      if (template) {
        this.currentModel = this.swApp.NewDocument(template, 0, 0, 0);
      } else {
        throw new Error('Failed to create new part - no template available');
      }
    }
    
    return {
      path: '',
      name: this.currentModel.GetTitle,
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
      
      // Get feature name - try different properties
      let featureName = 'Extrusion';
      try {
        if (feature.Name) {
          featureName = feature.Name;
        } else if (feature.GetName) {
          featureName = feature.GetName();
        } else if (feature.GetNameForSelection) {
          featureName = feature.GetNameForSelection();
        } else {
          // Generate a default name
          featureName = `Boss-Extrude${Date.now()}`;
        }
      } catch (e) {
        // Use default name if we can't get the actual name
        featureName = `Boss-Extrude${Date.now()}`;
      }
      
      return {
        name: featureName,
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
    
    let dimension = null;
    
    // Method 1: Try Parameter method
    try {
      dimension = this.currentModel.Parameter(name);
    } catch (e) {
      // Parameter might not work
    }
    
    // Method 2: Try GetParameter
    if (!dimension) {
      try {
        dimension = this.currentModel.GetParameter(name);
      } catch (e) {
        // GetParameter might not work
      }
    }
    
    // Method 3: Try Extension.GetParameter
    if (!dimension) {
      try {
        const ext = this.currentModel.Extension;
        if (ext) {
          dimension = ext.GetParameter(name);
        }
      } catch (e) {
        // Extension method might not work
      }
    }
    
    // Method 4: Try SelectByID and get dimension
    if (!dimension) {
      try {
        const selected = this.currentModel.Extension.SelectByID2(name, "DIMENSION", 0, 0, 0, false, 0, null, 0);
        if (selected) {
          const selMgr = this.currentModel.SelectionManager;
          if (selMgr && selMgr.GetSelectedObjectCount() > 0) {
            const obj = selMgr.GetSelectedObject6(1, -1);
            if (obj) {
              dimension = obj;
            }
          }
          this.currentModel.ClearSelection2(true);
        }
      } catch (e) {
        // Selection method failed
      }
    }
    
    if (!dimension) {
      throw new Error(`Dimension "${name}" not found. Try format like "D1@Sketch1" or "D1@Boss-Extrude1"`);
    }
    
    // Get the value - try different properties
    let value = 0;
    try {
      if (dimension.SystemValue !== undefined) {
        value = dimension.SystemValue * 1000; // Convert m to mm
      } else if (dimension.Value !== undefined) {
        value = dimension.Value * 1000;
      } else if (dimension.GetSystemValue) {
        value = dimension.GetSystemValue() * 1000;
      } else {
        throw new Error('Cannot read dimension value');
      }
    } catch (e) {
      throw new Error(`Cannot read value of dimension "${name}"`);
    }
    
    return value;
  }
  
  setDimension(name: string, value: number): void {
    if (!this.currentModel) throw new Error('No model open');
    
    let dimension = null;
    
    // Method 1: Try Parameter method
    try {
      dimension = this.currentModel.Parameter(name);
    } catch (e) {
      // Parameter might not work
    }
    
    // Method 2: Try GetParameter
    if (!dimension) {
      try {
        dimension = this.currentModel.GetParameter(name);
      } catch (e) {
        // GetParameter might not work
      }
    }
    
    // Method 3: Try Extension.GetParameter
    if (!dimension) {
      try {
        const ext = this.currentModel.Extension;
        if (ext) {
          dimension = ext.GetParameter(name);
        }
      } catch (e) {
        // Extension method might not work
      }
    }
    
    // Method 4: Try SelectByID and get dimension
    if (!dimension) {
      try {
        const selected = this.currentModel.Extension.SelectByID2(name, "DIMENSION", 0, 0, 0, false, 0, null, 0);
        if (selected) {
          const selMgr = this.currentModel.SelectionManager;
          if (selMgr && selMgr.GetSelectedObjectCount() > 0) {
            const obj = selMgr.GetSelectedObject6(1, -1);
            if (obj) {
              dimension = obj;
            }
          }
          // Don't clear selection yet - might need it for setting
        }
      } catch (e) {
        // Selection method failed
      }
    }
    
    if (!dimension) {
      throw new Error(`Dimension "${name}" not found. Try format like "D1@Sketch1" or "D1@Boss-Extrude1"`);
    }
    
    // Set the value - try different methods
    const newValue = value / 1000; // Convert mm to m
    let success = false;
    
    try {
      if (dimension.SystemValue !== undefined) {
        dimension.SystemValue = newValue;
        success = true;
      } else if (dimension.Value !== undefined) {
        dimension.Value = newValue;
        success = true;
      } else if (dimension.SetSystemValue) {
        success = dimension.SetSystemValue(newValue);
      } else if (dimension.SetValue) {
        success = dimension.SetValue(newValue);
      }
    } catch (e) {
      // Try equation manager
      try {
        const eqMgr = this.currentModel.GetEquationMgr();
        if (eqMgr) {
          const count = eqMgr.GetCount();
          for (let i = 0; i < count; i++) {
            const eq = eqMgr.Equation[i];
            if (eq && eq.includes(name)) {
              eqMgr.Equation[i] = `"${name}" = ${value}`;
              success = true;
              break;
            }
          }
        }
      } catch (e2) {
        // Equation manager failed
      }
    }
    
    // Clear selection if we used it
    try {
      this.currentModel.ClearSelection2(true);
    } catch (e) {
      // Ignore clear selection errors
    }
    
    if (!success) {
      throw new Error(`Failed to set dimension "${name}" to ${value}mm`);
    }
    
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
      let errors = 0;
      let warnings = 0;
      
      // Try different export methods based on format
      switch(ext) {
        case 'step':
        case 'stp':
          // Method 1: Try SaveAs3 with proper file extension
          try {
            success = this.currentModel.SaveAs3(filePath, 0, 2);
            if (!success) {
              // Method 2: Try Extension.SaveAs with swSaveAsCurrentVersion flag
              success = this.currentModel.Extension.SaveAs(filePath, 0, 2, null, errors, warnings);
            }
          } catch (e) {
            // Method 3: Try GetExportFileData approach
            try {
              const exportData = this.swApp.GetExportFileData(1);
              if (exportData) {
                exportData.SetStep203(true);
                success = this.currentModel.Extension.SaveAs(filePath, 0, 2, exportData, errors, warnings);
              }
            } catch (e2) {
              throw new Error(`Failed to export to STEP: ${e2}`);
            }
          }
          break;
          
        case 'iges':
        case 'igs':
          // Method 1: Try SaveAs3 with proper flags
          try {
            success = this.currentModel.SaveAs3(filePath, 0, 2);
            if (!success) {
              // Method 2: Try Extension.SaveAs
              success = this.currentModel.Extension.SaveAs(filePath, 0, 2, null, errors, warnings);
            }
          } catch (e) {
            throw new Error(`Failed to export to IGES: ${e}`);
          }
          break;
          
        case 'stl':
          // STL specific - try different methods
          try {
            // Method 1: SaveAs3 with proper flags
            success = this.currentModel.SaveAs3(filePath, 0, 2);
            if (!success) {
              // Method 2: Try SaveAs4 if available
              try {
                success = this.currentModel.SaveAs4(filePath, 0, 2, errors, warnings);
              } catch (e2) {
                // Method 3: Try Extension.SaveAs
                success = this.currentModel.Extension.SaveAs(filePath, 0, 2, null, errors, warnings);
              }
            }
          } catch (e) {
            throw new Error(`Failed to export to STL: ${e}`);
          }
          break;
          
        case 'pdf':
          // PDF export requires drawing
          const docType = this.currentModel.GetType();
          if (docType !== 3) { // 3 = swDocDRAWING
            throw new Error('PDF export requires a drawing document');
          }
          try {
            success = this.currentModel.SaveAs3(filePath, 0, 2);
            if (!success) {
              success = this.currentModel.Extension.SaveAs(filePath, 0, 2, null, errors, warnings);
            }
          } catch (e) {
            throw new Error(`Failed to export to PDF: ${e}`);
          }
          break;
          
        case 'dxf':
        case 'dwg':
          // DXF/DWG export - mainly for drawings
          try {
            success = this.currentModel.SaveAs3(filePath, 0, 2);
            if (!success) {
              success = this.currentModel.Extension.SaveAs(filePath, 0, 2, null, errors, warnings);
            }
          } catch (e) {
            throw new Error(`Failed to export to ${format.toUpperCase()}: ${e}`);
          }
          break;
          
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
      
      if (!success) {
        throw new Error(`Failed to export to ${format.toUpperCase()}: Export returned false`);
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
    if (!this.swApp) return;
    
    // Always try to sync with the active document
    try {
      const activeDoc = this.swApp.ActiveDoc;
      if (activeDoc) {
        // Check if the active doc has changed
        if (!this.currentModel || this.currentModel !== activeDoc) {
          this.currentModel = activeDoc;
        }
      } else if (!this.currentModel) {
        // No active doc and no current model - try to get any open doc
        try {
          const docCount = this.swApp.GetDocumentCount();
          if (docCount > 0) {
            // Get the first document
            const docs = this.swApp.GetDocuments();
            if (docs && docs.length > 0) {
              this.currentModel = docs[0];
            }
          }
        } catch (e2) {
          // GetDocumentCount might not be available
        }
      }
    } catch (e) {
      // ActiveDoc might throw if no documents are open
      // Keep the current model if we have one
      if (!this.currentModel) {
        // Try alternative methods to get a document
        try {
          const frame = this.swApp.Frame();
          if (frame) {
            const modelWindow = frame.ModelWindow();
            if (modelWindow) {
              this.currentModel = modelWindow.ModelDoc;
            }
          }
        } catch (e3) {
          // Frame method might not work
        }
      }
    }
  }
  
  // Helper to get current model
  getCurrentModel(): any {
    this.ensureCurrentModel();
    return this.currentModel;
  }
  
  // Helper to get SolidWorks app
  getApp(): any {
    return this.swApp;
  }
}