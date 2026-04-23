/**
 * Tests for PowerShell Bridge Adapter
 *
 * Tests the TypeScript-side logic: script generation, result parsing,
 * metrics tracking, and error handling. PowerShell execution is mocked
 * since tests run on Linux CI.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PowerShellAdapter } from '../powershell-adapter.js';

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock child_process since PowerShell isn't available on Linux CI
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

describe('PowerShellAdapter', () => {
  describe('construction', () => {
    it('should create adapter with default config', () => {
      const adapter = new PowerShellAdapter();
      expect(adapter).toBeDefined();
      expect(adapter.isConnected()).toBe(false);
    });

    it('should accept custom configuration', () => {
      const adapter = new PowerShellAdapter({
        timeout: 60000,
        tempDir: '/tmp/custom',
        powershellPath: 'pwsh',
      });
      expect(adapter).toBeDefined();
    });
  });

  describe('with mocked PowerShell execution', () => {
    let adapter: PowerShellAdapter;
    let mockExecutePS: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      adapter = new PowerShellAdapter();
      // Replace the private executePowerShell method with a mock
      mockExecutePS = vi.fn();
      (adapter as any).executePowerShell = mockExecutePS;
      // Mock detectPowerShell to succeed
      (adapter as any).psPath = 'pwsh';
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('connect/disconnect', () => {
      it('should connect successfully', async () => {
        mockExecutePS.mockResolvedValue({ success: true, processId: 5678 });
        await adapter.connect();
        expect(adapter.isConnected()).toBe(true);
      });

      it('should disconnect', async () => {
        mockExecutePS.mockResolvedValue({ success: true, processId: 5678 });
        await adapter.connect();
        await adapter.disconnect();
        expect(adapter.isConnected()).toBe(false);
      });
    });

    describe('healthCheck', () => {
      it('should return healthy when connected', async () => {
        mockExecutePS.mockResolvedValueOnce({ success: true, processId: 5678 });
        await adapter.connect();

        mockExecutePS.mockResolvedValueOnce({ success: true, healthy: true, processId: 5678 });
        const health = await adapter.healthCheck();
        expect(health.healthy).toBe(true);
        expect(health.connectionStatus).toBe('connected');
        expect(health.metrics?.macroFallbacks).toBe(0);
      });

      it('should return unhealthy on error', async () => {
        mockExecutePS.mockRejectedValue(new Error('PS not running'));
        const health = await adapter.healthCheck();
        expect(health.healthy).toBe(false);
        expect(health.connectionStatus).toBe('error');
      });
    });

    describe('model operations', () => {
      it('should create a part', async () => {
        mockExecutePS.mockResolvedValue({ success: true, name: 'Part1', type: 'Part' });
        const model = await adapter.createPart();
        expect(model.name).toBe('Part1');
        expect(model.type).toBe('Part');
        expect(model.isActive).toBe(true);
      });

      it('should create an assembly', async () => {
        mockExecutePS.mockResolvedValue({ success: true, name: 'Assem1', type: 'Assembly' });
        const model = await adapter.createAssembly();
        expect(model.type).toBe('Assembly');
      });

      it('should create a drawing', async () => {
        mockExecutePS.mockResolvedValue({ success: true, name: 'Drawing1', type: 'Drawing' });
        const model = await adapter.createDrawing();
        expect(model.type).toBe('Drawing');
      });

      it('should open a model', async () => {
        mockExecutePS.mockResolvedValue({
          success: true,
          path: 'C:\\test.sldprt',
          name: 'test',
          type: 'Part',
        });
        const model = await adapter.openModel('C:\\test.sldprt');
        expect(model.type).toBe('Part');
        expect(model.path).toBe('C:\\test.sldprt');
      });

      it('should close a model', async () => {
        mockExecutePS.mockResolvedValue({ success: true });
        await adapter.closeModel(true);
        expect(mockExecutePS).toHaveBeenCalled();
      });
    });

    describe('feature operations', () => {
      it('should create extrusion with all parameters', async () => {
        mockExecutePS.mockResolvedValue({ success: true, name: 'Boss-Extrude1', type: 'Extrusion' });

        const feature = await adapter.createExtrusion({
          depth: 25,
          reverse: true,
          bothDirections: false,
          depth2: 10,
          draft: 5,
          draftOutward: true,
          draftWhileExtruding: true,
          offsetReverse: false,
          translateSurface: false,
          merge: true,
          flipSideToCut: false,
          startCondition: 0,
          endCondition: 0,
        });

        expect(feature.name).toBe('Boss-Extrude1');
        expect(feature.type).toBe('Extrusion');
        expect(feature.suppressed).toBe(false);

        // Verify the PowerShell script contains FeatureExtrusion3
        const scriptArg = mockExecutePS.mock.calls[0][0];
        expect(scriptArg).toContain('FeatureExtrusion3');
      });

      it('should create revolve', async () => {
        mockExecutePS.mockResolvedValue({ success: true, name: 'Revolve1', type: 'Revolution' });
        const feature = await adapter.createRevolve({ angle: 360, direction: 'Both' });
        expect(feature.name).toBe('Revolve1');
        expect(feature.type).toBe('Revolution');

        const scriptArg = mockExecutePS.mock.calls[0][0];
        expect(scriptArg).toContain('FeatureRevolve2');
      });

      it('should create sweep', async () => {
        mockExecutePS.mockResolvedValue({ success: true, name: 'Sweep1', type: 'Sweep' });
        const feature = await adapter.createSweep({
          profileSketch: 'Sketch1',
          pathSketch: 'Sketch2',
          twistAngle: 45,
        });
        expect(feature.name).toBe('Sweep1');

        const scriptArg = mockExecutePS.mock.calls[0][0];
        expect(scriptArg).toContain('InsertProtrusionSwept4');
      });

      it('should create loft with profiles and guides', async () => {
        mockExecutePS.mockResolvedValue({ success: true, name: 'Loft1', type: 'Loft' });
        const feature = await adapter.createLoft({
          profiles: ['Sketch1', 'Sketch2'],
          guideCurves: ['Guide1'],
          closed: false,
          merge: true,
        });
        expect(feature.name).toBe('Loft1');

        const scriptArg = mockExecutePS.mock.calls[0][0];
        expect(scriptArg).toContain('InsertProtrusionLoft3');
        expect(scriptArg).toContain('Sketch1');
        expect(scriptArg).toContain('Sketch2');
        expect(scriptArg).toContain('Guide1');
      });
    });

    describe('sketch operations', () => {
      it('should create sketch on plane', async () => {
        mockExecutePS.mockResolvedValue({ success: true, sketchName: 'Sketch1' });
        const name = await adapter.createSketch('Front');
        expect(name).toBe('Sketch1');
      });

      it('should add a line', async () => {
        mockExecutePS.mockResolvedValue({ success: true });
        await adapter.addLine(0, 0, 100, 100);
        const scriptArg = mockExecutePS.mock.calls[0][0];
        expect(scriptArg).toContain('CreateLine');
      });

      it('should add a circle', async () => {
        mockExecutePS.mockResolvedValue({ success: true });
        await adapter.addCircle(50, 50, 25);
        const scriptArg = mockExecutePS.mock.calls[0][0];
        expect(scriptArg).toContain('CreateCircle');
      });

      it('should add a rectangle', async () => {
        mockExecutePS.mockResolvedValue({ success: true });
        await adapter.addRectangle(0, 0, 100, 50);
        const scriptArg = mockExecutePS.mock.calls[0][0];
        // Rectangle is 4 lines
        expect(scriptArg).toContain('CreateLine');
      });

      it('should exit sketch', async () => {
        mockExecutePS.mockResolvedValue({ success: true });
        await adapter.exitSketch();
        const scriptArg = mockExecutePS.mock.calls[0][0];
        expect(scriptArg).toContain('InsertSketch');
      });
    });

    describe('analysis & export', () => {
      it('should get mass properties', async () => {
        mockExecutePS.mockResolvedValue({
          success: true,
          mass: 2.5,
          volume: 0.01,
          surfaceArea: 0.2,
          density: 7800,
          comX: 15,
          comY: 25,
          comZ: 35,
          Ixx: 10,
          Iyy: 20,
          Izz: 30,
          Ixy: 1,
          Iyz: 2,
          Ixz: 3,
        });

        const mp = await adapter.getMassProperties();
        expect(mp.mass).toBe(2.5);
        expect(mp.centerOfMass.x).toBe(15);
        expect(mp.density).toBe(7800);
        expect(mp.momentsOfInertia?.Izz).toBe(30);
      });

      it('should export file', async () => {
        mockExecutePS.mockResolvedValue({ success: true });
        await adapter.exportFile('C:\\output.step', 'step');
        expect(mockExecutePS).toHaveBeenCalled();
      });

      it('should get dimension', async () => {
        mockExecutePS.mockResolvedValue({ success: true, value: 25.4 });
        const val = await adapter.getDimension('D1@Sketch1');
        expect(val).toBe(25.4);
      });

      it('should set dimension', async () => {
        mockExecutePS.mockResolvedValue({ success: true });
        await adapter.setDimension('D1@Sketch1', 50);
        expect(mockExecutePS).toHaveBeenCalled();
      });
    });

    describe('execute command routing', () => {
      it('should route CreateExtrusion command', async () => {
        mockExecutePS.mockResolvedValue({ success: true, name: 'Boss-Extrude1', type: 'Extrusion' });
        const command = {
          name: 'CreateExtrusion',
          parameters: { depth: 25 },
          validate: () => ({ valid: true }),
        };
        const result = await adapter.execute(command);
        expect(result.success).toBe(true);
        expect(result.metadata?.adapter).toBe('powershell');
      });

      it('should handle validation failure', async () => {
        const command = {
          name: 'CreateExtrusion',
          parameters: {},
          validate: () => ({ valid: false, errors: ['Missing depth'] }),
        };
        const result = await adapter.execute(command);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Missing depth');
      });

      it('should try fallback command on error', async () => {
        mockExecutePS.mockRejectedValueOnce(new Error('Primary failed'));
        mockExecutePS.mockResolvedValueOnce({ success: true, name: 'Part1', type: 'Part' });

        const fallback = {
          name: 'CreatePart',
          parameters: {},
          validate: () => ({ valid: true }),
        };
        const command = {
          name: 'CreatePart',
          parameters: {},
          validate: () => ({ valid: true }),
          fallback,
        };
        const result = await adapter.execute(command);
        expect(result.success).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should handle PowerShell errors', async () => {
        mockExecutePS.mockRejectedValue(new Error('SolidWorks not running'));
        await expect(adapter.createPart()).rejects.toThrow('SolidWorks not running');
      });

      it('should propagate errors from executePowerShell', async () => {
        // When executePowerShell throws (which it does on error JSON), it propagates
        mockExecutePS.mockRejectedValue(new Error('No active document'));
        await expect(adapter.createPart()).rejects.toThrow('No active document');
      });
    });

    describe('script generation', () => {
      it('should generate scripts with proper preamble', async () => {
        mockExecutePS.mockResolvedValue({ success: true, name: 'Part1', type: 'Part' });
        await adapter.createPart();

        const script = mockExecutePS.mock.calls[0][0];
        expect(script).toContain('$ErrorActionPreference');
        expect(script).toContain('Get-SolidWorks');
        expect(script).toContain('ConvertTo-Json');
        expect(script).toContain('try {');
        expect(script).toContain('catch {');
      });

      it('should include FeatureExtrusion3 with 23 params in extrusion script', async () => {
        mockExecutePS.mockResolvedValue({ success: true, name: 'E1', type: 'Extrusion' });
        await adapter.createExtrusion({ depth: 10 });

        const script = mockExecutePS.mock.calls[0][0];
        expect(script).toContain('FeatureExtrusion3');
        // Verify key parameters are present
        expect(script).toContain('# Sd (single direction)');
        expect(script).toContain('# Merge');
        expect(script).toContain('# UseFeatureScope');
      });
    });
  });
});
