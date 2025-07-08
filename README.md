# SolidWorks MCP Server

A powerful Model Context Protocol (MCP) server that enables Claude to control SolidWorks, generate VBA scripts, and automate CAD workflows.

## 🚀 Features

- **Full SolidWorks Control** - Open, create, modify, and analyze CAD models
- **VBA Script Generation** - Generate VBA scripts from templates with AI assistance
- **Batch Operations** - Process multiple files with automated workflows
- **Drawing Automation** - Create drawings with views, dimensions, and annotations
- **Export Capabilities** - Export to STEP, IGES, STL, PDF, DXF, DWG formats
- **Analysis Tools** - Mass properties, interference detection, geometry checks

## 📋 Prerequisites

- Windows 10/11
- SolidWorks 2021-2025 (licensed installation)
- Node.js 20 or higher
- Claude Desktop

## 🛠️ Installation

### 1. Install from npm (Recommended)

```bash
npm install -g mcp-server-solidworks-ts
```

### 2. Configure Claude Desktop

The installer will automatically update your Claude configuration. If you need to do it manually:

1. Open Claude Desktop settings
2. Go to Developer > Model Context Protocol
3. Add the SolidWorks server:

```json
{
  "mcpServers": {
    "solidworks": {
      "command": "npx",
      "args": ["mcp-server-solidworks-ts"]
    }
  }
}
```

### 3. Verify Installation

Restart Claude Desktop and you should see "solidworks" in the MCP tools list.

## 🚀 Usage Examples

### Basic Operations

```
"Open the part at C:/Models/bracket.sldprt"

"Create a new part"

"Create an extrusion 25mm deep"

"Change dimension D1@Sketch1 to 50mm"

"Export current model as STEP to C:/Exports/"
```

### VBA Generation

```
"Generate a VBA script to batch export all parts in C:/Models to STL format"

"Create a VBA macro that adds a 5mm fillet to all edges"

"Generate VBA to create drawings for all assemblies with front, top, and isometric views"
```

### Analysis

```
"What are the mass properties of this part?"

"Check for interferences in this assembly"

"Analyze draft angles with 2 degree minimum"
```

## 🔧 Configuration

Create a `.env` file in your project directory:

```env
# SolidWorks paths (optional - uses defaults if not set)
SOLIDWORKS_PATH=C:/Program Files/SOLIDWORKS Corp/SOLIDWORKS
SOLIDWORKS_VERSION=2024
SOLIDWORKS_MODELS_PATH=C:/SolidWorks/Models
SOLIDWORKS_MACROS_PATH=C:/SolidWorks/Macros
```

## 📚 Available Tools

### Modeling Tools
- `open_model` - Open SolidWorks files
- `create_part` - Create new part documents  
- `close_model` - Close with save options
- `create_extrusion` - Create extrude features
- `get_dimension` - Read dimension values
- `set_dimension` - Update dimension values
- `rebuild_model` - Force rebuild

### Drawing Tools
- `create_drawing_from_model` - Generate 2D drawings
- `add_drawing_view` - Add standard views
- `add_section_view` - Create section views
- `add_dimensions` - Auto-dimension views
- `update_sheet_format` - Update title block

### Export Tools
- `export_file` - Export to various formats
- `batch_export` - Export multiple configurations
- `export_with_options` - Export with format-specific options
- `capture_screenshot` - Save model screenshots

### VBA Tools
- `generate_vba_script` - Create VBA from templates
- `create_feature_vba` - Generate feature creation code
- `create_batch_vba` - Batch processing scripts
- `run_vba_macro` - Execute existing macros
- `create_drawing_vba` - Drawing automation scripts

### Analysis Tools
- `get_mass_properties` - Mass, volume, center of mass
- `check_interference` - Assembly interference detection
- `analyze_draft` - Molding draft analysis
- `check_geometry` - Geometry error checking
- `get_bounding_box` - Overall dimensions

## 🧪 Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-server-solidworks
cd mcp-server-solidworks-ts

# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev
```

### Testing

```bash
npm test
```

### Creating Custom VBA Templates

Add templates to `examples/vba-templates/` using Handlebars syntax:

```vba
' Custom Template: {{description}}
Sub CustomOperation()
    Dim swApp As SldWorks.SldWorks
    Set swApp = Application.SldWorks
    
    {{#each parameters}}
    ' Process {{this.name}}: {{this.value}}
    {{/each}}
End Sub
```

## 🐛 Troubleshooting

### "Cannot connect to SolidWorks"
- Ensure SolidWorks is installed and licensed
- Run Claude Desktop as Administrator
- Check Windows Defender/Antivirus settings

### "Tool not found"
- Restart Claude Desktop after installation
- Verify the server appears in MCP settings
- Check the console for error messages

### "Failed to execute VBA"
- Enable macros in SolidWorks settings
- Check macro security settings
- Ensure VBA is installed with SolidWorks

## 📄 License

MIT License - see LICENSE file

## 🤝 Contributing

Contributions welcome! Please read CONTRIBUTING.md

## 📞 Support

- Issues: [GitHub Issues](https://github.com/yourusername/mcp-server-solidworks/issues)
- Discussion: [GitHub Discussions](https://github.com/yourusername/mcp-server-solidworks/discussions)

---

Built with ❤️ by the community