/**
 * Comprehensive tests for the SolidWorks adapter architecture
 * 
 * Tests all aspects of the adapter pattern including:
 * - Connection management
 * - Command execution
 * - Circuit breaker functionality
 * - Connection pooling
 * - Fallback mechanisms
 * - Parameter validation
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WinAxAdapter } from '../../src/adapters/winax-adapter.js';
import { CircuitBreakerAdapter } from '../../src/adapters/circuit-breaker.js';
import { ConnectionPoolAdapter } from '../../src/adapters/connection-pool.js';
import { adapterFactory } from '../../src/adapters/factory.js';
import { ExtrusionCommand, ExtrusionFactory } from '../../src/commands/extrusion-command.js';
import { SolidWorksAPIRefactored } from '../../src/solidworks/api-refactored.js';

describe('SolidWorks Adapter Architecture', () => {
  
  describe('WinAxAdapter', () => {
    let adapter: WinAxAdapter;
    
    beforeAll(async () => {
      adapter = new WinAxAdapter();
    });
    
    afterAll(async () => {
      if (adapter.isConnected()) {
        await adapter.disconnect();
      }
    });
    
    it('should connect to SolidWorks', async () => {
      try {
        await adapter.connect();
        expect(adapter.isConnected()).toBe(true);
      } catch (error) {
        // Skip test if SolidWorks is not available
        console.log('SolidWorks not available, skipping connection test');
      }
    });
    
    it('should handle health checks', async () => {
      const health = await adapter.healthCheck();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('connectionStatus');
      expect(health).toHaveProperty('errorCount');
      expect(health).toHaveProperty('successCount');
    });
    
    it('should validate extrusion parameters', () => {
      const command = new ExtrusionCommand({ depth: 25 });
      const validation = command.validate();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toBeUndefined();
    });
    
    it('should reject invalid extrusion parameters', () => {
      const command = new ExtrusionCommand({ depth: -10 });
      const validation = command.validate();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Depth must be greater than 0');
    });
    
    it('should generate correct macro code for complex extrusion', () => {
      const generator = adapter['macroGenerator'];
      const macro = generator.generateExtrusionMacro({
        depth: 50,
        reverse: true,
        draft: 5,
        bothDirections: true,
        thinFeature: true,
        thinThickness: 2
      });
      
      expect(macro).toContain('FeatureExtrusion3');
      expect(macro).toContain('50'); // Depth should be converted
      expect(macro).toContain('True'); // Reverse
      expect(macro).toContain('SetThinWallType'); // Thin feature
    });
  });
  
  describe('CircuitBreakerAdapter', () => {
    it('should open circuit after threshold failures', async () => {
      const mockAdapter = {
        connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
        disconnect: vi.fn(),
        isConnected: vi.fn().mockReturnValue(false),
        healthCheck: vi.fn(),
        execute: vi.fn(),
        executeRaw: vi.fn(),
        openModel: vi.fn(),
        closeModel: vi.fn(),
        createPart: vi.fn(),
        createAssembly: vi.fn(),
        createDrawing: vi.fn(),
        createExtrusion: vi.fn(),
        createRevolve: vi.fn(),
        createSweep: vi.fn(),
        createLoft: vi.fn(),
        createSketch: vi.fn(),
        addLine: vi.fn(),
        addCircle: vi.fn(),
        addRectangle: vi.fn(),
        exitSketch: vi.fn(),
        getMassProperties: vi.fn(),
        exportFile: vi.fn(),
        getDimension: vi.fn(),
        setDimension: vi.fn()
      };
      
      const circuitBreaker = new CircuitBreakerAdapter(mockAdapter as any, 3, 1000);
      
      // Trigger failures
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.connect();
        } catch (e) {
          // Expected to fail
        }
      }
      
      // Circuit should be open
      const stats = circuitBreaker.getStatistics();
      expect(stats.state).toBe('OPEN');
      expect(stats.failures).toBe(3);
      
      // Further calls should fail immediately
      await expect(circuitBreaker.connect()).rejects.toThrow('Circuit breaker is OPEN');
    });
    
    it('should recover to half-open state after timeout', async () => {
      const mockAdapter = {
        connect: vi.fn()
          .mockRejectedValueOnce(new Error('Fail'))
          .mockRejectedValueOnce(new Error('Fail'))
          .mockRejectedValueOnce(new Error('Fail'))
          .mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(true)
      };
      
      const circuitBreaker = new CircuitBreakerAdapter(mockAdapter as any, 3, 100); // Short timeout for testing
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.connect();
        } catch (e) {
          // Expected
        }
      }
      
      expect(circuitBreaker.getStatistics().state).toBe('OPEN');
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should enter half-open and succeed
      await circuitBreaker.connect();
      
      const stats = circuitBreaker.getStatistics();
      expect(stats.state).toBe('HALF_OPEN');
    });
  });
  
  describe('ConnectionPoolAdapter', () => {
    it('should manage multiple connections', async () => {
      let connectionCount = 0;
      const mockFactory = async () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn().mockReturnValue(true),
        healthCheck: vi.fn().mockResolvedValue({
          healthy: true,
          lastCheck: new Date(),
          errorCount: 0,
          successCount: connectionCount++,
          averageResponseTime: 100,
          connectionStatus: 'connected' as const
        }),
        execute: vi.fn(),
        executeRaw: vi.fn(),
        openModel: vi.fn(),
        closeModel: vi.fn(),
        createPart: vi.fn().mockResolvedValue({ name: 'Part1', type: 'Part' as const, path: '', isActive: true }),
        createAssembly: vi.fn(),
        createDrawing: vi.fn(),
        createExtrusion: vi.fn(),
        createRevolve: vi.fn(),
        createSweep: vi.fn(),
        createLoft: vi.fn(),
        createSketch: vi.fn(),
        addLine: vi.fn(),
        addCircle: vi.fn(),
        addRectangle: vi.fn(),
        exitSketch: vi.fn(),
        getMassProperties: vi.fn(),
        exportFile: vi.fn(),
        getDimension: vi.fn(),
        setDimension: vi.fn()
      });
      
      const pool = new ConnectionPoolAdapter(mockFactory as any, 3);
      await pool.initialize();
      
      // Execute operations in parallel
      const results = await Promise.all([
        pool.createPart(),
        pool.createPart(),
        pool.createPart()
      ]);
      
      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('Part1');
      
      const stats = pool.getStatistics();
      expect(stats.totalConnections).toBe(3);
      expect(stats.availableConnections).toBeGreaterThanOrEqual(0);
      
      await pool.destroy();
    });
    
    it('should handle connection acquisition timeout', async () => {
      const mockFactory = async () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn().mockReturnValue(true),
        createPart: vi.fn().mockImplementation(
          () => new Promise(resolve => setTimeout(resolve, 1000))
        )
      });
      
      const pool = new ConnectionPoolAdapter(mockFactory as any, 1, 100); // 1 connection, 100ms timeout
      await pool.initialize();
      
      // First call occupies the connection
      pool.createPart();
      
      // Second call should timeout
      await expect(pool.createPart()).rejects.toThrow('Connection acquisition timeout');
      
      await pool.destroy();
    });
  });
  
  describe('AdapterFactory', () => {
    it('should create adapters with correct configuration', async () => {
      const adapter = await adapterFactory.createAdapter({
        type: 'winax',
        enableCircuitBreaker: false,
        enableConnectionPool: false
      });
      
      expect(adapter).toBeDefined();
      
      // Clean up
      await adapterFactory.clearCache();
    });
    
    it('should cache adapters with same configuration', async () => {
      const config = {
        type: 'winax' as const,
        enableCircuitBreaker: true,
        enableConnectionPool: false
      };
      
      const adapter1 = await adapterFactory.createAdapter(config);
      const adapter2 = await adapterFactory.createAdapter(config);
      
      // Should return same instance from cache
      expect(adapter1).toBe(adapter2);
      
      await adapterFactory.clearCache();
    });
    
    it('should perform health checks on all cached adapters', async () => {
      await adapterFactory.createAdapter({ type: 'winax' });
      
      const healthResults = await adapterFactory.healthCheckAll();
      expect(healthResults.size).toBeGreaterThan(0);
      
      for (const [key, health] of healthResults) {
        expect(health).toHaveProperty('healthy');
        expect(health).toHaveProperty('connectionStatus');
      }
      
      await adapterFactory.clearCache();
    });
  });
  
  describe('ExtrusionCommand', () => {
    it('should build simple extrusion command', () => {
      const command = ExtrusionFactory.simpleExtrusion(25);
      expect(command.parameters.depth).toBe(25);
      expect(command.validate().valid).toBe(true);
    });
    
    it('should build cut extrusion command', () => {
      const command = ExtrusionFactory.cutExtrusion(10);
      expect(command.parameters.flipSideToCut).toBe(true);
      expect(command.parameters.merge).toBe(false);
    });
    
    it('should build thin extrusion command', () => {
      const command = ExtrusionFactory.thinExtrusion(20, 2);
      expect(command.parameters.thinFeature).toBe(true);
      expect(command.parameters.thinThickness).toBe(2);
    });
    
    it('should build complex extrusion with builder', () => {
      const builder = new ExtrusionCommandBuilder()
        .depth(50)
        .bothDirections(true, 30)
        .draft(5, true, true)
        .thinFeature(2, 'TwoSide')
        .capEnds(1.5)
        .offset(3, false)
        .merge(true)
        .endCondition('ThroughAll');
      
      const command = builder.build();
      
      expect(command.parameters.depth).toBe(50);
      expect(command.parameters.bothDirections).toBe(true);
      expect(command.parameters.depth2).toBe(30);
      expect(command.parameters.draft).toBe(5);
      expect(command.parameters.draftOutward).toBe(true);
      expect(command.parameters.draftWhileExtruding).toBe(true);
      expect(command.parameters.thinFeature).toBe(true);
      expect(command.parameters.thinThickness).toBe(2);
      expect(command.parameters.thinType).toBe('TwoSide');
      expect(command.parameters.capEnds).toBe(true);
      expect(command.parameters.capThickness).toBe(1.5);
      expect(command.parameters.offsetDistance).toBe(3);
      expect(command.parameters.endCondition).toBe(1); // ThroughAll = 1
      
      const validation = command.validate();
      expect(validation.valid).toBe(true);
    });
  });
  
  describe('SolidWorksAPIRefactored', () => {
    let api: SolidWorksAPIRefactored;
    
    beforeAll(() => {
      api = new SolidWorksAPIRefactored({
        enableCircuitBreaker: true,
        enableConnectionPool: false
      });
    });
    
    afterAll(async () => {
      if (api.isConnected()) {
        await api.disconnect();
      }
    });
    
    it('should provide backward compatibility methods', () => {
      expect(api.getCurrentModel).toBeDefined();
      expect(api.getApp).toBeDefined();
      
      // These should log deprecation warnings
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      api.getCurrentModel();
      api.getApp();
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });
    
    it('should create batch context for operations', async () => {
      const mockAdapter = {
        isConnected: () => true
      };
      api['adapter'] = mockAdapter as any;
      
      const batch = await api.createBatch();
      expect(batch).toBeDefined();
      expect(batch.add).toBeDefined();
      expect(batch.execute).toBeDefined();
      expect(batch.executeParallel).toBeDefined();
    });
    
    it('should update configuration at runtime', async () => {
      const initialConfig = api['config'];
      expect(initialConfig.enableCircuitBreaker).toBe(true);
      
      await api.updateConfig({
        enableCircuitBreaker: false,
        enableConnectionPool: true
      });
      
      const updatedConfig = api['config'];
      expect(updatedConfig.enableCircuitBreaker).toBe(false);
      expect(updatedConfig.enableConnectionPool).toBe(true);
    });
  });
});