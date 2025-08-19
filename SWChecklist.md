# SolidWorks MCP Server Tools Testing Checklist
## Testing Date: August 18, 2025
## Status: 🟢 Working | 🔴 Not Working | 🟡 Partial | ⚪ Not Tested

---

## Basic Model Operations

### 1. solidworks:open_model
- **Status**: 🟢 Working
- **Test File**: `C:\Users\vinnie\Claude\TestPart.SLDPRT`
- **Error**: None
- **Notes**: Successfully opened TestPart 

### 2. solidworks:create_part
- **Status**: 🟢 Working  
- **Error**: None
- **Notes**: Successfully created new part (Part3)

### 3. solidworks:close_model
- **Status**: 🔴 Not Working
- **Parameters**: save (true/false)
- **Error**: TypeError: this.currentModel.GetTitle is not a function
- **Notes**: Issue with currentModel reference

### 4. solidworks:rebuild_model
- **Status**: 🔴 Not Working
- **Parameters**: force (true/false)
- **Error**: TypeError: model.EditRebuild3 is not a function
- **Notes**: Wrong API method name

---

## Feature Creation

### 5. solidworks:create_extrusion
- **Status**: ⚪ Not Tested
- **Parameters**: depth, draft, reverse
- **Error**:
- **Notes**:

---

## Dimensions

### 6. solidworks:get_dimension
- **Status**: 🔴 Not Working
- **Parameters**: name (e.g., "D1@Sketch1")
- **Error**: Dimension "D1@Sketch1" not found
- **Notes**: Tested without actual dimension existing

### 7. solidworks:set_dimension
- **Status**: ⚪ Not Tested
- **Parameters**: name, value
- **Error**:
- **Notes**:

---

## Drawing Operations

### 8. solidworks:create_drawing_from_model
- **Status**: ⚪ Not Tested
- **Parameters**: template, sheet_size
- **Error**:
- **Notes**:

### 9. solidworks:add_drawing_view
- **Status**: ⚪ Not Tested
- **Parameters**: viewType, modelPath, x, y, scale
- **Error**:
- **Notes**:

### 10. solidworks:add_section_view
- **Status**: ⚪ Not Tested
- **Parameters**: parentView, x, y, sectionLine
- **Error**:
- **Notes**:

### 11. solidworks:add_dimensions
- **Status**: ⚪ Not Tested
- **Parameters**: viewName, autoArrange
- **Error**:
- **Notes**:

### 12. solidworks:update_sheet_format
- **Status**: ⚪ Not Tested
- **Parameters**: properties
- **Error**:
- **Notes**:

---

## Export Operations

### 13. solidworks:export_file
- **Status**: 🔴 Not Working
- **Parameters**: outputPath, format
- **Error**: Failed to export to step
- **Notes**: Export functionality not working

### 14. solidworks:batch_export
- **Status**: ⚪ Not Tested
- **Parameters**: format, outputDir, configurations, prefix
- **Error**:
- **Notes**:

### 15. solidworks:export_with_options
- **Status**: ⚪ Not Tested
- **Parameters**: outputPath, format, options
- **Error**:
- **Notes**:

### 16. solidworks:capture_screenshot
- **Status**: 🔴 Not Working
- **Parameters**: outputPath, width, height
- **Error**: Failed to save screenshot
- **Notes**: Screenshot save failing

---

## VBA Generation Functions

### 17. solidworks:generate_vba_script
- **Status**: ⚪ Not Tested
- **Parameters**: template, parameters, outputPath
- **Error**:
- **Notes**:

### 18. solidworks:create_feature_vba
- **Status**: 🟢 Working
- **Parameters**: featureType, parameters
- **Error**: None
- **Notes**: Successfully generates VBA code for extrusion

### 19. solidworks:create_batch_vba
- **Status**: ⚪ Not Tested
- **Parameters**: operation, filePattern
- **Error**:
- **Notes**:

### 20. solidworks:run_vba_macro
- **Status**: 🔴 Not Working
- **Parameters**: macroPath, procedureName, moduleName, arguments
- **Error**: No result received from client-side tool execution
- **Notes**: COM automation issue with RunMacro2

### 21. solidworks:create_drawing_vba
- **Status**: ⚪ Not Tested
- **Parameters**: modelPath, template, views, sheet_size
- **Error**:
- **Notes**:

---

## VBA Advanced Features

### 22. solidworks:vba_create_reference_geometry
- **Status**: ⚪ Not Tested
- **Parameters**: geometryType, referenceType, references
- **Error**:
- **Notes**:

### 23. solidworks:vba_advanced_features
- **Status**: 🔴 Not Working
- **Parameters**: featureType, profiles
- **Error**: No result received from client-side tool execution
- **Notes**: Tool execution failure

### 24. solidworks:vba_pattern_features
- **Status**: ⚪ Not Tested
- **Parameters**: patternType, featureNames, direction1
- **Error**:
- **Notes**:

### 25. solidworks:vba_sheet_metal
- **Status**: ⚪ Not Tested
- **Parameters**: operation, thickness
- **Error**:
- **Notes**:

### 26. solidworks:vba_surface_modeling
- **Status**: ⚪ Not Tested
- **Parameters**: surfaceType, sketches
- **Error**:
- **Notes**:

### 27. solidworks:vba_assembly_mates
- **Status**: ⚪ Not Tested
- **Parameters**: mateType, component1, face1, component2, face2
- **Error**:
- **Notes**:

### 28. solidworks:vba_assembly_components
- **Status**: ⚪ Not Tested
- **Parameters**: operation
- **Error**:
- **Notes**:

### 29. solidworks:vba_assembly_analysis
- **Status**: ⚪ Not Tested
- **Parameters**: analysisType
- **Error**:
- **Notes**:

### 30. solidworks:vba_assembly_configurations
- **Status**: ⚪ Not Tested
- **Parameters**: operation, configName
- **Error**:
- **Notes**:

---

## VBA Drawing Functions

### 31. solidworks:vba_create_drawing_views
- **Status**: ⚪ Not Tested
- **Parameters**: viewType, modelPath, position
- **Error**:
- **Notes**:

### 32. solidworks:vba_drawing_dimensions
- **Status**: ⚪ Not Tested
- **Parameters**: dimensionType, position
- **Error**:
- **Notes**:

### 33. solidworks:vba_drawing_annotations
- **Status**: ⚪ Not Tested
- **Parameters**: annotationType, position
- **Error**:
- **Notes**:

### 34. solidworks:vba_drawing_tables
- **Status**: ⚪ Not Tested
- **Parameters**: tableType, position
- **Error**:
- **Notes**:

### 35. solidworks:vba_drawing_sheet_format
- **Status**: ⚪ Not Tested
- **Parameters**: operation
- **Error**:
- **Notes**:

---

## VBA Utility Functions

### 36. solidworks:vba_batch_operations
- **Status**: ⚪ Not Tested
- **Parameters**: operation, sourcePath
- **Error**:
- **Notes**:

### 37. solidworks:vba_custom_properties
- **Status**: ⚪ Not Tested
- **Parameters**: operation
- **Error**:
- **Notes**:

### 38. solidworks:vba_pdm_operations
- **Status**: ⚪ Not Tested
- **Parameters**: operation, vaultName
- **Error**:
- **Notes**:

### 39. solidworks:vba_design_table
- **Status**: ⚪ Not Tested
- **Parameters**: operation, tableName
- **Error**:
- **Notes**:

### 40. solidworks:vba_configurations
- **Status**: ⚪ Not Tested
- **Parameters**: operation, configName
- **Error**:
- **Notes**:

### 41. solidworks:vba_equations
- **Status**: ⚪ Not Tested
- **Parameters**: operation
- **Error**:
- **Notes**:

### 42. solidworks:vba_simulation_setup
- **Status**: ⚪ Not Tested
- **Parameters**: studyType, studyName
- **Error**:
- **Notes**:

### 43. solidworks:vba_api_automation
- **Status**: ⚪ Not Tested
- **Parameters**: automationType
- **Error**:
- **Notes**:

### 44. solidworks:vba_error_handling
- **Status**: ⚪ Not Tested
- **Parameters**: functionName, operationType
- **Error**:
- **Notes**:

---

## Analysis Functions

### 45. solidworks:get_mass_properties
- **Status**: 🔴 Not Working
- **Parameters**: units
- **Error**: TypeError: Cannot read properties of undefined (reading 'CreateMassProperty')
- **Notes**: Extension property not accessible

### 46. solidworks:check_interference
- **Status**: ⚪ Not Tested
- **Parameters**: includeMultibodyParts, treatCoincidenceAsInterference, treatSubAssembliesAsComponents
- **Error**:
- **Notes**:

### 47. solidworks:measure_distance
- **Status**: ⚪ Not Tested
- **Parameters**: entity1, entity2
- **Error**:
- **Notes**:

### 48. solidworks:analyze_draft
- **Status**: ⚪ Not Tested
- **Parameters**: pullDirection, requiredAngle
- **Error**:
- **Notes**:

### 49. solidworks:check_geometry
- **Status**: 🔴 Not Working
- **Parameters**: checkType
- **Error**: No result received from client-side tool execution
- **Notes**: Tool execution failure

### 50. solidworks:get_bounding_box
- **Status**: 🔴 Not Working
- **Parameters**: None
- **Error**: No result received from client-side tool execution
- **Notes**: Tool execution failure

---

## Macro Recording Functions

### 51. solidworks:macro_start_recording
- **Status**: ⚪ Not Tested
- **Parameters**: name, description
- **Error**:
- **Notes**:

### 52. solidworks:macro_stop_recording
- **Status**: ⚪ Not Tested
- **Parameters**: None
- **Error**:
- **Notes**:

### 53. solidworks:macro_export_vba
- **Status**: ⚪ Not Tested
- **Parameters**: macroId
- **Error**:
- **Notes**:

---

## Design Table Functions

### 54. solidworks:design_table_create
- **Status**: ⚪ Not Tested
- **Parameters**: name, config
- **Error**:
- **Notes**:

### 55. solidworks:design_table_refresh
- **Status**: ⚪ Not Tested
- **Parameters**: resourceId
- **Error**:
- **Notes**:

---

## Summary
- **Total Functions**: 55
- **Working**: 0
- **Not Working**: 0
- **Partial**: 0
- **Not Tested**: 55

## Notes
- Testing conducted with SolidWorks running
- MCP Server version: 2.1.0
- Node.js version: v22.18.0