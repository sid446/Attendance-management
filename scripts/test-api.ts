import 'dotenv/config';

async function testPredefinedValuesAPI() {
  try {
    const response = await fetch('http://localhost:3001/api/users/predefined-values');
    const data = await response.json();

    console.log('API Response:', JSON.stringify(data, null, 2));

    if (data.success && data.data) {
      console.log('\n✅ API is working correctly!');
      console.log(`Teams: ${data.data.teams.length} values`);
      console.log(`Designations: ${data.data.designations.length} values`);
      console.log(`Paid From: ${data.data.paidFrom.length} values`);
      console.log(`Categories: ${data.data.categories.length} values`);
    } else {
      console.log('❌ API returned error:', data);
    }
  } catch (error) {
    console.error('❌ Failed to test API:', error);
  }
}

testPredefinedValuesAPI();