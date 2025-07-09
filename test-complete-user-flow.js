const conversationService = require('./src/services/conversationService');

/**
 * Test the complete user flow from the screenshot
 */
async function testCompleteUserFlow() {
  console.log('🧪 Testing Complete User Flow (Screenshot Simulation)\n');

  const testUser = {
    id: 'test-user-123',
    phone_number: '+358417407821',
    user_roles: { role: 'renter' },
    name: 'Waqas'
  };

  try {
    console.log('👤 User: Waqas (+358417407821)');
    console.log('🎯 Simulating the exact flow from screenshot...\n');

    // Step 1: Search for properties (simulate previous search)
    console.log('📝 Step 1: User searches for properties');
    console.log('User: "apartments in Lisbon"');
    console.log('=' .repeat(50));
    
    const searchResponse = await conversationService.handleSearch('apartments in Lisbon', testUser);
    console.log('🤖 Bot Response:');
    searchResponse.slice(0, 1).forEach((msg, i) => {
      console.log(`   ${i + 1}. ${msg.substring(0, 200)}...`);
    });
    console.log('   [Search results displayed - properties 1-10 shown]');

    console.log('\n');

    // Step 2: User asks for details of property 4
    console.log('📝 Step 2: User asks for property details');
    console.log('User: "tell me more about 4"');
    console.log('=' .repeat(50));
    
    const detailsResponse = await conversationService.processMessage('tell me more about 4', testUser);
    console.log('🤖 Bot Response:');
    detailsResponse.forEach((msg, i) => {
      console.log(`   ${i + 1}. ${msg.substring(0, 200)}...`);
    });

    console.log('\n');

    // Step 3: THE CRITICAL TEST - User expresses viewing interest
    console.log('📝 Step 3: User expresses viewing interest (THE FIX)');
    console.log('User: "i am interested in visiting this"');
    console.log('=' .repeat(50));
    
    const viewingResponse = await conversationService.processMessage('i am interested in visiting this', testUser);
    console.log('🤖 Bot Response:');
    viewingResponse.forEach((msg, i) => {
      console.log(`   ${i + 1}. ${msg}`);
    });

    console.log('\n');
    console.log('✅ Complete user flow test finished!');
    console.log('\n🎯 EXPECTED vs ACTUAL:');
    console.log('   Expected: Appointment booking for property 4 ✅');
    console.log('   Actual: Check bot responses above');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testCompleteUserFlow()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testCompleteUserFlow }; 