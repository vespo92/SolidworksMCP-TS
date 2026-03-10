/**
 * COM Interop Helpers for SolidWorks
 * Provides safe handling of COM-specific types and null values
 */

// @ts-ignore
import winax from 'winax';

/**
 * Returns a COM-safe Nothing/Empty value for use as the Callout parameter
 * in SelectByID2 and similar COM methods.
 *
 * JavaScript `null` causes a type mismatch in SolidWorks COM interop.
 * This function returns VT_EMPTY via winax.Variant, which correctly
 * maps to COM Nothing.
 */
export function comNothing(): any {
  try {
    // VT_EMPTY — maps to COM Nothing for the Callout parameter
    return new winax.Variant(0, 'cycEmpty' as any);
  } catch {
    return undefined; // fallback for environments where Variant isn't available
  }
}

/**
 * Wraps Extension.SelectByID2 with the correct COM Nothing for the Callout parameter.
 *
 * @param model - The SolidWorks ModelDoc2 COM object
 * @param name - Entity name (e.g., "Sketch1", "Front Plane")
 * @param type - Entity type string (e.g., "SKETCH", "PLANE", "SKETCHSEGMENT")
 * @param x - X coordinate (usually 0 when selecting by name)
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @param append - Whether to append to existing selection
 * @param mark - Selection mark value
 * @param selectOption - Selection option flags (default 0)
 * @returns true if the entity was selected successfully
 */
export function selectByID2(
  model: any,
  name: string,
  type: string,
  x: number = 0,
  y: number = 0,
  z: number = 0,
  append: boolean = false,
  mark: number = 0,
  selectOption: number = 0
): boolean {
  const ext = model.Extension;
  if (!ext) {
    throw new Error('Cannot access model Extension for selection');
  }
  return ext.SelectByID2(name, type, x, y, z, append, mark, comNothing(), selectOption);
}
