// Test SendGrid email from Docker container
const axios = require('axios');

async function testDockerEmail() {
  console.log('Testing email functionality in Docker container...');
  
  try {
    // Test a simple signup OTP email
    const response = await axios.post('http://localhost:3001/api/auth/send-signup-otp', {
      email: 'dolusoga001@gmail.com', // Send to the verified sender email
      name: 'Test User'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Email API call successful!');
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    
  } catch (error) {
    console.error('❌ Email API call failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Run the test
testDockerEmail();