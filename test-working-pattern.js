// TEST WORKING PATTERN - Based on user's confirmation that it worked before
// This test tries to replicate what might have been working
// Run on Windows: node test-working-pattern.js

const winax = require('winax');

console.log('=== TESTING PATTERN FROM WORKING VERSION ===\n');

// Based on the Fixes-V2 code, they were calling methods with parentheses
// Let's test if there's a specific pattern that makes this work

try {
  console.log('1. Testing with ActiveXObject (which user confirmed works):');
  
  // This pattern worked in user's test
  const sw1 = new ActiveXObject('SldWorks.Application');
  console.log('   ✅ Created with ActiveXObject');
  console.log('   typeof sw1:', typeof sw1);
  console.log('   typeof sw1.GetTitle:', typeof sw1.GetTitle);
  
  try {
    const title1 = sw1.GetTitle();
    console.log('   ✅ sw1.GetTitle() =', title1);
  } catch (e) {
    console.log('   ❌ sw1.GetTitle() failed:', e.message);
    try {
      const title1b = sw1.GetTitle;
      console.log('   ✅ sw1.GetTitle =', title1b);
    } catch (e2) {
      console.log('   ❌ sw1.GetTitle failed:', e2.message);
    }
  }
  
} catch (e) {
  console.log('   ActiveXObject not available or failed:', e.message);
}

console.log('\n2. Testing with winax.Object:');
try {
  const sw2 = new winax.Object('SldWorks.Application');
  console.log('   ✅ Created with winax.Object');
  console.log('   typeof sw2:', typeof sw2);
  console.log('   typeof sw2.GetTitle:', typeof sw2.GetTitle);
  
  // The actual values we need
  console.log('\n3. Getting actual values we need for MCP:');
  
  // Make visible
  sw2.Visible = true;
  console.log('   ✅ Set Visible = true');
  
  // Get title (try both patterns)
  let appTitle;
  try {
    appTitle = sw2.GetTitle();
    console.log('   ✅ App title (method):', appTitle);
  } catch (e) {
    appTitle = sw2.GetTitle;
    console.log('   ✅ App title (property):', appTitle);
  }
  
  // Create a document
  console.log('\n4. Creating document and testing methods:');
  const template = sw2.GetUserPreferenceStringValue(8);
  console.log('   Template:', template);
  
  const doc = sw2.NewDocument(template, 0, 0, 0);
  if (doc) {
    console.log('   ✅ Document created');
    
    // Get document title
    let docTitle;
    try {
      docTitle = doc.GetTitle();
      console.log('   ✅ Doc title (method):', docTitle);
    } catch (e) {
      docTitle = doc.GetTitle;
      console.log('   ✅ Doc title (property):', docTitle);
    }
    
    // Get document type
    let docType;
    try {
      docType = doc.GetType();
      console.log('   ✅ Doc type (method):', docType);
    } catch (e) {
      docType = doc.GetType;
      console.log('   ✅ Doc type (property):', docType);
    }
    
    // Get path name
    let pathName;
    try {
      pathName = doc.GetPathName();
      console.log('   ✅ Path name (method):', pathName);
    } catch (e) {
      pathName = doc.GetPathName;
      console.log('   ✅ Path name (property):', pathName);
    }
    
    // Test managers
    console.log('\n5. Testing managers:');
    const fm = doc.FeatureManager;
    console.log('   FeatureManager:', fm ? 'exists' : 'null');
    
    const sm = doc.SketchManager;
    console.log('   SketchManager:', sm ? 'exists' : 'null');
    
    const ext = doc.Extension;
    console.log('   Extension:', ext ? 'exists' : 'null');
    
    // Close document
    console.log('\n6. Closing document:');
    try {
      const closeTitle = docTitle || 'Unknown';
      sw2.CloseDoc(closeTitle);
      console.log('   ✅ Document closed');
    } catch (e) {
      console.log('   ❌ Close failed:', e.message);
    }
  }
  
} catch (e) {
  console.log('   Failed:', e.message);
}

console.log('\n=== PATTERN RECOMMENDATION ===');
console.log('Based on these results, the correct pattern is:');
console.log('1. Properties like Visible: Direct access (sw.Visible)');
console.log('2. Getters like GetTitle: [TO BE DETERMINED FROM TEST]');
console.log('3. Methods with params: Function call (sw.NewDocument(...))');
console.log('\nShare this output to determine the correct implementation!');