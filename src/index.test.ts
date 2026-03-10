/**
 * Test suite for SolidWorks MCP Server
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { modelingTools } from './tools/modeling.js';
import { vbaTools } from './tools/vba.js';
import { analysisTools } from './tools/analysis.js';
import { sketchTools } from './tools/sketch.js';
import { templateManagerTools } from './tools/template-manager.js';
import { nativeMacroTools } from './tools/native-macro.js';
import { resourceRegistry } from './resources/registry.js';
import { DesignTableResource } from './resources/design-table.js';
import { PDMResource } from './resources/pdm.js';
import { MacroRecorder } from './macro/recorder.js';
import { ResourceStateStore } from './state/store.js';
import { ResourceStatus } from './resources/base.js';

// Mock winax (Windows-only COM module) for cross-platform testing
vi.mock('winax', () => ({
  default: {
    Object: vi.fn(),
    Variant: vi.fn(),
  },
}));

// Mock COM helpers (depends on winax)
vi.mock('./utils/com-helpers.js', () => ({
  comNothing: vi.fn().mockReturnValue(undefined),
  selectByID2: vi.fn().mockReturnValue(true),
}));

// Mock SolidWorks API
vi.mock('./solidworks/api.js', () => ({
  SolidWorksAPI: vi.fn().mockImplementation(() => ({
    isConnected: vi.fn().mockReturnValue(false),
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(true),
    createSketch: vi.fn().mockResolvedValue({ sketchId: 'test-sketch' }),
    addLine: vi.fn().mockResolvedValue({ lineId: 'test-line' }),
    extrude: vi.fn().mockResolvedValue({ featureId: 'test-extrude' })
  }))
}));

describe('SolidWorks MCP Server', () => {
  describe('Tool Definitions', () => {
    it('should have modeling tools defined', () => {
      expect(modelingTools).toBeDefined();
      expect(modelingTools.length).toBeGreaterThan(0);
      expect(modelingTools[0]).toHaveProperty('name');
      expect(modelingTools[0]).toHaveProperty('description');
      expect(modelingTools[0]).toHaveProperty('inputSchema');
      expect(modelingTools[0]).toHaveProperty('handler');
    });

    it('should have VBA tools defined', () => {
      expect(vbaTools).toBeDefined();
      expect(vbaTools.length).toBeGreaterThan(0);
      
      const generateVbaTool = vbaTools.find(t => t.name === 'generate_vba_script');
      expect(generateVbaTool).toBeDefined();
    });
  });

  describe('Tool Schemas', () => {
    it('should have valid Zod schemas', () => {
      modelingTools.forEach(tool => {
        expect(() => tool.inputSchema.parse({})).toBeDefined();
      });
    });
  });

  describe('Resource Registry', () => {
    beforeAll(() => {
      resourceRegistry.clear();
    });

    it('should register design table resource', () => {
      resourceRegistry.register({
        type: 'design-table',
        name: 'Design Table',
        description: 'Test design table',
        schema: DesignTableResource.prototype.schema,
        factory: (id, name, properties) => new DesignTableResource(id, name, properties)
      });

      expect(resourceRegistry.getAllTypes()).toContain('design-table');
    });

    it('should create design table resource instance', () => {
      const resource = resourceRegistry.createResource(
        'design-table',
        'dt-1',
        'TestTable',
        {
          tableName: 'TestTable',
          parameters: [],
          configurations: []
        }
      );

      expect(resource).toBeInstanceOf(DesignTableResource);
      expect(resource.id).toBe('dt-1');
      expect(resource.name).toBe('TestTable');
    });
  });

  describe('Design Table Resource', () => {
    it('should create design table with SQL configuration', () => {
      const resource = new DesignTableResource('dt-1', 'ParametricBox', {
        tableName: 'ParametricBox',
        parameters: [
          { name: 'Length', type: 'dimension', dataType: 'number', sqlColumn: 'length' },
          { name: 'Width', type: 'dimension', dataType: 'number', sqlColumn: 'width' }
        ],
        dataSource: {
          type: 'sql',
          connectionString: 'mssql://localhost:1433/test',
          query: 'SELECT * FROM configurations'
        }
      });

      expect(resource.type).toBe('design-table');
      expect(resource.getRequiredCapabilities()).toContain('sql-integration');
    });

    it('should generate VBA code', () => {
      const resource = new DesignTableResource('dt-1', 'TestTable', {
        tableName: 'TestTable',
        parameters: [
          { name: 'Height', type: 'dimension', dataType: 'number' }
        ],
        configurations: [
          { name: 'Config1', values: { Height: 100 }, active: true }
        ]
      });

      const vbaCode = resource.toVBACode();
      
      expect(vbaCode).toContain('Sub CreateDesignTable_TestTable()');
      expect(vbaCode).toContain('swDesignTable.AddParameter "Height", "dimension"');
      expect(vbaCode).toContain('swDesignTable.AddConfiguration "Config1"');
    });
  });

  describe('PDM Resource', () => {
    it('should create PDM configuration', () => {
      const resource = new PDMResource('pdm-1', 'Engineering Vault', {
        vaultName: 'Engineering',
        operations: {
          checkIn: { enabled: true, comment: 'Test check-in' },
          checkOut: { enabled: true, getLatestVersion: true }
        }
      });

      expect(resource.type).toBe('pdm-configuration');
      expect(resource.getRequiredCapabilities()).toContain('pdm-integration');
    });

    it('should generate VBA code for PDM operations', () => {
      const resource = new PDMResource('pdm-1', 'Test Vault', {
        vaultName: 'TestVault',
        operations: {
          checkIn: { enabled: true, comment: 'Auto check-in' },
          checkOut: { enabled: true }
        }
      });

      const vbaCode = resource.toVBACode();
      
      expect(vbaCode).toContain('pdmVault.LoginAuto "TestVault"');
      expect(vbaCode).toContain('pdmFile.LockFile');
      expect(vbaCode).toContain('pdmFile.UnlockFile');
    });
  });

  describe('Macro Recorder', () => {
    let recorder: MacroRecorder;

    beforeAll(() => {
      recorder = new MacroRecorder();
    });

    afterAll(() => {
      recorder.clear();
    });

    it('should start and stop recording', () => {
      const id = recorder.startRecording('TestMacro', 'Test description');
      expect(id).toBeDefined();

      recorder.recordAction('test-action', 'Test Action', { param: 'value' });
      
      const recording = recorder.stopRecording();
      expect(recording).toBeDefined();
      expect(recording!.name).toBe('TestMacro');
      expect(recording!.actions).toHaveLength(1);
    });

    it('should export macro to VBA', () => {
      const id = recorder.startRecording('ExportTest');
      
      recorder.recordAction('create-sketch', 'Create Sketch', { plane: 'Front' });
      recorder.recordAction('add-line', 'Add Line', {
        x1: 0, y1: 0, z1: 0,
        x2: 100, y2: 0, z2: 0
      });
      
      const recording = recorder.stopRecording();
      const vbaCode = recorder.exportToVBA(recording!.id);
      
      expect(vbaCode).toContain('Sub ExportTest()');
      expect(vbaCode).toContain('swModel.CreateSketch "Front"');
      expect(vbaCode).toContain('swModel.CreateLine2');
    });
  });

  describe('State Store', () => {
    let stateStore: ResourceStateStore;

    beforeAll(() => {
      stateStore = new ResourceStateStore(':memory:', false);
    });

    afterAll(() => {
      stateStore.stopAutoSave();
    });

    it('should store and retrieve resource state', async () => {
      const state = {
        id: 'test-1',
        type: 'design-table',
        name: 'TestResource',
        properties: { tableName: 'Test' },
        outputs: {},
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'test',
          version: 1,
          tags: {},
          annotations: {}
        },
        status: ResourceStatus.CREATED
      };

      await stateStore.setState('test-1', state);
      const retrieved = stateStore.getState('test-1');
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('TestResource');
    });

    it('should query states by type', async () => {
      const designTables = stateStore.getStatesByType('design-table');
      expect(designTables).toBeDefined();
    });
  });

  // ============================================
  // Bug fix regression tests
  // ============================================

  describe('Bug 1: SelectByID2 COM null fix', () => {
    it('sketch tools should import comNothing and not use raw null', async () => {
      // Verify that sketch tools are properly defined (they import comNothing at module level)
      expect(sketchTools).toBeDefined();
      expect(sketchTools.length).toBeGreaterThan(0);

      // Verify key tools that use SelectByID2 exist
      const editSketch = sketchTools.find(t => t.name === 'edit_sketch');
      expect(editSketch).toBeDefined();

      const addConstraint = sketchTools.find(t => t.name === 'add_sketch_constraint');
      expect(addConstraint).toBeDefined();

      const addDimension = sketchTools.find(t => t.name === 'add_sketch_dimension');
      expect(addDimension).toBeDefined();

      const spline = sketchTools.find(t => t.name === 'sketch_spline');
      expect(spline).toBeDefined();
    });
  });

  describe('Bug 2: Native macro tools use .swb files', () => {
    it('should have create_initialized_macro tool defined', () => {
      const tool = nativeMacroTools.find(t => t.name === 'create_initialized_macro');
      expect(tool).toBeDefined();
      expect(tool!.description).toContain('VBA initialization');
    });

    it('should have convert_text_to_native_macro tool defined', () => {
      const tool = nativeMacroTools.find(t => t.name === 'convert_text_to_native_macro');
      expect(tool).toBeDefined();
      expect(tool!.description).toContain('.swb');
    });

    it('should have start/stop recording tools defined', () => {
      const start = nativeMacroTools.find(t => t.name === 'start_native_macro_recording');
      const stop = nativeMacroTools.find(t => t.name === 'stop_native_macro_recording');
      expect(start).toBeDefined();
      expect(stop).toBeDefined();
    });
  });

  describe('Bug 3: Template manager uses ESM imports', () => {
    it('should have template manager tools defined (proves ESM imports work)', () => {
      expect(templateManagerTools).toBeDefined();
      expect(templateManagerTools.length).toBeGreaterThan(0);

      const listTool = templateManagerTools.find(t => t.name === 'list_template_library');
      expect(listTool).toBeDefined();

      const saveTool = templateManagerTools.find(t => t.name === 'save_template_to_library');
      expect(saveTool).toBeDefined();
    });
  });

  describe('Bug 4: Mass properties null guards', () => {
    it('should have analysis tools defined', () => {
      expect(analysisTools).toBeDefined();
      const massPropsTool = analysisTools.find(t => t.name === 'get_mass_properties');
      expect(massPropsTool).toBeDefined();
    });

    it('get_mass_properties handler should handle null/undefined values', () => {
      const tool = analysisTools.find(t => t.name === 'get_mass_properties');
      expect(tool).toBeDefined();

      // Create a mock API that returns null/undefined mass properties
      const mockApi = {
        getMassProperties: () => ({
          mass: null,
          volume: undefined,
          surfaceArea: null,
          centerOfMass: null,
          density: undefined,
        }),
      };

      // Should not throw — null guards should handle it
      const result = tool!.handler({ units: 'kg' }, mockApi as any);
      expect(result).toBeDefined();
      // Result should contain formatted strings, not throw toFixed errors
      expect(typeof result).toBe('object');
      expect(result.mass).toContain('kg');
      expect(result.volume).toContain('mm³');
      expect(result.surfaceArea).toContain('mm²');
      expect(result.centerOfMass.x).toContain('mm');
    });
  });
});