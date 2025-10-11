// Route: Payment processing and wallet management
import express from 'express';
import { WalletService } from '../services/walletService';
import { PaystackService } from '../services/paystackService';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { BusinessService } from '../services/businessService';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Validation schemas
const createPaymentIntentSchema = Joi.object({
  bookingId: Joi.string().uuid().required(),
  customerEmail: Joi.string().email().required(),
  customerName: Joi.string().optional(),
  customerPhone: Joi.string().optional()
});

const verifyPaymentSchema = Joi.object({
  paymentIntentId: Joi.string().uuid().required(),
  paystackReference: Joi.string().required()
});

const withdrawFundsSchema = Joi.object({
  amount: Joi.number().positive().required(),
  description: Joi.string().required(),
  bankCode: Joi.string().required(),
  accountNumber: Joi.string().required(),
  accountName: Joi.string().required()
});

// Rate limiters
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 payment attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * @openapi
 * /api/payments/create-intent:
 *   post:
 *     summary: Create payment intent for booking deposit
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bookingId:
 *                 type: string
 *                 format: uuid
 *               customerEmail:
 *                 type: string
 *                 format: email
 *               customerName:
 *                 type: string
 *               customerPhone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Payment intent created successfully
 *       400:
 *         description: Invalid request or booking not found
 *       401:
 *         description: Unauthorized
 */
router.post('/create-intent', authenticateToken, paymentLimiter, async (req: AuthRequest, res) => {
  try {
    const { error, value } = createPaymentIntentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { bookingId, customerEmail, customerName, customerPhone } = value;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get business profile
    const businessProfile = await BusinessService.findByUserId(userId);
    if (!businessProfile) {
      return res.status(404).json({ error: 'Business profile not found' });
    }

    // Get booking details (you'll need to implement this in your booking service)
    // For now, assuming you have a booking service
    // const booking = await BookingService.findById(bookingId);
    // if (!booking || booking.businessId !== businessProfile.id) {
    //   return res.status(404).json({ error: 'Booking not found' });
    // }

    // For demo purposes, let's assume we have booking data
    const depositPercentage = 25; // This should come from the service
    const totalAmount = 100; // This should come from the booking

    // Create payment intent
    const paymentIntent = await WalletService.createPaymentIntent(
      bookingId,
      businessProfile.id,
      customerEmail,
      totalAmount,
      depositPercentage,
      customerName,
      customerPhone
    );

    // Initialize Paystack transaction
    const paystackResponse = await PaystackService.initializeTransaction({
      amount: paymentIntent.depositAmount,
      email: customerEmail,
      reference: PaystackService.generateReference(),
      callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
      metadata: {
        paymentIntentId: paymentIntent.id,
        bookingId,
        businessId: businessProfile.id,
        depositPercentage
      },
      customer: {
        email: customerEmail,
        first_name: customerName?.split(' ')[0],
        last_name: customerName?.split(' ').slice(1).join(' '),
        phone: customerPhone
      }
    });

    if (!paystackResponse.status) {
      return res.status(400).json({ error: paystackResponse.message });
    }

    // Update payment intent with Paystack data
    await WalletService.updatePaymentIntent(
      paymentIntent.id,
      paystackResponse.data.reference,
      paystackResponse.data.access_code,
      'pending'
    );

    res.status(201).json({
      message: 'Payment intent created successfully',
      paymentIntent: {
        id: paymentIntent.id,
        amount: paymentIntent.depositAmount,
        currency: paymentIntent.currency,
        expiresAt: paymentIntent.expiresAt
      },
      paystack: {
        publicKey: PaystackService.getPublicKey(),
        reference: paystackResponse.data.reference,
        accessCode: paystackResponse.data.access_code,
        authorizationUrl: paystackResponse.data.authorization_url
      }
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/payments/verify:
 *   post:
 *     summary: Verify payment completion
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentIntentId:
 *                 type: string
 *                 format: uuid
 *               paystackReference:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified successfully
 *       400:
 *         description: Payment verification failed
 */

/**
 * @openapi
 * /api/payments/wallet/balance:
 *   get:
 *     summary: Get user's wallet balance
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance
 *       401:
 *         description: Unauthorized
 */
router.get('/wallet/balance', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get business profile
    const businessProfile = await BusinessService.findByUserId(userId);
    if (!businessProfile) {
      return res.status(404).json({ error: 'Business profile not found' });
    }

    // Get or create wallet
    let wallet = await WalletService.getWalletByBusinessId(businessProfile.id);
    if (!wallet) {
      wallet = await WalletService.createWallet(businessProfile.id);
    }
    
    // Prevent caching to avoid 304 responses
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'ETag': false
    });
    
    res.status(200).json({
      balance: wallet.balance,
      currency: wallet.currency
    });
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/verify', paymentLimiter, async (req, res) => {
  try {
    const { error, value } = verifyPaymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { paymentIntentId, paystackReference } = value;

    // Get payment intent
    const paymentIntent = await WalletService.getPaymentIntent(paymentIntentId);
    if (!paymentIntent) {
      return res.status(404).json({ error: 'Payment intent not found' });
    }

    // Verify with Paystack
    const verification = await PaystackService.verifyTransaction(paystackReference);
    
    if (!verification.status || verification.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Process the payment
    const result = await WalletService.processPayment(
      paymentIntentId,
      paystackReference,
      verification.data.channel || 'unknown'
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      message: 'Payment verified and processed successfully',
      transaction: {
        reference: paystackReference,
        amount: paymentIntent.depositAmount,
        currency: paymentIntent.currency,
        status: 'completed'
      }
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/payments/wallet:
 *   get:
 *     summary: Get wallet information and balance
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet information retrieved successfully
 *       404:
 *         description: Wallet not found
 */
router.get('/wallet', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const businessProfile = await BusinessService.findByUserId(userId);
    if (!businessProfile) {
      return res.status(404).json({ error: 'Business profile not found' });
    }

    let wallet = await WalletService.getWalletByBusinessId(businessProfile.id);
    if (!wallet) {
      wallet = await WalletService.createWallet(businessProfile.id);
    }

    // Prevent caching to avoid 304 responses
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'ETag': false
    });
    
    res.json({
      wallet: {
        id: wallet.id,
        balance: wallet.balance,
        currency: wallet.currency,
        isActive: wallet.isActive
      }
    });

  } catch (error) {
    console.error('Error fetching wallet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/payments/transactions:
 *   get:
 *     summary: Get wallet transaction history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [deposit, withdrawal, payment_received, refund, fee, adjustment]
 *     responses:
 *       200:
 *         description: Transaction history retrieved successfully
 */
router.get('/transactions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const businessProfile = await BusinessService.findByUserId(userId);
    if (!businessProfile) {
      return res.status(404).json({ error: 'Business profile not found' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const type = req.query.type as string;

    const transactions = await WalletService.getWalletTransactions(
      businessProfile.id,
      limit,
      offset,
      type as any
    );

    res.json({
      transactions: transactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        description: t.description,
        reference: t.reference,
        status: t.status,
        createdAt: t.createdAt
      })),
      pagination: {
        limit,
        offset,
        hasMore: transactions.length === limit
      }
    });

  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/payments/withdraw:
 *   post:
 *     summary: Request withdrawal from wallet
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               description:
 *                 type: string
 *               bankCode:
 *                 type: string
 *               accountNumber:
 *                 type: string
 *               accountName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Withdrawal request submitted successfully
 *       400:
 *         description: Invalid request or insufficient balance
 */
router.post('/withdraw', authenticateToken, paymentLimiter, async (req: AuthRequest, res) => {
  try {
    const { error, value } = withdrawFundsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const businessProfile = await BusinessService.findByUserId(userId);
    if (!businessProfile) {
      return res.status(404).json({ error: 'Business profile not found' });
    }

    const { amount, description, bankCode, accountNumber, accountName } = value;

    // Validate account number with Paystack
    const validation = await PaystackService.validateAccountNumber(accountNumber, bankCode);
    if (!validation.status) {
      return res.status(400).json({ error: 'Invalid account details' });
    }

    // Create transfer recipient
    const recipientResponse = await PaystackService.createTransferRecipient(
      'nuban',
      accountName,
      accountNumber,
      bankCode
    );

    if (!recipientResponse.status) {
      return res.status(400).json({ error: 'Failed to create transfer recipient' });
    }

    // Initiate withdrawal transaction
    const result = await WalletService.withdrawFunds(
      businessProfile.id,
      amount,
      description,
      PaystackService.generateReference()
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Initiate Paystack transfer (this would typically be done asynchronously)
    // For now, we'll just create the wallet transaction
    const transferResult = await PaystackService.initiateTransfer(
      'balance',
      amount,
      recipientResponse.data.recipient_code,
      description,
      result.transactionId
    );

    if (transferResult.status) {
      // Update transaction with Paystack reference
      await WalletService.updateTransactionStatus(result.transactionId!, 'completed');
    }

    res.json({
      message: 'Withdrawal request submitted successfully',
      transactionId: result.transactionId,
      amount,
      status: transferResult.status ? 'processing' : 'pending'
    });

  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/payments/banks:
 *   get:
 *     summary: Get list of supported banks for withdrawals
 *     responses:
 *       200:
 *         description: Banks list retrieved successfully
 */
router.get('/banks', async (req, res) => {
  try {
    const banksResponse = await PaystackService.getBanks();
    
    if (!banksResponse.status) {
      return res.status(400).json({ error: banksResponse.message });
    }

    res.json({
      banks: banksResponse.data.map((bank: any) => ({
        id: bank.id,
        name: bank.name,
        code: bank.code,
        longcode: bank.longcode,
        gateway: bank.gateway,
        pay_with_bank: bank.pay_with_bank,
        active: bank.active,
        is_deleted: bank.is_deleted,
        country: bank.country,
        currency: bank.currency,
        type: bank.type
      }))
    });

  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/payments/validate-account:
 *   get:
 *     summary: Validate bank account number
 *     parameters:
 *       - in: query
 *         name: accountNumber
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: bankCode
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Account validation result
 */
router.get('/validate-account', async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.query;

    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: 'Account number and bank code are required' });
    }

    const validation = await PaystackService.validateAccountNumber(
      accountNumber as string,
      bankCode as string
    );

    if (!validation.status) {
      return res.status(400).json({ error: validation.message });
    }

    res.json({
      valid: true,
      accountNumber: validation.data.account_number,
      accountName: validation.data.account_name,
      bankCode: validation.data.bank_code
    });

  } catch (error) {
    console.error('Error validating account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
