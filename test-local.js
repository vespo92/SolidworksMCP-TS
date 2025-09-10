// Test script to verify the fix works
// Run this on Windows with: node test-local.js

import('./dist/solidworks/api.js').then(({ SolidWorksAPI }) => {

async function test() {
  console.log('Testing SolidWorks MCP API...');
  
  const api = new SolidWorksAPI();
  
  try {
    console.log('Attempting to connect to SolidWorks...');
    api.connect();
    console.log('✅ SUCCESS! Connected to SolidWorks');
    
    // Try to get some info to verify connection
    if (api.swApp) {
      console.log('SolidWorks application object exists');
    }
    
    api.disconnect();
    console.log('Disconnected successfully');
    
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    console.error('Full error:', error);
  }
}

test();
});