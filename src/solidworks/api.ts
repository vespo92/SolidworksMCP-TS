import { createActiveXObject } from 'winax';
import { SolidWorksModel, SolidWorksFeature, SolidWorksDrawing } from './types.js';

export class SolidWorksAPI {
  private swApp: any;
  private currentModel: any;
  
  constructor() {
    this.swApp = null;
    this.currentModel = null;
  }
  
  async connect(): Promise<void> {
    try {
      // Create or get running instance of SolidWorks
      this.swApp = createActiveXObject('SldWorks.Application');
      this.swApp.Visible = true;
      console.log('Connected to SolidWorks');
    } catch (error) {
      throw new Error(`Failed to connect to SolidWorks: ${error}`);
    }
  }
  
  async disconnect(): Promise<void> {
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
      type: ['Part', 'Assembly', 'Drawing'][docType - 1],
      isActive: true,
    };
  }
  
  async closeModel(save: boolean = false): Promise<void> {
    if (!this.currentModel) return;
    
    if (save) {
      this.currentModel.Save3(1, 0, 0); // swSaveAsOptions_Silent
    }
    
    this.swApp.CloseDoc(this.currentModel.GetTitle());
    this.currentModel = null;
  }
  
  async createPart(): Promise<SolidWorksModel> {
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
  
  // Feature operations
  async createExtrude(
    depth: number,
    draft: number = 0,
    reverse: boolean = false
  ): Promise<SolidWorksFeature> {
    if (!this.currentModel) throw new Error('No model open');
    
    const feature = this.currentModel.FeatureManager.FeatureExtrusion3(
      true, // sd
      reverse, // flip
      false, // dir
      0, // t1
      0, // t2
      depth / 1000, // convert mm to m
      0.01, // d2
      false, // dchk1
      false, // dchk2
      false, // dang
      draft * Math.PI / 180, // convert degrees to radians
      0, // d2ang
      false, // offsetReverse1
      false, // offsetReverse2
      false, // translateSurface1
      false, // translateSurface2
      false, // merge
      true, // useFeatScope
      true // useAutoSelect
    );
    
    if (!feature) {
      throw new Error('Failed to create extrusion');
    }
    
    return {
      name: feature.Name,
      type: 'Extrusion',
      suppressed: false,
    };
  }
  
  // Dimension operations
  async getDimension(name: string): Promise<number> {
    if (!this.currentModel) throw new Error('No model open');
    
    const dimension = this.currentModel.Parameter(name);
    if (!dimension) {
      throw new Error(`Dimension "${name}" not found`);
    }
    
    return dimension.SystemValue * 1000; // Convert m to mm
  }
  
  async setDimension(name: string, value: number): Promise<void> {
    if (!this.currentModel) throw new Error('No model open');
    
    const dimension = this.currentModel.Parameter(name);
    if (!dimension) {
      throw new Error(`Dimension "${name}" not found`);
    }
    
    dimension.SystemValue = value / 1000; // Convert mm to m
    this.currentModel.EditRebuild3();
  }
  
  // Export operations
  async exportFile(filePath: string, format: string): Promise<void> {
    if (!this.currentModel) throw new Error('No model open');
    
    const formatMap: Record<string, number> = {
      'step': 0,
      'iges': 1,
      'stl': 2,
      'pdf': 3,
      'dxf': 4,
      'dwg': 5,
    };
    
    const exportFormat = formatMap[format.toLowerCase()];
    if (exportFormat === undefined) {
      throw new Error(`Unsupported export format: ${format}`);
    }
    
    const success = this.currentModel.SaveAs3(
      filePath,
      0, // version
      1 // options
    );
    
    if (!success) {
      throw new Error(`Failed to export to ${format}`);
    }
  }
  
  // VBA operations
  async runMacro(macroPath: string, moduleName: string, procedureName: string, args: any[] = []): Promise<any> {
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
  async getMassProperties(): Promise<any> {
    if (!this.currentModel) throw new Error('No model open');
    
    const massProps = this.currentModel.Extension.CreateMassProperty();
    
    return {
      mass: massProps.Mass,
      volume: massProps.Volume,
      surfaceArea: massProps.SurfaceArea,
      centerOfMass: {
        x: massProps.CenterOfMass[0],
        y: massProps.CenterOfMass[1],
        z: massProps.CenterOfMass[2],
      },
    };
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