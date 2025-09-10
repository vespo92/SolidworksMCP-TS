// Test to understand winax Dispatch object behavior
// Run on Windows: node test-dispatch.js

const winax = require('winax');

console.log('=== Winax Dispatch Object Behavior Test ===\n');

try {
  const sw = new winax.Object('SldWorks.Application');
  console.log('Created SolidWorks COM object\n');
  
  // Test accessing properties vs calling methods
  console.log('Testing property/method access patterns:\n');
  
  // Test 1: Visible (known property)
  console.log('1. Visible property:');
  console.log('   - typeof sw.Visible:', typeof sw.Visible);
  console.log('   - Value:', sw.Visible);
  
  // Test 2: GetTitle (the problematic one)
  console.log('\n2. GetTitle:');
  console.log('   - typeof sw.GetTitle:', typeof sw.GetTitle);
  try {
    console.log('   - Calling GetTitle():', sw.GetTitle());
  } catch (e) {
    console.log('   - GetTitle() failed:', e.message);
  }
  try {
    console.log('   - Accessing GetTitle:', sw.GetTitle);
  } catch (e) {
    console.log('   - GetTitle access failed:', e.message);
  }
  
  // Test 3: NewDocument (method that takes parameters)
  console.log('\n3. NewDocument:');
  console.log('   - typeof sw.NewDocument:', typeof sw.NewDocument);
  
  // Test 4: GetUserPreferenceStringValue (method with parameter)
  console.log('\n4. GetUserPreferenceStringValue:');
  console.log('   - typeof sw.GetUserPreferenceStringValue:', typeof sw.GetUserPreferenceStringValue);
  try {
    const val = sw.GetUserPreferenceStringValue(8);
    console.log('   - Called with (8):', val);
  } catch (e) {
    console.log('   - Call failed:', e.message);
  }
  
  // Test 5: Create a document and test its methods
  console.log('\n5. Testing document methods:');
  try {
    // Get default template
    const template = sw.GetUserPreferenceStringValue(8);
    console.log('   - Got template:', template);
    
    // Create new document
    const doc = sw.NewDocument(template, 0, 0, 0);
    if (doc) {
      console.log('   - Document created');
      
      // Test GetTitle on document
      console.log('   - typeof doc.GetTitle:', typeof doc.GetTitle);
      try {
        console.log('   - doc.GetTitle():', doc.GetTitle());
      } catch (e) {
        console.log('   - doc.GetTitle() failed:', e.message);
        try {
          console.log('   - doc.GetTitle:', doc.GetTitle);
        } catch (e2) {
          console.log('   - doc.GetTitle access failed:', e2.message);
        }
      }
      
      // Test GetType
      console.log('   - typeof doc.GetType:', typeof doc.GetType);
      try {
        console.log('   - doc.GetType():', doc.GetType());
      } catch (e) {
        console.log('   - doc.GetType() failed:', e.message);
        try {
          console.log('   - doc.GetType:', doc.GetType);
        } catch (e2) {
          console.log('   - doc.GetType access failed:', e2.message);
        }
      }
    }
  } catch (e) {
    console.log('   - Document test failed:', e.message);
  }
  
} catch (error) {
  console.log('Failed to create COM object:', error.message);
  console.log('\nMake sure SolidWorks is running before running this test.');
}