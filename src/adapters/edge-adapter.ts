/**
 * Edge.js Adapter for SolidWorks COM Integration
 *
 * Uses Edge.js to bridge Node.js with C# code running in the .NET CLR.
 * Key advantage: Full access to ALL SolidWorks COM API parameters without
 * the 12-parameter limitation of winax. No VBA macro fallback needed.
 *
 * Requirements:
 * - Windows with .NET Framework 4.5+ or .NET 6+
 * - edge-js npm package
 * - SolidWorks installed and licensed
 */

import type { SolidWorksFeature, SolidWorksModel } from '../solidworks/types.js';
import { logger } from '../utils/logger.js';
import type {
  AdapterHealth,
  AdapterResult,
  Command,
  ExtrusionParameters,
  ISolidWorksAdapter,
  LoftParameters,
  MassProperties,
  RevolveParameters,
  SweepParameters,
} from './types.js';

// Edge.js C# source for SolidWorks COM interop
// This is compiled once and reused for all calls
const CSHARP_BRIDGE = `
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

public class Startup
{
    private static dynamic swApp;
    private static dynamic currentModel;

    public async Task<object> Invoke(IDictionary<string, object> input)
    {
        string command = (string)input["command"];
        var parameters = input.ContainsKey("parameters")
            ? (IDictionary<string, object>)input["parameters"]
            : new Dictionary<string, object>();

        try
        {
            switch (command)
            {
                case "Connect": return await Connect();
                case "Disconnect": return await Disconnect();
                case "HealthCheck": return await HealthCheck();
                case "OpenModel": return await OpenModel(parameters);
                case "CloseModel": return await CloseModel(parameters);
                case "CreatePart": return await CreatePart();
                case "CreateAssembly": return await CreateAssembly();
                case "CreateDrawing": return await CreateDrawing();
                case "CreateExtrusion": return await CreateExtrusion(parameters);
                case "CreateRevolve": return await CreateRevolve(parameters);
                case "CreateSweep": return await CreateSweep(parameters);
                case "CreateLoft": return await CreateLoft(parameters);
                case "CreateSketch": return await CreateSketch(parameters);
                case "AddLine": return await AddLine(parameters);
                case "AddCircle": return await AddCircle(parameters);
                case "AddRectangle": return await AddRectangle(parameters);
                case "ExitSketch": return await ExitSketch();
                case "GetMassProperties": return await GetMassProperties();
                case "ExportFile": return await ExportFile(parameters);
                case "GetDimension": return await GetDimension(parameters);
                case "SetDimension": return await SetDimension(parameters);
                case "ExecuteRaw": return await ExecuteRaw(parameters);
                default:
                    return new { success = false, error = "Unknown command: " + command };
            }
        }
        catch (Exception ex)
        {
            return new { success = false, error = ex.Message, stackTrace = ex.StackTrace };
        }
    }

    private Task<object> Connect()
    {
        return Task.Run(() =>
        {
            try
            {
                // Try to attach to running instance first
                swApp = Marshal.GetActiveObject("SldWorks.Application");
            }
            catch
            {
                // Create new instance
                Type swType = Type.GetTypeFromProgID("SldWorks.Application");
                if (swType == null)
                    throw new Exception("SolidWorks is not installed or registered");
                swApp = Activator.CreateInstance(swType);
            }

            swApp.Visible = true;
            int pid = swApp.GetProcessID();

            return (object)new { success = true, processId = pid };
        });
    }

    private Task<object> Disconnect()
    {
        return Task.Run(() =>
        {
            if (currentModel != null)
            {
                Marshal.ReleaseComObject(currentModel);
                currentModel = null;
            }
            // Don't close SolidWorks, just release our reference
            if (swApp != null)
            {
                Marshal.ReleaseComObject(swApp);
                swApp = null;
            }
            GC.Collect();
            GC.WaitForPendingFinalizers();
            return (object)new { success = true };
        });
    }

    private Task<object> HealthCheck()
    {
        return Task.Run(() =>
        {
            if (swApp == null)
                return (object)new { success = true, healthy = false, status = "disconnected" };

            try
            {
                int pid = swApp.GetProcessID();
                return (object)new { success = true, healthy = pid > 0, status = "connected", processId = pid };
            }
            catch
            {
                return (object)new { success = true, healthy = false, status = "error" };
            }
        });
    }

    private Task<object> OpenModel(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            string filePath = (string)p["filePath"];
            string ext = System.IO.Path.GetExtension(filePath).ToLower();
            int docType = ext == ".sldasm" ? 2 : ext == ".slddrw" ? 3 : 1;

            int errors = 0, warnings = 0;
            currentModel = swApp.OpenDoc6(filePath, docType, 1, "", ref errors, ref warnings);

            if (currentModel == null)
                throw new Exception("Failed to open model: " + filePath + " (errors: " + errors + ")");

            string name = currentModel.GetTitle();
            string[] types = { "Part", "Assembly", "Drawing" };

            return (object)new { success = true, path = filePath, name = name, type = types[docType - 1] };
        });
    }

    private Task<object> CloseModel(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            if (currentModel == null)
                return (object)new { success = true };

            bool save = p.ContainsKey("save") && Convert.ToBoolean(p["save"]);
            if (save)
                currentModel.Save3(1, ref (int)0, ref (int)0);

            string title = currentModel.GetTitle();
            swApp.CloseDoc(title);

            Marshal.ReleaseComObject(currentModel);
            currentModel = null;

            return (object)new { success = true };
        });
    }

    private Task<object> CreatePart()
    {
        return Task.Run(() =>
        {
            EnsureConnected();
            currentModel = swApp.NewPart();
            if (currentModel == null)
            {
                string template = swApp.GetUserPreferenceStringValue(8);
                currentModel = swApp.NewDocument(template, 0, 0, 0);
            }
            if (currentModel == null) throw new Exception("Failed to create new part");
            return (object)new { success = true, name = currentModel.GetTitle(), type = "Part" };
        });
    }

    private Task<object> CreateAssembly()
    {
        return Task.Run(() =>
        {
            EnsureConnected();
            string template = swApp.GetUserPreferenceStringValue(9);
            currentModel = swApp.NewDocument(template, 0, 0, 0);
            if (currentModel == null) throw new Exception("Failed to create new assembly");
            return (object)new { success = true, name = currentModel.GetTitle(), type = "Assembly" };
        });
    }

    private Task<object> CreateDrawing()
    {
        return Task.Run(() =>
        {
            EnsureConnected();
            string template = swApp.GetUserPreferenceStringValue(10);
            currentModel = swApp.NewDocument(template, 0, 0, 0);
            if (currentModel == null) throw new Exception("Failed to create new drawing");
            return (object)new { success = true, name = currentModel.GetTitle(), type = "Drawing" };
        });
    }

    // Full FeatureExtrusion3 - ALL 23 parameters, no COM bridge limitation
    private Task<object> CreateExtrusion(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            EnsureModel();

            double depth = Convert.ToDouble(p["depth"]) / 1000.0; // mm to meters
            bool reverse = GetBool(p, "reverse", false);
            bool bothDirections = GetBool(p, "bothDirections", false);
            double depth2 = GetDouble(p, "depth2", 0) / 1000.0;
            double draft = GetDouble(p, "draft", 0) * Math.PI / 180.0; // degrees to radians
            bool draftOutward = GetBool(p, "draftOutward", false);
            bool draftWhileExtruding = GetBool(p, "draftWhileExtruding", false);
            bool offsetReverse = GetBool(p, "offsetReverse", false);
            bool translateSurface = GetBool(p, "translateSurface", false);
            bool merge = GetBool(p, "merge", true);
            bool flipSideToCut = GetBool(p, "flipSideToCut", false);
            int startCondition = GetInt(p, "startCondition", 0);
            int endCondition = GetInt(p, "endCondition", 0);

            // Select sketch for extrusion
            SelectLatestSketch();

            dynamic featureMgr = currentModel.FeatureManager;

            // FeatureExtrusion3 with ALL 23 parameters - the key advantage of Edge.js
            dynamic feature = featureMgr.FeatureExtrusion3(
                !bothDirections,         // Sd (single direction)
                reverse,                 // Flip
                bothDirections,          // Dir (both directions)
                endCondition,            // T1 (end condition type 1)
                0,                       // T2 (end condition type 2)
                depth,                   // D1 (depth 1)
                depth2,                  // D2 (depth 2)
                draftWhileExtruding,     // Dchk1 (draft while extruding dir 1)
                false,                   // Dchk2 (draft while extruding dir 2)
                draftOutward,            // Ddir1 (draft outward dir 1)
                false,                   // Ddir2 (draft outward dir 2)
                draft,                   // Dang1 (draft angle dir 1)
                0.0,                     // Dang2 (draft angle dir 2)
                offsetReverse,           // OffsetReverse1
                false,                   // OffsetReverse2
                translateSurface,        // TranslateSurface1
                false,                   // TranslateSurface2
                merge,                   // Merge
                flipSideToCut,           // FlipSideToCut
                true,                    // Update/Regenerate
                startCondition,          // StartCondition
                0,                       // FlipStartOffset
                false                    // UseFeatureScope
            );

            currentModel.ClearSelection2(true);
            currentModel.EditRebuild3();

            if (feature == null) throw new Exception("Failed to create extrusion feature");

            return (object)new {
                success = true,
                name = (string)(feature.Name ?? "Boss-Extrude1"),
                type = "Extrusion"
            };
        });
    }

    // FeatureRevolve2 with all parameters
    private Task<object> CreateRevolve(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            EnsureModel();

            double angle = Convert.ToDouble(p["angle"]) * Math.PI / 180.0;
            string direction = GetString(p, "direction", "Forward");
            bool merge = GetBool(p, "merge", true);
            bool thinFeature = GetBool(p, "thinFeature", false);
            double thinThickness = GetDouble(p, "thinThickness", 0) / 1000.0;

            SelectLatestSketch();

            bool singleDir = direction != "Both";
            bool reverseDir = direction == "Reverse";

            dynamic featureMgr = currentModel.FeatureManager;
            dynamic feature = featureMgr.FeatureRevolve2(
                singleDir,               // SingleDir
                reverseDir,              // Flip
                false,                   // Dir (both directions)
                false,                   // BossFeature
                0,                       // T1 (end condition: one direction)
                0,                       // T2 (end condition: other direction)
                angle,                   // Angle1
                0.0,                     // Angle2
                thinFeature,             // ThinFeatureFlag
                thinThickness,           // ThinWallThickness1
                0.0,                     // ThinWallThickness2
                merge                    // Merge
            );

            currentModel.ClearSelection2(true);
            currentModel.EditRebuild3();

            if (feature == null) throw new Exception("Failed to create revolve feature");

            return (object)new {
                success = true,
                name = (string)(feature.Name ?? "Revolve1"),
                type = "Revolution"
            };
        });
    }

    // InsertProtrusionSwept4 with all 14 parameters
    private Task<object> CreateSweep(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            EnsureModel();

            string profileSketch = GetString(p, "profileSketch", "Sketch1");
            string pathSketch = GetString(p, "pathSketch", "Sketch2");
            double twistAngle = GetDouble(p, "twistAngle", 0) * Math.PI / 180.0;
            bool merge = GetBool(p, "merge", true);
            bool thinFeature = GetBool(p, "thinFeature", false);
            double thinThickness = GetDouble(p, "thinThickness", 0) / 1000.0;

            dynamic ext = currentModel.Extension;
            currentModel.ClearSelection2(true);

            // Select profile (mark=1) and path (mark=4)
            ext.SelectByID2(profileSketch, "SKETCH", 0, 0, 0, false, 1, null, 0);
            ext.SelectByID2(pathSketch, "SKETCH", 0, 0, 0, true, 4, null, 0);

            dynamic featureMgr = currentModel.FeatureManager;
            dynamic feature = featureMgr.InsertProtrusionSwept4(
                false,                   // Propagate
                false,                   // Alignment
                0,                       // TwistCtrlOption
                twistAngle,              // TwistAngle
                false,                   // ReverseTwistDir
                0,                       // TangencyType
                0,                       // PathAlignment
                merge,                   // Merge
                thinFeature,             // UseThinFeature
                thinThickness,           // ThinWallThickness
                0,                       // ThinType
                true,                    // MergeSmoothFaces
                false,                   // UseFeatureScope
                true                     // AutoSelect
            );

            currentModel.ClearSelection2(true);
            currentModel.EditRebuild3();

            if (feature == null) throw new Exception("Failed to create sweep feature");

            return (object)new {
                success = true,
                name = (string)(feature.Name ?? "Sweep1"),
                type = "Sweep"
            };
        });
    }

    // InsertProtrusionLoft3 with all 17 parameters
    private Task<object> CreateLoft(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            EnsureModel();

            bool closed = GetBool(p, "closed", false) || GetBool(p, "close", false);
            bool merge = GetBool(p, "merge", true);
            bool thinFeature = GetBool(p, "thinFeature", false);
            double thinThickness = GetDouble(p, "thinThickness", 0) / 1000.0;

            // Select profiles
            currentModel.ClearSelection2(true);
            dynamic ext = currentModel.Extension;

            object[] profiles = p.ContainsKey("profiles") ? (object[])p["profiles"] : new object[0];
            for (int i = 0; i < profiles.Length; i++)
            {
                ext.SelectByID2((string)profiles[i], "SKETCH", 0, 0, 0, i > 0, 1, null, 0);
            }

            // Select guide curves if provided
            if (p.ContainsKey("guideCurves") || p.ContainsKey("guides"))
            {
                object[] guides = p.ContainsKey("guideCurves")
                    ? (object[])p["guideCurves"]
                    : (object[])p["guides"];

                foreach (string guide in guides)
                {
                    ext.SelectByID2(guide, "SKETCH", 0, 0, 0, true, 2, null, 0);
                }
            }

            dynamic featureMgr = currentModel.FeatureManager;
            dynamic feature = featureMgr.InsertProtrusionLoft3(
                closed,                  // Closed
                false,                   // KeepTangency
                false,                   // ForceNonRational
                false,                   // SimpleSurfaces
                false,                   // CloseGuideCurves
                0,                       // StartTangencyType
                0,                       // EndTangencyType
                0.0,                     // StartTangentLength
                0.0,                     // EndTangentLength
                thinFeature,             // ThinFeature
                thinThickness,           // ThinWallThickness1
                0.0,                     // ThinWallThickness2
                0,                       // ThinType
                merge,                   // Merge
                true,                    // UseFeatScope
                true,                    // AutoSelectBodies
                0                        // GuideCurveInfluence
            );

            currentModel.ClearSelection2(true);
            currentModel.EditRebuild3();

            if (feature == null) throw new Exception("Failed to create loft feature");

            return (object)new {
                success = true,
                name = (string)(feature.Name ?? "Loft1"),
                type = "Loft"
            };
        });
    }

    private Task<object> CreateSketch(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            EnsureModel();
            string plane = (string)p["plane"];

            dynamic ext = currentModel.Extension;
            bool selected = ext.SelectByID2(plane, "PLANE", 0, 0, 0, false, 0, null, 0);
            if (!selected)
                selected = ext.SelectByID2(plane + " Plane", "PLANE", 0, 0, 0, false, 0, null, 0);
            if (!selected)
                throw new Exception("Failed to select plane: " + plane);

            currentModel.SketchManager.InsertSketch(true);
            string sketchName = currentModel.SketchManager.ActiveSketch?.Name ?? "Sketch1";

            return (object)new { success = true, sketchName = sketchName };
        });
    }

    private Task<object> AddLine(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            EnsureModel();
            double x1 = Convert.ToDouble(p["x1"]) / 1000.0;
            double y1 = Convert.ToDouble(p["y1"]) / 1000.0;
            double x2 = Convert.ToDouble(p["x2"]) / 1000.0;
            double y2 = Convert.ToDouble(p["y2"]) / 1000.0;

            dynamic line = currentModel.SketchManager.CreateLine(x1, y1, 0, x2, y2, 0);
            if (line == null) throw new Exception("Failed to create line");
            return (object)new { success = true };
        });
    }

    private Task<object> AddCircle(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            EnsureModel();
            double cx = Convert.ToDouble(p["centerX"]) / 1000.0;
            double cy = Convert.ToDouble(p["centerY"]) / 1000.0;
            double r = Convert.ToDouble(p["radius"]) / 1000.0;

            dynamic circle = currentModel.SketchManager.CreateCircle(cx, cy, 0, cx + r, cy, 0);
            if (circle == null) throw new Exception("Failed to create circle");
            return (object)new { success = true };
        });
    }

    private Task<object> AddRectangle(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            EnsureModel();
            double x1 = Convert.ToDouble(p["x1"]) / 1000.0;
            double y1 = Convert.ToDouble(p["y1"]) / 1000.0;
            double x2 = Convert.ToDouble(p["x2"]) / 1000.0;
            double y2 = Convert.ToDouble(p["y2"]) / 1000.0;

            dynamic sm = currentModel.SketchManager;
            sm.CreateLine(x1, y1, 0, x2, y1, 0);
            sm.CreateLine(x2, y1, 0, x2, y2, 0);
            sm.CreateLine(x2, y2, 0, x1, y2, 0);
            sm.CreateLine(x1, y2, 0, x1, y1, 0);

            return (object)new { success = true };
        });
    }

    private Task<object> ExitSketch()
    {
        return Task.Run(() =>
        {
            EnsureModel();
            currentModel.SketchManager.InsertSketch(true);
            return (object)new { success = true };
        });
    }

    private Task<object> GetMassProperties()
    {
        return Task.Run(() =>
        {
            EnsureModel();
            dynamic massProp = currentModel.Extension.CreateMassProperty();
            if (massProp == null) throw new Exception("Failed to create mass property object");

            dynamic com = massProp.CenterOfMass;
            dynamic moi = massProp.MomentOfInertia;

            return (object)new {
                success = true,
                mass = (double)massProp.Mass,
                volume = (double)massProp.Volume,
                surfaceArea = (double)massProp.SurfaceArea,
                density = (double)massProp.Density,
                centerOfMassX = (double)com[0] * 1000.0,
                centerOfMassY = (double)com[1] * 1000.0,
                centerOfMassZ = (double)com[2] * 1000.0,
                Ixx = (double)moi[0], Iyy = (double)moi[4], Izz = (double)moi[8],
                Ixy = (double)moi[1], Iyz = (double)moi[5], Ixz = (double)moi[2]
            };
        });
    }

    private Task<object> ExportFile(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            EnsureModel();
            string filePath = (string)p["filePath"];
            string format = ((string)p["format"]).ToLower();

            int errors = 0, warnings = 0;
            bool success = currentModel.Extension.SaveAs2(
                filePath, 0, 1, null, "", false, ref errors, ref warnings);

            if (!success) throw new Exception("Export failed (errors: " + errors + ")");
            return (object)new { success = true };
        });
    }

    private Task<object> GetDimension(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            EnsureModel();
            string name = (string)p["name"];
            dynamic dim = currentModel.Parameter(name);
            if (dim == null) throw new Exception("Dimension not found: " + name);
            return (object)new { success = true, value = (double)dim.SystemValue * 1000.0 };
        });
    }

    private Task<object> SetDimension(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            EnsureModel();
            string name = (string)p["name"];
            double value = Convert.ToDouble(p["value"]) / 1000.0;

            dynamic dim = currentModel.Parameter(name);
            if (dim == null) throw new Exception("Dimension not found: " + name);
            dim.SystemValue = value;
            currentModel.EditRebuild3();
            return (object)new { success = true };
        });
    }

    private Task<object> ExecuteRaw(IDictionary<string, object> p)
    {
        return Task.Run(() =>
        {
            EnsureModel();
            string method = (string)p["method"];
            object[] args = p.ContainsKey("args") ? (object[])p["args"] : new object[0];

            dynamic target = currentModel ?? swApp;
            object result = target.GetType().InvokeMember(
                method,
                System.Reflection.BindingFlags.InvokeMethod,
                null, target, args);

            return (object)new { success = true, result = result };
        });
    }

    // Helpers

    private void EnsureConnected()
    {
        if (swApp == null) throw new Exception("Not connected to SolidWorks");
    }

    private void EnsureModel()
    {
        EnsureConnected();
        if (currentModel == null)
        {
            currentModel = swApp.ActiveDoc;
            if (currentModel == null)
                throw new Exception("No active model");
        }
    }

    private void SelectLatestSketch()
    {
        // Feature tree traversal (most reliable)
        try
        {
            int count = currentModel.GetFeatureCount();
            for (int i = 0; i < Math.Min(10, count); i++)
            {
                dynamic feat = currentModel.FeatureByPositionReverse(i);
                if (feat != null)
                {
                    string typeName = feat.GetTypeName2();
                    if (typeName == "ProfileFeature" || typeName.ToLower().Contains("sketch"))
                    {
                        feat.Select2(false, 0);
                        return;
                    }
                }
            }
        }
        catch { /* fall through to SelectByID2 */ }

        // Fallback: try common sketch names
        dynamic ext = currentModel.Extension;
        string[] names = { "Sketch1", "Sketch2", "Sketch3", "Sketch4", "Sketch5" };
        foreach (string name in names)
        {
            try
            {
                if (ext.SelectByID2(name, "SKETCH", 0, 0, 0, false, 0, null, 0))
                    return;
            }
            catch { }
        }
    }

    private static bool GetBool(IDictionary<string, object> p, string key, bool def)
    {
        return p.ContainsKey(key) ? Convert.ToBoolean(p[key]) : def;
    }

    private static double GetDouble(IDictionary<string, object> p, string key, double def)
    {
        return p.ContainsKey(key) ? Convert.ToDouble(p[key]) : def;
    }

    private static int GetInt(IDictionary<string, object> p, string key, int def)
    {
        return p.ContainsKey(key) ? Convert.ToInt32(p[key]) : def;
    }

    private static string GetString(IDictionary<string, object> p, string key, string def)
    {
        return p.ContainsKey(key) ? (string)p[key] : def;
    }
}
`;

/**
 * Edge.js adapter for SolidWorks COM integration via .NET CLR.
 *
 * Bridges Node.js to C# code that runs in-process, giving full access
 * to all SolidWorks COM API parameters without the 12-param winax limit.
 */
export class EdgeJsAdapter implements ISolidWorksAdapter {
  private invokeCS: ((input: any) => Promise<any>) | null = null;
  private connected = false;
  private edgeAvailable = false;
  private metrics = {
    calls: 0,
    errors: 0,
    totalResponseTime: 0,
  };

  constructor() {
    this.initializeBridge();
  }

  private initializeBridge(): void {
    try {
      // @ts-ignore - edge-js has no type definitions
      const edge = require('edge-js');
      this.invokeCS = edge.func(CSHARP_BRIDGE);
      this.edgeAvailable = true;
      logger.info('Edge.js bridge initialized successfully');
    } catch (error) {
      this.edgeAvailable = false;
      logger.warn(`Edge.js not available - install edge-js and .NET runtime for this adapter. Error: ${error}`);
    }
  }

  private async invoke(command: string, parameters: Record<string, any> = {}): Promise<any> {
    if (!this.invokeCS) {
      throw new Error('Edge.js bridge not initialized. Ensure edge-js is installed and .NET runtime is available.');
    }

    const startTime = Date.now();
    this.metrics.calls++;

    try {
      const result = await this.invokeCS({ command, parameters });

      if (result && !result.success) {
        throw new Error(result.error || `Command ${command} failed`);
      }

      this.metrics.totalResponseTime += Date.now() - startTime;
      return result;
    } catch (error) {
      this.metrics.errors++;
      this.metrics.totalResponseTime += Date.now() - startTime;
      throw error;
    }
  }

  private getAverageResponseTime(): number {
    return this.metrics.calls > 0 ? this.metrics.totalResponseTime / this.metrics.calls : 0;
  }

  private getSuccessRate(): number {
    return this.metrics.calls > 0 ? ((this.metrics.calls - this.metrics.errors) / this.metrics.calls) * 100 : 100;
  }

  // --- ISolidWorksAdapter implementation ---

  async connect(): Promise<void> {
    const result = await this.invoke('Connect');
    this.connected = true;
    logger.info(`Connected to SolidWorks via Edge.js (PID: ${result.processId})`);
  }

  async disconnect(): Promise<void> {
    await this.invoke('Disconnect');
    this.connected = false;
    logger.info('Disconnected from SolidWorks (Edge.js)');
  }

  isConnected(): boolean {
    return this.connected && this.edgeAvailable;
  }

  async healthCheck(): Promise<AdapterHealth> {
    try {
      const result = await this.invoke('HealthCheck');
      return {
        healthy: result.healthy,
        lastCheck: new Date(),
        errorCount: this.metrics.errors,
        successCount: this.metrics.calls - this.metrics.errors,
        averageResponseTime: this.getAverageResponseTime(),
        connectionStatus: result.status as 'connected' | 'disconnected' | 'error',
        metrics: {
          directCOMCalls: this.metrics.calls,
          macroFallbacks: 0, // Edge.js never needs macro fallback
          successRate: this.getSuccessRate(),
        },
      };
    } catch (_error) {
      return {
        healthy: false,
        lastCheck: new Date(),
        errorCount: this.metrics.errors,
        successCount: this.metrics.calls - this.metrics.errors,
        averageResponseTime: this.getAverageResponseTime(),
        connectionStatus: 'error',
      };
    }
  }

  async execute<T>(command: Command): Promise<AdapterResult<T>> {
    const startTime = Date.now();

    try {
      const validation = command.validate();
      if (!validation.valid) {
        throw new Error(`Command validation failed: ${validation.errors?.join(', ')}`);
      }

      let result: any;
      switch (command.name) {
        case 'CreateExtrusion':
          result = await this.createExtrusion(command.parameters as ExtrusionParameters);
          break;
        case 'CreateRevolve':
          result = await this.createRevolve(command.parameters as RevolveParameters);
          break;
        case 'CreateSweep':
          result = await this.createSweep(command.parameters as SweepParameters);
          break;
        case 'CreateLoft':
          result = await this.createLoft(command.parameters as LoftParameters);
          break;
        case 'OpenModel':
          result = await this.openModel(command.parameters.filePath);
          break;
        case 'CloseModel':
          result = await this.closeModel(command.parameters.save);
          break;
        case 'CreatePart':
          result = await this.createPart();
          break;
        case 'ExportFile':
          result = await this.exportFile(command.parameters.filePath, command.parameters.format);
          break;
        default:
          result = await this.executeRaw(command.name, Object.values(command.parameters));
      }

      return {
        success: true,
        data: result as T,
        timing: { start: startTime, end: Date.now(), duration: Date.now() - startTime },
        metadata: { adapter: 'edge-js', metrics: { ...this.metrics } },
      };
    } catch (error) {
      if (command.fallback) {
        logger.info(`Executing fallback for ${command.name}`);
        return this.execute(command.fallback);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timing: { start: startTime, end: Date.now(), duration: Date.now() - startTime },
      };
    }
  }

  async executeRaw(method: string, args: any[]): Promise<any> {
    const result = await this.invoke('ExecuteRaw', { method, args });
    return result.result;
  }

  async openModel(filePath: string): Promise<SolidWorksModel> {
    const result = await this.invoke('OpenModel', { filePath });
    return {
      path: result.path,
      name: result.name,
      type: result.type as 'Part' | 'Assembly' | 'Drawing',
      isActive: true,
    };
  }

  async closeModel(save?: boolean): Promise<void> {
    await this.invoke('CloseModel', { save: save ?? false });
  }

  async createPart(): Promise<SolidWorksModel> {
    const result = await this.invoke('CreatePart');
    return { path: '', name: result.name, type: 'Part', isActive: true };
  }

  async createAssembly(): Promise<SolidWorksModel> {
    const result = await this.invoke('CreateAssembly');
    return { path: '', name: result.name, type: 'Assembly', isActive: true };
  }

  async createDrawing(): Promise<SolidWorksModel> {
    const result = await this.invoke('CreateDrawing');
    return { path: '', name: result.name, type: 'Drawing', isActive: true };
  }

  async createExtrusion(params: ExtrusionParameters): Promise<SolidWorksFeature> {
    const result = await this.invoke('CreateExtrusion', params as any);
    return { name: result.name, type: result.type, suppressed: false };
  }

  async createRevolve(params: RevolveParameters): Promise<SolidWorksFeature> {
    const result = await this.invoke('CreateRevolve', params as any);
    return { name: result.name, type: result.type, suppressed: false };
  }

  async createSweep(params: SweepParameters): Promise<SolidWorksFeature> {
    const result = await this.invoke('CreateSweep', params as any);
    return { name: result.name, type: result.type, suppressed: false };
  }

  async createLoft(params: LoftParameters): Promise<SolidWorksFeature> {
    const result = await this.invoke('CreateLoft', params as any);
    return { name: result.name, type: result.type, suppressed: false };
  }

  async createSketch(plane: string): Promise<string> {
    const result = await this.invoke('CreateSketch', { plane });
    return result.sketchName;
  }

  async addLine(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    await this.invoke('AddLine', { x1, y1, x2, y2 });
  }

  async addCircle(centerX: number, centerY: number, radius: number): Promise<void> {
    await this.invoke('AddCircle', { centerX, centerY, radius });
  }

  async addRectangle(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    await this.invoke('AddRectangle', { x1, y1, x2, y2 });
  }

  async exitSketch(): Promise<void> {
    await this.invoke('ExitSketch');
  }

  async getMassProperties(): Promise<MassProperties> {
    const r = await this.invoke('GetMassProperties');
    return {
      mass: r.mass,
      volume: r.volume,
      surfaceArea: r.surfaceArea,
      centerOfMass: { x: r.centerOfMassX, y: r.centerOfMassY, z: r.centerOfMassZ },
      density: r.density,
      momentsOfInertia: {
        Ixx: r.Ixx,
        Iyy: r.Iyy,
        Izz: r.Izz,
        Ixy: r.Ixy,
        Iyz: r.Iyz,
        Ixz: r.Ixz,
      },
    };
  }

  async exportFile(filePath: string, format: string): Promise<void> {
    await this.invoke('ExportFile', { filePath, format });
  }

  async getDimension(name: string): Promise<number> {
    const result = await this.invoke('GetDimension', { name });
    return result.value;
  }

  async setDimension(name: string, value: number): Promise<void> {
    await this.invoke('SetDimension', { name, value });
  }
}

/**
 * Factory function to create Edge.js adapter
 */
export async function createEdgeJsAdapter(): Promise<EdgeJsAdapter> {
  const adapter = new EdgeJsAdapter();
  await adapter.connect();
  return adapter;
}
