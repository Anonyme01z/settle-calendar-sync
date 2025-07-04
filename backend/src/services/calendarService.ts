import { calendar, oauth2Client } from '../config/google';
import { UserService } from './userService';
import { BusinessService } from './businessService';
import { ServiceService } from './serviceService';
import { AvailableSlot, WorkingDay } from '../types';

export class CalendarService {
  static async refreshAccessTokenIfNeeded(userId: string): Promise<string> {
    const tokens = await UserService.getGoogleTokens(userId);
    if (!tokens) {
      throw new Error('No Google tokens found for user');
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

    const service = await ServiceService.findById(serviceId, userId);
    if (!service) {
      throw new Error('Service not found');
    }

    const { settings } = businessProfile;
    const { workingHours, bufferTimeMinutes, minBookingNoticeHours, timeZone } = settings;

    // Parse the target date
    const targetDate = new Date(date);
    const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    // Find working hours for this day
    const workingDay = workingHours.find(wh => wh.day.toLowerCase() === dayName);
    if (!workingDay || !workingDay.isWorkingDay) {
      return [];
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

    // Get busy times from Google Calendar
    const freeBusyResponse = await calendar.freebusy.query({
      requestBody: {
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        timeZone: timeZone,
        items: [{ id: 'primary' }]
      }
    });

    const busyTimes = freeBusyResponse.data.calendars?.primary?.busy || [];

    // Generate potential slots
    const slots: AvailableSlot[] = [];
    const slotDuration = service.durationMinutes + bufferTimeMinutes;
    
    let currentTime = new Date(effectiveStart);
    
    while (currentTime.getTime() + (service.durationMinutes * 60 * 1000) <= endOfDay.getTime()) {
      const slotEnd = new Date(currentTime.getTime() + (service.durationMinutes * 60 * 1000));
      
      // Check if this slot conflicts with any busy time
      const isAvailable = !busyTimes.some(busy => {
        const busyStart = new Date(busy.start!);
        const busyEnd = new Date(busy.end!);
        
        // Check for overlap
        return (currentTime < busyEnd && slotEnd > busyStart);
      });

      slots.push({
        startTime: currentTime.toISOString(),
        endTime: slotEnd.toISOString(),
        available: isAvailable
      });

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

    const startTime = new Date(slotStartTime);
    const endTime = new Date(startTime.getTime() + (service.durationMinutes * 60 * 1000));

    // Double-check availability to prevent race conditions
    const freeBusyResponse = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        items: [{ id: 'primary' }]
      }
    });

    const busyTimes = freeBusyResponse.data.calendars?.primary?.busy || [];
    const hasConflict = busyTimes.some(busy => {
      const busyStart = new Date(busy.start!);
      const busyEnd = new Date(busy.end!);
      return (startTime < busyEnd && endTime > busyStart);
    });

    if (hasConflict) {
      throw new Error('Time slot is no longer available');
    }

    // Create calendar event
    const event = {
      summary: `${service.title}${customerName ? ` - ${customerName}` : ''}`,
      description: `Booking via Settle\nService: ${service.title}\nCustomer: ${customerName || 'N/A'}\nEmail: ${customerEmail || 'N/A'}`,
      start: {
        dateTime: startTime.toISOString(),
      },
      end: {
        dateTime: endTime.toISOString(),
      },
      attendees: customerEmail ? [{ email: customerEmail }] : [],
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    return {
      eventId: response.data.id,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      service: service.title,
      customer: customerName,
      email: customerEmail
    };
  }
}
