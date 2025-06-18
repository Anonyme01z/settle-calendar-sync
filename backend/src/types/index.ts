
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
  socialLinks: SocialLinks;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessSettings {
  workingHours: WorkingDay[];
  bufferTimeMinutes: number;
  minBookingNoticeHours: number;
  bookingWindowDays: number;
  calendarConnected: boolean;
  timeZone: string;
}

export interface WorkingDay {
  day: string;
  startTime: string;
  endTime: string;
  isWorkingDay: boolean;
}

export interface SocialLinks {
  instagram?: string;
  twitter?: string;
  facebook?: string;
  website?: string;
}

export interface Service {
  id: string;
  userId: string;
  title: string;
  durationMinutes: number;
  location: string;
  totalPrice: number;
  depositPercentage: number;
  description: string;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Booking {
  id: string;
  userId: string;
  serviceId: string;
  startTime: Date;
  endTime: Date;
  customerName?: string;
  customerEmail?: string;
  googleCalendarEventId?: string;
  status: 'confirmed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  available: boolean;
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
