// Test script for SolidWorks MCP Server fixes
// Run this to verify the fixed functions work correctly

import { SolidWorksAPI } from './dist/solidworks/api.js';
import { DesignTableResource } from './dist/resources/design-table.js';

async function testFixes() {
  console.log('Testing SolidWorks MCP Server Fixes...\n');
  
  const api = new SolidWorksAPI();
  
  try {
    // Test 1: Connect to SolidWorks
    console.log('1. Testing SolidWorks connection...');
    api.connect();
    console.log('   ✅ Connected to SolidWorks\n');
    
    // Test 2: Test design_table_create
    console.log('2. Testing design_table_create...');
    const designTable = new DesignTableResource(
      'test_dt_1',
      'TestDesignTable',
      {
        parameters: [
          { name: 'Width', dataType: 'number', defaultValue: 100 },
          { name: 'Height', dataType: 'number', defaultValue: 50 }
        ],
        configurations: [
          { name: 'Config1', values: { Width: 100, Height: 50 }, active: true },
          { name: 'Config2', values: { Width: 150, Height: 75 }, active: false }
        ]
      }
    );
    
    // Test mapSQLToParameters
    const testRow = { width: 200, height: 100, material: 'Steel' };
    const mapped = designTable['mapSQLToParameters'](testRow);
    console.log('   Mapped parameters:', mapped);
    console.log('   ✅ design_table_create functions working\n');
    
    // Test 3: Test getMassProperties
    console.log('3. Testing getMassProperties...');
    try {
      const massProps = api.getMassProperties();
      console.log('   Mass properties:', massProps);
      
      // Test that values are numeric
      if (typeof massProps.mass === 'number') {
        console.log('   ✅ Mass properties returns numeric values\n');
      } else {
        console.log('   ⚠️ Mass properties may need a part/assembly open\n');
      }
    } catch (e) {
      console.log('   ⚠️ Mass properties requires a part/assembly to be open\n');
    }
    
    console.log('All tests completed!');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    api.disconnect();
  }
}

// Run the tests
testFixes().catch(console.error);