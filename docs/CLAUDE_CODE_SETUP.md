# Setting Up SolidWorks MCP with Claude Code

This guide walks through configuring the SolidWorks MCP server to work with
[Claude Code](https://claude.ai/code), Anthropic's CLI for Claude.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Windows | 10 or 11 (64-bit) |
| SolidWorks | 2021–2025 (licensed, installed) |
| Node.js | 20 or later |
| npm | 8 or later |
| Claude Code | Latest (`npm install -g @anthropic-ai/claude-code`) |

> **Note:** The `winax` COM bridge is Windows-only. The server will not connect
> to SolidWorks on macOS or Linux, but the MCP tools still load correctly for
> testing and VBA code generation.

---

## 1. Install and Build the Server

```bash
# Clone the repository
git clone https://github.com/IntricateMetalForming/SolidworksMCP.git
cd SolidworksMCP

# Install dependencies (also compiles the winax native COM addon)
npm install

# Compile TypeScript to dist/
npm run build
```

Verify the build succeeded:

```bash
node dist/index.js --help
# or just check that dist/index.js exists
```

---

## 2. Configure the MCP Server in Claude Code

Claude Code reads MCP server configuration from a JSON file. You can configure
at project level (`.mcp.json` in the repo root) or globally (`~/.claude/mcp.json`).

### Option A — Project-level (recommended)

Create `.mcp.json` in the repository root:

```json
{
  "mcpServers": {
    "solidworks": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "SOLIDWORKS_PATH": "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

This file is already listed in `.gitignore` so personal paths stay off of git.
If you want to share a template, copy `.env.example` to `.env` and fill in
your paths — the server reads `.env` automatically via `dotenv`.

### Option B — Global configuration

Add the server to `~/.claude/mcp.json` (create it if it doesn't exist):

```json
{
  "mcpServers": {
    "solidworks": {
      "command": "node",
      "args": ["C:\\full\\path\\to\\SolidworksMCP\\dist\\index.js"],
      "env": {
        "SOLIDWORKS_PATH": "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

Use the full absolute path to `dist/index.js` when configuring globally.

---

## 3. Environment Variables

Copy `.env.example` to `.env` and edit as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `SOLIDWORKS_PATH` | — | Path to SolidWorks install directory |
| `SOLIDWORKS_VERSION` | `2024` | SolidWorks version year |
| `SOLIDWORKS_MODELS_PATH` | — | Default directory for model files |
| `SOLIDWORKS_MACROS_PATH` | — | Default directory for macro files |
| `ENABLE_PDM` | `false` | Enable PDM vault integration |
| `PDM_VAULT` | — | PDM vault name (when PDM enabled) |
| `LOG_LEVEL` | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |
| `CHROMA_HOST` | `localhost` | ChromaDB host (optional, for knowledge features) |
| `CHROMA_PORT` | `8000` | ChromaDB port |

---

## 4. Start Claude Code

From the repository root:

```bash
claude
```

Claude Code will automatically read `.mcp.json` and connect to the SolidWorks
MCP server. You should see a confirmation that the `solidworks` server is
connected when you start a session.

To verify the connection is working, ask Claude:

```
What SolidWorks tools are available?
```

Claude will list all 39 available tools across modeling, sketching, analysis,
export, and VBA generation categories.

---

## 5. Verify SolidWorks Connectivity

The MCP server connects to a running SolidWorks instance via COM. Before using
modeling tools, make sure SolidWorks is open.

Try a basic workflow:

```
Create a new SolidWorks part, draw a 50mm × 30mm rectangle on the Front plane,
extrude it 20mm, and take a screenshot.
```

If SolidWorks is not running, the connection attempt will fail with a clear
error message. The VBA generation and template tools work without a live
SolidWorks connection.

---

## 6. Using the Tools

### Basic Part Modeling

```
Open a new part, create a sketch on the Front plane with a circle of radius 25mm
at the origin, then extrude it 40mm.
```

### Generating VBA Macros

```
Generate a VBA macro that creates a box 100mm × 50mm × 30mm with a 5mm fillet
on all edges.
```

### Exporting

```
Export the current model as a STEP file to C:\Models\part.step
```

### Mass Properties

```
Get the mass properties of the current part in grams.
```

---

## 7. Troubleshooting

### Server fails to start

- Check that `npm run build` completed without errors.
- Ensure `dist/index.js` exists.
- Check the `LOG_LEVEL=debug` output for specific errors.

### "SolidWorks not connected" errors

- SolidWorks must be running before calling modeling tools.
- Run SolidWorks as the same user that runs Claude Code (COM requires same
  Windows session).
- If SolidWorks is running but the connection fails, try:
  ```
  Tools → Options → General → Allow multiple SolidWorks sessions
  ```

### winax build errors during `npm install`

- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
  with the "Desktop development with C++" workload.
- Run `npm install` in a Developer Command Prompt or with
  `npm install --msvs_version=2022`.

### SelectByID2 / entity selection errors

These were a known issue and are fixed in v3.1.0+. Ensure you are on the
latest version.

### Screenshot saves as BMP instead of PNG

SolidWorks' COM API only natively supports BMP export. The server will save as
BMP and report the actual output path in the response. Convert the BMP to PNG
afterwards using any image tool, or use the BMP file directly.

---

## 8. Running Tests

```bash
# Unit tests (no SolidWorks required)
npm test

# Type checking
npm run typecheck

# Integration tests (requires SolidWorks running)
npm run test:integration
```

---

## 9. Tool Categories

| Category | Tool Count | Description |
|---|---|---|
| Sketch | 14 | Create and edit sketch geometry |
| Modeling | 8 | Extrude, revolve, shell, fillet, etc. |
| Analysis | 6 | Mass properties, bounding box, draft, geometry check |
| Export | 4 | STEP, STL, DXF, screenshot |
| VBA | 4 | Generate and run VBA macros |
| Native Macro | 5 | Record, create, and convert macros to .swb files |
| Template | 4 | Save and load drawing templates |
| Design Table | 2 | Parametric design tables |

---

## 10. Project Structure (for contributors)

```
src/
├── index.ts              # MCP server entry point
├── solidworks/
│   └── api.ts            # Core SolidWorks COM interface
├── tools/                # MCP tool implementations
│   ├── modeling.ts
│   ├── sketch.ts
│   ├── analysis.ts
│   ├── export.ts
│   ├── vba.ts
│   ├── native-macro.ts
│   └── template-manager.ts
├── utils/
│   ├── com-helpers.ts    # COM interop utilities (comNothing, selectByID2)
│   └── logger.ts
├── macro/
│   └── recorder.ts       # VBA macro recorder
└── adapters/
    └── winax-adapter.ts  # WinAx COM bridge adapter
```

For architecture details see [ARCHITECTURE_ANALYSIS.md](../ARCHITECTURE_ANALYSIS.md).
