// Route: Public booking flows (no auth) for business handles
import express from 'express';
import { BusinessService } from '../services/businessService';
import { ServiceService } from '../services/serviceService';
import { CalendarService } from '../services/calendarService';
import { EmailService } from '../services/emailService';
import Joi from 'joi';
import { format } from 'date-fns';

const router = express.Router();

// 1. Get Business Profile by Handle
router.get('/business/:handle', async (req, res) => {
  const { handle } = req.params;
  if (!handle) return res.status(400).json({ error: 'Handle is required' });
  const business = await BusinessService.findByHandle(handle);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  // Only return public fields
  const { id, handle: h, name, email, settings, socialLinks } = business;
  res.json({ id, handle: h, name, email, settings, socialLinks });
});

// 2. Get All Active Services for a Business
router.get('/business/:handle/services', async (req, res) => {
  const { handle } = req.params;
  if (!handle) return res.status(400).json({ error: 'Handle is required' });
  const business = await BusinessService.findByHandle(handle);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  const services = await ServiceService.findByUserId(business.userId);
  res.json(services.filter(s => s.isActive));
});

// 3. Get Service Details
router.get('/business/:handle/services/:serviceId', async (req, res) => {
  const { handle, serviceId } = req.params;
  if (!handle || !serviceId) return res.status(400).json({ error: 'Handle and serviceId are required' });
  const business = await BusinessService.findByHandle(handle);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  const service = await ServiceService.findById(serviceId, business.userId);
  if (!service) return res.status(404).json({ error: 'Service not found' });
  res.json(service);
});

// 4. Check Calendar Connection Status
router.get('/business/:handle/calendar-status', async (req, res) => {
  const { handle } = req.params;
  if (!handle) return res.status(400).json({ error: 'Handle is required' });
  
  try {
    const business = await BusinessService.findByHandle(handle);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    
    // Check if user has Google tokens without accessing calendar
    const { UserService } = require('../services/userService');
    const tokens = await UserService.getGoogleTokens(business.userId);
    
    res.json({
      calendarConnected: !!tokens,
      businessName: business.name
    });
  } catch (error) {
    console.error('Error checking calendar status:', error);
    res.status(500).json({ error: 'Failed to check calendar status' });
  }
});

// 5. Get Available Slots for a Service
router.get('/business/:handle/services/:serviceId/availability', async (req, res) => {
  const { handle, serviceId } = req.params;
  const { date } = req.query;
  if (!handle || !serviceId || !date) return res.status(400).json({ error: 'Handle, serviceId, and date are required' });
  const business = await BusinessService.findByHandle(handle);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  try {
    const slots = await CalendarService.getAvailableSlots(business.userId, date as string, serviceId);
    res.json(slots);
  } catch (err: any) {
    if (err.message === 'GOOGLE_CALENDAR_NOT_CONNECTED') {
      return res.status(503).json({ 
        error: 'Calendar not available', 
        message: `${business.name} has not connected their Google Calendar yet. Please contact them directly to schedule your appointment.` 
      });
    } else if (err.message === 'WORKING_HOURS_NOT_CONFIGURED') {
      return res.status(503).json({ 
        error: 'Working hours not configured', 
        message: `Booking Not Available: ${business.name} has not set up their working hours yet. Please contact them directly to schedule your appointment.` 
      });
    } else if (err.message === 'BUSINESS_NOT_OPEN_ON_DATE') {
      return res.status(200).json({ message: 'Booking Not Available: This business hasn\'t set up any working hours yet. Please contact them directly to schedule.' });
    } else if (err.message === 'BUSINESS_CLOSED_TODAY') {
      return res.status(200).json({ message: 'Booking Unavailable: This business is closed today. Please try a different date or contact them directly.' });
    } else if (err.message === 'BUSINESS_PAUSED_ON_DATE') {
      return res.status(200).json({ message: 'Booking Unavailable: This business is not accepting bookings on this date. Please try another day.' });
    }
    res.status(400).json({ error: err.message || 'Failed to retrieve available slots' });
  }
});

// 5. Create a Booking
const bookingSchema = Joi.object({
  customerName: Joi.string().required(),
  customerEmail: Joi.string().email().required(),
  slotStartTime: Joi.string().isoDate().required(),
  customerNotes: Joi.string().allow('').optional()
});

router.post('/business/:handle/services/:serviceId/book', async (req, res) => {
  const { handle, serviceId } = req.params;
  const { error, value } = bookingSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const business = await BusinessService.findByHandle(handle);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  
  try {
    // Get service details for email
    const service = await ServiceService.findById(serviceId, business.userId);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    
    const booking = await CalendarService.createBooking(
      business.userId,
      serviceId,
      value.slotStartTime,
      value.customerName,
      value.customerEmail
    );
    
    // Send email notifications (async, don't wait)
    const bookingDateTime = new Date(value.slotStartTime);
    const bookingTime = format(bookingDateTime, 'h:mm a');
    
    EmailService.sendBookingConfirmation({
      customerName: value.customerName,
      customerEmail: value.customerEmail,
      businessName: business.name,
      businessEmail: business.email,
      serviceName: service.title,
      bookingDate: bookingDateTime,
      bookingTime: bookingTime,
      duration: service.durationMinutes || 60,
      customerNotes: value.customerNotes,
      bookingId: booking.eventId || booking.id
    }).catch(error => {
      console.error('Failed to send booking confirmation emails:', error);
    });
    
    res.json({ success: true, bookingId: booking.eventId, message: 'Booking confirmed!' });
  } catch (err: any) {
    if (err.message === 'GOOGLE_CALENDAR_NOT_CONNECTED') {
      return res.status(503).json({ 
        error: 'Calendar not available', 
        message: `${business.name} has not connected their Google Calendar yet. Please contact them directly to schedule your appointment.` 
      });
    } else if (err.message === 'WORKING_HOURS_NOT_CONFIGURED') {
      return res.status(503).json({ 
        error: 'Working hours not configured', 
        message: `Booking Not Available: ${business.name} has not set up their working hours yet. Please contact them directly to schedule your appointment.` 
      });
    } else if (err.message === 'BOOKING_OUTSIDE_WINDOW') {
      return res.status(400).json({ error: 'Booking date is outside the allowed booking window for this service.' });
    } else if (err.message === 'BOOKING_ON_PAUSED_DATE') {
      return res.status(400).json({ error: 'Cannot book on a paused date.' });
    }
    res.status(400).json({ error: err.message || 'Failed to create booking' });
  }
});

// 6. Reserve a Slot
const reserveSchema = Joi.object({
  slotStartTime: Joi.string().isoDate().required()
});

router.post('/business/:handle/services/:serviceId/reserve', async (req, res) => {
  const { handle, serviceId } = req.params;
  const { error, value } = reserveSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  
  const business = await BusinessService.findByHandle(handle);
  if (!business) return res.status(404).json({ error: 'Business not found' });

  try {
    const reservation = await CalendarService.reserveSlot(
      business.userId,
      serviceId,
      value.slotStartTime
    );

    res.json(reservation);
  } catch (err: any) {
    if (err.message === 'Service not found') {
      return res.status(404).json({ error: 'Service not found' });
    } else if (err.message === 'Slot is not available') {
      return res.status(400).json({ error: 'The selected slot is no longer available' });
    }
    res.status(400).json({ error: err.message || 'Failed to reserve slot' });
  }
});

// 7. Confirm a Reservation
const confirmSchema = Joi.object({
  reservationToken: Joi.string().uuid().required(),
  customerName: Joi.string().required(),
  customerEmail: Joi.string().email().required(),
  customerNotes: Joi.string().allow('').optional()
});

router.post('/business/:handle/services/:serviceId/confirm', async (req, res) => {
  const { handle, serviceId } = req.params;
  const { error, value } = confirmSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  
  const business = await BusinessService.findByHandle(handle);
  if (!business) return res.status(404).json({ error: 'Business not found' });

  try {
    const booking = await CalendarService.confirmReservation(
      business.userId,
      serviceId,
      value.reservationToken,
      value.customerName,
      value.customerEmail,
      value.customerNotes
    );

    // Send email notifications (async, don't wait)
    const service = await ServiceService.findById(serviceId, business.userId);
    if (!service) throw new Error('Service not found');

    const bookingDateTime = new Date(booking.start_time);
    const bookingTime = format(bookingDateTime, 'h:mm a');
    
    EmailService.sendBookingConfirmation({
      customerName: value.customerName,
      customerEmail: value.customerEmail,
      businessName: business.name,
      businessEmail: business.email,
      serviceName: service.title,
      bookingDate: bookingDateTime,
      bookingTime: bookingTime,
      duration: service.durationMinutes || 60,
      customerNotes: value.customerNotes,
      bookingId: booking.eventId || booking.id
    }).catch(error => {
      console.error('Failed to send booking confirmation emails:', error);
    });

    res.json({ success: true, bookingId: booking.eventId, message: 'Booking confirmed!' });
  } catch (err: any) {
    if (err.message === 'Invalid or expired reservation') {
      return res.status(400).json({ error: 'The reservation is invalid or has expired' });
    }
    res.status(400).json({ error: err.message || 'Failed to confirm booking' });
  }
});

export default router;
