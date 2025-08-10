import express from 'express';
import Joi, { ObjectSchema } from 'joi';
import pool from '../config/database';
import { BusinessService } from '../services/businessService';
import { PauseService } from '../services/pauseService';
import { ServiceService } from '../services/serviceService';
import { WorkingDay, WorkingHoursEntry, Booking, BusinessSettings } from '../types';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Schema for validating working hours
const workingDaySchema: Joi.ObjectSchema<WorkingDay> = Joi.object({
  day: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday').required(),
  isWorkingDay: Joi.boolean().required(),
  startTime: Joi.when('isWorkingDay', {
    is: true,
    then: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
    otherwise: Joi.string().allow(null, '').optional()
  }).options({ messages: { 'string.pattern.base': 'Time must be in HH:mm format' } }),
  endTime: Joi.when('isWorkingDay', {
    is: true,
    then: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
    otherwise: Joi.string().allow(null, '').optional()
  }).options({ messages: { 'string.pattern.base': 'Time must be in HH:mm format' } }),
});

const workingHoursUpdateSchema = Joi.object({
  newWorkingHours: Joi.array().items(workingDaySchema).min(7).max(7).required(),
  force: Joi.boolean().default(false)
});

// Endpoint to edit working hours
router.put('/settings/working-hours', authenticateToken, async (req: AuthRequest, res: any) => {
  const { userId } = req;
  
  if (!userId) {
    return res.status(401).json({ error: 'User ID not found in request' });
  }
  const { error, value } = workingHoursUpdateSchema.validate(req.body);

  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { newWorkingHours, force } = value;

  try {
    const businessProfile = await BusinessService.findByUserId(userId);
    if (!businessProfile) {
      return res.status(404).json({ error: 'Business profile not found.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    let effectiveFromDate: Date | undefined;
    if (businessProfile.settings && !businessProfile.settings.hasSetWorkingHours) {
      effectiveFromDate = today; // Apply immediately for first-time setup
    } else {
      effectiveFromDate = tomorrow; // Apply from next calendar day for existing setup
    }

    // Calculate max booking window end date across all active services
    const services = await ServiceService.findByUserId(userId);
    let maxBookingWindowDays = 0;
    if (services && services.length > 0) {
      maxBookingWindowDays = Math.max(...services.map(s => (s.bookingWindowDays != null) ? s.bookingWindowDays : 365));
    } else {
      maxBookingWindowDays = 365; // Default if no services or bookingWindowDays
    }
    const maxBookingWindowEndDate = new Date(today.getTime() + (maxBookingWindowDays * 24 * 60 * 60 * 1000));

    // Conflict Check for existing bookings within the relevant date range
    const conflictQuery = `
      SELECT id, user_id, service_id, slot_start_time, slot_end_time, customer_name, customer_email, status, created_at, updated_at
      FROM bookings
      WHERE user_id = $1
        AND status = 'confirmed'
        AND slot_start_time::date >= $2
        AND slot_start_time::date <= $3;
    `;
    const effectiveFromDateString = effectiveFromDate ? effectiveFromDate.toISOString().split('T')[0] : '';
    const maxBookingWindowEndDateString = maxBookingWindowEndDate ? maxBookingWindowEndDate.toISOString().split('T')[0] : '';
    const conflictResult = await pool.query(conflictQuery, [userId, effectiveFromDateString || null, maxBookingWindowEndDateString || null]);
    const existingBookingsInWindow: Booking[] = conflictResult.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      serviceId: row.service_id,
      slotStartTime: new Date(row.slot_start_time),
      slotEndTime: new Date(row.slot_end_time),
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    }));

    const conflictingBookings: Booking[] = [];
    const oldWorkingHours = await BusinessService.getEffectiveWorkingHours(userId, effectiveFromDate);

    for (const booking of existingBookingsInWindow) {
      const bookingDayName = booking.slotStartTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const oldDaySetting = oldWorkingHours.find((wh: WorkingDay) => wh.day.toLowerCase() === bookingDayName);
      const newDaySetting = newWorkingHours.find((wh: WorkingDay) => wh.day.toLowerCase() === bookingDayName);

      // Check if the new settings would make an existing booking's slot unavailable
      if (oldDaySetting && oldDaySetting.isWorkingDay && newDaySetting && newDaySetting.isWorkingDay) {
        // Check if the booking time falls outside the new working hours
        const bookingStartMinutes = booking.slotStartTime.getHours() * 60 + booking.slotStartTime.getMinutes();
        const bookingEndMinutes = booking.slotEndTime.getHours() * 60 + booking.slotEndTime.getMinutes();

        if (newDaySetting.startTime && newDaySetting.endTime) {
          const newStartMinutes = parseInt((newDaySetting.startTime as string).split(':')[0] as string) * 60 + parseInt((newDaySetting.startTime as string).split(':')[1] as string);
          const newEndMinutes = parseInt((newDaySetting.endTime as string).split(':')[0]) * 60 + parseInt((newDaySetting.endTime as string).split(':')[1]);

          if (bookingStartMinutes < newStartMinutes || bookingEndMinutes > newEndMinutes) {
            conflictingBookings.push(booking);
          }
        }
      }
    }

    if (force && conflictingBookings.length > 0) {
      const bookingIdsToCancel = conflictingBookings.map(b => b.id);
      const cancelQuery = `
        UPDATE bookings
        SET status = 'cancelled',
            cancellation_reason = $2,
            cancelled_at = NOW()
        WHERE id = ANY($1::uuid[])
        RETURNING id;
      `;
      await pool.query(cancelQuery, [bookingIdsToCancel, 'Working hours changed by business, booking cancelled.']);
      // TODO: Trigger notifications for cancelled bookings (optional/async)
      console.log(`Cancelled bookings with IDs: ${bookingIdsToCancel.join(', ')} due to working hours change.`);
    }

    // Update business settings with new working hours history
    const updatedSettings: BusinessSettings = {
      currency: businessProfile.settings.currency,
      timeZone: businessProfile.settings.timeZone,
      workingHours: businessProfile.settings.workingHours, // Keep old for now, will be deprecated
      bufferTimeMinutes: businessProfile.settings.bufferTimeMinutes,
      minBookingNoticeHours: businessProfile.settings.minBookingNoticeHours,
      hasSetWorkingHours: true,
      workingHoursHistory: [
        ...(businessProfile.settings.workingHoursHistory || []),
        { effectiveFrom: effectiveFromDate.toISOString().split('T')[0]!, days: newWorkingHours }
      ].sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime())
    };

    const updatedBusiness = await BusinessService.updateProfile(userId, { settings: updatedSettings });

    res.json({
      message: 'Working hours updated successfully.',
      effectiveFrom: effectiveFromDate.toISOString().split('T')[0],
      updatedBusinessProfile: updatedBusiness
    });

  } catch (err: any) {
    console.error('Error updating working hours:', err);
    res.status(500).json({ error: err.message || 'Failed to update working hours.' });
  }
});

// Schema for pausing bookings
const pauseBookingSchema = Joi.object({
  startDate: Joi.string().isoDate().required(),
  endDate: Joi.string().isoDate().required(),
  reason: Joi.string().allow('').optional(),
  force: Joi.boolean().default(false)
}).custom((obj) => {
  if (new Date(obj.startDate) >= new Date(obj.endDate)) {
    throw new Error('End date must be after start date.');
  }
  return obj;
}).options({ messages: { 'any.custom': 'End date must be after start date' } });

// Endpoint to pause bookings
router.post('/pause-bookings', authenticateToken, async (req: AuthRequest, res: any) => {
  const { userId } = req; // userId from authMiddleware
  
  if (!userId) {
    return res.status(401).json({ error: 'User ID not found in request' });
  }
  const { error, value } = pauseBookingSchema.validate(req.body);

  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { startDate, endDate, reason, force } = value;

  try {
    const businessProfile = await BusinessService.findByUserId(userId);
    if (!businessProfile) {
      return res.status(404).json({ error: 'Business profile not found.' });
    }

    // Calculate max booking window end date across all active services
    const services = await ServiceService.findByUserId(userId); // Use ServiceService
    let maxBookingWindowDays = 0;
    if (services && services.length > 0) {
      maxBookingWindowDays = Math.max(...services.map(s => s.bookingWindowDays || 365));
    } else {
      maxBookingWindowDays = 365; // Default if no services or bookingWindowDays
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxBookingWindowEndDate = new Date(today.getTime() + (maxBookingWindowDays * 24 * 60 * 60 * 1000));

    // Validate pause range against booking window
    const requestedStartDate = new Date(startDate);
    const requestedEndDate = new Date(endDate);

    if (requestedStartDate > maxBookingWindowEndDate || requestedEndDate > maxBookingWindowEndDate) {
      return res.status(400).json({ error: `Pause dates must be within the maximum booking window (${maxBookingWindowDays} days from today).` });
    }

    let pauseReason: string = reason !== null && reason !== undefined ? reason : '';

    const result = await PauseService.createPauseWindow(userId!, startDate, endDate, pauseReason || '', userId!, force);

    if ('conflicts' in result) {
      return res.status(409).json({
        error: 'Pausing bookings conflicts with existing confirmed bookings.',
        conflicts: result.conflicts.map(b => ({
          id: b.id,
          customerName: b.customerName,
          customerEmail: b.customerEmail,
          slotStartTime: b.slotStartTime.toISOString(),
          slotEndTime: b.slotEndTime.toISOString()
        }))
      });
    }

    res.json({ message: 'Bookings paused successfully.', pauseWindow: result });

  } catch (err: any) {
    console.error('Error pausing bookings:', err);
    res.status(500).json({ error: err.message || 'Failed to pause bookings.' });
  }
});

export default router;
