import { describe, it, expect } from 'vitest';
import { modelingTools } from './tools/modeling.js';
import { vbaTools } from './tools/vba.js';

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
});