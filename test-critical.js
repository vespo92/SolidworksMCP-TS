// CRITICAL TEST - Understanding the exact Dispatch behavior
// Run on Windows: node test-critical.js

const winax = require('winax');

console.log('=== CRITICAL DISPATCH BEHAVIOR TEST ===\n');

try {
  const sw = new winax.Object('SldWorks.Application');
  sw.Visible = true;
  
  console.log('1. Testing GetTitle access patterns:');
  console.log('   Raw object:', sw);
  console.log('   Constructor:', sw.constructor.name);
  console.log('   typeof sw.GetTitle:', typeof sw.GetTitle);
  
  // Critical test: What IS GetTitle exactly?
  const getTitle = sw.GetTitle;
  console.log('\n2. Analyzing GetTitle property:');
  console.log('   Assigned to variable:', getTitle);
  console.log('   typeof:', typeof getTitle);
  console.log('   Is function?:', typeof getTitle === 'function');
  
  // Test if it's a getter property
  console.log('\n3. Testing if GetTitle is a getter:');
  const descriptor = Object.getOwnPropertyDescriptor(sw, 'GetTitle');
  console.log('   Property descriptor:', descriptor);
  
  // Test different invocation patterns
  console.log('\n4. Testing invocation patterns:');
  
  // Pattern 1: Direct property access (should work based on test)
  try {
    const result1 = sw.GetTitle;
    console.log('   ✅ sw.GetTitle =', result1);
  } catch (e) {
    console.log('   ❌ sw.GetTitle failed:', e.message);
  }
  
  // Pattern 2: Method call (failed in test)
  try {
    const result2 = sw.GetTitle();
    console.log('   ✅ sw.GetTitle() =', result2);
  } catch (e) {
    console.log('   ❌ sw.GetTitle() failed:', e.message);
  }
  
  // Pattern 3: Call the stored reference
  try {
    const fn = sw.GetTitle;
    const result3 = fn();
    console.log('   ✅ fn() =', result3);
  } catch (e) {
    console.log('   ❌ fn() failed:', e.message);
  }
  
  // Pattern 4: Apply/Call
  try {
    const result4 = sw.GetTitle.call(sw);
    console.log('   ✅ GetTitle.call(sw) =', result4);
  } catch (e) {
    console.log('   ❌ GetTitle.call(sw) failed:', e.message);
  }
  
  // Test with a document
  console.log('\n5. Testing with Document:');
  const template = sw.GetUserPreferenceStringValue(8);
  const doc = sw.NewDocument(template, 0, 0, 0);
  
  if (doc) {
    console.log('   Document created');
    
    // Test GetTitle on document
    console.log('   typeof doc.GetTitle:', typeof doc.GetTitle);
    
    try {
      const docTitle = doc.GetTitle;
      console.log('   ✅ doc.GetTitle =', docTitle);
    } catch (e) {
      console.log('   ❌ doc.GetTitle failed:', e.message);
    }
    
    // Test GetType
    console.log('   typeof doc.GetType:', typeof doc.GetType);
    
    try {
      const docType = doc.GetType;
      console.log('   ✅ doc.GetType =', docType);
    } catch (e) {
      console.log('   ❌ doc.GetType failed:', e.message);
    }
    
    // Test methods that take parameters
    console.log('\n6. Testing methods with parameters:');
    
    // SaveAs3
    console.log('   typeof doc.SaveAs3:', typeof doc.SaveAs3);
    
    // Save3
    console.log('   typeof doc.Save3:', typeof doc.Save3);
    
    // Try calling Save3
    try {
      const saveResult = doc.Save3(1, 0, 0);
      console.log('   ✅ doc.Save3(1,0,0) =', saveResult);
    } catch (e) {
      console.log('   ❌ doc.Save3(1,0,0) failed:', e.message);
    }
  }
  
  console.log('\n=== CONCLUSION ===');
  console.log('Based on these results, we can determine:');
  console.log('1. Whether GetTitle/GetType are properties or callable methods');
  console.log('2. How to correctly access them in our code');
  console.log('3. Which methods require parentheses and which don\'t');
  
} catch (error) {
  console.log('FATAL ERROR:', error.message);
}

console.log('\nPLEASE RUN THIS TEST AND SHARE THE COMPLETE OUTPUT!');