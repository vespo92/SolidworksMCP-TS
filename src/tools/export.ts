import { z } from 'zod';
import { SolidWorksAPI } from '../solidworks/api.js';
import { basename, extname, join } from 'path';
import { existsSync } from 'fs';

export const exportTools = [
  {
    name: 'export_file',
    description: 'Export the current model to various formats',
    inputSchema: z.object({
      outputPath: z.string().describe('Output file path (extension determines format)'),
      format: z.enum(['step', 'iges', 'stl', 'pdf', 'dxf', 'dwg']).optional()
        .describe('Export format (if not specified, uses file extension)'),
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        // Determine format from extension if not specified
        const format = args.format || extname(args.outputPath).slice(1).toLowerCase();
        
        // Try to export
        try {
          swApi.exportFile(args.outputPath, format);
        } catch (e) {
          // Even if export throws, check if file was created
          if (existsSync(args.outputPath)) {
            return `Exported to ${format.toUpperCase()}: ${args.outputPath} (with warnings)`;
          }
          throw e;
        }
        
        // Verify file was created
        if (existsSync(args.outputPath)) {
          return `Exported to ${format.toUpperCase()}: ${args.outputPath}`;
        } else {
          // File might be created with different extension for some formats
          const altPath = args.outputPath.replace(/\.[^.]+$/, `.${format}`);
          if (existsSync(altPath)) {
            return `Exported to ${format.toUpperCase()}: ${altPath}`;
          }
          return `Export completed but file not found at: ${args.outputPath}. Check SolidWorks for any error messages.`;
        }
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
    handler: (args: any, swApi: SolidWorksAPI) => {
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
            swApi.exportFile(outputPath, args.format);
            exported.push(outputPath);
          }
        } else {
          // Export current state
          const filename = `${args.prefix || ''}${modelName}.${args.format}`;
          const outputPath = join(args.outputDir, filename);
          swApi.exportFile(outputPath, args.format);
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
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        const model = swApi.getCurrentModel();
        if (!model) throw new Error('No model open');
        
        // Set export options based on format
        if (args.format === 'stl' && args.options.quality) {
          const qualityMap = { coarse: 1, fine: 10, custom: 5 };
          model.Extension.SetUserPreferenceInteger(8, 0, qualityMap[args.options.quality as keyof typeof qualityMap]);
        }
        
        swApi.exportFile(args.outputPath, args.format);
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
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        const model = swApi.getCurrentModel();
        if (!model) throw new Error('No model open');
        
        const modelView = model.ActiveView;
        if (!modelView) throw new Error('No active view');
        
        // Determine the format from file extension
        const ext = args.outputPath.toLowerCase().split('.').pop();
        let success = false;
        
        if (ext === 'bmp') {
          // Use SaveBMP for bitmap format
          success = model.SaveBMP(args.outputPath, args.width || 1920, args.height || 1080);
        } else {
          // Try using ViewZoomtofit first to ensure proper view
          model.ViewZoomtofit2();
          
          // For PNG/JPG, try Extension.SaveAs2 then fall back to BMP
          try {
            if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
              const formatFlag = ext === 'png' ? 0x20 : 0x40;
              success = model.Extension.SaveAs2(args.outputPath, 0, formatFlag, null, null, false, null);
              // Verify the file was actually created in the requested format
              if (!success || !existsSync(args.outputPath)) {
                // SaveAs2 failed — fall back to BMP
                const bmpPath = args.outputPath.replace(/\.[^.]+$/, '.bmp');
                success = model.SaveBMP(bmpPath, args.width || 1920, args.height || 1080);
                if (success) {
                  return `Screenshot saved as BMP (${ext.toUpperCase()} format not supported by this SolidWorks version): ${bmpPath}`;
                }
              }
            } else {
              // Unsupported extension — use BMP
              const bmpPath = args.outputPath.replace(/\.[^.]+$/, '.bmp');
              success = model.SaveBMP(bmpPath, args.width || 1920, args.height || 1080);
              if (success) {
                return `Screenshot saved as BMP (format ${ext} not directly supported): ${bmpPath}`;
              }
            }
          } catch (e) {
            // Final fallback to BMP
            const bmpPath = args.outputPath.replace(/\.[^.]+$/, '.bmp');
            success = model.SaveBMP(bmpPath, args.width || 1920, args.height || 1080);
            if (success) {
              return `Screenshot saved as BMP (${ext.toUpperCase()} export failed): ${bmpPath}`;
            }
          }
        }
        
        // Check if file was created even if success is false
        if (!success) {
          // Check if file exists anyway
          if (existsSync(args.outputPath)) {
            return `Screenshot saved to: ${args.outputPath} (operation reported failure but file exists)`;
          }
          
          // Check for BMP fallback
          const bmpPath = args.outputPath.replace(/\.[^.]+$/, '.bmp');
          if (existsSync(bmpPath)) {
            return `Screenshot saved as BMP: ${bmpPath} (requested format failed)`;
          }
          
          throw new Error('Failed to save screenshot - file not created');
        }
        
        // Verify file exists
        if (existsSync(args.outputPath)) {
          return `Screenshot saved to: ${args.outputPath}`;
        } else {
          // Check for alternative extensions
          const bmpPath = args.outputPath.replace(/\.[^.]+$/, '.bmp');
          if (existsSync(bmpPath)) {
            return `Screenshot saved as BMP: ${bmpPath}`;
          }
          return `Screenshot operation completed but file not found at: ${args.outputPath}`;
        }
      } catch (error) {
        return `Failed to capture screenshot: ${error}`;
      }
    },
  },
];