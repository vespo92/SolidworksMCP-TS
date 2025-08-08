import { z } from 'zod';
import { SolidWorksAPI } from '../solidworks/api.js';
import { dirname, basename, extname, join } from 'path';

export const exportTools = [
  {
    name: 'export_file',
    description: 'Export the current model to various formats',
    inputSchema: z.object({
      outputPath: z.string().describe('Output file path (extension determines format)'),
      format: z.enum(['step', 'iges', 'stl', 'pdf', 'dxf', 'dwg']).optional()
        .describe('Export format (if not specified, uses file extension)'),
    }),
    handler: async (args: any, swApi: SolidWorksAPI) => {
      try {
        // Determine format from extension if not specified
        const format = args.format || extname(args.outputPath).slice(1).toLowerCase();
        await swApi.exportFile(args.outputPath, format);
        return `Exported to ${format.toUpperCase()}: ${args.outputPath}`;
      } catch (error) {
        return `Failed to export: ${error}`;
      }
    },
  },
  
  {
    name: 'batch_export',
    description: 'Export multiple configurations or files to a format',
    inputSchema: z.object({
      format: z.enum(['step', 'iges', 'stl', 'pdf', 'dxf', 'dwg']),
      outputDir: z.string().describe('Output directory'),
      configurations: z.array(z.string()).optional()
        .describe('List of configurations to export (if applicable)'),
      prefix: z.string().optional().describe('Prefix for output files'),
    }),
    handler: async (args: any, swApi: SolidWorksAPI) => {
      try {
        const model = swApi.getCurrentModel();
        if (!model) throw new Error('No model open');
        
        const exported: string[] = [];
        const modelName = basename(model.GetPathName(), extname(model.GetPathName()));
        
        if (args.configurations && args.configurations.length > 0) {
          // Export each configuration
          for (const config of args.configurations) {
            model.ShowConfiguration2(config);
            const filename = `${args.prefix || ''}${modelName}_${config}.${args.format}`;
            const outputPath = join(args.outputDir, filename);
            await swApi.exportFile(outputPath, args.format);
            exported.push(outputPath);
          }
        } else {
          // Export current state
          const filename = `${args.prefix || ''}${modelName}.${args.format}`;
          const outputPath = join(args.outputDir, filename);
          await swApi.exportFile(outputPath, args.format);
          exported.push(outputPath);
        }
        
        return `Exported ${exported.length} file(s):\n${exported.join('\n')}`;
      } catch (error) {
        return `Failed to batch export: ${error}`;
      }
    },
  },
  
  {
    name: 'export_with_options',
    description: 'Export with specific format options',
    inputSchema: z.object({
      outputPath: z.string().describe('Output file path'),
      format: z.enum(['stl', 'step', 'iges']),
      options: z.object({
        units: z.enum(['mm', 'in', 'm']).optional(),
        binary: z.boolean().optional().describe('Binary format (STL only)'),
        version: z.string().optional().describe('Format version (STEP/IGES)'),
        quality: z.enum(['coarse', 'fine', 'custom']).optional().describe('Mesh quality (STL)'),
      }),
    }),
    handler: async (args: any, swApi: SolidWorksAPI) => {
      try {
        const model = swApi.getCurrentModel();
        if (!model) throw new Error('No model open');
        
        // Set export options based on format
        if (args.format === 'stl' && args.options.quality) {
          const qualityMap = { coarse: 1, fine: 10, custom: 5 };
          model.Extension.SetUserPreferenceInteger(8, 0, qualityMap[args.options.quality as keyof typeof qualityMap]);
        }
        
        await swApi.exportFile(args.outputPath, args.format);
        return `Exported with options to: ${args.outputPath}`;
      } catch (error) {
        return `Failed to export with options: ${error}`;
      }
    },
  },
  
  {
    name: 'capture_screenshot',
    description: 'Capture a screenshot of the current model view',
    inputSchema: z.object({
      outputPath: z.string().describe('Output image path (.png, .jpg, .bmp)'),
      width: z.number().optional().describe('Image width in pixels'),
      height: z.number().optional().describe('Image height in pixels'),
    }),
    handler: async (args: any, swApi: SolidWorksAPI) => {
      try {
        const model = swApi.getCurrentModel();
        if (!model) throw new Error('No model open');
        
        const modelView = model.ActiveView;
        if (!modelView) throw new Error('No active view');
        
        // Set image size if specified
        if (args.width && args.height) {
          modelView.FrameState = 1; // swWindowState_e.swWindowMaximized
          // Note: Actual window sizing would require more complex Win32 API calls
        }
        
        const success = model.SaveAs3(args.outputPath, 0, 2); // Save as image
        if (!success) throw new Error('Failed to save screenshot');
        
        return `Screenshot saved to: ${args.outputPath}`;
      } catch (error) {
        return `Failed to capture screenshot: ${error}`;
      }
    },
  },
];