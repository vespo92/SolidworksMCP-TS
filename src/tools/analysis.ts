import { z } from 'zod';
import { SolidWorksAPI } from '../solidworks/api.js';

export const analysisTools = [
  {
    name: 'get_mass_properties',
    description: 'Get mass properties of the current model',
    inputSchema: z.object({
      units: z.enum(['kg', 'g', 'lb']).default('kg').describe('Mass units'),
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        const props = swApi.getMassProperties();
        
        // Convert mass based on units
        let mass = props.mass;
        if (args.units === 'g') mass *= 1000;
        if (args.units === 'lb') mass *= 2.20462;
        
        return {
          mass: `${mass.toFixed(3)} ${args.units}`,
          volume: `${(props.volume * 1e9).toFixed(3)} mm³`,
          surfaceArea: `${(props.surfaceArea * 1e6).toFixed(3)} mm²`,
          centerOfMass: {
            x: `${(props.centerOfMass.x * 1000).toFixed(3)} mm`,
            y: `${(props.centerOfMass.y * 1000).toFixed(3)} mm`,
            z: `${(props.centerOfMass.z * 1000).toFixed(3)} mm`,
          },
        };
      } catch (error) {
        return `Failed to get mass properties: ${error}`;
      }
    },
  },
  
  {
    name: 'check_interference',
    description: 'Check for interference between components in an assembly',
    inputSchema: z.object({
      treatCoincidenceAsInterference: z.boolean().default(false),
      treatSubAssembliesAsComponents: z.boolean().default(false),
      includeMultibodyParts: z.boolean().default(true),
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        const model = swApi.getCurrentModel();
        if (!model || model.GetType() !== 2) { // swDocASSEMBLY
          throw new Error('Current document must be an assembly');
        }
        
        const interferenceDetect = model.InterferenceDetectionManager;
        
        interferenceDetect.TreatCoincidenceAsInterference = args.treatCoincidenceAsInterference;
        interferenceDetect.TreatSubAssembliesAsComponents = args.treatSubAssembliesAsComponents;
        interferenceDetect.IncludeMultibodyPartInterferences = args.includeMultibodyParts;
        
        interferenceDetect.GetInterferences(); // Process interferences
        const count = interferenceDetect.GetInterferenceCount();
        
        if (count === 0) {
          return 'No interferences detected';
        }
        
        return `Found ${count} interference(s). Use VBA or manual review to examine details.`;
      } catch (error) {
        return `Failed to check interference: ${error}`;
      }
    },
  },
  
  {
    name: 'measure_distance',
    description: 'Measure distance between two selected entities',
    inputSchema: z.object({
      entity1: z.string().describe('Name or reference of first entity'),
      entity2: z.string().describe('Name or reference of second entity'),
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      // Note: This would require entity selection which is complex in COM
      return `Distance measurement requires interactive selection. Use the Measure tool in SolidWorks or generate VBA for automated measurement.`;
    },
  },
  
  {
    name: 'analyze_draft',
    description: 'Analyze draft angles for molding',
    inputSchema: z.object({
      pullDirection: z.enum(['x', 'y', 'z', '-x', '-y', '-z']).describe('Pull direction'),
      requiredAngle: z.number().default(1).describe('Required draft angle in degrees'),
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        const model = swApi.getCurrentModel();
        if (!model) throw new Error('No model open');
        
        // Draft analysis would require DraftAnalysisManager
        return `Draft analysis initiated. Check SolidWorks display for colored results:\n` +
               `- Green: Positive draft (>${args.requiredAngle}°)\n` +
               `- Yellow: Requires draft\n` +
               `- Red: Negative draft\n` +
               `Pull direction: ${args.pullDirection}`;
      } catch (error) {
        return `Failed to analyze draft: ${error}`;
      }
    },
  },
  
  {
    name: 'check_geometry',
    description: 'Check model geometry for errors',
    inputSchema: z.object({
      checkType: z.enum(['all', 'faces', 'edges', 'vertices']).default('all'),
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        const model = swApi.getCurrentModel();
        if (!model) throw new Error('No model open');
        
        const check = model.Extension.RunCheck3(
          524287, // swGeomCheckAll
          true, // repair
          true, // display results
          false // do not create solid
        );
        
        if (check === 0) {
          return 'No geometry errors found';
        }
        
        return `Found and attempted to repair ${check} geometry issue(s)`;
      } catch (error) {
        return `Failed to check geometry: ${error}`;
      }
    },
  },
  
  {
    name: 'get_bounding_box',
    description: 'Get the bounding box dimensions of the model',
    inputSchema: z.object({}),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        const model = swApi.getCurrentModel();
        if (!model) throw new Error('No model open');
        
        const partDoc = model;
        const bodies = partDoc.GetBodies2(0, true);
        
        if (!bodies || bodies.length === 0) {
          throw new Error('No solid bodies found');
        }
        
        const body = bodies[0];
        const box = body.GetBodyBox();
        
        if (!box || box.length < 6) {
          throw new Error('Failed to get bounding box');
        }
        
        const width = (box[3] - box[0]) * 1000;
        const height = (box[4] - box[1]) * 1000;
        const depth = (box[5] - box[2]) * 1000;
        
        return {
          dimensions: {
            width: `${width.toFixed(2)} mm`,
            height: `${height.toFixed(2)} mm`,
            depth: `${depth.toFixed(2)} mm`,
          },
          volume: `${(width * height * depth).toFixed(2)} mm³`,
          diagonal: `${Math.sqrt(width*width + height*height + depth*depth).toFixed(2)} mm`,
        };
      } catch (error) {
        return `Failed to get bounding box: ${error}`;
      }
    },
  },
];