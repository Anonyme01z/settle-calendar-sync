// Route: Calendar availability, booking creation, and cancellation
import express from 'express';
import { CalendarService } from '../services/calendarService';
import { WalletService } from '../services/walletService';
import { PaystackService } from '../services/paystackService';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import Joi from 'joi';
import pool from '../config/database';

const router = express.Router();

// Validation schemas
const bookingSchema = Joi.object({
  serviceId: Joi.string().required(),
  slotStartTime: Joi.string().isoDate().required(),
  customerName: Joi.string().allow(''),
  customerEmail: Joi.string().email().allow(''),
  customerPhone: Joi.string().optional(),
  customerNotes: Joi.string().optional()
});

/**
 * @openapi
 * /api/calendar/{userId}/availability:
 *   get:
 *     summary: Get available slots for a specific date and service
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of available slots
 */
router.get('/:userId/availability', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { date, serviceId } = req.query;
    
    // Ensure user can only access their own calendar
    if (req.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!date || !serviceId) {
      return res.status(400).json({ error: 'Date and serviceId are required' });
    }

    const availableSlots = await CalendarService.getAvailableSlots(
      userId,
      date as string,
      serviceId as string
    );

    res.json(availableSlots);
  } catch (error) {
    console.error('Get availability error:', error);
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('tokens')) {
        return res.status(401).json({ error: 'Google Calendar not connected' });
      }
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/calendar/{userId}/book:
 *   post:
 *     summary: Create a booking
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serviceId:
 *                 type: string
 *               slotStartTime:
 *                 type: string
 *               customerName:
 *                 type: string
 *               customerEmail:
 *                 type: string
 *     responses:
 *       201:
 *         description: Booking created successfully
 */
router.post('/:userId/book', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    
    // For booking, we don't require authentication matching since customers book for businesses
    // But we validate the business exists
    const { error, value } = bookingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { serviceId, slotStartTime, customerName, customerEmail, customerPhone, customerNotes } = value;

    // First, create a tentative booking (without payment)
    const booking = await CalendarService.createBooking(
      userId,
      serviceId,
      slotStartTime,
      customerName,
      customerEmail
    );

    // Get service details to calculate deposit
    const serviceQuery = 'SELECT * FROM services WHERE id = $1';
    const serviceResult = await pool.query(serviceQuery, [serviceId]);
    
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const service = serviceResult.rows[0];
    const depositPercentage = service.deposit_percentage || 25; // Default 25%
    const totalAmount = service.price || 0; // You'll need to add price field to services

    // Create payment intent
    const paymentIntent = await WalletService.createPaymentIntent(
      booking.id,
      userId, // business ID
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
        bookingId: booking.id,
        businessId: userId,
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
      message: 'Booking created. Payment required to confirm.',
      booking: {
        id: booking.id,
        status: 'pending_payment',
        serviceName: service.title,
        slotStartTime: booking.start_time,
        customerName,
        customerEmail
      },
      payment: {
        paymentIntentId: paymentIntent.id,
        depositAmount: paymentIntent.depositAmount,
        totalAmount: paymentIntent.amount,
        depositPercentage: paymentIntent.depositPercentage,
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
    console.error('Create booking error:', error);
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('no longer available')) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message.includes('tokens')) {
        return res.status(401).json({ error: 'Google Calendar not connected' });
      }
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel booking
const cancelSchema = Joi.object({
  bookingId: Joi.string().required(),
  reason: Joi.string().max(500).allow('', null),
});

router.post('/:userId/cancel', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    if (!req.userId || req.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error, value } = cancelSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { bookingId, reason } = value;

    const result = await CalendarService.cancelBooking(userId, bookingId, reason || undefined);

    res.json({ message: 'Booking cancelled successfully', ...result });
  } catch (err) {
    console.error('Cancel booking error:', err);
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
