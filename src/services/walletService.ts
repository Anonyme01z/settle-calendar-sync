// Service: Wallet management for business accounts
import pool from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface Wallet {
  id: string;
  businessId: string;
  balance: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  bookingId?: string;
  type: 'deposit' | 'withdrawal' | 'payment_received' | 'refund' | 'fee' | 'adjustment';
  amount: number;
  currency: string;
  description?: string;
  reference?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentIntent {
  id: string;
  bookingId: string;
  businessId: string;
  customerEmail: string;
  amount: number;
  currency: string;
  depositAmount: number;
  depositPercentage: number;
  paystackReference?: string;
  paystackAccessCode?: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
  paymentMethod?: string;
  customerName?: string;
  customerPhone?: string;
  metadata?: any;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class WalletService {
  // Get wallet by business ID
  static async getWalletByBusinessId(businessId: string): Promise<Wallet | null> {
    const query = 'SELECT * FROM wallets WHERE business_id = $1 AND is_active = TRUE';
    const result = await pool.query(query, [businessId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToWallet(result.rows[0]);
  }
  
  // Map database row to Wallet object
  private static mapRowToWallet(row: any): Wallet {
    return {
      id: row.id,
      businessId: row.business_id,
      balance: parseFloat(row.balance),
      currency: row.currency,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // Create wallet for business
  static async createWallet(businessId: string, currency: string = 'NGN'): Promise<Wallet> {
    const id = uuidv4();
    const query = `
      INSERT INTO wallets (id, business_id, balance, currency, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await pool.query(query, [id, businessId, 0.00, currency, true]);
    return this.mapRowToWallet(result.rows[0]);
  }

  // Get wallet balance
  static async getWalletBalance(businessId: string): Promise<number> {
    const wallet = await this.getWalletByBusinessId(businessId);
    return wallet ? wallet.balance : 0;
  }
  
  // Get transactions for a business
  static async getTransactions(businessId: string, limit: number = 10, offset: number = 0): Promise<WalletTransaction[]> {
    const wallet = await this.getWalletByBusinessId(businessId);
    if (!wallet) {
      return [];
    }
    
    const query = `
      SELECT * FROM wallet_transactions 
      WHERE wallet_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    
    const result = await pool.query(query, [wallet.id, limit, offset]);
    return result.rows.map(this.mapRowToTransaction);
  }
  
  // Map database row to WalletTransaction object
  private static mapRowToTransaction(row: any): WalletTransaction {
    return {
      id: row.id,
      walletId: row.wallet_id,
      bookingId: row.booking_id,
      type: row.type,
      amount: parseFloat(row.amount),
      currency: row.currency,
      description: row.description,
      reference: row.reference,
      status: row.status,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // Create wallet transaction
  static async createTransaction(transaction: Omit<WalletTransaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<WalletTransaction> {
    const id = uuidv4();
    const query = `
      INSERT INTO wallet_transactions (
        id, wallet_id, booking_id, type, amount, currency, 
        description, reference, status, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      id,
      transaction.walletId,
      transaction.bookingId || null,
      transaction.type,
      transaction.amount,
      transaction.currency,
      transaction.description || null,
      transaction.reference || null,
      transaction.status,
      JSON.stringify(transaction.metadata || {})
    ]);
    
    return this.mapRowToTransaction(result.rows[0]);
  }

  // Update transaction status
  static async updateTransactionStatus(transactionId: string, status: WalletTransaction['status']): Promise<WalletTransaction | null> {
    const query = `
      UPDATE wallet_transactions 
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [status, transactionId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToTransaction(result.rows[0]);
  }

  // Get wallet transactions
  static async getWalletTransactions(
    businessId: string, 
    limit: number = 50, 
    offset: number = 0,
    type?: WalletTransaction['type']
  ): Promise<WalletTransaction[]> {
    const wallet = await this.getWalletByBusinessId(businessId);
    if (!wallet) {
      return [];
    }

    let query = `
      SELECT wt.* FROM wallet_transactions wt
      WHERE wt.wallet_id = $1
    `;
    const params: any[] = [wallet.id];
    
    if (type) {
      query += ` AND wt.type = $${params.length + 1}`;
      params.push(type);
    }
    
    query += ` ORDER BY wt.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    return result.rows.map(row => this.mapRowToTransaction(row));
  }

  // Create payment intent
  static async createPaymentIntent(
    bookingId: string,
    businessId: string,
    customerEmail: string,
    amount: number,
    depositPercentage: number,
    customerName?: string,
    customerPhone?: string
  ): Promise<PaymentIntent> {
    const id = uuidv4();
    const depositAmount = (amount * depositPercentage) / 100;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
    
    const query = `
      INSERT INTO payment_intents (
        id, booking_id, business_id, customer_email, amount, currency,
        deposit_amount, deposit_percentage, status, customer_name, customer_phone,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      id,
      bookingId,
      businessId,
      customerEmail,
      amount,
      'NGN',
      depositAmount,
      depositPercentage,
      'pending',
      customerName || null,
      customerPhone || null,
      expiresAt
    ]);
    
    return this.mapRowToPaymentIntent(result.rows[0]);
  }

  // Update payment intent with Paystack data
  static async updatePaymentIntent(
    paymentIntentId: string,
    paystackReference?: string,
    paystackAccessCode?: string,
    status?: PaymentIntent['status'],
    paymentMethod?: string
  ): Promise<PaymentIntent | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (paystackReference) {
      updates.push(`paystack_reference = $${paramCount++}`);
      params.push(paystackReference);
    }
    
    if (paystackAccessCode) {
      updates.push(`paystack_access_code = $${paramCount++}`);
      params.push(paystackAccessCode);
    }
    
    if (status) {
      updates.push(`status = $${paramCount++}`);
      params.push(status);
    }
    
    if (paymentMethod) {
      updates.push(`payment_method = $${paramCount++}`);
      params.push(paymentMethod);
    }

    if (updates.length === 0) {
      return null;
    }

    updates.push(`updated_at = NOW()`);
    
    const query = `
      UPDATE payment_intents 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount++}
      RETURNING *
    `;
    
    params.push(paymentIntentId);
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToPaymentIntent(result.rows[0]);
  }

  // Get payment intent by ID
  static async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent | null> {
    const query = 'SELECT * FROM payment_intents WHERE id = $1';
    const result = await pool.query(query, [paymentIntentId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToPaymentIntent(result.rows[0]);
  }

  // Get payment intent by booking ID
  static async getPaymentIntentByBooking(bookingId: string): Promise<PaymentIntent | null> {
    const query = 'SELECT * FROM payment_intents WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1';
    const result = await pool.query(query, [bookingId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToPaymentIntent(result.rows[0]);
  }

  // Process successful payment
  static async processPayment(
    paymentIntentId: string,
    paystackReference: string,
    paymentMethod: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Start transaction
      await pool.query('BEGIN');
      
      // Get payment intent
      const paymentIntent = await this.getPaymentIntent(paymentIntentId);
      if (!paymentIntent) {
        await pool.query('ROLLBACK');
        return { success: false, error: 'Payment intent not found' };
      }
      
      if (paymentIntent.status !== 'pending') {
        await pool.query('ROLLBACK');
        return { success: false, error: 'Payment intent already processed' };
      }
      
      // Update payment intent
      await this.updatePaymentIntent(
        paymentIntentId,
        paystackReference,
        undefined,
        'paid',
        paymentMethod
      );
      
      // Get or create wallet
      let wallet = await this.getWalletByBusinessId(paymentIntent.businessId);
      if (!wallet) {
        wallet = await this.createWallet(paymentIntent.businessId);
      }
      
      // Create wallet transaction for deposit received
      await this.createTransaction({
        walletId: wallet.id,
        bookingId: paymentIntent.bookingId,
        type: 'payment_received',
        amount: paymentIntent.depositAmount,
        currency: paymentIntent.currency,
        description: `Deposit payment for booking ${paymentIntent.bookingId}`,
        reference: paystackReference,
        status: 'completed',
        metadata: {
          paymentIntentId,
          paymentMethod,
          originalAmount: paymentIntent.amount,
          depositPercentage: paymentIntent.depositPercentage
        }
      });
      
      // Update booking with wallet reference
      await pool.query(
        'UPDATE bookings SET wallet_id = $1 WHERE id = $2',
        [wallet.id, paymentIntent.bookingId]
      );
      
      await pool.query('COMMIT');
      return { success: true };
      
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Error processing payment:', error);
      return { success: false, error: 'Failed to process payment' };
    }
  }

  // Withdraw funds from wallet
  static async withdrawFunds(
    businessId: string,
    amount: number,
    description: string,
    reference?: string
  ): Promise<{ success: boolean; error?: string; transactionId?: string }> {
    try {
      const wallet = await this.getWalletByBusinessId(businessId);
      if (!wallet) {
        return { success: false, error: 'Wallet not found' };
      }
      
      if (wallet.balance < amount) {
        return { success: false, error: 'Insufficient balance' };
      }
      
      const transaction = await this.createTransaction({
        walletId: wallet.id,
        type: 'withdrawal',
        amount,
        currency: wallet.currency,
        description,
        reference,
        status: 'pending'
      });
      
      return { success: true, transactionId: transaction.id };
      
    } catch (error) {
      console.error('Error withdrawing funds:', error);
      return { success: false, error: 'Failed to withdraw funds' };
    }
  }

  // Map database row to PaymentIntent object
  private static mapRowToPaymentIntent(row: any): PaymentIntent {
    return {
      id: row.id,
      bookingId: row.booking_id,
      businessId: row.business_id,
      customerEmail: row.customer_email,
      amount: parseFloat(row.amount),
      currency: row.currency,
      depositAmount: parseFloat(row.deposit_amount),
      depositPercentage: row.deposit_percentage,
      paystackReference: row.paystack_reference,
      paystackAccessCode: row.paystack_access_code,
      status: row.status,
      paymentMethod: row.payment_method,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
