import { z } from 'zod';
import { SolidWorksAPI } from '../solidworks/api.js';

export const modelingTools = [
  {
    name: 'open_model',
    description: 'Open a SolidWorks part, assembly, or drawing file',
    inputSchema: z.object({
      path: z.string().describe('Full path to the SolidWorks file'),
    }),
    handler: async (args: any, swApi: SolidWorksAPI) => {
      try {
        const model = await swApi.openModel(args.path);
        return `Opened ${model.type}: ${model.name}`;
      } catch (error) {
        return `Failed to open model: ${error}`;
      }
    },
  },
  
  {
    name: 'create_part',
    description: 'Create a new SolidWorks part document',
    inputSchema: z.object({}),
    handler: async (args: any, swApi: SolidWorksAPI) => {
      try {
        const model = await swApi.createPart();
        return `Created new part: ${model.name}`;
      } catch (error) {
        return `Failed to create part: ${error}`;
      }
    },
  },
  
  {
    name: 'close_model',
    description: 'Close the current model with option to save',
    inputSchema: z.object({
      save: z.boolean().default(false).describe('Save before closing'),
    }),
    handler: async (args: any, swApi: SolidWorksAPI) => {
      try {
        await swApi.closeModel(args.save);
        return 'Model closed successfully';
      } catch (error) {
        return `Failed to close model: ${error}`;
      }
    },
  },
  
  {
    name: 'create_extrusion',
    description: 'Create an extrusion feature',
    inputSchema: z.object({
      depth: z.number().describe('Extrusion depth in mm'),
      draft: z.number().default(0).describe('Draft angle in degrees'),
      reverse: z.boolean().default(false).describe('Reverse direction'),
    }),
    handler: async (args: any, swApi: SolidWorksAPI) => {
      try {
        const feature = await swApi.createExtrude(args.depth, args.draft, args.reverse);
        return `Created extrusion: ${feature.name}`;
      } catch (error) {
        return `Failed to create extrusion: ${error}`;
      }
    },
  },
  
  {
    name: 'get_dimension',
    description: 'Get the value of a dimension',
    inputSchema: z.object({
      name: z.string().describe('Dimension name (e.g., "D1@Sketch1")'),
    }),
    handler: async (args: any, swApi: SolidWorksAPI) => {
      try {
        const value = await swApi.getDimension(args.name);
        return `Dimension ${args.name} = ${value} mm`;
      } catch (error) {
        return `Failed to get dimension: ${error}`;
      }
    },
  },
  
  {
    name: 'set_dimension',
    description: 'Set the value of a dimension',
    inputSchema: z.object({
      name: z.string().describe('Dimension name (e.g., "D1@Sketch1")'),
      value: z.number().describe('New value in mm'),
    }),
    handler: async (args: any, swApi: SolidWorksAPI) => {
      try {
        await swApi.setDimension(args.name, args.value);
        return `Set dimension ${args.name} = ${args.value} mm`;
      } catch (error) {
        return `Failed to set dimension: ${error}`;
      }
    },
  },
  
  {
    name: 'rebuild_model',
    description: 'Rebuild the current model',
    inputSchema: z.object({
      force: z.boolean().default(false).describe('Force rebuild even if not needed'),
    }),
    handler: async (args: any, swApi: SolidWorksAPI) => {
      try {
        const model = swApi.getCurrentModel();
        if (!model) throw new Error('No model open');
        
        model.EditRebuild3();
        return 'Model rebuilt successfully';
      } catch (error) {
        return `Failed to rebuild model: ${error}`;
      }
    },
  },
];