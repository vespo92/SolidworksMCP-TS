# Testing Guide

This guide explains how to test the SolidWorks MCP Server in different scenarios - with and without SolidWorks installed.

## Table of Contents

- [Quick Start](#quick-start)
- [Testing Without SolidWorks](#testing-without-solidworks)
- [Testing With SolidWorks](#testing-with-solidworks)
- [CI/CD Testing](#cicd-testing)
- [Version Testing](#version-testing)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- Node.js 20.x or higher
- npm or yarn

### Install Dependencies

```bash
npm install
```

### Run Unit Tests (No SolidWorks Required)

```bash
# Run all tests with mocks
USE_MOCK_SOLIDWORKS=true npm test

# Run in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

---

## Testing Without SolidWorks

Perfect for CI/CD, development, and contributors who don't have SolidWorks installed.

### Environment Setup

Create a `.env` file:

```env
USE_MOCK_SOLIDWORKS=true
SOLIDWORKS_VERSION=2024
MOCK_SIMULATE_ERRORS=false
```

### Running Tests

```bash
# All unit tests
npm test

# Specific test file
npm test -- solidworks-config.test.ts

# With coverage
npm run test:coverage
```

### Mock Adapter

The mock adapter simulates SolidWorks behavior:

```typescript
import { createMockSolidWorksAdapter } from './src/adapters/mock-solidworks-adapter.js';

// Create mock for SolidWorks 2024
const mock = createMockSolidWorksAdapter({ version: '2024' });

// Get mock application
const app = mock.getApplication();

// Use like real SolidWorks API
const version = app.RevisionNumber(); // Returns "2024 SP5.0"
```

### Testing Different Scenarios

```typescript
// Test error handling
const mockWithErrors = createMockSolidWorksAdapter({
  version: '2024',
  simulateErrors: true
});

// Test failure scenarios
const mockWithFailures = createMockSolidWorksAdapter({
  failOperations: true
});

// Test async behavior
const mockWithDelay = createMockSolidWorksAdapter({
  delayMs: 100
});
```

---

## Testing With SolidWorks

For integration testing with real SolidWorks installation.

### Prerequisites

- Windows OS
- SolidWorks 2019-2025 installed
- SolidWorks license active

### Environment Setup

Create a `.env` file:

```env
USE_MOCK_SOLIDWORKS=false
SOLIDWORKS_VERSION=2024  # Your installed version
LOG_LEVEL=debug
```

### Running Integration Tests

```bash
# Run integration tests
npm run test:integration

# With specific version
SOLIDWORKS_VERSION=2023 npm run test:integration
```

### Manual Testing

1. Start the MCP server:
   ```bash
   npm run dev
   ```

2. Test individual tools via MCP client

3. Check logs for detailed information:
   ```bash
   tail -f logs/solidworks-mcp.log
   ```

---

## CI/CD Testing

### GitHub Actions

The project includes GitHub Actions workflows for automated testing.

#### Main CI Workflow

Tests against multiple SolidWorks versions using mocks:

```yaml
# Runs on: push, pull_request
# Tests: SW 2021, 2022, 2023, 2024, 2025
# Uses: Mock adapters (no SolidWorks required)
```

#### Integration Tests Workflow

For testing with real SolidWorks (requires self-hosted runner):

```yaml
# Trigger: Manual or scheduled
# Requires: Windows runner with SolidWorks installed
# Runner labels: [self-hosted, windows, solidworks]
```

### Setting Up Self-Hosted Runner

For integration tests with real SolidWorks:

1. Set up Windows machine with SolidWorks
2. Install GitHub Actions runner
3. Add labels: `windows`, `solidworks`
4. Configure runner to run as service

```powershell
# Install runner
./config.cmd --url https://github.com/your-org/repo --token YOUR_TOKEN --labels windows,solidworks

# Run as service
./svc.cmd install
./svc.cmd start
```

---

## Version Testing

### Testing Multiple SolidWorks Versions

The project supports SolidWorks 2019-2025. Test against different versions:

```bash
# Test SW 2021
SOLIDWORKS_VERSION=2021 npm test

# Test SW 2023
SOLIDWORKS_VERSION=2023 npm test

# Test SW 2025
SOLIDWORKS_VERSION=2025 npm test
```

### Version Compatibility Matrix

| Version | Mock Support | Integration Tests | Status |
|---------|--------------|-------------------|--------|
| 2019    | ✅ Full      | ⚠️ Manual         | Supported |
| 2020    | ✅ Full      | ⚠️ Manual         | Supported |
| 2021    | ✅ Full      | ✅ Automated      | Supported |
| 2022    | ✅ Full      | ✅ Automated      | Supported |
| 2023    | ✅ Full      | ✅ Automated      | Supported |
| 2024    | ✅ Full      | ✅ Automated      | Primary   |
| 2025    | ✅ Full      | ✅ Automated      | Supported |

### Version-Specific Testing

```typescript
// Test version detection
import { SolidWorksConfig } from './src/utils/solidworks-config.js';
import { createMockSolidWorksAdapter } from './src/adapters/mock-solidworks-adapter.js';

const mock = createMockSolidWorksAdapter({ version: '2023' });
const app = mock.getApplication();

const version = SolidWorksConfig.getVersion(app);
console.log(version);
// { year: '2023', majorVersion: 2023, revisionNumber: '2023 SP5.0' }
```

---

## Test Organization

### Test Types

1. **Unit Tests** (`*.test.ts`)
   - No SolidWorks required
   - Fast execution
   - High coverage
   - Run in CI

2. **Integration Tests** (`*.integration.test.ts`)
   - Requires SolidWorks
   - Slower execution
   - End-to-end validation
   - Manual or self-hosted runner

3. **E2E Tests** (`*.e2e.test.ts`)
   - Full workflow testing
   - Requires SolidWorks
   - Real document creation
   - Manual execution

### Test Structure

```
src/
├── utils/
│   ├── __tests__/
│   │   ├── solidworks-config.test.ts    # Unit tests
│   │   ├── environment.test.ts           # Unit tests
│   │   └── *.integration.test.ts         # Integration tests
│   ├── solidworks-config.ts
│   └── environment.ts
├── adapters/
│   ├── __tests__/
│   │   └── mock-solidworks-adapter.test.ts
│   ├── mock-solidworks-adapter.ts
│   └── macro-generator.ts
└── tools/
    ├── __tests__/
    │   ├── drawing.test.ts               # Unit tests with mocks
    │   └── drawing.integration.test.ts   # Integration tests
    └── drawing.ts
```

---

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { SolidWorksConfig } from '../solidworks-config.js';
import { createMockSolidWorksAdapter } from '../../adapters/mock-solidworks-adapter.js';

describe('SolidWorksConfig', () => {
  it('should detect version correctly', () => {
    const mock = createMockSolidWorksAdapter({ version: '2024' });
    const app = mock.getApplication();

    const version = SolidWorksConfig.getVersion(app);

    expect(version?.year).toBe('2024');
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { SolidWorksAPI } from '../solidworks/api.js';

describe.skipIf(process.env.USE_MOCK_SOLIDWORKS === 'true')('SolidWorks Integration', () => {
  let api: SolidWorksAPI;

  beforeAll(() => {
    api = new SolidWorksAPI();
    api.connect();
  });

  it('should create part document', () => {
    const model = api.createPart();
    expect(model.type).toBe('Part');
  });
});
```

---

## Troubleshooting

### Tests Fail with "SolidWorks not found"

**Solution:** Set `USE_MOCK_SOLIDWORKS=true`:

```bash
USE_MOCK_SOLIDWORKS=true npm test
```

### Mock adapter behaves differently than real SolidWorks

**Solution:** Report the issue with:
- Expected behavior
- Actual behavior
- SolidWorks version
- Test case

### Integration tests timeout

**Solution:**
1. Increase timeout in test file:
   ```typescript
   it('long running test', { timeout: 60000 }, async () => {
     // test code
   });
   ```

2. Check SolidWorks is running and licensed

3. Enable debug logging:
   ```bash
   LOG_LEVEL=debug npm run test:integration
   ```

### CI tests pass but integration tests fail

This is expected! Differences between mock and real SolidWorks:

1. **Mock** simulates behavior - perfect for unit tests
2. **Real SW** has actual COM interface quirks
3. Both are valuable for different purposes

---

## Contributing Tests

When adding new features:

1. ✅ Write unit tests using mocks
2. ✅ Test against multiple SW versions (2021-2025)
3. ✅ Add integration tests if applicable
4. ✅ Update this guide if needed

### Test Coverage Goals

- Unit tests: > 80%
- Integration tests: Critical paths
- E2E tests: Major workflows

---

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [SolidWorks API Documentation](https://help.solidworks.com/api)
- [GitHub Actions Documentation](https://docs.github.com/actions)

---

## Questions?

If you have questions about testing:

1. Check this guide
2. Review existing tests
3. Open an issue with `testing` label
