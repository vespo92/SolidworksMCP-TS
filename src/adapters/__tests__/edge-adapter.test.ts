/**
 * Tests for Edge.js Adapter
 *
 * Since edge-js requires .NET runtime (Windows), these tests verify:
 * - Graceful degradation when edge-js is not available
 * - TypeScript-side logic (metrics, invoke routing, result mapping)
 * - Mocked bridge behavior for all operations
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EdgeJsAdapter } from '../edge-adapter.js';

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('EdgeJsAdapter', () => {
  describe('construction', () => {
    it('should create an adapter instance', () => {
      const adapter = new EdgeJsAdapter();
      expect(adapter).toBeDefined();
    });

    it('should report not connected initially', () => {
      const adapter = new EdgeJsAdapter();
      expect(adapter.isConnected()).toBe(false);
    });

    it('should gracefully handle missing edge-js', () => {
      const adapter = new EdgeJsAdapter();
      expect(adapter).toBeDefined();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('connect without edge-js', () => {
    it('should throw when edge-js is not available', async () => {
      const adapter = new EdgeJsAdapter();
      await expect(adapter.connect()).rejects.toThrow(/Edge\.js bridge not initialized/);
    });
  });

  describe('healthCheck without connection', () => {
    it('should return unhealthy status', async () => {
      const adapter = new EdgeJsAdapter();
      const health = await adapter.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.connectionStatus).toBe('error');
    });
  });

  describe('operations without connection', () => {
    let adapter: EdgeJsAdapter;

    beforeEach(() => {
      adapter = new EdgeJsAdapter();
    });

    const ops = [
      ['createPart', []] as const,
      ['createAssembly', []] as const,
      ['createDrawing', []] as const,
      ['createSketch', ['Front']] as const,
      ['addLine', [0, 0, 10, 10]] as const,
      ['addCircle', [0, 0, 5]] as const,
      ['addRectangle', [0, 0, 10, 10]] as const,
      ['exitSketch', []] as const,
      ['createExtrusion', [{ depth: 10 }]] as const,
      ['createRevolve', [{ angle: 360 }]] as const,
      ['createSweep', [{ profileSketch: 'S1', pathSketch: 'S2' }]] as const,
      ['createLoft', [{ profiles: ['S1', 'S2'] }]] as const,
      ['openModel', ['test.sldprt']] as const,
      ['closeModel', [false]] as const,
      ['exportFile', ['out.step', 'step']] as const,
      ['getMassProperties', []] as const,
      ['getDimension', ['D1']] as const,
      ['setDimension', ['D1', 25]] as const,
      ['executeRaw', ['GetTitle', []]] as const,
    ];

    for (const [method, args] of ops) {
      it(`should throw on ${method}`, async () => {
        await expect((adapter as any)[method](...args)).rejects.toThrow();
      });
    }
  });

  describe('with mocked edge-js bridge', () => {
    let adapter: EdgeJsAdapter;

    beforeEach(() => {
      adapter = new EdgeJsAdapter();
      (adapter as any).invokeCS = vi.fn();
      (adapter as any).edgeAvailable = true;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should connect successfully', async () => {
      (adapter as any).invokeCS.mockResolvedValue({ success: true, processId: 1234 });
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
    });

    it('should disconnect successfully', async () => {
      (adapter as any).invokeCS.mockResolvedValueOnce({ success: true, processId: 1234 });
      await adapter.connect();

      (adapter as any).invokeCS.mockResolvedValueOnce({ success: true });
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });

    it('should return healthy status when connected', async () => {
      (adapter as any).invokeCS.mockResolvedValueOnce({ success: true, processId: 1234 });
      await adapter.connect();

      (adapter as any).invokeCS.mockResolvedValueOnce({
        success: true,
        healthy: true,
        status: 'connected',
      });
      const health = await adapter.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.connectionStatus).toBe('connected');
      expect(health.metrics?.macroFallbacks).toBe(0);
    });

    it('should create a part and return model info', async () => {
      (adapter as any).invokeCS.mockResolvedValue({ success: true, name: 'Part1', type: 'Part' });
      const model = await adapter.createPart();
      expect(model.name).toBe('Part1');
      expect(model.type).toBe('Part');
      expect(model.isActive).toBe(true);
    });

    it('should create extrusion with all parameters', async () => {
      (adapter as any).invokeCS.mockResolvedValue({
        success: true,
        name: 'Boss-Extrude1',
        type: 'Extrusion',
      });

      const feature = await adapter.createExtrusion({
        depth: 25,
        reverse: true,
        bothDirections: false,
        draft: 5,
        merge: true,
      });
      expect(feature.name).toBe('Boss-Extrude1');
      expect(feature.type).toBe('Extrusion');
      expect(feature.suppressed).toBe(false);

      expect((adapter as any).invokeCS).toHaveBeenCalledWith(expect.objectContaining({ command: 'CreateExtrusion' }));
    });

    it('should create revolve feature', async () => {
      (adapter as any).invokeCS.mockResolvedValue({
        success: true,
        name: 'Revolve1',
        type: 'Revolution',
      });
      const feature = await adapter.createRevolve({ angle: 360 });
      expect(feature.name).toBe('Revolve1');
      expect(feature.type).toBe('Revolution');
    });

    it('should create sweep feature', async () => {
      (adapter as any).invokeCS.mockResolvedValue({
        success: true,
        name: 'Sweep1',
        type: 'Sweep',
      });
      const feature = await adapter.createSweep({
        profileSketch: 'Sketch1',
        pathSketch: 'Sketch2',
      });
      expect(feature.name).toBe('Sweep1');
      expect(feature.type).toBe('Sweep');
    });

    it('should create loft feature', async () => {
      (adapter as any).invokeCS.mockResolvedValue({
        success: true,
        name: 'Loft1',
        type: 'Loft',
      });
      const feature = await adapter.createLoft({ profiles: ['Sketch1', 'Sketch2'] });
      expect(feature.name).toBe('Loft1');
      expect(feature.type).toBe('Loft');
    });

    it('should return mass properties with all fields', async () => {
      (adapter as any).invokeCS.mockResolvedValue({
        success: true,
        mass: 1.5,
        volume: 0.005,
        surfaceArea: 0.1,
        density: 7800,
        centerOfMassX: 10,
        centerOfMassY: 20,
        centerOfMassZ: 30,
        Ixx: 1,
        Iyy: 2,
        Izz: 3,
        Ixy: 0.1,
        Iyz: 0.2,
        Ixz: 0.3,
      });

      const mp = await adapter.getMassProperties();
      expect(mp.mass).toBe(1.5);
      expect(mp.centerOfMass.x).toBe(10);
      expect(mp.momentsOfInertia?.Ixx).toBe(1);
    });

    it('should track metrics correctly', async () => {
      (adapter as any).invokeCS.mockResolvedValue({ success: true, processId: 1 });
      await adapter.connect();

      (adapter as any).invokeCS.mockResolvedValue({ success: true, name: 'Part1', type: 'Part' });
      await adapter.createPart();

      (adapter as any).invokeCS.mockResolvedValue({
        success: true,
        healthy: true,
        status: 'connected',
      });
      const health = await adapter.healthCheck();
      expect(health.successCount).toBeGreaterThan(0);
      expect(health.metrics?.directCOMCalls).toBeGreaterThan(0);
    });

    it('should handle errors from C# bridge', async () => {
      (adapter as any).invokeCS.mockResolvedValue({
        success: false,
        error: 'COM object not available',
      });
      await expect(adapter.createPart()).rejects.toThrow('COM object not available');
    });

    it('should execute commands via execute method', async () => {
      (adapter as any).invokeCS.mockResolvedValue({ success: true, name: 'Part1', type: 'Part' });
      const command = {
        name: 'CreatePart',
        parameters: {},
        validate: () => ({ valid: true }),
      };
      const result = await adapter.execute(command);
      expect(result.success).toBe(true);
      expect(result.timing).toBeDefined();
      expect(result.metadata?.adapter).toBe('edge-js');
    });

    it('should return error result for failed validation', async () => {
      const command = {
        name: 'CreateExtrusion',
        parameters: { depth: -1 },
        validate: () => ({ valid: false, errors: ['Depth must be positive'] }),
      };
      const result = await adapter.execute(command);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Depth must be positive');
    });

    it('should open model and return correct type', async () => {
      (adapter as any).invokeCS.mockResolvedValue({
        success: true,
        path: 'C:\\test.sldprt',
        name: 'test',
        type: 'Part',
      });
      const model = await adapter.openModel('C:\\test.sldprt');
      expect(model.type).toBe('Part');
      expect(model.isActive).toBe(true);
    });

    it('should get and set dimensions', async () => {
      (adapter as any).invokeCS.mockResolvedValueOnce({ success: true, value: 25.4 });
      const val = await adapter.getDimension('D1@Sketch1');
      expect(val).toBe(25.4);

      (adapter as any).invokeCS.mockResolvedValueOnce({ success: true });
      await adapter.setDimension('D1@Sketch1', 50);
    });
  });
});
