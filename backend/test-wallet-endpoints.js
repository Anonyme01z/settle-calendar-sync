#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const API_BASE = `${BASE_URL}/api`;

// Test configuration
const TEST_CONFIG = {
  email: 'test@example.com',
  password: 'testpass123',
  businessName: 'Test Business'
};

async function testWalletEndpoints() {
  try {
    console.log('🚀 Testing Wallet Endpoints...\n');

    // 1. Register a test user
    console.log('1. Registering test user...');
    const registerResponse = await axios.post(`${API_BASE}/auth/register`, TEST_CONFIG);
    const { token } = registerResponse.data;
    console.log('✅ User registered successfully');

    const headers = { Authorization: `Bearer ${token}` };

    // 2. Test wallet balance endpoint
    console.log('\n2. Testing wallet balance endpoint...');
    const balanceResponse = await axios.get(`${API_BASE}/payments/wallet/balance`, { headers });
    console.log('✅ Wallet balance:', balanceResponse.data);

    // 3. Test main wallet endpoint
    console.log('\n3. Testing main wallet endpoint...');
    const walletResponse = await axios.get(`${API_BASE}/payments/wallet`, { headers });
    console.log('✅ Wallet info:', walletResponse.data);

    // 4. Test transactions endpoint
    console.log('\n4. Testing transactions endpoint...');
    const transactionsResponse = await axios.get(`${API_BASE}/payments/transactions?limit=10&offset=0`, { headers });
    console.log('✅ Transactions:', transactionsResponse.data);

    // 5. Test banks endpoint (public)
    console.log('\n5. Testing banks endpoint...');
    const banksResponse = await axios.get(`${API_BASE}/payments/banks`);
    console.log('✅ Banks count:', banksResponse.data.banks?.length || 0);

    console.log('\n🎉 All wallet endpoints are working correctly!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.status === 500) {
      console.error('💡 Check server logs for detailed error information');
    }
  }
}

// Run tests
if (require.main === module) {
  testWalletEndpoints();
}

module.exports = testWalletEndpoints;