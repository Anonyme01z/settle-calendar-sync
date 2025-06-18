
import express from 'express';
import { CalendarService } from '../services/calendarService';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const bookingSchema = Joi.object({
  serviceId: Joi.string().required(),
  slotStartTime: Joi.string().isoDate().required(),
  customerName: Joi.string().allow(''),
  customerEmail: Joi.string().email().allow('')
});

// Get available slots for a specific date and service
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
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    if (error.message.includes('tokens')) {
      return res.status(401).json({ error: 'Google Calendar not connected' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a booking
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
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    if (error.message.includes('no longer available')) {
      return res.status(409).json({ error: error.message });
    }
    
    if (error.message.includes('tokens')) {
      return res.status(401).json({ error: 'Google Calendar not connected' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
