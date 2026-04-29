// Service: Paystack payment gateway integration
import axios from 'axios';

export interface PaystackConfig {
  secretKey: string;
  publicKey: string;
  baseUrl: string;
}

export interface PaystackCustomer {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

export interface PaystackTransaction {
  amount: number;
  email: string;
  reference?: string;
  callback_url?: string;
  metadata?: any;
  customer?: PaystackCustomer;
  currency?: string;
}

export interface PaystackResponse {
  status: boolean;
  message: string;
  data?: any;
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    domain: string;
    status: string;
    reference: string;
    amount: number;
    message: string;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: string;
    currency: string;
    ip_address: string;
    metadata: any;
    log: any;
    fees: number;
    fees_split: any;
    authorization: any;
    customer: any;
    plan: any;
    split: any;
    order_id: any;
    paidAt: string;
    createdAt: string;
    requested_amount: number;
    pos_transaction_data: any;
    source: any;
    fees_breakdown: any;
  };
}

export class PaystackService {
  private static config: PaystackConfig;
  private static initialized = false;

  static initialize() {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const publicKey = process.env.PAYSTACK_PUBLIC_KEY;
    
    if (!secretKey || !publicKey) {
      throw new Error('Paystack credentials not configured. Please set PAYSTACK_SECRET_KEY and PAYSTACK_PUBLIC_KEY');
    }

    this.config = {
      secretKey,
      publicKey,
      baseUrl: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co'
    };

    this.initialized = true;
    console.log('Paystack service initialized successfully');
  }

  private static ensureInitialized() {
    if (!this.initialized) {
      this.initialize();
    }
  }

  // Initialize transaction
  static async initializeTransaction(transaction: PaystackTransaction): Promise<PaystackResponse> {
    this.ensureInitialized();

    try {
      const response = await axios.post(
        `${this.config.baseUrl}/transaction/initialize`,
        {
          amount: Math.round(transaction.amount * 100), // Convert to kobo (cents)
          email: transaction.email,
          reference: transaction.reference,
          callback_url: transaction.callback_url,
          metadata: transaction.metadata,
          customer: transaction.customer,
          currency: transaction.currency || 'NGN'
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Paystack initialization error:', error.response?.data || error.message);
      return {
        status: false,
        message: error.response?.data?.message || 'Failed to initialize transaction'
      };
    }
  }

  // Verify transaction
  static async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    this.ensureInitialized();

    try {
      const response = await axios.get(
        `${this.config.baseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Paystack verification error:', error.response?.data || error.message);
      return {
        status: false,
        message: error.response?.data?.message || 'Failed to verify transaction',
        data: null as any
      };
    }
  }

  // Create customer
  static async createCustomer(customer: PaystackCustomer): Promise<PaystackResponse> {
    this.ensureInitialized();

    try {
      const response = await axios.post(
        `${this.config.baseUrl}/customer`,
        customer,
        {
          headers: {
            'Authorization': `Bearer ${this.config.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Paystack customer creation error:', error.response?.data || error.message);
      return {
        status: false,
        message: error.response?.data?.message || 'Failed to create customer'
      };
    }
  }

  // Get customer by email
  static async getCustomerByEmail(email: string): Promise<PaystackResponse> {
    this.ensureInitialized();

    try {
      const response = await axios.get(
        `${this.config.baseUrl}/customer/${email}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Paystack customer fetch error:', error.response?.data || error.message);
      return {
        status: false,
        message: error.response?.data?.message || 'Customer not found'
      };
    }
  }

  // Create transfer recipient (for withdrawals)
  static async createTransferRecipient(
    type: 'nuban' | 'mobile_money' | 'basa',
    name: string,
    account_number: string,
    bank_code: string,
    currency: string = 'NGN'
  ): Promise<PaystackResponse> {
    this.ensureInitialized();

    try {
      const response = await axios.post(
        `${this.config.baseUrl}/transferrecipient`,
        {
          type,
          name,
          account_number,
          bank_code,
          currency
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Paystack transfer recipient creation error:', error.response?.data || error.message);
      return {
        status: false,
        message: error.response?.data?.message || 'Failed to create transfer recipient'
      };
    }
  }

  // Initiate transfer (for withdrawals)
  static async initiateTransfer(
    source: 'balance',
    amount: number,
    recipient: string,
    reason: string,
    reference?: string
  ): Promise<PaystackResponse> {
    this.ensureInitialized();

    try {
      const response = await axios.post(
        `${this.config.baseUrl}/transfer`,
        {
          source,
          amount: Math.round(amount * 100), // Convert to kobo
          recipient,
          reason,
          reference
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Paystack transfer error:', error.response?.data || error.message);
      return {
        status: false,
        message: error.response?.data?.message || 'Failed to initiate transfer'
      };
    }
  }

  // Get banks list (for Nigerian banks)
  static async getBanks(): Promise<PaystackResponse> {
    this.ensureInitialized();

    try {
      const response = await axios.get(
        `${this.config.baseUrl}/bank`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Paystack banks fetch error:', error.response?.data || error.message);
      return {
        status: false,
        message: error.response?.data?.message || 'Failed to fetch banks'
      };
    }
  }

  // Validate account number
  static async validateAccountNumber(accountNumber: string, bankCode: string): Promise<PaystackResponse> {
    this.ensureInitialized();

    try {
      const response = await axios.get(
        `${this.config.baseUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Paystack account validation error:', error.response?.data || error.message);
      return {
        status: false,
        message: error.response?.data?.message || 'Failed to validate account'
      };
    }
  }

  // Get public key for frontend
  static getPublicKey(): string {
    this.ensureInitialized();
    return this.config.publicKey;
  }

  // Generate unique reference
  static generateReference(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `settle_${timestamp}_${random}`;
  }

  // Format amount for display
  static formatAmount(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  }

  // Convert amount from kobo to main currency
  static convertFromKobo(amount: number): number {
    return amount / 100;
  }

  // Convert amount to kobo
  static convertToKobo(amount: number): number {
    return Math.round(amount * 100);
  }
}
