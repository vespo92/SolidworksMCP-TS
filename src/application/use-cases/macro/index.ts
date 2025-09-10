/**
 * Macro Use Cases
 * Business logic for SolidWorks macro operations
 */

import { z } from 'zod';
import { 
  ISolidWorksAdapter,
  ILogger
} from '../../../core/interfaces/core-abstractions.js';
import { Tool } from '../../services/tool-registry.js';

export class MacroUseCases {
  constructor(
    private swAdapter: ISolidWorksAdapter,
    private logger: ILogger
  ) {}

  getTools(): Tool[] {
    // Placeholder - will be implemented with actual macro tools
    return [];
  }
}