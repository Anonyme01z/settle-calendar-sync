// Simple SendGrid test script
require('dotenv').config();

// Check if API key is set
const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  console.error('SENDGRID_API_KEY is not set in .env file');
  process.exit(1);
}

console.log('API Key found:', apiKey.substring(0, 7) + '...');

// Check sender email
const fromEmail = process.env.MAIL_FROM;
if (!fromEmail) {
  console.error('MAIL_FROM is not set in .env file');
  process.exit(1);
}
console.log('Using sender email:', fromEmail);
console.log('NOTE: This email MUST be verified in your SendGrid account');
console.log('To verify: Go to SendGrid dashboard > Settings > Sender Authentication');

// Initialize SendGrid
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(apiKey);

// Create test message
const msg = {
  to: fromEmail, // Send to yourself for testing
  from: fromEmail,
  subject: 'SendGrid Test',
  text: 'This is a test email from SendGrid',
  html: '<strong>This is a test email from SendGrid</strong>',
};

// Send the email
console.log('\nSending test email...');
sgMail.send(msg)
  .then(() => {
    console.log('✅ Email sent successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error sending email:');
    
    if (error.response && error.response.body && error.response.body.errors) {
      const errors = error.response.body.errors;
      
      // Check for sender verification error
      const senderError = errors.find(e => e.field === 'from');
      if (senderError) {
        console.error('\n⚠️ SENDER VERIFICATION ERROR:');
        console.error('The email address you\'re using as sender (' + fromEmail + ') has not been verified in SendGrid.');
        console.error('\nTo fix this:');
        console.error('1. Go to SendGrid dashboard: https://app.sendgrid.com/settings/sender_auth');
        console.error('2. Click "Verify a Single Sender"');
        console.error('3. Follow the steps to verify ' + fromEmail);
        console.error('4. Once verified, run this test again');
      } else {
        console.error(error.response.body);
      }
    } else {
      console.error(error);
    }
    
    process.exit(1);
  });