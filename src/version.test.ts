import { describe, it, expect } from 'vitest';
import { SolidWorksMCPServer } from './index.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

describe('Version Test', () => {
  it('should initialize with the correct version from package.json', () => {
    const server = new SolidWorksMCPServer({ registerResources: false });
    // @ts-ignore - Accessing private property for testing
    expect(server.server.info.version).toBe(packageJson.version);
  });
});
