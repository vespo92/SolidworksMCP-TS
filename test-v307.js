// Test script for v3.0.7 - Run this on Windows with: node test-v307.js
console.log('=== SolidWorks MCP v3.0.7 Test ===\n');

// Test 1: Direct winax loading (what works in your test)
console.log('Test 1: Direct winax require()');
try {
  const winax = require('winax');
  console.log('✅ winax loaded via require()');
  console.log('   - winax.Object exists:', !!winax.Object);
  console.log('   - global.ActiveXObject exists:', !!global.ActiveXObject);
  
  // Try creating COM object
  const sw = new winax.Object('SldWorks.Application');
  console.log('✅ Created SolidWorks COM object directly');
  console.log('   - Object is null:', sw === null);
  console.log('   - Object type:', typeof sw);
  if (sw && sw.GetTitle) {
    console.log('   - GetTitle method exists');
  }
} catch (error) {
  console.log('❌ Direct winax test failed:', error.message);
}

console.log('\n---\n');

// Test 2: Eval-based loading (what v3.0.7 uses)
console.log('Test 2: Eval-based require() (v3.0.7 approach)');
try {
  const winaxEval = eval("require('winax')");
  console.log('✅ winax loaded via eval(require())');
  console.log('   - winax.Object exists:', !!winaxEval.Object);
  console.log('   - global.ActiveXObject exists:', !!global.ActiveXObject);
  
  // Try creating COM object
  const sw = new winaxEval.Object('SldWorks.Application');
  console.log('✅ Created SolidWorks COM object via eval');
  console.log('   - Object is null:', sw === null);
  console.log('   - Object type:', typeof sw);
  if (sw && sw.GetTitle) {
    console.log('   - GetTitle method exists');
  }
} catch (error) {
  console.log('❌ Eval-based test failed:', error.message);
}

console.log('\n---\n');

// Test 3: Import the compiled API module
console.log('Test 3: Import compiled API module');
import('./dist/solidworks/api.js').then(({ SolidWorksAPI }) => {
  console.log('✅ API module loaded');
  
  const api = new SolidWorksAPI();
  
  try {
    console.log('Attempting to connect to SolidWorks...');
    api.connect();
    console.log('✅ API connect() called successfully');
    
    // Check if connection worked
    if (api.swApp) {
      console.log('✅ swApp exists');
      console.log('   - swApp is null:', api.swApp === null);
      console.log('   - swApp type:', typeof api.swApp);
      
      // Try to access a property
      try {
        const title = api.swApp.GetTitle ? api.swApp.GetTitle() : 'No GetTitle method';
        console.log('   - Window title:', title);
      } catch (e) {
        console.log('   - Error accessing GetTitle:', e.message);
      }
    } else {
      console.log('❌ swApp is undefined or null');
    }
    
    api.disconnect();
    console.log('✅ Disconnected successfully');
    
  } catch (error) {
    console.log('❌ API test failed:', error.message);
    console.log('   Full error:', error);
  }
}).catch(error => {
  console.log('❌ Failed to import API module:', error.message);
});

// Test 4: Check what happens with null COM object
console.log('\nTest 4: Debugging null COM object');
setTimeout(() => {
  try {
    const winax = require('winax');
    console.log('Creating COM object for debugging...');
    const sw = new winax.Object('SldWorks.Application');
    
    console.log('COM object details:');
    console.log('   - Value:', sw);
    console.log('   - Type:', typeof sw);
    console.log('   - Is null:', sw === null);
    console.log('   - Is undefined:', sw === undefined);
    console.log('   - Constructor:', sw?.constructor?.name);
    console.log('   - Keys:', sw ? Object.keys(sw).slice(0, 5) : 'N/A');
    
    // Try different ways to check if it's valid
    if (sw) {
      console.log('   - Truthy: yes');
      try {
        // Try to list properties
        for (let key in sw) {
          console.log(`   - Property: ${key}`);
          break; // Just show first one
        }
      } catch (e) {
        console.log('   - Cannot enumerate properties:', e.message);
      }
    } else {
      console.log('   - Truthy: no');
    }
    
  } catch (error) {
    console.log('Debug test error:', error.message);
  }
}, 1000);