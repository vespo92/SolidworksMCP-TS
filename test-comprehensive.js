// COMPREHENSIVE TEST - Run this on Windows to understand Dispatch behavior
// node test-comprehensive.js

const winax = require('winax');
const fs = require('fs');

console.log('=== COMPREHENSIVE SOLIDWORKS DISPATCH TEST ===\n');
console.log('This test will help us understand exactly how to interact with SolidWorks COM objects.\n');

// Results object to save
const results = {
  timestamp: new Date().toISOString(),
  winaxVersion: '3.6.2',
  tests: {}
};

try {
  console.log('1. Creating SolidWorks Application object...');
  const sw = new winax.Object('SldWorks.Application');
  console.log('   ✅ Application object created\n');
  
  // Make visible
  sw.Visible = true;
  
  // ===== TEST SUITE 1: Application Properties =====
  console.log('2. Testing Application Properties:');
  results.tests.appProperties = {};
  
  const appPropertiesToTest = [
    'Visible',
    'FrameState',
    'StartupProcessCompleted',
    'ActiveDoc',
    'Version'
  ];
  
  for (const prop of appPropertiesToTest) {
    try {
      const value = sw[prop];
      console.log(`   ${prop}: ${typeof value} = ${value}`);
      results.tests.appProperties[prop] = { type: typeof value, value: String(value) };
    } catch (e) {
      console.log(`   ${prop}: ERROR - ${e.message}`);
      results.tests.appProperties[prop] = { error: e.message };
    }
  }
  
  // ===== TEST SUITE 2: Application Methods (No Parameters) =====
  console.log('\n3. Testing Application Methods (No Parameters):');
  results.tests.appMethodsNoParams = {};
  
  const appMethodsNoParams = [
    'GetTitle',
    'GetRevisionNumber',
    'GetBuildNumber',
    'GetProcessID'
  ];
  
  for (const method of appMethodsNoParams) {
    console.log(`   Testing ${method}:`);
    results.tests.appMethodsNoParams[method] = {};
    
    // Test as property access
    try {
      const value = sw[method];
      console.log(`     - As property: ${typeof value} = ${value}`);
      results.tests.appMethodsNoParams[method].asProperty = { type: typeof value, value: String(value) };
    } catch (e) {
      console.log(`     - As property: ERROR - ${e.message}`);
      results.tests.appMethodsNoParams[method].asProperty = { error: e.message };
    }
    
    // Test as method call
    try {
      const value = sw[method]();
      console.log(`     - As method(): ${typeof value} = ${value}`);
      results.tests.appMethodsNoParams[method].asMethod = { type: typeof value, value: String(value) };
    } catch (e) {
      console.log(`     - As method(): ERROR - ${e.message}`);
      results.tests.appMethodsNoParams[method].asMethod = { error: e.message };
    }
  }
  
  // ===== TEST SUITE 3: Application Methods (With Parameters) =====
  console.log('\n4. Testing Application Methods (With Parameters):');
  results.tests.appMethodsWithParams = {};
  
  // Test GetUserPreferenceStringValue
  console.log('   GetUserPreferenceStringValue(8):');
  try {
    const template = sw.GetUserPreferenceStringValue(8);
    console.log(`     - Result: ${template}`);
    results.tests.appMethodsWithParams.GetUserPreferenceStringValue = { success: true, value: template };
  } catch (e) {
    console.log(`     - ERROR: ${e.message}`);
    results.tests.appMethodsWithParams.GetUserPreferenceStringValue = { error: e.message };
  }
  
  // ===== TEST SUITE 4: Create and Test Document =====
  console.log('\n5. Creating a new document to test document methods:');
  results.tests.document = {};
  
  try {
    // Get template path
    const template = sw.GetUserPreferenceStringValue(8);
    console.log(`   Template: ${template}`);
    
    // Create new part
    const doc = sw.NewDocument(template, 0, 0, 0);
    
    if (doc) {
      console.log('   ✅ Document created\n');
      
      // Test document properties
      console.log('   Document Properties:');
      results.tests.document.properties = {};
      
      const docProperties = ['Visible', 'Title', 'PathName'];
      for (const prop of docProperties) {
        try {
          const value = doc[prop];
          console.log(`     ${prop}: ${typeof value} = ${value}`);
          results.tests.document.properties[prop] = { type: typeof value, value: String(value) };
        } catch (e) {
          console.log(`     ${prop}: ERROR - ${e.message}`);
          results.tests.document.properties[prop] = { error: e.message };
        }
      }
      
      // Test document methods
      console.log('\n   Document Methods:');
      results.tests.document.methods = {};
      
      const docMethods = ['GetTitle', 'GetType', 'GetPathName'];
      for (const method of docMethods) {
        console.log(`     Testing ${method}:`);
        results.tests.document.methods[method] = {};
        
        // As property
        try {
          const value = doc[method];
          console.log(`       - As property: ${typeof value} = ${value}`);
          results.tests.document.methods[method].asProperty = { type: typeof value, value: String(value) };
        } catch (e) {
          console.log(`       - As property: ERROR - ${e.message}`);
          results.tests.document.methods[method].asProperty = { error: e.message };
        }
        
        // As method
        try {
          const value = doc[method]();
          console.log(`       - As method(): ${typeof value} = ${value}`);
          results.tests.document.methods[method].asMethod = { type: typeof value, value: String(value) };
        } catch (e) {
          console.log(`       - As method(): ERROR - ${e.message}`);
          results.tests.document.methods[method].asMethod = { error: e.message };
        }
      }
      
      // Test accessing Extension
      console.log('\n   Testing Extension access:');
      results.tests.document.extension = {};
      try {
        const ext = doc.Extension;
        console.log(`     Extension: ${typeof ext} = ${ext ? 'exists' : 'null'}`);
        results.tests.document.extension.exists = !!ext;
        
        if (ext) {
          // Test SaveAs on Extension
          console.log('     Testing Extension.SaveAs:');
          try {
            const saveAsType = typeof ext.SaveAs;
            console.log(`       - typeof SaveAs: ${saveAsType}`);
            results.tests.document.extension.SaveAs = { type: saveAsType };
          } catch (e) {
            console.log(`       - ERROR: ${e.message}`);
            results.tests.document.extension.SaveAs = { error: e.message };
          }
        }
      } catch (e) {
        console.log(`     ERROR: ${e.message}`);
        results.tests.document.extension.error = e.message;
      }
      
      // Test FeatureManager
      console.log('\n   Testing FeatureManager access:');
      results.tests.document.featureManager = {};
      try {
        const fm = doc.FeatureManager;
        console.log(`     FeatureManager: ${typeof fm} = ${fm ? 'exists' : 'null'}`);
        results.tests.document.featureManager.exists = !!fm;
      } catch (e) {
        console.log(`     ERROR: ${e.message}`);
        results.tests.document.featureManager.error = e.message;
      }
      
      // Test SketchManager
      console.log('\n   Testing SketchManager access:');
      results.tests.document.sketchManager = {};
      try {
        const sm = doc.SketchManager;
        console.log(`     SketchManager: ${typeof sm} = ${sm ? 'exists' : 'null'}`);
        results.tests.document.sketchManager.exists = !!sm;
      } catch (e) {
        console.log(`     ERROR: ${e.message}`);
        results.tests.document.sketchManager.error = e.message;
      }
      
    } else {
      console.log('   ❌ Failed to create document');
      results.tests.document.error = 'Failed to create document';
    }
    
  } catch (e) {
    console.log(`   ERROR: ${e.message}`);
    results.tests.document.error = e.message;
  }
  
  // ===== TEST SUITE 5: Special Cases =====
  console.log('\n6. Testing Special Cases:');
  results.tests.specialCases = {};
  
  // Test undefined method
  console.log('   Non-existent method:');
  try {
    const value = sw.NonExistentMethod;
    console.log(`     typeof: ${typeof value}`);
    results.tests.specialCases.nonExistent = { type: typeof value };
  } catch (e) {
    console.log(`     ERROR: ${e.message}`);
    results.tests.specialCases.nonExistent = { error: e.message };
  }
  
  // Test iteration
  console.log('\n   Object keys:');
  try {
    const keys = Object.keys(sw);
    console.log(`     Keys (first 5): ${keys.slice(0, 5).join(', ')}`);
    results.tests.specialCases.keys = keys.slice(0, 10);
  } catch (e) {
    console.log(`     ERROR: ${e.message}`);
    results.tests.specialCases.keysError = e.message;
  }
  
} catch (error) {
  console.log('\n❌ FATAL ERROR:', error.message);
  results.fatalError = error.message;
}

// Save results to file
console.log('\n=== SAVING RESULTS ===');
const resultsJson = JSON.stringify(results, null, 2);
fs.writeFileSync('test-results.json', resultsJson);
console.log('Results saved to test-results.json');

// Print summary
console.log('\n=== SUMMARY ===');
console.log('Please share the test-results.json file.');
console.log('\nKey findings will help us understand:');
console.log('1. Which APIs are properties vs methods');
console.log('2. How to correctly access each type');
console.log('3. What the return values look like');
console.log('4. How to handle special cases');