# SolidWorks MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green?logo=anthropic)](https://modelcontextprotocol.io)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Windows](https://img.shields.io/badge/Windows-10%2F11-blue?logo=windows)](https://www.microsoft.com/windows)

A Node.js MCP server for automating SolidWorks via COM interop. Connects AI assistants (Claude Desktop, etc.) to SolidWorks for CAD automation tasks.

> **Project Status: Alpha / Experimental**
>
> This project is under active development. While the architecture is in place and basic operations (sketch planes, simple extrusions) have been demonstrated, **most tools have not been validated against a live SolidWorks instance**. Expect rough edges, COM quirks, and incomplete functionality. Contributions and testing reports are very welcome.

## How It Works

The server exposes SolidWorks operations as MCP tools over stdio. An intelligent routing layer handles a key limitation of Node.js COM bridges: methods with 13+ parameters often fail via direct COM calls.

- **Simple operations (12 params or fewer)** - Direct COM call via `winax`
- **Complex operations (13+ params)** - Auto-generated VBA macro executed by SolidWorks
- **Failed operations** - Automatic fallback with error context

## Prerequisites

- **Windows 10/11** (required - COM interop is Windows-only)
- **SolidWorks 2021-2025** (licensed, installed)
- **Node.js 20+**
- An MCP-compatible client (Claude Desktop, etc.)

## Installation

```bash
git clone https://github.com/vespo92/SolidworksMCP-TS.git
cd SolidworksMCP-TS

# Install dependencies (compiles winax native module for your system)
npm install

# Build TypeScript
npm run build
```

> **Note:** The `winax` native module must be compiled locally on each Windows machine. Global npm installation does not work.

## Configure Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "solidworks": {
      "command": "node",
      "args": ["C:/path/to/SolidworksMCP-TS/dist/index.js"],
      "env": {
        "SOLIDWORKS_PATH": "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS",
        "ADAPTER_TYPE": "winax-enhanced"
      }
    }
  }
}
```

## Available Tools

The server registers tools across these categories:

| Category | Tools | Status |
|----------|-------|--------|
| **Modeling** | create_part, create_extrusion, create_revolve, create_sweep, create_loft, create_fillet, create_chamfer, etc. | Partially tested |
| **Sketch** | create_sketch, add_line, add_circle, add_rectangle, add_arc, add_constraints, dimension_sketch | Basic ops verified |
| **Drawing** | create_drawing_from_model, add_drawing_view, add_section_view, add_dimensions, etc. | Untested |
| **Export** | export_file (STEP, IGES, STL, PDF, DWG, DXF), batch_export | Untested |
| **Analysis** | get_mass_properties, check_interference, measure_distance, check_geometry | Untested |
| **VBA Generation** | generate_vba_script, vba_sheet_metal, vba_configurations, vba_equations, etc. | Code generation works; execution untested |
| **Macro** | macro_start_recording, macro_stop_recording, macro_export_vba | Untested |

**"Partially tested"** means the tool has been run against SolidWorks at least once but not comprehensively. **"Untested"** means only mock/unit tests exist (if any).

## Architecture

```
MCP Protocol (stdio)
    |
Tool Registry (index.ts)
    |
Feature Complexity Analyzer --- routes by param count
    |                    |
Direct COM (winax)    VBA Macro Generator
    |                    |
    +--------------------+
    |
SolidWorks COM API
```

### Key Design Decisions

- **COM parameter limit workaround**: SolidWorks API methods like `FeatureExtrusion3` take 20+ parameters. Node.js COM bridges choke on these. The complexity analyzer detects this and generates a VBA macro instead.
- **Never pass `null` to COM**: Use `undefined` for optional parameters. COM interprets `null` as `VT_NULL`, causing type mismatch errors (this was the root cause of SelectByID2 failures).
- **Feature tree traversal over SelectByID2**: `FeatureByPositionReverse()` + `GetTypeName2()` is more reliable for finding sketches than `SelectByID2`.
- **Winston logger only**: Never use `console.*` - it corrupts the JSON-RPC stdio transport.

## Development

```bash
npm run build        # TypeScript compile
npm run dev          # Hot-reload dev server (tsx watch)
npm run check        # TypeScript + Biome lint in one command
npm run lint         # Biome lint check
npm run lint:fix     # Biome auto-fix
npm run format       # Biome format
npm run typecheck    # Type check without emit
```

## Testing

See [TESTING.md](TESTING.md) for the full testing guide.

```bash
# Unit tests (mock adapter, no SolidWorks needed)
USE_MOCK_SOLIDWORKS=true npm test

# Watch mode
npm run test:watch
```

**Current test status**: Unit tests exist for config and environment utilities. Most tool modules lack test coverage. Integration tests require a Windows machine with SolidWorks and have not been run in CI.

## Known Issues & Limitations

- **No CI integration testing** - Tests only run against mocks. Real SolidWorks integration tests require a self-hosted Windows runner that doesn't exist yet.
- **winax compilation** - Must be compiled locally on each machine. No pre-built binaries.
- **Edge.js adapter** - Defined in architecture but not implemented.
- **PowerShell bridge** - Defined in architecture but not implemented.
- **Connection pooling / circuit breaker** - Referenced in code but not battle-tested.
- **Performance metrics are unverified** - No real benchmarking has been done.

## What Has Worked

Based on development testing:

- Connecting to a running SolidWorks instance via COM
- Creating sketch planes and basic sketch geometry
- Simple extrusions with limited parameters
- Feature tree traversal for sketch selection
- VBA macro code generation (execution path needs more testing)

## Roadmap

- [ ] Comprehensive integration test suite on real SolidWorks
- [ ] CI with self-hosted Windows runner
- [ ] Validate all modeling tools end-to-end
- [ ] Validate drawing and export tools
- [ ] Edge.js adapter for .NET runtime path
- [ ] PowerShell bridge as alternative COM path
- [ ] Performance benchmarking with real metrics

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Key areas where help is needed:

- **Testing against real SolidWorks** - The biggest gap. If you have SolidWorks, running tools and reporting results is extremely valuable.
- **COM interop edge cases** - Different SolidWorks versions behave differently.
- **Additional tool implementations** - Many SolidWorks API methods aren't exposed yet.

## Troubleshooting

### COM Registration Issues
```powershell
regsvr32 "C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\sldworks.tlb"
```

### Build Issues
```bash
rm -rf node_modules dist
npm install
npm run build
```

### Debug Logging
```bash
ENABLE_LOGGING=true LOG_LEVEL=debug node dist/index.js
```

## License

MIT - See [LICENSE](LICENSE)

## Acknowledgments

- [winax](https://github.com/nicedreams/node-activex) - COM bridge for Node.js
- [Anthropic MCP](https://modelcontextprotocol.io) - Model Context Protocol
- SolidWorks API documentation
