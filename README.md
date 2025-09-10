# SolidWorks MCP Server

<div align="center">

[![CI](https://github.com/vespo92/SolidworksMCP-TS/actions/workflows/ci.yml/badge.svg)](https://github.com/vespo92/SolidworksMCP-TS/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/solidworks-mcp-server.svg)](https://www.npmjs.com/package/solidworks-mcp-server)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green?logo=anthropic)](https://modelcontextprotocol.com)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/vespo92/SolidworksMCP-TS/pulls)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/vespo92/SolidworksMCP-TS/graphs/commit-activity)

</div>

A comprehensive Model Context Protocol (MCP) server that enables AI assistants to interact with SolidWorks CAD software, providing automated design capabilities, macro recording, design tables with SQL integration, VBA generation, and PDM configuration management.

## 🎯 Quick Start

### Option 1: Install from npm (Recommended)
```bash
# Install globally from npm registry
npm install -g solidworks-mcp-server
```

### Option 2: Manual Installation
```bash
# Clone the repository
git clone https://github.com/vespo92/SolidworksMCP-TS
cd SolidworksMCP-TS
npm install
npm run build

# Link globally for use with Claude Desktop
npm link
```

### Configure Claude Desktop
After installation, add to your Claude Desktop config and restart Claude Desktop.

Then in Claude Desktop:
```
"Generate VBA to batch export all parts in my folder to STEP format"
"Create a parametric design table for a configurable bracket"
"Check for interferences in my assembly"
```

## 🚀 Key Features

### Core Capabilities
- **Full SolidWorks Control** - Open, create, modify, and analyze CAD models
- **Macro Recording & Playback** - Record operations and generate reusable macros
- **Design Tables with SQL** - Create parametric designs driven by database data
- **PDM Integration** - Configure and manage SolidWorks PDM vaults
- **VBA Script Generation** - Generate VBA scripts from templates with AI assistance
- **State Management** - Persistent resource states with auto-save
- **Resource-Based Architecture** - Modular, extensible design pattern

### New in v2.1.0 - Comprehensive VBA Generation Suite
⚠️ **IMPORTANT: VBA script generation features are NOT WORKING in the current iteration and require additional testing**
- 🔧 **Part Modeling VBA** - Advanced features, patterns, sheet metal, surfaces
- 🏗️ **Assembly Automation** - Mates, components, interference analysis
- 📐 **Drawing Generation** - Views, dimensions, annotations, tables
- 📁 **File & PDM Operations** - Batch processing, custom properties, vault management
- ⚙️ **Advanced Features** - Configurations, equations, simulation setup
- 🎯 **100+ VBA Tools** - Generate production-ready VBA without coding knowledge

### Enterprise Features (v2.0)
- 🎯 **Macro Recording System** - Record actions and export to VBA
- 📊 **SQL-Driven Design Tables** - Connect to databases for parametric designs
- 🗄️ **PDM Configuration** - Manage vault operations, workflows, and automation
- 💾 **State Persistence** - Track and restore resource states
- 🏗️ **Resource Registry** - Dynamic resource type management
- 📝 **Enhanced Logging** - Comprehensive operation tracking

## 📋 Prerequisites

- Windows 10/11
- SolidWorks 2021-2025 (licensed installation)
- Node.js 20 or higher
- Claude Desktop
- Optional: SQL Server or PostgreSQL for design tables
- Optional: SolidWorks PDM for vault operations

## 🛠️ Installation

### 1. Install the MCP Server

#### From npm Registry (Recommended):
```bash
npm install -g solidworks-mcp-server
```

#### Or Manual Installation:
```bash
git clone https://github.com/vespo92/SolidworksMCP-TS
cd SolidworksMCP-TS
npm install
npm run build
npm link  # Makes it available globally
```

### 2. Configure Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "solidworks": {
      "command": "npx",
      "args": ["solidworks-mcp-server"],
      "env": {
        "ENABLE_MACRO_RECORDING": "true",
        "ENABLE_PDM": "true",
        "SQL_CONNECTION": "mssql://server:1433/database"
      }
    }
  }
}
```

### 3. Environment Configuration

Create a `.env` file for advanced configuration:

```env
# SolidWorks Configuration
SOLIDWORKS_PATH=C:/Program Files/SOLIDWORKS Corp/SOLIDWORKS
SOLIDWORKS_VERSION=2024

# Feature Flags
ENABLE_MACRO_RECORDING=true
ENABLE_PDM=true

# Database Configuration (for Design Tables)
SQL_CONNECTION=mssql://localhost:1433/solidworks_db

# PDM Configuration
PDM_VAULT=Engineering

# State Management
STATE_FILE=.solidworks-state.json

# Logging
LOG_LEVEL=info
```

## 🚀 Usage Examples

### Macro Recording

```
"Start recording a macro called 'CreateBracket'"
"Create a sketch on the front plane"
"Add a rectangle 100mm x 50mm"
"Extrude 25mm"
"Stop recording and export to VBA"
```

### Design Tables with SQL

```
"Create a design table for parametric box configurations from SQL database"
"Use query: SELECT * FROM box_configurations"
"Map columns: length, width, height to dimensions"
"Generate all configurations"
```

### PDM Operations

```
"Configure PDM vault 'Engineering' for automatic check-in/check-out"
"Set up workflow transition from 'Work in Progress' to 'Released'"
"Create folder structure with permissions for project team"
```

### Advanced VBA Generation (v2.1.0)

#### Part Modeling
```
"Generate VBA to create a parametric bracket with:
- Reference planes offset by 50mm
- Sweep feature along a 3D curve
- Linear pattern with 5 instances
- Sheet metal conversion with 2mm thickness"
```

#### Assembly Automation
```
"Generate VBA for assembly that:
- Inserts components from a folder
- Creates coincident and distance mates
- Checks for interferences
- Exports mass properties to Excel"
```

#### Batch Operations
```
"Generate VBA to process all files in C:\Parts that:
- Opens each SLDPRT file
- Updates custom properties (Part Number, Revision)
- Exports to STEP format
- Checks into PDM vault with comment"
```

#### Drawing Automation
```
"Generate VBA to create drawings that:
- Creates standard 3-view layout
- Adds section view A-A
- Dimensions all features
- Inserts BOM table
- Exports to PDF"
```

## 🔧 Available Tools

### Macro Tools
- `macro_start_recording` - Begin recording operations
- `macro_stop_recording` - End recording and save
- `macro_export_vba` - Export macro to VBA code ⚠️ **NOT WORKING - Requires additional testing**
- `macro_execute` - Run recorded macro

### Design Table Tools
- `design_table_create` - Create parametric design table
- `design_table_refresh` - Update from SQL source
- `design_table_add_config` - Add configuration
- `design_table_export` - Export configurations

### PDM Tools
- `pdm_configure` - Set up vault configuration
- `pdm_checkin` - Check in files with comments
- `pdm_checkout` - Check out for editing
- `pdm_workflow` - Execute workflow transitions
- `pdm_create_structure` - Set up folder hierarchy

### Resource Management
- `resource_create` - Create new resource
- `resource_list` - List all resources
- `resource_get` - Get resource details
- `resource_update` - Update resource properties
- `resource_delete` - Remove resource

### Existing Tools
All original tools remain available:
- Modeling tools (create, modify, analyze)
- Drawing tools (views, dimensions, annotations)
- Export tools (STEP, IGES, STL, PDF, etc.)
- VBA tools ⚠️ **NOTE: VBA script generation is NOT WORKING in the current iteration and requires additional testing**
- Analysis tools (mass properties, interference)

## 📚 API Reference

### Resource Types

#### Design Table Resource
```typescript
{
  type: 'design-table',
  tableName: string,
  parameters: Array<{
    name: string,
    type: 'dimension' | 'feature' | 'configuration',
    dataType: 'number' | 'string' | 'boolean',
    sqlColumn?: string,
    formula?: string
  }>,
  dataSource?: {
    type: 'sql' | 'file' | 'api',
    connectionString?: string,
    query?: string
  }
}
```

#### PDM Configuration Resource
```typescript
{
  type: 'pdm-configuration',
  vaultName: string,
  operations: {
    checkIn?: { enabled: boolean, comment?: string },
    checkOut?: { enabled: boolean, getLatestVersion?: boolean },
    workflow?: { 
      enabled: boolean,
      transitions: Array<{
        name: string,
        fromState: string,
        toState: string
      }>
    }
  }
}
```

## 🧪 Development

### Building from Source

```bash
git clone https://github.com/vespo92/SolidworksMCP-TS
cd solidworks-mcp-server
npm install
npm run build
```

### Running Tests

```bash
npm test                  # Run all tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests
```

### Adding Custom Resources

Create a new resource type:

```typescript
import { SolidWorksResource } from './resources/base';

export class CustomResource extends SolidWorksResource {
  readonly type = 'custom-type';
  
  async execute(api: SolidWorksAPI) {
    // Implementation
  }
  
  toVBACode(): string {
    // Generate VBA
  }
}
```

Register the resource:

```typescript
resourceRegistry.register({
  type: 'custom-type',
  name: 'Custom Resource',
  schema: CustomSchema,
  factory: (id, name, props) => new CustomResource(id, name, props)
});
```

## 🐛 Troubleshooting

### Macro Recording Issues
- Ensure macro recording is enabled in environment
- Check that actions are supported for recording
- Verify VBA export permissions

### SQL Connection Problems
- Verify connection string format
- Check database permissions
- Ensure SQL drivers are installed

### PDM Integration
- Confirm PDM client is installed
- Verify vault access permissions
- Check network connectivity to PDM server

### State Management
- Check write permissions for state file
- Clear corrupted state with `resource_clear`
- Verify auto-save is enabled

## 📊 Performance Considerations

- **Batch Operations**: Use macro recording for repetitive tasks
- **SQL Queries**: Optimize queries for large datasets
- **State Storage**: Periodically clean old states
- **PDM Operations**: Use batch check-in/check-out

## 🔒 Security

- SQL connections use secure authentication
- PDM credentials are not stored in state
- Macro execution requires explicit permission
- State files can be encrypted (configure in .env)

## 📄 License

MIT License - see LICENSE file

## 🤝 Contributing

We welcome contributions! Please see CONTRIBUTING.md for guidelines.

### Areas for Contribution
- Additional resource types
- Enhanced SQL integrations
- More VBA templates
- PDM workflow automation
- Testing improvements

## 📞 Support

- Issues: [GitHub Issues](https://github.com/vespo92/SolidworksMCP-TS/issues)
- Discussions: [GitHub Discussions](https://github.com/vespo92/SolidworksMCP-TS/discussions)

## 🚀 Roadmap

### v2.1 (Q2 2024)
- [ ] Real-time collaboration features
- [ ] Cloud storage integration
- [ ] Advanced simulation tools
- [ ] Custom property management

### v2.2 (Q3 2024)
- [ ] AI-powered design suggestions
- [ ] Automated testing framework
- [ ] Performance optimization tools
- [ ] Extended PDM capabilities

## 📖 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

Built with ❤️ for the SolidWorks community