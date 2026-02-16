// Alternative approach: Create a helper module that uses simpler API calls
import { z } from 'zod';
import { SolidWorksAPI } from '../solidworks/api.js';
import { selectSketchForFeature } from '../utils/com-helpers.js';

export const extrusionHelper = {
  name: 'simple_extrude',
  description: 'Simplified extrusion helper that creates a boss-extrude from the most recent sketch',
  inputSchema: z.object({
    depth: z.number().describe('Extrusion depth in mm'),
    sketchName: z.string().optional().describe('Specific sketch name to extrude (e.g., "Sketch1"). Auto-detects if not specified.'),
  }),
  handler: (args: any, swApi: SolidWorksAPI) => {
    try {
      const model = swApi.getCurrentModel();
      if (!model) throw new Error('No active model');

      // Use the safe sketch selection helper
      const sketchResult = selectSketchForFeature(model, args.sketchName);

      if (!sketchResult.success) {
        const errorDetail = sketchResult.errors.length > 0
          ? ` Errors: ${sketchResult.errors.join('; ')}`
          : '';
        throw new Error(`Could not find sketch to extrude.${errorDetail}`);
      }

      // Use the main API's extrude method which handles COM parameter fallbacks
      const feature = swApi.createExtrude(args.depth, 0, false, sketchResult.selectedSketch);
      return `Extrusion created: ${feature.name} (from ${sketchResult.selectedSketch})`;
    } catch (error) {
      return `Helper failed: ${error}`;
    }
  },
};
