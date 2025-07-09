const appointmentService = require('./src/services/appointmentService');

/**
 * Test the new intelligent appointment detection system
 */
async function testAppointmentIntelligence() {
  console.log('🧪 Testing Intelligent Appointment Detection\n');

  const testMessages = [
    // Should detect as appointment requests
    'i am interested in visiting this',
    'i am interested in visitng this',  // Typo test
    'I want to see this property',
    'can I book a viewing',
    'when can I visit',
    'schedule a tour for this place',
    'interested in viewing the apartment',
    'would love to see this house',
    
    // Should NOT detect as appointment requests  
    'tell me more about properties',
    'what is the price',
    'show me apartments in Lisbon',
    'hello how are you',
    'update my property price'
  ];

  for (const message of testMessages) {
    console.log(`\n📝 Testing: "${message}"`);
    console.log('=' .repeat(50));
    
    try {
      const result = await appointmentService.isAppointmentRequest(message);
      
      console.log(`🤖 Detection Result:`);
      console.log(`   Is Appointment: ${result.isAppointmentRequest ? '✅ YES' : '❌ NO'}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Intent Type: ${result.intentType}`);
      console.log(`   Has Context: ${result.hasContextualReference ? 'Yes' : 'No'}`);
      console.log(`   Keywords: [${result.keywords.join(', ')}]`);
      
    } catch (error) {
      console.error(`❌ Error testing "${message}":`, error.message);
    }
  }

  console.log('\n✅ Intelligent appointment detection testing complete!');
  console.log('\n💡 Expected behavior:');
  console.log('   • "interested in visiting this" → ✅ Detected');
  console.log('   • "visitng" typo → ✅ Handled intelligently');
  console.log('   • "tell me about properties" → ❌ Not detected');
}

// Run the test
if (require.main === module) {
  testAppointmentIntelligence()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testAppointmentIntelligence }; 