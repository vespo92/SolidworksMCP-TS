/**
 * Native Macro Recording for SolidWorks
 * Uses SolidWorks' built-in macro recording API for proper VBA initialization
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { SolidWorksAPI } from '../solidworks/api.js';
import { MacroRecorder } from '../macro/recorder.js';

// Module-level state for active macro recording sessions
let _macroRecorder: MacroRecorder | null = null;
let _activeMacroPath: string | null = null;

/**
 * Native macro tools for creating, running, and managing SolidWorks VBA macros
 */
export const nativeMacroTools = [
  // ============================================
  // NATIVE MACRO RECORDING
  // ============================================
  
  {
    name: 'start_native_macro_recording',
    description: 'Start recording a macro that captures subsequent MCP tool calls as VBA',
    inputSchema: z.object({
      macroPath: z.string().describe('Full path where the macro will be saved (e.g., C:\\Macros\\MyMacro.swb)'),
      macroName: z.string().default('RecordedMacro').describe('Name for the macro recording'),
      description: z.string().optional().describe('Description of what the macro does'),
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        // Ensure macro path uses .swb (plain-text VBA) extension
        let macroPath = args.macroPath;
        if (!macroPath.toLowerCase().endsWith('.swb')) {
          macroPath = macroPath.replace(/\.[^.]*$/, '') + '.swb';
        }

        // Ensure directory exists
        const dir = path.dirname(macroPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Store the macro path for later retrieval on stop
        // We use a module-level variable since the MacroRecorder doesn't track file paths
        _activeMacroPath = macroPath;

        // Use the built-in MacroRecorder to track actions
        if (!_macroRecorder) {
          _macroRecorder = new MacroRecorder();
        }
        const id = _macroRecorder.startRecording(args.macroName, args.description);

        return {
          success: true,
          message: 'Macro recording started — subsequent MCP tool calls will be captured',
          macroPath,
          recordingId: id,
          status: 'recording',
        };
      } catch (error) {
        return `Failed to start macro recording: ${error}`;
      }
    }
  },

  {
    name: 'stop_native_macro_recording',
    description: 'Stop the current macro recording and save as a .swb VBA file',
    inputSchema: z.object({
      runMacro: z.boolean().default(false).describe('Run the macro immediately after saving')
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        if (!_macroRecorder) {
          throw new Error('No macro recorder active — call start_native_macro_recording first');
        }

        // Stop recording and export to VBA
        const recording = _macroRecorder.stopRecording();
        if (!recording) {
          throw new Error('No recording in progress');
        }

        const vbaCode = _macroRecorder.exportToVBA(recording.id);
        const macroPath = _activeMacroPath || path.join(process.env.TEMP || '/tmp', `macro_${Date.now()}.swb`);

        // Write the .swb file (plain-text VBA format, natively supported by SolidWorks)
        fs.writeFileSync(macroPath, vbaCode, 'utf8');

        // Run macro if requested
        if (args.runMacro) {
          const swApp = swApi.getApp();
          if (swApp) {
            swApp.RunMacro2(macroPath, 'main', 'main', 1, 0);
          }
        }

        _activeMacroPath = null;

        return {
          success: true,
          message: `Macro recording saved to ${macroPath}`,
          macroPath,
          actionCount: recording.actions.length,
          executed: args.runMacro,
        };
      } catch (error) {
        return `Failed to stop macro recording: ${error}`;
      }
    }
  },

  {
    name: 'pause_resume_macro_recording',
    description: 'Pause or resume the current macro recording',
    inputSchema: z.object({
      action: z.enum(['pause', 'resume']).describe('Action to perform')
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        const swApp = swApi.getApp();
        if (!swApp) throw new Error('SolidWorks application not connected');
        
        if (args.action === 'pause') {
          swApp.PauseMacroRecording();
        } else {
          swApp.ResumeMacroRecording();
        }
        
        return {
          success: true,
          message: `Macro recording ${args.action}d`,
          status: args.action === 'pause' ? 'paused' : 'recording'
        };
      } catch (error) {
        return `Failed to ${args.action} macro recording: ${error}`;
      }
    }
  },

  // ============================================
  // MACRO EXECUTION & MANAGEMENT
  // ============================================
  
  {
    name: 'run_macro',
    description: 'Run a SolidWorks macro file',
    inputSchema: z.object({
      macroPath: z.string().describe('Full path to the macro file (.swp or .swb)'),
      moduleName: z.string().default('main').describe('Module name containing the macro'),
      procedureName: z.string().default('main').describe('Procedure/subroutine name to run'),
      arguments: z.array(z.any()).optional().describe('Arguments to pass to the macro'),
      unloadAfterRun: z.boolean().default(true).describe('Unload macro from memory after execution')
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        const swApp = swApi.getApp();
        if (!swApp) throw new Error('SolidWorks application not connected');
        
        // Check if macro file exists
        if (!fs.existsSync(args.macroPath)) {
          throw new Error(`Macro file not found: ${args.macroPath}`);
        }
        
        // Determine run option
        const runOption = args.unloadAfterRun ? 1 : 0; // swRunMacroOption_e
        
        // Run the macro
        let success;
        if (args.arguments && args.arguments.length > 0) {
          // Run with arguments (requires special handling)
          const vbaApp = swApp.GetAddInObject("SldWorks.MacroRunner");
          success = vbaApp.RunMacroWithArguments(
            args.macroPath,
            args.moduleName,
            args.procedureName,
            args.arguments
          );
        } else {
          // Run without arguments
          success = swApp.RunMacro2(
            args.macroPath,
            args.moduleName,
            args.procedureName,
            runOption
          );
        }
        
        if (!success) {
          throw new Error('Macro execution failed');
        }
        
        return {
          success: true,
          message: 'Macro executed successfully',
          macroPath: args.macroPath,
          module: args.moduleName,
          procedure: args.procedureName,
          hadArguments: args.arguments ? args.arguments.length : 0
        };
      } catch (error) {
        return `Failed to run macro: ${error}`;
      }
    }
  },

  {
    name: 'edit_macro',
    description: 'Open a macro in the SolidWorks VBA editor',
    inputSchema: z.object({
      macroPath: z.string().describe('Full path to the macro file')
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        const swApp = swApi.getApp();
        if (!swApp) throw new Error('SolidWorks application not connected');
        
        // Check if macro file exists
        if (!fs.existsSync(args.macroPath)) {
          throw new Error(`Macro file not found: ${args.macroPath}`);
        }
        
        // Open in VBA editor
        const success = swApp.EditMacro(args.macroPath);
        
        if (!success) {
          throw new Error('Failed to open macro in editor');
        }
        
        return {
          success: true,
          message: 'Macro opened in VBA editor',
          macroPath: args.macroPath
        };
      } catch (error) {
        return `Failed to edit macro: ${error}`;
      }
    }
  },

  // ============================================
  // MACRO INITIALIZATION & CONVERSION
  // ============================================
  
  {
    name: 'create_initialized_macro',
    description: 'Create a new macro with proper SolidWorks VBA initialization',
    inputSchema: z.object({
      macroPath: z.string().describe('Path where the macro will be saved'),
      macroName: z.string().describe('Name of the macro'),
      description: z.string().optional().describe('Macro description'),
      includeErrorHandling: z.boolean().default(true).describe('Include error handling code'),
      includeComments: z.boolean().default(true).describe('Include helpful comments'),
      template: z.enum(['basic', 'part', 'assembly', 'drawing']).default('basic').describe('Macro template type')
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        // Use .swb (plain-text VBA) which SolidWorks natively supports
        let macroPath = args.macroPath;
        if (!macroPath.toLowerCase().endsWith('.swb') && !macroPath.toLowerCase().endsWith('.swp')) {
          macroPath = macroPath.replace(/\.[^.]*$/, '') + '.swb';
        }
        // Prefer .swb since we're writing plain text
        if (macroPath.toLowerCase().endsWith('.swp')) {
          macroPath = macroPath.replace(/\.swp$/i, '.swb');
        }

        // Create directory if needed
        const dir = path.dirname(macroPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Build template code based on type
        const templateCode = generateMacroTemplate(args);

        // Write the .swb file directly — no COM VBA editor needed
        fs.writeFileSync(macroPath, templateCode, 'utf8');

        return {
          success: true,
          message: `Initialized macro created at ${macroPath}`,
          macroPath,
          macroName: args.macroName,
          template: args.template,
          linesOfCode: templateCode.split('\n').length
        };
      } catch (error) {
        return `Failed to create initialized macro: ${error}`;
      }
    }
  },

  {
    name: 'convert_text_to_native_macro',
    description: 'Convert plain text VBA code to a properly initialized SolidWorks macro (.swb)',
    inputSchema: z.object({
      vbaCode: z.string().describe('Plain text VBA code to convert'),
      outputPath: z.string().describe('Path where the converted macro will be saved'),
      macroName: z.string().describe('Name for the macro'),
      addInitialization: z.boolean().default(true).describe('Add SolidWorks initialization code'),
    }),
    handler: (args: any, swApi: SolidWorksAPI) => {
      try {
        // Use .swb (plain-text VBA) extension
        let outputPath = args.outputPath;
        if (!outputPath.toLowerCase().endsWith('.swb') && !outputPath.toLowerCase().endsWith('.swp')) {
          outputPath = outputPath.replace(/\.[^.]*$/, '') + '.swb';
        }
        if (outputPath.toLowerCase().endsWith('.swp')) {
          outputPath = outputPath.replace(/\.swp$/i, '.swb');
        }

        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Process the VBA code
        let processedCode = args.vbaCode;

        // Add initialization if needed
        if (args.addInitialization && !processedCode.includes('Dim swApp')) {
          const initCode = `' ${args.macroName}
' Converted from text VBA by SolidWorks MCP Server
' Date: ${new Date().toISOString()}

Option Explicit

' SolidWorks Variables
Dim swApp As SldWorks.SldWorks
Dim swModel As SldWorks.ModelDoc2
Dim swPart As SldWorks.PartDoc
Dim swAssembly As SldWorks.AssemblyDoc
Dim swDrawing As SldWorks.DrawingDoc
Dim boolStatus As Boolean
Dim longStatus As Long, longWarnings As Long

`;
          processedCode = initCode + processedCode;
        }

        // Ensure main subroutine exists
        if (!processedCode.includes('Sub main')) {
          processedCode = processedCode + `

Sub main()
    Set swApp = Application.SldWorks
    Set swModel = swApp.ActiveDoc

    If swModel Is Nothing Then
        MsgBox "Please open a document first."
        Exit Sub
    End If

    ' Call your main procedure here
    ${args.macroName}
End Sub`;
        }

        // Write the .swb file directly
        fs.writeFileSync(outputPath, processedCode, 'utf8');

        return {
          success: true,
          message: `VBA code converted and saved to ${outputPath}`,
          outputPath,
          macroName: args.macroName,
          linesOfCode: processedCode.split('\n').length,
          initializationAdded: args.addInitialization
        };
      } catch (error) {
        return `Failed to convert text to native macro: ${error}`;
      }
    }
  },

  // ============================================
  // MACRO BATCH OPERATIONS
  // ============================================
  
  {
    name: 'batch_run_macros',
    description: 'Run multiple macros in sequence',
    inputSchema: z.object({
      macros: z.array(z.object({
        path: z.string().describe('Macro file path'),
        module: z.string().default('main').describe('Module name'),
        procedure: z.string().default('main').describe('Procedure name'),
        arguments: z.array(z.any()).optional().describe('Arguments'),
        continueOnError: z.boolean().default(true).describe('Continue if this macro fails')
      })).describe('Array of macros to run'),
      delayBetween: z.number().default(1000).describe('Delay between macros in milliseconds'),
      stopOnError: z.boolean().default(false).describe('Stop batch if any macro fails')
    }),
    handler: async (args: any, swApi: SolidWorksAPI) => {
      try {
        const swApp = swApi.getApp();
        if (!swApp) throw new Error('SolidWorks application not connected');
        
        const results = {
          total: args.macros.length,
          successful: 0,
          failed: 0,
          skipped: 0,
          details: [] as any[]
        };
        
        for (let i = 0; i < args.macros.length; i++) {
          const macro = args.macros[i];
          const result = {
            index: i,
            path: macro.path,
            status: 'pending',
            message: '',
            startTime: new Date().toISOString()
          };
          
          try {
            // Check if file exists
            if (!fs.existsSync(macro.path)) {
              throw new Error('Macro file not found');
            }
            
            // Run the macro
            const success = swApp.RunMacro2(
              macro.path,
              macro.module,
              macro.procedure,
              1 // Unload after run
            );
            
            if (!success) {
              throw new Error('Macro execution failed');
            }
            
            result.status = 'success';
            result.message = 'Macro executed successfully';
            results.successful++;
            
          } catch (error) {
            result.status = 'failed';
            result.message = String(error);
            results.failed++;
            
            if (args.stopOnError && !macro.continueOnError) {
              results.skipped = args.macros.length - i - 1;
              results.details.push(result);
              break;
            }
          }
          
          (result as any).endTime = new Date().toISOString();
          results.details.push(result);
          
          // Delay between macros
          if (i < args.macros.length - 1) {
            await new Promise(resolve => setTimeout(resolve, args.delayBetween));
          }
        }
        
        return {
          success: results.failed === 0,
          message: `Batch execution completed: ${results.successful}/${results.total} successful`,
          results
        };
      } catch (error) {
        return `Failed to run batch macros: ${error}`;
      }
    }
  }
];

// Helper function to generate macro templates
function generateMacroTemplate(args: any): string {
  const templates: any = {
    basic: `
' Macro: ${args.macroName}
' Description: ${args.description || 'Basic SolidWorks macro'}
' Created: ${new Date().toISOString()}
' Generated by SolidWorks MCP Server

Option Explicit

' SolidWorks Variables
Dim swApp As SldWorks.SldWorks
Dim swModel As SldWorks.ModelDoc2
Dim boolStatus As Boolean
Dim longStatus As Long, longWarnings As Long

Sub main()
${args.includeErrorHandling ? '    On Error GoTo ErrorHandler' : ''}
    
    ' Get SolidWorks application
    Set swApp = Application.SldWorks
    
    ' Get active document
    Set swModel = swApp.ActiveDoc
    
    ' Check if document is open
    If swModel Is Nothing Then
        MsgBox "Please open a document first."
        Exit Sub
    End If
    
    ${args.includeComments ? "' Your code here" : ''}
    
    MsgBox "Macro completed successfully!"
    
${args.includeErrorHandling ? `ErrorHandler:
    If Err.Number <> 0 Then
        MsgBox "Error " & Err.Number & ": " & Err.Description
    End If` : ''}
End Sub`,

    part: `
' Macro: ${args.macroName}
' Description: ${args.description || 'Part-specific SolidWorks macro'}
' Created: ${new Date().toISOString()}

Option Explicit

Dim swApp As SldWorks.SldWorks
Dim swModel As SldWorks.ModelDoc2
Dim swPart As SldWorks.PartDoc
Dim swFeature As SldWorks.Feature
Dim swFeatMgr As SldWorks.FeatureManager

Sub main()
${args.includeErrorHandling ? '    On Error GoTo ErrorHandler' : ''}
    
    Set swApp = Application.SldWorks
    Set swModel = swApp.ActiveDoc
    
    ' Verify this is a part document
    If swModel Is Nothing Then
        MsgBox "Please open a part document."
        Exit Sub
    End If
    
    If swModel.GetType <> swDocPART Then
        MsgBox "This macro only works with part documents."
        Exit Sub
    End If
    
    Set swPart = swModel
    Set swFeatMgr = swModel.FeatureManager
    
    ${args.includeComments ? "' Part-specific operations here" : ''}
    
${args.includeErrorHandling ? `ErrorHandler:
    If Err.Number <> 0 Then
        MsgBox "Error " & Err.Number & ": " & Err.Description
    End If` : ''}
End Sub`,

    assembly: `
' Macro: ${args.macroName}
' Description: ${args.description || 'Assembly-specific SolidWorks macro'}
' Created: ${new Date().toISOString()}

Option Explicit

Dim swApp As SldWorks.SldWorks
Dim swModel As SldWorks.ModelDoc2
Dim swAssembly As SldWorks.AssemblyDoc
Dim swComp As SldWorks.Component2

Sub main()
${args.includeErrorHandling ? '    On Error GoTo ErrorHandler' : ''}
    
    Set swApp = Application.SldWorks
    Set swModel = swApp.ActiveDoc
    
    ' Verify this is an assembly document
    If swModel Is Nothing Then
        MsgBox "Please open an assembly document."
        Exit Sub
    End If
    
    If swModel.GetType <> swDocASSEMBLY Then
        MsgBox "This macro only works with assembly documents."
        Exit Sub
    End If
    
    Set swAssembly = swModel
    
    ${args.includeComments ? "' Assembly-specific operations here" : ''}
    
${args.includeErrorHandling ? `ErrorHandler:
    If Err.Number <> 0 Then
        MsgBox "Error " & Err.Number & ": " & Err.Description
    End If` : ''}
End Sub`,

    drawing: `
' Macro: ${args.macroName}
' Description: ${args.description || 'Drawing-specific SolidWorks macro'}
' Created: ${new Date().toISOString()}

Option Explicit

Dim swApp As SldWorks.SldWorks
Dim swModel As SldWorks.ModelDoc2
Dim swDrawing As SldWorks.DrawingDoc
Dim swSheet As SldWorks.Sheet
Dim swView As SldWorks.View

Sub main()
${args.includeErrorHandling ? '    On Error GoTo ErrorHandler' : ''}
    
    Set swApp = Application.SldWorks
    Set swModel = swApp.ActiveDoc
    
    ' Verify this is a drawing document
    If swModel Is Nothing Then
        MsgBox "Please open a drawing document."
        Exit Sub
    End If
    
    If swModel.GetType <> swDocDRAWING Then
        MsgBox "This macro only works with drawing documents."
        Exit Sub
    End If
    
    Set swDrawing = swModel
    Set swSheet = swDrawing.GetCurrentSheet
    
    ${args.includeComments ? "' Drawing-specific operations here" : ''}
    
${args.includeErrorHandling ? `ErrorHandler:
    If Err.Number <> 0 Then
        MsgBox "Error " & Err.Number & ": " & Err.Description
    End If` : ''}
End Sub`
  };
  
  return templates[args.template] || templates.basic;
}

