# SolidWorks MCP — Claude Code Instructions

This file contains project-specific guidance for Claude Code when working in
this repository.

## Project Overview

This is a Node.js MCP (Model Context Protocol) server that exposes SolidWorks
automation as AI-accessible tools via the `@modelcontextprotocol/sdk`. It
bridges Claude to SolidWorks through the Windows COM API using `winax`.

**Language:** TypeScript (ESM, `"type": "module"`)
**Runtime:** Node.js 20+, Windows only for COM features
**Framework:** `@modelcontextprotocol/sdk` with `StdioServerTransport`

---

## Quick Setup for Claude Code

See [docs/CLAUDE_CODE_SETUP.md](docs/CLAUDE_CODE_SETUP.md) for the full setup
guide. The short version:

```bash
npm install
npm run build
```

Add to `.mcp.json` in the repo root:

```json
{
  "mcpServers": {
    "solidworks": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "SOLIDWORKS_PATH": "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS"
      }
    }
  }
}
```

Then run `claude` from the repo root.

---

## Build & Test Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Type-check without emitting
npm test             # Run unit tests (no SolidWorks required)
npm run dev          # Watch mode for development
```

---

## Key Architecture Rules

### COM interop — always use `comNothing()`

`SelectByID2` and other SolidWorks COM methods require VT_EMPTY (COM Nothing)
for optional dispatch parameters — **never pass JavaScript `null`**. Use the
helper from `src/utils/com-helpers.ts`:

```typescript
import { comNothing, selectByID2 } from '../utils/com-helpers.js';

// Direct call
model.Extension.SelectByID2(name, 'SKETCH', 0, 0, 0, false, 0, comNothing(), 0);

// Or use the wrapper
selectByID2(model, name, 'SKETCH');
```

### ESM modules — no `require()`

The project uses `"type": "module"`. All imports must use ESM `import`
syntax. Never use `require()` inside handler bodies or anywhere in `src/`.

```typescript
// Correct
import * as fs from 'fs';
import * as path from 'path';

// Wrong — will throw "require is not defined" at runtime
const fs = require('fs');
```

### Null safety for COM return values

SolidWorks COM methods can return null for numeric properties on sketch-only
parts (no solid body). Always guard before calling `.toFixed()` or arithmetic:

```typescript
// Correct
`${(value ?? 0).toFixed(3)} mm`

// Wrong — throws TypeError on sketch-only documents
`${value.toFixed(3)} mm`
```

### Macro files use `.swb`, not `.swp`

SolidWorks macros saved as plain-text VBA should use the `.swb` extension.
The server writes `.swb` files directly with `fs.writeFileSync` — it does not
call `swApp.RecordMacro()` (that method does not exist on the COM API).

---

## Adding New Tools

1. Add the tool definition to the appropriate file in `src/tools/`.
2. Export it from `src/tools/<file>.ts` as part of the exported array.
3. Import and include it in the `allTools` array in `src/index.ts`.
4. Add a test case in `src/index.test.ts`.
5. Run `npm run typecheck && npm test` to verify.

Tool definition shape:

```typescript
{
  name: 'my_tool_name',
  description: 'What this tool does',
  inputSchema: z.object({
    param: z.string().describe('Parameter description'),
  }),
  handler: (args: any, swApi: SolidWorksAPI) => {
    try {
      // implementation
      return { success: true, result: '...' };
    } catch (error) {
      return `Failed: ${error}`;
    }
  },
}
```

---

## Testing

Unit tests use Vitest and do not require SolidWorks to be running. `winax` and
`com-helpers` are mocked in `src/index.test.ts`.

```bash
npm test               # All unit tests
npm run test:coverage  # With coverage report
```

Integration tests require a running SolidWorks instance:

```bash
npm run test:integration
```

---

## Known Limitations

- **Windows only** for COM connectivity. All tools load on any platform, but
  modeling tools will error if SolidWorks is not reachable.
- **Screenshot format**: SolidWorks COM only natively exports BMP. The server
  attempts PNG/JPG via `Extension.SaveAs2` but falls back to BMP with a
  descriptive message.
- **SolidWorks must be running** before calling any modeling, sketch, or
  analysis tools.
