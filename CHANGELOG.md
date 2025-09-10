# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.9] - 2025-09-10

### Fixed
- **Critical: Winax Module Loading** - Reverted to simple ES module import pattern that matches working version
- **COM Object Access** - Fixed GetTitle/GetType/GetPathName property access on Document objects
- **Part Creation** - Use NewPart() method instead of NewDocument() with template

### Changed  
- **Installation Method** - Documented that local installation is required due to winax native module compilation
- **README Documentation** - Added clear warnings and explanations about winax installation requirements

### Technical
- Removed complex eval-based winax loading in favor of direct import
- Cleaned up test files and debugging artifacts
- Updated documentation to reflect installation limitations

### Known Issues
- Global npm installation does not work due to winax native module requirements
- Each Windows system must compile winax locally during npm install

## [3.0.8] - 2025-09-10

### Fixed
- **COM Object Method Access** - GetTitle/GetType are properties on Document objects, not Application
- **Part Creation** - Added fallback to NewDocument when NewPart fails

## [3.0.1 to 3.0.7] - 2025-09-10

### Fixed
- Multiple attempts to fix winax module loading and COM object creation
- Winston logger file-only output to prevent MCP protocol corruption
- Zod schema to JSON schema conversion for Claude Desktop tool visibility

## [2.2.0] - 2025-08-19

### Fixed
- **Critical: Handlebars Helper Registration** - Added all necessary Handlebars helpers (eq, ne, lt, gt, lte, gte, and, or, not) to fix VBA generation tools
- **Template Name Mismatch** - Fixed batch_export template mapping and created proper batch_export.vba template
- **Rebuild Model API** - Updated to use correct SolidWorks API methods (ForceRebuild3, EditRebuild, Rebuild) with fallback strategies
- **Close Model Error Handling** - Added safe error handling for title retrieval preventing COM object access errors
- **Export File Robustness** - Enhanced export functionality with format-specific handling and retry logic
- **Mass Properties Extraction** - Improved getMassProperties with comprehensive error handling

### Added
- batch_export.vba template for batch export operations
- Debug scripts (debug-server.mjs, debug-wrapper.mjs, test-fixes.mjs) for troubleshooting
- SWChecklist.md comprehensive testing checklist
- zod-to-json-schema dependency for schema validation
- ensureCurrentModel helper method in api.ts

### Improved
- Enhanced error handling across all API methods with multiple fallback strategies
- Better COM object access patterns for Windows SolidWorks compatibility
- Template compilation with proper error recovery
- API compatibility for different SolidWorks versions

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