// Test to debug why COM object might be null
// Run on Windows: node test-com-null.js

const winax = require('winax');

console.log('=== COM Object Null Debug Test ===\n');

// Test different ProgIDs
const progIds = [
  'SldWorks.Application',
  'SldWorks.Application.31',  // Try specific version (2023)
  'SldWorks.Application.30',  // Try specific version (2022)
  'SldWorks.Application.29',  // Try specific version (2021)
];

for (const progId of progIds) {
  console.log(`Testing ProgID: ${progId}`);
  try {
    const sw = new winax.Object(progId);
    
    if (sw === null) {
      console.log('  ❌ COM object is null');
    } else if (sw === undefined) {
      console.log('  ❌ COM object is undefined');
    } else {
      console.log('  ✅ COM object created');
      
      // Try to check if it's a valid COM object
      try {
        // Check for common SolidWorks properties
        const hasVisible = 'Visible' in sw;
        const hasGetTitle = 'GetTitle' in sw;
        
        console.log(`     - Has Visible property: ${hasVisible}`);
        console.log(`     - Has GetTitle method: ${hasGetTitle}`);
        
        if (hasGetTitle) {
          try {
            const title = sw.GetTitle();
            console.log(`     - Window title: "${title}"`);
          } catch (e) {
            console.log(`     - GetTitle() error: ${e.message}`);
          }
        }
        
        // Try to make it visible
        if (hasVisible) {
          try {
            sw.Visible = true;
            console.log('     - Set Visible = true');
          } catch (e) {
            console.log(`     - Set Visible error: ${e.message}`);
          }
        }
        
      } catch (e) {
        console.log(`     - Error checking properties: ${e.message}`);
      }
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
  console.log('');
}

// Also test if SolidWorks is running
console.log('Checking if SolidWorks is running...');
try {
  const sw = new winax.Object('SldWorks.Application');
  if (sw && sw.Visible !== undefined) {
    console.log('✅ SolidWorks appears to be accessible');
  } else {
    console.log('⚠️  SolidWorks COM object created but may not be fully accessible');
  }
} catch (e) {
  console.log('❌ Cannot connect to SolidWorks:', e.message);
  console.log('\nPossible reasons:');
  console.log('1. SolidWorks is not installed');
  console.log('2. SolidWorks is not running (try starting it first)');
  console.log('3. COM registration issues (try running as administrator)');
  console.log('4. Version mismatch in ProgID');
}