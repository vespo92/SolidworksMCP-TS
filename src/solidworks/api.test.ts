import { describe, expect, it, vi } from 'vitest';
import { SolidWorksAPI } from './api.js';

describe('SolidWorksAPI extrusion', () => {
  it('uses direct FeatureExtrusion3 and does not fall back to RunMacro2 when available', () => {
    const api = new SolidWorksAPI();
    const sketchFeature = {
      Name: 'Sketch1',
      GetName: () => 'Sketch1',
      GetTypeName2: () => 'ProfileFeature',
      Select2: vi.fn().mockReturnValue(true),
    };
    const extrusionFeature = {
      Name: 'Boss-ExtrudeDirect',
      GetName: () => 'Boss-ExtrudeDirect',
      GetTypeName2: () => 'BossExtrude',
    };
    const featureMgr = {
      FeatureExtrusion: vi.fn(() => {
        throw new Error('legacy FeatureExtrusion should not be used');
      }),
      FeatureExtrusion3: vi.fn(() => extrusionFeature),
    };
    const runMacro2 = vi.fn(() => {
      throw new Error('RunMacro2 should not be used');
    });

    (api as any).swApp = { RunMacro2: runMacro2 };
    (api as any).currentModel = {
      FeatureManager: featureMgr,
      SketchManager: { ActiveSketch: null },
      ClearSelection2: vi.fn(),
      GetFeatureCount: () => 1,
      FeatureByPositionReverse: () => sketchFeature,
      EditRebuild3: vi.fn(),
    };

    const result = api.createExtrude(50);

    expect(result.name).toBe('Boss-ExtrudeDirect');
    expect(featureMgr.FeatureExtrusion3).toHaveBeenCalledWith(
      true,
      false,
      false,
      0,
      0,
      0.05,
      0,
      false,
      false,
      false,
      false,
      0,
      0,
      false,
      false,
      false,
      false,
      true,
      false,
      true,
      0,
      0,
      false
    );
    expect(featureMgr.FeatureExtrusion).not.toHaveBeenCalled();
    expect(runMacro2).not.toHaveBeenCalled();
  });
});
