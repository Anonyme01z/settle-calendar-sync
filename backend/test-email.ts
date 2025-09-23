// Test script for SendGrid email implementation
import dotenv from 'dotenv';
import { EmailService } from './src/services/emailService';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Using environment variables from .env file
// No need to set them manually

async function testEmail() {
  console.log('Testing SendGrid email implementation...');
  
  // Print environment variables for debugging
  console.log('Environment variables:');
  console.log('- SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'Set (hidden for security)' : 'Not set');
  console.log('- MAIL_FROM:', process.env.MAIL_FROM || 'Not set');
  console.log('- MAIL_FROM_NAME:', process.env.MAIL_FROM_NAME || 'Not set');
  
  try {
    // Test sending a feedback notification email
    console.log('Sending test email...');
    
    // Print the actual API key format (first 7 chars only for security)
    const apiKey = process.env.SENDGRID_API_KEY || '';
    console.log('API Key format check:', apiKey.substring(0, 7) + '...');
    
    // Force the API key to be properly formatted
    // SendGrid API keys must start with "SG." followed by the actual key
    if (!apiKey.startsWith('SG.')) {
      console.error('❌ Error: Your SendGrid API key must start with "SG."');
      console.error('Please update your .env file with a valid SendGrid API key');
      process.exit(1);
    }
    
    await EmailService.sendFeedbackNotification({
      name: 'Test User',
      email: process.env.MAIL_FROM!, // Send to yourself for testing
      message: 'This is a test email from the SendGrid implementation'
    });
    
    console.log('✅ Email sent successfully! Check your inbox.');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error sending email:');
    
    // Print detailed error information
    if (error?.response?.body?.errors) {
      console.error('SendGrid API error details:', JSON.stringify(error.response.body.errors, null, 2));
      console.error('\nPossible solutions:');
      console.error('1. Verify your SendGrid account is active');
      console.error('2. Make sure your API key has proper permissions (at least "Mail Send" access)');
      console.error('3. Check that your sender email is verified in SendGrid');
    } else {
      console.error(error);
    }
    
    process.exit(1);
  }
  
  try {
    // Send a test email
    await EmailService.sendFeedbackNotification({
      name: 'Test User',
      email: 'test@example.com',
      message: 'This is a test email from the SendGrid implementation.'
    });
    
    console.log('Test email sent successfully! Check the recipient inbox.');
    console.log('If you don\'t see the email, check your spam folder and SendGrid logs.');
  } catch (error) {
    console.error('Error sending test email:', error);
    process.exit(1);
  }
}

// Run the test
testEmail();