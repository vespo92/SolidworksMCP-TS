// TEST MCP OPERATIONS - Test the actual operations that MCP server needs
// node test-mcp-operations.js

const winax = require('winax');

console.log('=== MCP OPERATIONS TEST ===\n');
console.log('Testing the specific operations that the MCP server performs\n');

function testOperation(name, operation) {
  console.log(`\nTesting: ${name}`);
  console.log('=' .repeat(50));
  try {
    const result = operation();
    console.log('✅ SUCCESS');
    if (result !== undefined) {
      console.log('Result:', result);
    }
    return { success: true, result };
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', error.message);
    return { success: false, error: error.message };
  }
}

// Initialize SolidWorks
let sw, doc;

testOperation('1. Connect to SolidWorks', () => {
  sw = new winax.Object('SldWorks.Application');
  sw.Visible = true;
  return 'Connected';
});

testOperation('2. Get SolidWorks Title (as property)', () => {
  return sw.GetTitle;
});

testOperation('3. Get SolidWorks Title (as method)', () => {
  return sw.GetTitle();
});

testOperation('4. Create New Part', () => {
  const template = sw.GetUserPreferenceStringValue(8);
  doc = sw.NewDocument(template, 0, 0, 0);
  return doc ? 'Document created' : 'Failed';
});

if (doc) {
  testOperation('5. Get Document Title (as property)', () => {
    return doc.GetTitle;
  });
  
  testOperation('6. Get Document Title (as method)', () => {
    return doc.GetTitle();
  });
  
  testOperation('7. Get Document Type (as property)', () => {
    return doc.GetType;
  });
  
  testOperation('8. Get Document Type (as method)', () => {
    return doc.GetType();
  });
  
  testOperation('9. Access FeatureManager', () => {
    const fm = doc.FeatureManager;
    return fm ? 'FeatureManager accessible' : 'null';
  });
  
  testOperation('10. Access SketchManager', () => {
    const sm = doc.SketchManager;
    return sm ? 'SketchManager accessible' : 'null';
  });
  
  testOperation('11. Access Extension', () => {
    const ext = doc.Extension;
    return ext ? 'Extension accessible' : 'null';
  });
  
  testOperation('12. Create Sketch', () => {
    const sm = doc.SketchManager;
    if (!sm) throw new Error('No SketchManager');
    
    // Try to insert sketch
    sm.InsertSketch(true);
    return 'Sketch inserted';
  });
  
  testOperation('13. Get Active Sketch', () => {
    const sm = doc.SketchManager;
    if (!sm) throw new Error('No SketchManager');
    
    const sketch = sm.ActiveSketch;
    return sketch ? 'Active sketch exists' : 'No active sketch';
  });
  
  testOperation('14. Create Line', () => {
    const sm = doc.SketchManager;
    if (!sm) throw new Error('No SketchManager');
    
    const line = sm.CreateLine(0, 0, 0, 0.1, 0, 0);
    return line ? 'Line created' : 'Failed';
  });
  
  testOperation('15. Save Document', () => {
    // Try different save methods
    try {
      doc.Save3(1, 0, 0);
      return 'Save3 worked';
    } catch (e1) {
      try {
        doc.Save();
        return 'Save worked';
      } catch (e2) {
        try {
          doc.SaveAs('C:\\temp\\test.SLDPRT');
          return 'SaveAs worked';
        } catch (e3) {
          throw new Error(`All save methods failed: Save3: ${e1.message}, Save: ${e2.message}, SaveAs: ${e3.message}`);
        }
      }
    }
  });
  
  testOperation('16. Close Document', () => {
    const title = doc.GetTitle || doc.GetTitle();
    sw.CloseDoc(title);
    return 'Document closed';
  });
}

console.log('\n\n=== TEST PATTERNS ===');
console.log('\nBased on these results, we need to understand:');
console.log('1. Which operations work as properties vs methods');
console.log('2. Which operations fail completely');
console.log('3. What the actual return values are');
console.log('\nPlease run this test and share the output!');