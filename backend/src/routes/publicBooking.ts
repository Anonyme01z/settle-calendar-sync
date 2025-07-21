import express from 'express';
import { BusinessService } from '../services/businessService';
import { ServiceService } from '../services/serviceService';
import { CalendarService } from '../services/calendarService';
import Joi from 'joi';

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

// 4. Get Available Slots for a Service
router.get('/business/:handle/services/:serviceId/availability', async (req, res) => {
  const { handle, serviceId } = req.params;
  const { date } = req.query;
  if (!handle || !serviceId || !date) return res.status(400).json({ error: 'Handle, serviceId, and date are required' });
  const business = await BusinessService.findByHandle(handle);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  const slots = await CalendarService.getAvailableSlots(business.userId, date as string, serviceId);
  res.json(slots);
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
    const booking = await CalendarService.createBooking(
      business.userId,
      serviceId,
      value.slotStartTime,
      value.customerName,
      value.customerEmail
    );
    res.json({ success: true, bookingId: booking.eventId, message: 'Booking confirmed!' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create booking' });
  }
});

export default router; 