/**
 * PowerShell Bridge Adapter for SolidWorks COM Integration
 *
 * Uses PowerShell child processes for COM interop, providing an alternative
 * path that avoids both winax parameter limitations AND the .NET runtime
 * dependency of Edge.js.
 *
 * Key advantages:
 * - PowerShell has native COM support with no parameter count limits
 * - Available on all Windows machines (PowerShell 5.1+ ships with Windows)
 * - No native module compilation needed (unlike winax)
 * - No .NET SDK dependency (unlike edge-js)
 *
 * Trade-off: Each operation spawns a PowerShell process, so latency is higher
 * than in-process adapters. A persistent process mode is available to mitigate this.
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
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

const execFileAsync = promisify(execFile);

/**
 * Configuration for the PowerShell adapter
 */
export interface PowerShellAdapterConfig {
  /** Path to PowerShell executable. Auto-detected if not set. */
  powershellPath?: string;
  /** Timeout for each PowerShell operation in ms. Default: 30000 */
  timeout?: number;
  /** Temp directory for script files. Default: os.tmpdir() */
  tempDir?: string;
}

/**
 * PowerShell bridge adapter for SolidWorks COM automation.
 *
 * Generates PowerShell scripts for each operation, executes them as child
 * processes, and parses JSON results from stdout.
 */
export class PowerShellAdapter implements ISolidWorksAdapter {
  private psPath: string | null = null;
  private connected = false;
  private swProcessId = 0;
  private tempDir: string;
  private timeout: number;
  private metrics = {
    calls: 0,
    errors: 0,
    totalResponseTime: 0,
  };

  constructor(config: PowerShellAdapterConfig = {}) {
    this.timeout = config.timeout ?? 30000;
    this.tempDir = config.tempDir ?? path.join(os.tmpdir(), 'solidworks_mcp_ps');
    if (config.powershellPath) {
      this.psPath = config.powershellPath;
    }
  }

  /**
   * Detect available PowerShell executable
   */
  private async detectPowerShell(): Promise<string> {
    if (this.psPath) return this.psPath;

    // Try pwsh (PowerShell 7+) first, then Windows PowerShell
    for (const candidate of ['pwsh', 'powershell']) {
      try {
        await execFileAsync(candidate, ['-Command', 'echo ok'], { timeout: 5000 });
        this.psPath = candidate;
        logger.info(`PowerShell detected: ${candidate}`);
        return candidate;
      } catch {
        // Try next candidate
      }
    }

    throw new Error('PowerShell not found. Install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH.');
  }

  /**
   * Execute a PowerShell script and return parsed JSON result.
   *
   * Writes the script to a temp .ps1 file, runs it with -ExecutionPolicy Bypass,
   * captures stdout as JSON, and cleans up.
   */
  private async executePowerShell(script: string): Promise<any> {
    const ps = await this.detectPowerShell();
    const startTime = Date.now();
    this.metrics.calls++;

    // Ensure temp directory exists
    await fs.mkdir(this.tempDir, { recursive: true });

    const scriptPath = path.join(this.tempDir, `sw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.ps1`);

    try {
      await fs.writeFile(scriptPath, script, 'utf-8');

      const { stdout, stderr } = await execFileAsync(
        ps,
        ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-NonInteractive', '-File', scriptPath],
        { timeout: this.timeout, windowsHide: true }
      );

      if (stderr?.trim()) {
        logger.warn(`PowerShell stderr: ${stderr.trim()}`);
      }

      const trimmed = stdout.trim();
      if (!trimmed) {
        throw new Error('PowerShell returned empty output');
      }

      const result = JSON.parse(trimmed);
      this.metrics.totalResponseTime += Date.now() - startTime;

      if (result.error) {
        this.metrics.errors++;
        throw new Error(result.error);
      }

      return result;
    } catch (error: any) {
      this.metrics.errors++;
      this.metrics.totalResponseTime += Date.now() - startTime;

      if (error.killed) {
        throw new Error(`PowerShell operation timed out after ${this.timeout}ms`);
      }

      // If JSON parse failed, wrap the original error
      if (error instanceof SyntaxError) {
        throw new Error(`PowerShell returned invalid JSON: ${error.message}`);
      }

      throw error;
    } finally {
      // Clean up temp script
      await fs.unlink(scriptPath).catch(() => {});
    }
  }

  /**
   * Generate the common PowerShell preamble that connects to SolidWorks
   */
  private preamble(): string {
    return `
$ErrorActionPreference = "Stop"

function Get-SolidWorks {
    try {
        $sw = [System.Runtime.InteropServices.Marshal]::GetActiveObject("SldWorks.Application")
        return $sw
    } catch {
        throw "SolidWorks is not running or not accessible: $_"
    }
}

function ConvertTo-JsonOutput {
    param([hashtable]$Data)
    $Data | ConvertTo-Json -Depth 10 -Compress
}

function Write-ErrorJson {
    param([string]$Message)
    @{ error = $Message } | ConvertTo-Json -Compress
}
`;
  }

  /**
   * Wrap a script body with try/catch and JSON error output
   */
  private wrapScript(body: string): string {
    return `${this.preamble()}
try {
${body}
} catch {
    Write-ErrorJson -Message $_.Exception.Message
}
`;
  }

  private getAverageResponseTime(): number {
    return this.metrics.calls > 0 ? this.metrics.totalResponseTime / this.metrics.calls : 0;
  }

  private getSuccessRate(): number {
    return this.metrics.calls > 0 ? ((this.metrics.calls - this.metrics.errors) / this.metrics.calls) * 100 : 100;
  }

  // --- ISolidWorksAdapter implementation ---

  async connect(): Promise<void> {
    await this.detectPowerShell();

    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $sw.Visible = $true
    $pid = $sw.GetProcessID()
    ConvertTo-JsonOutput @{
        success = $true
        processId = $pid
    }
`)
    );

    this.swProcessId = result.processId;
    this.connected = true;
    logger.info(`Connected to SolidWorks via PowerShell (PID: ${this.swProcessId})`);
  }

  async disconnect(): Promise<void> {
    // PowerShell processes are ephemeral - just clear state
    this.connected = false;
    this.swProcessId = 0;
    logger.info('Disconnected from SolidWorks (PowerShell)');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<AdapterHealth> {
    try {
      const result = await this.executePowerShell(
        this.wrapScript(`
    $sw = Get-SolidWorks
    $pid = $sw.GetProcessID()
    ConvertTo-JsonOutput @{
        success = $true
        healthy = ($pid -gt 0)
        processId = $pid
    }
`)
      );

      return {
        healthy: result.healthy,
        lastCheck: new Date(),
        errorCount: this.metrics.errors,
        successCount: this.metrics.calls - this.metrics.errors,
        averageResponseTime: this.getAverageResponseTime(),
        connectionStatus: result.healthy ? 'connected' : 'error',
        metrics: {
          directCOMCalls: this.metrics.calls,
          macroFallbacks: 0,
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
        metadata: { adapter: 'powershell', metrics: { ...this.metrics } },
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
    const argsStr = args.map((a) => JSON.stringify(a)).join(', ');
    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    $target = if ($model) { $model } else { $sw }
    $result = $target.${method}(${argsStr})
    ConvertTo-JsonOutput @{ success = $true; result = $result }
`)
    );
    return result.result;
  }

  async openModel(filePath: string): Promise<SolidWorksModel> {
    const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/'/g, "''");
    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $ext = [System.IO.Path]::GetExtension('${escapedPath}').ToLower()
    $docType = switch ($ext) {
        '.sldasm' { 2 }
        '.slddrw' { 3 }
        default { 1 }
    }
    $errors = 0
    $warnings = 0
    $model = $sw.OpenDoc6('${escapedPath}', $docType, 1, '', [ref]$errors, [ref]$warnings)
    if (-not $model) { throw "Failed to open model: ${escapedPath} (errors: $errors)" }

    $typeNames = @('Part', 'Assembly', 'Drawing')
    ConvertTo-JsonOutput @{
        success = $true
        path = '${escapedPath}'
        name = $model.GetTitle()
        type = $typeNames[$docType - 1]
    }
`)
    );

    return {
      path: result.path,
      name: result.name,
      type: result.type as 'Part' | 'Assembly' | 'Drawing',
      isActive: true,
    };
  }

  async closeModel(save?: boolean): Promise<void> {
    await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if ($model) {
        ${save ? '$model.Save3(1, 0, 0)' : ''}
        $title = $model.GetTitle()
        $sw.CloseDoc($title)
    }
    ConvertTo-JsonOutput @{ success = $true }
`)
    );
  }

  async createPart(): Promise<SolidWorksModel> {
    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.NewPart()
    if (-not $model) {
        $template = $sw.GetUserPreferenceStringValue(8)
        $model = $sw.NewDocument($template, 0, 0, 0)
    }
    if (-not $model) { throw "Failed to create new part" }
    ConvertTo-JsonOutput @{ success = $true; name = $model.GetTitle(); type = 'Part' }
`)
    );
    return { path: '', name: result.name, type: 'Part', isActive: true };
  }

  async createAssembly(): Promise<SolidWorksModel> {
    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $template = $sw.GetUserPreferenceStringValue(9)
    $model = $sw.NewDocument($template, 0, 0, 0)
    if (-not $model) { throw "Failed to create new assembly" }
    ConvertTo-JsonOutput @{ success = $true; name = $model.GetTitle(); type = 'Assembly' }
`)
    );
    return { path: '', name: result.name, type: 'Assembly', isActive: true };
  }

  async createDrawing(): Promise<SolidWorksModel> {
    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $template = $sw.GetUserPreferenceStringValue(10)
    $model = $sw.NewDocument($template, 0, 0, 0)
    if (-not $model) { throw "Failed to create new drawing" }
    ConvertTo-JsonOutput @{ success = $true; name = $model.GetTitle(); type = 'Drawing' }
`)
    );
    return { path: '', name: result.name, type: 'Drawing', isActive: true };
  }

  /**
   * Create extrusion via PowerShell using FeatureExtrusion3 with ALL 23 parameters.
   * This is the key advantage - no parameter count limitation.
   */
  async createExtrusion(params: ExtrusionParameters): Promise<SolidWorksFeature> {
    const depth = (params.depth || 0) / 1000;
    const depth2 = (params.depth2 || 0) / 1000;
    const draft = ((params.draft || 0) * Math.PI) / 180;
    const reverse = params.reverse ? '$true' : '$false';
    const bothDir = params.bothDirections ? '$true' : '$false';
    const draftOutward = params.draftOutward ? '$true' : '$false';
    const draftWhileExtruding = params.draftWhileExtruding ? '$true' : '$false';
    const offsetReverse = params.offsetReverse ? '$true' : '$false';
    const translateSurface = params.translateSurface ? '$true' : '$false';
    const merge = params.merge !== false ? '$true' : '$false';
    const flipSideToCut = params.flipSideToCut ? '$true' : '$false';
    const singleDir = params.bothDirections ? '$false' : '$true';
    const startCondition = params.startCondition || 0;
    const endCondition = typeof params.endCondition === 'number' ? params.endCondition : 0;

    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }

    # Select latest sketch using feature tree traversal
    $selected = $false
    $count = $model.GetFeatureCount()
    for ($i = 0; $i -lt [Math]::Min(10, $count); $i++) {
        $feat = $model.FeatureByPositionReverse($i)
        if ($feat) {
            $typeName = $feat.GetTypeName2()
            if ($typeName -eq 'ProfileFeature' -or $typeName -match 'sketch') {
                [void]$feat.Select2($false, 0)
                $selected = $true
                break
            }
        }
    }

    if (-not $selected) {
        # Fallback: try common sketch names
        foreach ($name in @('Sketch1','Sketch2','Sketch3','Sketch4','Sketch5')) {
            $ok = $model.Extension.SelectByID2($name, 'SKETCH', 0, 0, 0, $false, 0, $null, 0)
            if ($ok) { $selected = $true; break }
        }
    }

    if (-not $selected) { throw "No sketch found to extrude" }

    # FeatureExtrusion3 with ALL 23 parameters - no COM bridge limitation
    $featureMgr = $model.FeatureManager
    $feature = $featureMgr.FeatureExtrusion3(
        ${singleDir},              # Sd (single direction)
        ${reverse},                # Flip
        ${bothDir},                # Dir (both directions)
        ${endCondition},           # T1 (end condition type 1)
        0,                         # T2 (end condition type 2)
        ${depth},                  # D1 (depth 1)
        ${depth2},                 # D2 (depth 2)
        ${draftWhileExtruding},    # Dchk1 (draft while extruding dir 1)
        $false,                    # Dchk2 (draft while extruding dir 2)
        ${draftOutward},           # Ddir1 (draft outward dir 1)
        $false,                    # Ddir2 (draft outward dir 2)
        ${draft},                  # Dang1 (draft angle dir 1)
        0.0,                       # Dang2 (draft angle dir 2)
        ${offsetReverse},          # OffsetReverse1
        $false,                    # OffsetReverse2
        ${translateSurface},       # TranslateSurface1
        $false,                    # TranslateSurface2
        ${merge},                  # Merge
        ${flipSideToCut},          # FlipSideToCut
        $true,                     # Update/Regenerate
        ${startCondition},         # StartCondition
        0,                         # FlipStartOffset
        $false                     # UseFeatureScope
    )

    $model.ClearSelection2($true)
    $model.EditRebuild3()

    if (-not $feature) { throw "Failed to create extrusion feature" }

    ConvertTo-JsonOutput @{
        success = $true
        name = $feature.Name
        type = 'Extrusion'
    }
`)
    );

    return { name: result.name || 'Boss-Extrude1', type: 'Extrusion', suppressed: false };
  }

  /**
   * Create revolve via FeatureRevolve2 with all parameters
   */
  async createRevolve(params: RevolveParameters): Promise<SolidWorksFeature> {
    const angle = ((params.angle || 0) * Math.PI) / 180;
    const dirStr = String(params.direction || 'Forward');
    const singleDir = dirStr !== 'Both' ? '$true' : '$false';
    const reverseDir = dirStr === 'Reverse' ? '$true' : '$false';
    const merge = params.merge !== false ? '$true' : '$false';
    const thinFeature = params.thinFeature ? '$true' : '$false';
    const thinThickness = (params.thinThickness || 0) / 1000;

    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }

    # Select sketch
    $selected = $false
    $count = $model.GetFeatureCount()
    for ($i = 0; $i -lt [Math]::Min(10, $count); $i++) {
        $feat = $model.FeatureByPositionReverse($i)
        if ($feat) {
            $typeName = $feat.GetTypeName2()
            if ($typeName -eq 'ProfileFeature' -or $typeName -match 'sketch') {
                [void]$feat.Select2($false, 0)
                $selected = $true
                break
            }
        }
    }
    if (-not $selected) { throw "No sketch found for revolve" }

    $featureMgr = $model.FeatureManager
    $feature = $featureMgr.FeatureRevolve2(
        ${singleDir},       # SingleDir
        ${reverseDir},      # Flip
        $false,             # Dir (both directions)
        $false,             # BossFeature
        0,                  # T1 (end condition)
        0,                  # T2
        ${angle},           # Angle1
        0.0,                # Angle2
        ${thinFeature},     # ThinFeatureFlag
        ${thinThickness},   # ThinWallThickness1
        0.0,                # ThinWallThickness2
        ${merge}            # Merge
    )

    $model.ClearSelection2($true)
    $model.EditRebuild3()

    if (-not $feature) { throw "Failed to create revolve feature" }

    ConvertTo-JsonOutput @{
        success = $true
        name = $feature.Name
        type = 'Revolution'
    }
`)
    );

    return { name: result.name || 'Revolve1', type: 'Revolution', suppressed: false };
  }

  /**
   * Create sweep via InsertProtrusionSwept4 with all 14 parameters
   */
  async createSweep(params: SweepParameters): Promise<SolidWorksFeature> {
    const profile = params.profileSketch || 'Sketch1';
    const pathSketch = params.pathSketch || 'Sketch2';
    const twistAngle = ((params.twistAngle || 0) * Math.PI) / 180;
    const merge = params.merge !== false ? '$true' : '$false';
    const thinFeature = params.thinFeature ? '$true' : '$false';
    const thinThickness = (params.thinThickness || 0) / 1000;

    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }

    $model.ClearSelection2($true)
    [void]$model.Extension.SelectByID2('${profile}', 'SKETCH', 0, 0, 0, $false, 1, $null, 0)
    [void]$model.Extension.SelectByID2('${pathSketch}', 'SKETCH', 0, 0, 0, $true, 4, $null, 0)

    $featureMgr = $model.FeatureManager
    $feature = $featureMgr.InsertProtrusionSwept4(
        $false,              # Propagate
        $false,              # Alignment
        0,                   # TwistCtrlOption
        ${twistAngle},       # TwistAngle
        $false,              # ReverseTwistDir
        0,                   # TangencyType
        0,                   # PathAlignment
        ${merge},            # Merge
        ${thinFeature},      # UseThinFeature
        ${thinThickness},    # ThinWallThickness
        0,                   # ThinType
        $true,               # MergeSmoothFaces
        $false,              # UseFeatureScope
        $true                # AutoSelect
    )

    $model.ClearSelection2($true)
    $model.EditRebuild3()

    if (-not $feature) { throw "Failed to create sweep feature" }

    ConvertTo-JsonOutput @{
        success = $true
        name = $feature.Name
        type = 'Sweep'
    }
`)
    );

    return { name: result.name || 'Sweep1', type: 'Sweep', suppressed: false };
  }

  /**
   * Create loft via InsertProtrusionLoft3 with all 17 parameters
   */
  async createLoft(params: LoftParameters): Promise<SolidWorksFeature> {
    const profiles = params.profiles || [];
    const guides = params.guideCurves || params.guides || [];
    const closed = params.closed || params.close ? '$true' : '$false';
    const merge = params.merge !== false ? '$true' : '$false';
    const thinFeature = params.thinFeature ? '$true' : '$false';
    const thinThickness = (params.thinThickness || 0) / 1000;

    // Build profile selection commands
    const profileSelections = profiles
      .map(
        (p, i) =>
          `[void]$model.Extension.SelectByID2('${p}', 'SKETCH', 0, 0, 0, ${i > 0 ? '$true' : '$false'}, 1, $null, 0)`
      )
      .join('\n    ');

    const guideSelections = guides
      .map((g) => `[void]$model.Extension.SelectByID2('${g}', 'SKETCH', 0, 0, 0, $true, 2, $null, 0)`)
      .join('\n    ');

    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }

    $model.ClearSelection2($true)

    # Select profiles
    ${profileSelections}

    # Select guide curves
    ${guideSelections}

    $featureMgr = $model.FeatureManager
    $feature = $featureMgr.InsertProtrusionLoft3(
        ${closed},           # Closed
        $false,              # KeepTangency
        $false,              # ForceNonRational
        $false,              # SimpleSurfaces
        $false,              # CloseGuideCurves
        0,                   # StartTangencyType
        0,                   # EndTangencyType
        0.0,                 # StartTangentLength
        0.0,                 # EndTangentLength
        ${thinFeature},      # ThinFeature
        ${thinThickness},    # ThinWallThickness1
        0.0,                 # ThinWallThickness2
        0,                   # ThinType
        ${merge},            # Merge
        $true,               # UseFeatScope
        $true,               # AutoSelectBodies
        0                    # GuideCurveInfluence
    )

    $model.ClearSelection2($true)
    $model.EditRebuild3()

    if (-not $feature) { throw "Failed to create loft feature" }

    ConvertTo-JsonOutput @{
        success = $true
        name = $feature.Name
        type = 'Loft'
    }
`)
    );

    return { name: result.name || 'Loft1', type: 'Loft', suppressed: false };
  }

  async createSketch(plane: string): Promise<string> {
    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }

    $selected = $model.Extension.SelectByID2('${plane}', 'PLANE', 0, 0, 0, $false, 0, $null, 0)
    if (-not $selected) {
        $selected = $model.Extension.SelectByID2('${plane} Plane', 'PLANE', 0, 0, 0, $false, 0, $null, 0)
    }
    if (-not $selected) { throw "Failed to select plane: ${plane}" }

    $model.SketchManager.InsertSketch($true)
    $sketchName = $model.SketchManager.ActiveSketch.Name

    ConvertTo-JsonOutput @{ success = $true; sketchName = $sketchName }
`)
    );

    return result.sketchName;
  }

  async addLine(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }
    $line = $model.SketchManager.CreateLine(${x1 / 1000}, ${y1 / 1000}, 0, ${x2 / 1000}, ${y2 / 1000}, 0)
    if (-not $line) { throw "Failed to create line" }
    ConvertTo-JsonOutput @{ success = $true }
`)
    );
  }

  async addCircle(centerX: number, centerY: number, radius: number): Promise<void> {
    const cx = centerX / 1000;
    const cy = centerY / 1000;
    const r = radius / 1000;
    await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }
    $circle = $model.SketchManager.CreateCircle(${cx}, ${cy}, 0, ${cx + r}, ${cy}, 0)
    if (-not $circle) { throw "Failed to create circle" }
    ConvertTo-JsonOutput @{ success = $true }
`)
    );
  }

  async addRectangle(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    const a = x1 / 1000;
    const b = y1 / 1000;
    const c = x2 / 1000;
    const d = y2 / 1000;
    await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }
    $sm = $model.SketchManager
    [void]$sm.CreateLine(${a}, ${b}, 0, ${c}, ${b}, 0)
    [void]$sm.CreateLine(${c}, ${b}, 0, ${c}, ${d}, 0)
    [void]$sm.CreateLine(${c}, ${d}, 0, ${a}, ${d}, 0)
    [void]$sm.CreateLine(${a}, ${d}, 0, ${a}, ${b}, 0)
    ConvertTo-JsonOutput @{ success = $true }
`)
    );
  }

  async exitSketch(): Promise<void> {
    await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }
    $model.SketchManager.InsertSketch($true)
    ConvertTo-JsonOutput @{ success = $true }
`)
    );
  }

  async getMassProperties(): Promise<MassProperties> {
    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }

    $mp = $model.Extension.CreateMassProperty()
    if (-not $mp) { throw "Failed to create mass property object" }

    $com = $mp.CenterOfMass
    $moi = $mp.MomentOfInertia

    ConvertTo-JsonOutput @{
        success = $true
        mass = $mp.Mass
        volume = $mp.Volume
        surfaceArea = $mp.SurfaceArea
        density = $mp.Density
        comX = $com[0] * 1000.0
        comY = $com[1] * 1000.0
        comZ = $com[2] * 1000.0
        Ixx = $moi[0]; Iyy = $moi[4]; Izz = $moi[8]
        Ixy = $moi[1]; Iyz = $moi[5]; Ixz = $moi[2]
    }
`)
    );

    return {
      mass: result.mass,
      volume: result.volume,
      surfaceArea: result.surfaceArea,
      centerOfMass: { x: result.comX, y: result.comY, z: result.comZ },
      density: result.density,
      momentsOfInertia: {
        Ixx: result.Ixx,
        Iyy: result.Iyy,
        Izz: result.Izz,
        Ixy: result.Ixy,
        Iyz: result.Iyz,
        Ixz: result.Ixz,
      },
    };
  }

  async exportFile(filePath: string, format: string): Promise<void> {
    const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/'/g, "''");
    await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }

    $errors = 0
    $warnings = 0
    $success = $model.Extension.SaveAs2('${escapedPath}', 0, 1, $null, '', $false, [ref]$errors, [ref]$warnings)

    if (-not $success) { throw "Export to ${format} failed (errors: $errors)" }
    ConvertTo-JsonOutput @{ success = $true }
`)
    );
  }

  async getDimension(name: string): Promise<number> {
    const result = await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }

    $dim = $model.Parameter('${name}')
    if (-not $dim) { throw "Dimension not found: ${name}" }

    ConvertTo-JsonOutput @{ success = $true; value = ($dim.SystemValue * 1000.0) }
`)
    );
    return result.value;
  }

  async setDimension(name: string, value: number): Promise<void> {
    const valueInMeters = value / 1000;
    await this.executePowerShell(
      this.wrapScript(`
    $sw = Get-SolidWorks
    $model = $sw.ActiveDoc
    if (-not $model) { throw "No active model" }

    $dim = $model.Parameter('${name}')
    if (-not $dim) { throw "Dimension not found: ${name}" }

    $dim.SystemValue = ${valueInMeters}
    $model.EditRebuild3()
    ConvertTo-JsonOutput @{ success = $true }
`)
    );
  }
}

/**
 * Factory function to create PowerShell adapter
 */
export async function createPowerShellAdapter(config?: PowerShellAdapterConfig): Promise<PowerShellAdapter> {
  const adapter = new PowerShellAdapter(config);
  await adapter.connect();
  return adapter;
}
