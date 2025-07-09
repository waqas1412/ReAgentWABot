const searchService = require('./src/services/searchService');
const conversationService = require('./src/services/conversationService');

/**
 * Test the new intelligent search system with ambiguous queries
 */
async function testIntelligentSearch() {
  console.log('🧪 Testing Intelligent Search System\n');

  const testUser = {
    id: 'test-user',
    phone_number: '+1234567890',
    user_roles: { role: 'renter' }
  };

  const testQueries = [
    'apartment in 3000',           // Should ask for clarification (€3000 vs postal code 3000)
    'house under €500000',        // Clear price - should search normally
    'apartments in Lisbon',       // Clear location - should search normally
    '2 bedroom 1500',            // Ambiguous (€1500 vs area 1500)
    'luxury apartment',          // Potentially ambiguous - needs location
    'apartments under €2000 in Porto' // Clear - should search normally
  ];

  for (const query of testQueries) {
    console.log(`\n📝 Testing: "${query}"`);
    console.log('=' .repeat(50));
    
    try {
      const response = await conversationService.handleSearch(query, testUser);
      
      console.log('🤖 Bot Response:');
      response.forEach((msg, i) => {
        console.log(`   ${i + 1}. ${msg}`);
      });
      
    } catch (error) {
      console.error(`❌ Error testing "${query}":`, error.message);
    }
    
    console.log(''); // Add spacing
  }

  console.log('\n✅ Intelligent search testing complete!');
  console.log('\n💡 Expected behavior:');
  console.log('   • "apartment in 3000" → Ask clarification (€3000 vs postal code)');
  console.log('   • "house under €500000" → Normal search');
  console.log('   • "2 bedroom 1500" → Ask clarification (€1500 vs area)');
}

// Run the test
if (require.main === module) {
  testIntelligentSearch()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testIntelligentSearch }; 