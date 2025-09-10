/**
 * Drawing Use Cases
 * Business logic for SolidWorks drawing operations
 */

import { z } from 'zod';
import { 
  ISolidWorksAdapter,
  ILogger
} from '../../../core/interfaces/core-abstractions.js';
import { Tool } from '../../services/tool-registry.js';

export class DrawingUseCases {
  constructor(
    private swAdapter: ISolidWorksAdapter,
    private logger: ILogger
  ) {}

  getTools(): Tool[] {
    // Placeholder - will be implemented with actual drawing tools
    return [];
  }
}