# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-01-11

### Added
- **Massive VBA Generation Expansion** - Added 5 new comprehensive VBA generation modules
- **Part Modeling VBA Tools** - Reference geometry, advanced features (sweep, loft, boundary), patterns, sheet metal, surface modeling
- **Assembly Automation VBA** - Complete mate types, component management, interference analysis, configuration management
- **Drawing Automation VBA** - View creation, dimensioning, annotations, tables, sheet format management
- **File Management & PDM VBA** - Batch operations, custom properties, PDM vault operations, design tables
- **Advanced Features VBA** - Configurations, equations, simulation setup, API automation, error handling

### Improved
- Fixed TypeScript compilation errors for better CI/CD stability
- Added proper type definitions for dotenv
- Corrected template string interpolation in VBA code generation
- Enhanced error handling in VBA generation

### Technical
- Added 3,300+ lines of sophisticated VBA generation code
- Modular architecture with domain-specific modules
- Full TypeScript support with Zod validation
- Comprehensive error handling and logging capabilities

## [2.0.1] - 2025-01-11

### Fixed
- Repository URLs corrected to GitHub repo
- Package-lock.json added for CI/CD
- ESLint errors resolved

## [2.0.0] - 2025-01-11

### Added
- Complete architecture rewrite with enterprise features
- Macro recording and playback system
- SQL integration for design tables
- PDM vault management
- Knowledge base with ChromaDB integration
- State management system
- Cache management
- Advanced resource registry

## [1.0.0] - 2025-01-08

### Added
- Initial release of SolidWorks MCP Server
- Full SolidWorks API integration via COM
- VBA script generation from templates
- Support for modeling operations (create, modify, dimension control)
- Drawing automation tools
- Multi-format export capabilities (STEP, IGES, STL, PDF, DXF, DWG)
- Analysis tools (mass properties, interference, geometry checks)
- Batch processing capabilities
- Automatic Claude Desktop configuration
- Comprehensive TypeScript implementation
- Windows-native COM integration via winax

### Features
- 25+ MCP tools for SolidWorks automation
- Handlebars-based VBA template system
- Support for SolidWorks 2021-2025
- One-command npm installation
- Auto-configuration of Claude Desktop
- Type-safe TypeScript architecture

### Documentation
- Comprehensive README with examples
- Installation guide
- Contributing guidelines
- VBA template examples