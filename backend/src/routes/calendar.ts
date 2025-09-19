import express from 'express';
import { CalendarService } from '../services/calendarService';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import Joi from 'joi';
import pool from '../config/database';

const router = express.Router();

// Validation schemas
const bookingSchema = Joi.object({
  serviceId: Joi.string().required(),
  slotStartTime: Joi.string().isoDate().required(),
  customerName: Joi.string().allow(''),
  customerEmail: Joi.string().email().allow('')
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

    const { serviceId, slotStartTime, customerName, customerEmail } = value;

    const booking = await CalendarService.createBooking(
      userId,
      serviceId,
      slotStartTime,
      customerName,
      customerEmail
    );

    res.status(201).json({
      message: 'Booking created successfully',
      booking
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
