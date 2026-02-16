/**
 * COM Interop Helper Functions
 *
 * Provides workarounds for common winax COM bridge issues,
 * particularly the "DispInvoke: SelectByID2 Type mismatch" error.
 *
 * Root cause: The winax COM bridge can misinterpret JavaScript types
 * when marshalling to COM VARIANT types:
 *   - JavaScript `null` may not translate to COM `Nothing` (VT_EMPTY)
 *   - JavaScript integer `0` may be sent as VT_I4 instead of VT_R8 (Double)
 *   - JavaScript `false` may not properly map to VARIANT_BOOL
 *
 * These helpers ensure parameters are typed correctly for COM dispatch.
 */

import { logger } from './logger.js';

/**
 * Safe wrapper around Extension.SelectByID2 that handles COM type mismatches.
 *
 * Tries multiple parameter marshalling strategies:
 * 1. Standard call with explicit floating-point coordinates
 * 2. Fallback with undefined instead of null for Callout
 * 3. Fallback using feature tree selection (FeatureByName + Select2)
 *
 * @param model - The SolidWorks model document COM object
 * @param name - Entity name (e.g., "Sketch1", "Front Plane")
 * @param type - Entity type (e.g., "SKETCH", "PLANE", "SKETCHSEGMENT", "EDGE", "FACE")
 * @param x - X coordinate in meters (use 0.0 for name-based selection)
 * @param y - Y coordinate in meters
 * @param z - Z coordinate in meters
 * @param append - True to add to selection, false to replace
 * @param mark - Selection mark (0 for default, 1+ for specific marks)
 * @param callout - Callout object (usually null/Nothing)
 * @param selectOption - Selection options flag (usually 0)
 * @returns true if selection succeeded
 */
export function safeSelectByID2(
  model: any,
  name: string,
  type: string,
  x: number = 0,
  y: number = 0,
  z: number = 0,
  append: boolean = false,
  mark: number = 0,
  callout: any = null,
  selectOption: number = 0
): boolean {
  if (!model) return false;

  const ext = getExtension(model);
  if (!ext) return false;

  // Ensure coordinates are floating-point (VT_R8) not integer (VT_I4)
  const dx = Number(x) + 0.0;
  const dy = Number(y) + 0.0;
  const dz = Number(z) + 0.0;

  // Strategy 1: Standard call with explicit doubles and undefined for callout
  // Using undefined instead of null avoids VT_NULL being sent; winax typically
  // converts undefined to VT_EMPTY which maps to COM Nothing
  try {
    const result = ext.SelectByID2(
      String(name),
      String(type),
      dx, dy, dz,
      Boolean(append),
      Math.round(mark),
      undefined,
      Math.round(selectOption)
    );
    if (result) return true;
  } catch (e1) {
    // Strategy 1 failed, try alternatives
    logger.debug(`SelectByID2 strategy 1 failed for "${name}": ${e1}`);
  }

  // Strategy 2: Try with null callout (some winax versions handle this)
  try {
    const result = ext.SelectByID2(
      String(name),
      String(type),
      dx, dy, dz,
      Boolean(append),
      Math.round(mark),
      null,
      Math.round(selectOption)
    );
    if (result) return true;
  } catch (e2) {
    logger.debug(`SelectByID2 strategy 2 failed for "${name}": ${e2}`);
  }

  // Strategy 3: Try with empty string callout
  try {
    const result = ext.SelectByID2(
      String(name),
      String(type),
      dx, dy, dz,
      Boolean(append),
      Math.round(mark),
      '',
      Math.round(selectOption)
    );
    if (result) return true;
  } catch (e3) {
    logger.debug(`SelectByID2 strategy 3 failed for "${name}": ${e3}`);
  }

  // Strategy 4: For SKETCH and PLANE types, try FeatureByName + Select2
  if (type === 'SKETCH' || type === 'PLANE') {
    try {
      const feature = model.FeatureByName(name);
      if (feature) {
        const selected = feature.Select2(Boolean(append), Math.round(mark));
        if (selected) {
          logger.debug(`SelectByID2 fallback via FeatureByName succeeded for "${name}"`);
          return true;
        }
      }
    } catch (e4) {
      logger.debug(`SelectByID2 FeatureByName fallback failed for "${name}": ${e4}`);
    }
  }

  return false;
}

/**
 * Safely get the Extension object from a model, handling COM errors.
 */
export function getExtension(model: any): any {
  if (!model) return null;
  try {
    return model.Extension;
  } catch (e) {
    logger.debug(`Failed to get Extension: ${e}`);
    return null;
  }
}

/**
 * Select a sketch by name for feature creation (extrusion, revolve, etc.)
 *
 * Tries multiple strategies:
 * 1. Select by explicit sketch name if provided
 * 2. Try standard names (Sketch1..Sketch10)
 * 3. Walk feature tree backwards to find latest sketch
 *
 * @param model - The SolidWorks model document COM object
 * @param sketchName - Optional explicit sketch name. If not provided, searches automatically.
 * @returns Object with success flag, selected sketch name, and any errors encountered
 */
export function selectSketchForFeature(
  model: any,
  sketchName?: string
): { success: boolean; selectedSketch?: string; errors: string[] } {
  if (!model) return { success: false, errors: ['No model provided'] };

  const errors: string[] = [];

  // Exit sketch edit mode if active
  try {
    const sketchMgr = model.SketchManager;
    if (sketchMgr) {
      const activeSketch = sketchMgr.ActiveSketch;
      if (activeSketch) {
        sketchMgr.InsertSketch(true);
      }
    }
  } catch (e) {
    // Not in sketch mode, continue
  }

  // Clear selections
  try {
    model.ClearSelection2(true);
  } catch (e) {
    // Continue
  }

  // Strategy 1: If an explicit sketch name was given, try that first
  if (sketchName) {
    try {
      if (safeSelectByID2(model, sketchName, 'SKETCH')) {
        return { success: true, selectedSketch: sketchName, errors };
      }
    } catch (e) {
      errors.push(`${sketchName}: ${e}`);
    }
  }

  // Strategy 2: Try standard sketch names (Sketch1 through Sketch10)
  for (let i = 1; i <= 10; i++) {
    const name = `Sketch${i}`;
    if (name === sketchName) continue; // Already tried
    try {
      if (safeSelectByID2(model, name, 'SKETCH')) {
        return { success: true, selectedSketch: name, errors };
      }
    } catch (e) {
      errors.push(`${name}: ${e}`);
    }
  }

  // Strategy 3: Walk feature tree backwards to find the latest sketch
  try {
    const featureCount = model.GetFeatureCount();
    if (featureCount > 0) {
      const limit = Math.min(20, featureCount);
      for (let i = 0; i < limit; i++) {
        try {
          const feat = model.FeatureByPositionReverse(i);
          if (feat) {
            const typeName = feat.GetTypeName2();
            if (typeName && (
              typeName === 'ProfileFeature' ||
              typeName === '3DProfileFeature' ||
              typeName.toLowerCase().includes('sketch')
            )) {
              try {
                feat.Select2(false, 0);
                const featName = feat.Name || `SketchFeature@${i}`;
                logger.info(`Selected sketch by feature tree position: ${featName}`);
                return { success: true, selectedSketch: featName, errors };
              } catch (selectErr) {
                errors.push(`FeatureByPosition(${i}): ${selectErr}`);
              }
            }
          }
        } catch (e) {
          // Continue to next feature
        }
      }
    }
  } catch (e) {
    errors.push(`Feature tree walk: ${e}`);
  }

  return { success: false, errors };
}

/**
 * Safely select a plane by name for sketch creation.
 *
 * @param model - The SolidWorks model document COM object
 * @param planeName - Plane name: "Front", "Top", "Right", or full names like "Front Plane"
 * @returns true if selection succeeded
 */
export function selectPlane(model: any, planeName: string): boolean {
  if (!model) return false;

  // Normalize plane name
  const planeMap: Record<string, string[]> = {
    'front': ['Front Plane', 'Plan de face', 'Vorderseite', 'Plano Frontal'],
    'top': ['Top Plane', 'Plan de dessus', 'Draufsicht', 'Plano Superior'],
    'right': ['Right Plane', 'Plan de droite', 'Rechte Seite', 'Plano Derecho'],
  };

  const normalized = planeName.toLowerCase().replace(' plane', '');
  const candidates = planeMap[normalized] || [planeName];

  // If the full name was provided, add it to candidates
  if (!candidates.includes(planeName)) {
    candidates.unshift(planeName);
  }

  for (const name of candidates) {
    // Try SelectByID2 with type "PLANE"
    if (safeSelectByID2(model, name, 'PLANE')) {
      return true;
    }
    // Also try with "DATUMPLANE" type
    if (safeSelectByID2(model, name, 'DATUMPLANE')) {
      return true;
    }
  }

  // Fallback: try FeatureByName
  for (const name of candidates) {
    try {
      const feature = model.FeatureByName(name);
      if (feature) {
        feature.Select2(false, 0);
        return true;
      }
    } catch (e) {
      // Continue
    }
  }

  return false;
}
