export interface User {
  id: string;
  email: string;
  passwordHash: string;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  googleTokenExpiry?: Date;
  googleCalendarId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessProfile {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  handle: string;
  rating?: number;
  reviewCount?: number;
  phone?: string;
  address?: string;
  settings: BusinessSettings;
  socialLinks: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
    website?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessSettings {
  currency: string;
  timeZone: string;
  workingHours: WorkingDay[]; // This will be deprecated in favor of workingHoursHistory
  bufferTimeMinutes: number;
  minBookingNoticeHours: number;
  bookingWindowDays?: number; // Number of days ahead customers can book
  hasSetWorkingHours?: boolean; // New flag for first-time setup
  workingHoursHistory?: WorkingHoursEntry[]; // New field for historical working hours
}

export interface WorkingDay {
  day: string;
  isWorkingDay: boolean;
  startTime?: string; // Made optional
  endTime?: string;   // Made optional
}

export interface WorkingHoursEntry {
  effectiveFrom: string; // ISO date string (YYYY-MM-DD)
  days: WorkingDay[];
}

export interface Service {
  id: string;
  userId: string;
  title: string;
  bookingType: 'fixed' | 'flexible';
  description: string;
  location: string;
  locationType: 'online' | 'offline';
  meetingLink?: string;
  address?: string;
  price: number;
  currency: string;
  isActive: boolean;
  customerNotesEnabled: boolean;
  capacity?: number;
  depositPercentage: number;
  durationMinutes?: number;
  windowDuration?: number;
  estimatedDuration?: number;
  requiresApproval?: boolean;
  bookingWindowDays?: number; // New field
  createdAt: Date;
  updatedAt: Date;
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  available: boolean;
  spacesLeft?: number; // For flexible services: how many bookings are still available for this slot
}

export interface Booking {
  id: string;
  userId: string;
  serviceId: string;
  slotStartTime: Date;
  slotEndTime: Date;
  customerName: string;
  customerEmail: string;
  googleCalendarEventId?: string;
  status: 'confirmed' | 'cancelled' | 'pending';
  cancellationReason?: string;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PauseWindow {
  id: string;
  userId: string;
  startDate: string; // ISO date string (YYYY-MM-DD)
  endDate: string; // ISO date string (YYYY-MM-DD)
  reason?: string;
  createdAt: Date;
  createdBy: string; // userId of the creator
}

export interface BookingRequest {
  serviceId: string;
  slotStartTime: string;
  customerName?: string;
  customerEmail?: string;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}
