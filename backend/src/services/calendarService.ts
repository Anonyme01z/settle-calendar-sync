import { calendar, oauth2Client } from '../config/google';
import { UserService } from './userService';
import { BusinessService } from './businessService';
import { ServiceService } from './serviceService';
import { PauseService } from './pauseService'; // Import PauseService
import { AvailableSlot, WorkingDay } from '../types';
import pool from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export class CalendarService {
  static async refreshAccessTokenIfNeeded(userId: string): Promise<string> {
    const tokens = await UserService.getGoogleTokens(userId);
    if (!tokens) {
      throw new Error('GOOGLE_CALENDAR_NOT_CONNECTED');
    }

    // Check if token is expired
    if (tokens.expiry && new Date(tokens.expiry) <= new Date()) {
      if (!tokens.refreshToken) {
        throw new Error('Refresh token not available');
      }

      oauth2Client.setCredentials({
        refresh_token: tokens.refreshToken
      });

      const { credentials } = await oauth2Client.refreshAccessToken();
      
      if (credentials.access_token) {
        await UserService.updateGoogleTokens(
          userId,
          credentials.access_token,
          credentials.refresh_token || tokens.refreshToken,
          credentials.expiry_date ?? undefined
        );
        return credentials.access_token;
      }
    }

    return tokens.accessToken;
  }

  static async getAvailableSlots(userId: string, date: string, serviceId: string): Promise<AvailableSlot[]> {
    // Get fresh access token
    const accessToken = await this.refreshAccessTokenIfNeeded(userId);
    oauth2Client.setCredentials({ access_token: accessToken });

    // Get business profile and service details
    const businessProfile = await BusinessService.findByUserId(userId);
    if (!businessProfile) {
      throw new Error('Business profile not found');
    }

    // Check if working hours have been set up
    if (!businessProfile.settings.hasSetWorkingHours) {
      throw new Error('WORKING_HOURS_NOT_CONFIGURED');
    }

    const service = await ServiceService.findById(serviceId, userId);
    if (!service) {
      throw new Error('Service not found');
    }

    // Debug logging
    console.log('Service details:', {
      id: service.id,
      title: service.title,
      bookingType: service.bookingType,
      capacity: service.capacity,
      durationMinutes: service.durationMinutes
    });

    // Get business settings
    const { settings } = businessProfile;
    const { bufferTimeMinutes, minBookingNoticeHours, timeZone } = settings;

    // Parse the target date
    const targetDate = new Date(date);
    const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    // Check if business is paused on this date
    const pausedWindows = await PauseService.getPauseWindows(userId, date);
    if (pausedWindows.length > 0) {
      throw new Error('BUSINESS_PAUSED_ON_DATE'); // Throw a specific error for paused dates
    }

    // Get effective working hours for the target date
    const effectiveWorkingHours = await BusinessService.getEffectiveWorkingHours(userId, targetDate);
    const workingDay = effectiveWorkingHours.find(wh => wh.day.toLowerCase() === dayName);

    if (!workingDay || !workingDay.isWorkingDay || !workingDay.startTime || !workingDay.endTime) {
      // Check if business has set up working hours at all vs just closed on this day
      if (businessProfile.settings.hasSetWorkingHours) {
        throw new Error('BUSINESS_CLOSED_TODAY');
      } else {
        throw new Error('BUSINESS_NOT_OPEN_ON_DATE');
      }
    }

    // Create time boundaries for the day
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(parseInt(workingDay.startTime.split(':')[0]), parseInt(workingDay.startTime.split(':')[1]), 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(parseInt(workingDay.endTime.split(':')[0]), parseInt(workingDay.endTime.split(':')[1]), 0, 0);

    // Check minimum booking notice
    const now = new Date();
    const minBookingTime = new Date(now.getTime() + (minBookingNoticeHours * 60 * 60 * 1000));
    const effectiveStart = startOfDay > minBookingTime ? startOfDay : minBookingTime;
    if (effectiveStart >= endOfDay) {
      return [];
    }

    // Get busy times from Google Calendar (for fixed only)
    let busyTimes: { start: string; end: string }[] = [];
    if (service.bookingType === 'fixed') {
      const freeBusyResponse = await calendar.freebusy.query({
        requestBody: {
          timeMin: startOfDay.toISOString(),
          timeMax: endOfDay.toISOString(),
          timeZone: timeZone,
          items: [{ id: 'primary' }]
        }
      });
      busyTimes = (freeBusyResponse.data.calendars?.primary?.busy || [])
        .filter((b: any) => typeof b.start === 'string' && typeof b.end === 'string')
        .map((b: any) => ({ start: b.start as string, end: b.end as string }));
    }

    // Generate potential slots
    const slots: AvailableSlot[] = [];
    const slotDuration = (service.durationMinutes || 60) + bufferTimeMinutes; // Default to 60 minutes if not specified
    let currentTime = new Date(effectiveStart);
    // Ensure the full occupied slot (service + buffer) fits within working hours
    while (currentTime.getTime() + (slotDuration * 60 * 1000) <= endOfDay.getTime()) {
      const serviceEndTime = new Date(currentTime.getTime() + ((service.durationMinutes || 60) * 60 * 1000));
      const slotOccupiedEndTime = new Date(currentTime.getTime() + (slotDuration * 60 * 1000)); // End of service + buffer
      let isAvailable = true;
      if (service.bookingType === 'fixed') {
        // Check for overlap with busy times, considering the full occupied slot duration
        isAvailable = !busyTimes.some(busy => {
          const busyStart = new Date(busy.start!);
          const busyEnd = new Date(busy.end!);
          return (currentTime < busyEnd && slotOccupiedEndTime > busyStart);
        });
        // Also check DB for existing bookings
        if (isAvailable) {
          // Synchronous DB call for slot
          // eslint-disable-next-line no-await-in-loop
          const result = await pool.query(
            `SELECT COUNT(*) FROM bookings WHERE service_id = $1 AND start_time = $2 AND status = 'confirmed'`,
            [serviceId, currentTime.toISOString()]
          );
          const existingCount = parseInt(result.rows[0].count, 10);
          if (existingCount > 0) isAvailable = false;
        }
        
        // Only add fixed service slots if they're available
        if (isAvailable) {
          slots.push({
            startTime: currentTime.toISOString(),
            endTime: serviceEndTime.toISOString(),
            available: true
          });
        }
      } else if (service.bookingType === 'flexible' && service.capacity) {
        // For flexible, check DB for number of bookings in this slot
        // eslint-disable-next-line no-await-in-loop
        const result = await pool.query(
          `SELECT COUNT(*) FROM bookings WHERE service_id = $1 AND start_time = $2 AND status = 'confirmed'`,
          [serviceId, currentTime.toISOString()]
        );
        const existingCount = parseInt(result.rows[0].count, 10);
        const spacesLeft = Math.max(service.capacity - existingCount, 0);
        
        // Only add flexible service slots if there are spaces left
        if (spacesLeft > 0) {
          slots.push({
            startTime: currentTime.toISOString(),
            endTime: serviceEndTime.toISOString(),
            available: true,
            spacesLeft
          });
        }
      }
      
      // Move to next slot (including buffer time)
      currentTime = new Date(currentTime.getTime() + (slotDuration * 60 * 1000));
    }
    return slots.filter(slot => slot.available);
  }

  static async createBooking(userId: string, serviceId: string, slotStartTime: string, customerName?: string, customerEmail?: string): Promise<any> {
    // Get fresh access token
    const accessToken = await this.refreshAccessTokenIfNeeded(userId);
    oauth2Client.setCredentials({ access_token: accessToken });

    const service = await ServiceService.findById(serviceId, userId);
    if (!service) {
      throw new Error('Service not found');
    }

    const businessProfile = await BusinessService.findByUserId(userId);
    if (!businessProfile) {
      throw new Error('Business profile not found');
    }

    // Check if working hours have been set up
    if (!businessProfile.settings.hasSetWorkingHours) {
      throw new Error('WORKING_HOURS_NOT_CONFIGURED');
    }

    const { bufferTimeMinutes } = businessProfile.settings;

    const startTime = new Date(slotStartTime);
    const serviceEndTime = new Date(startTime.getTime() + ((service.durationMinutes || 60) * 60 * 1000));
    const slotOccupiedEndTime = new Date(startTime.getTime() + ((service.durationMinutes || 60) + bufferTimeMinutes) * 60 * 1000);

    // Check booking window
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bookingWindowEndDate = new Date(today.getTime() + ((service.bookingWindowDays || 365) * 24 * 60 * 60 * 1000));
    if (startTime > bookingWindowEndDate) {
      throw new Error('BOOKING_OUTSIDE_WINDOW');
    }

    // Check if business is paused on this date
    const pausedWindows = await PauseService.getPauseWindows(userId, startTime.toISOString().split('T')[0]);
    if (pausedWindows.length > 0) {
      throw new Error('BOOKING_ON_PAUSED_DATE');
    }

    // Double-check availability to prevent race conditions
    const freeBusyResponse = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime.toISOString(),
        timeMax: slotOccupiedEndTime.toISOString(), // Use slotOccupiedEndTime for conflict check
        items: [{ id: 'primary' }]
      }
    });

    const busyTimes = freeBusyResponse.data.calendars?.primary?.busy || [];
    const hasConflict = busyTimes.some(busy => {
      const busyStart = new Date(busy.start!);
      const busyEnd = new Date(busy.end!);
      return (startTime < busyEnd && slotOccupiedEndTime > busyStart); // Use slotOccupiedEndTime
    });

    if (hasConflict) {
      throw new Error('Time slot is no longer available');
    }

    // Check for existing bookings in DB for this slot
    const query = `SELECT COUNT(*) FROM bookings WHERE service_id = $1 AND start_time = $2 AND status = 'confirmed'`;
    const result = await pool.query(query, [serviceId, startTime.toISOString()]);
    const existingCount = parseInt(result.rows[0].count, 10);
    if (service.bookingType === 'fixed' && existingCount > 0) {
      throw new Error('Time slot is no longer available');
    }
    if (service.bookingType === 'flexible' && service.capacity && existingCount >= service.capacity) {
      throw new Error('Time slot is fully booked');
    }

    // Create calendar event
    const event = {
      summary: `${service.title}${customerName ? ` - ${customerName}` : ''}`,
      description: `Booking via Settle\nService: ${service.title}\nCustomer: ${customerName || 'N/A'}\nEmail: ${customerEmail || 'N/A'}`,
      start: {
        dateTime: startTime.toISOString(),
      },
      end: {
        dateTime: serviceEndTime.toISOString(), // Use serviceEndTime for the event end time
      },
      attendees: customerEmail ? [{ email: customerEmail }] : [],
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    // Persist booking in our database
    const bookingId = uuidv4();
    await pool.query(
      `INSERT INTO bookings (
         id, user_id, service_id, start_time, end_time, customer_name, customer_email, google_calendar_event_id, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW(), NOW())`,
      [
        bookingId,
        userId,
        serviceId,
        startTime.toISOString(),
        serviceEndTime.toISOString(),
        customerName || null,
        customerEmail || null,
        response.data.id || null
      ]
    );

    return {
      id: bookingId,
      eventId: response.data.id,
      startTime: startTime.toISOString(),
      endTime: serviceEndTime.toISOString(), // Use serviceEndTime
      service: service.title,
      customer: customerName,
      email: customerEmail
    };
  }
}

