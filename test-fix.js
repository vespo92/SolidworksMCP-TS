// FIX TEST - Testing what actually works
const winax = require('winax');

console.log('=== FIX TEST ===\n');

try {
  const sw = new winax.Object('SldWorks.Application');
  sw.Visible = true;
  console.log('✅ Connected to SolidWorks\n');
  
  // Test 1: Application doesn't have GetTitle
  console.log('1. Application properties:');
  console.log('   Visible:', sw.Visible);
  console.log('   GetProcessID:', sw.GetProcessID());
  
  // Test 2: Create part directly
  console.log('\n2. Creating new part:');
  const doc = sw.NewPart();  // Try NewPart instead of NewDocument
  
  if (doc) {
    console.log('   ✅ Part created with NewPart()');
    
    // Now test GetTitle on DOCUMENT
    console.log('\n3. Document properties:');
    console.log('   typeof doc.GetTitle:', typeof doc.GetTitle);
    console.log('   doc.GetTitle:', doc.GetTitle);
    
    // If GetTitle is a function on document
    if (typeof doc.GetTitle === 'function') {
      console.log('   doc.GetTitle():', doc.GetTitle());
    }
    
    console.log('   typeof doc.GetType:', typeof doc.GetType);
    console.log('   doc.GetType:', doc.GetType);
    
    if (typeof doc.GetType === 'function') {
      console.log('   doc.GetType():', doc.GetType());
    }
    
    console.log('   typeof doc.GetPathName:', typeof doc.GetPathName);
    console.log('   doc.GetPathName:', doc.GetPathName);
    
    // Close it
    const title = doc.GetTitle || doc.GetTitle() || 'Part1';
    sw.CloseDoc(title);
  } else {
    console.log('   ❌ NewPart() returned null');
  }
  
} catch (error) {
  console.log('ERROR:', error.message);
}