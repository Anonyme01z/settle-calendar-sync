// Service: Business profile operations and settings management
import pool from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { BusinessProfile, BusinessSettings, WorkingDay, WorkingHoursEntry } from '../types';

export class BusinessService {
  static async createBusinessProfile(
    userId: string, 
    name: string, 
    email: string, 
    handle: string,
    initialSettings: Partial<BusinessSettings> = {}, // Allow partial settings for initial creation
    socialLinks: BusinessProfile['socialLinks'] = {} // Use the inline type from BusinessProfile
  ): Promise<BusinessProfile> {
    const id = uuidv4();
    
    // Initialize default settings, including new fields
    const settings: BusinessSettings = {
      currency: initialSettings.currency || 'USD', // Default currency
      timeZone: initialSettings.timeZone || 'UTC', // Default timezone
      workingHours: initialSettings.workingHours || [], // Old field, will be empty or migrated
      bufferTimeMinutes: initialSettings.bufferTimeMinutes || 0,
      minBookingNoticeHours: initialSettings.minBookingNoticeHours || 0,
      hasSetWorkingHours: false, // Default to false for new profiles
      workingHoursHistory: [] // Initialize as empty array
    };

    const query = `
      INSERT INTO business_profiles (id, user_id, name, email, handle, settings, social_links, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      id, userId, name, email, handle, 
      JSON.stringify(settings), 
      JSON.stringify(socialLinks)
    ]);
    
    return this.mapRowToBusinessProfile(result.rows[0]);
  }

  static async findByUserId(userId: string): Promise<BusinessProfile | null> {
    const query = 'SELECT * FROM business_profiles WHERE user_id = $1';
    const result = await pool.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToBusinessProfile(result.rows[0]);
  }

  static async findByHandle(handle: string): Promise<BusinessProfile | null> {
    const query = 'SELECT * FROM business_profiles WHERE handle = $1';
    const result = await pool.query(query, [handle]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToBusinessProfile(result.rows[0]);
  }

  static async updateProfile(userId: string, updates: Partial<BusinessProfile>): Promise<BusinessProfile> {
    const setClause = [];
    const values = [];
    let paramCount = 1;

    if (updates.name) {
      setClause.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.email) {
      setClause.push(`email = $${paramCount++}`);
      values.push(updates.email);
    }
    if (updates.avatarUrl) {
      setClause.push(`avatar_url = $${paramCount++}`);
      values.push(updates.avatarUrl);
    }
    if (updates.phone) {
      setClause.push(`phone = $${paramCount++}`);
      values.push(updates.phone);
    }
    if (updates.address) {
      setClause.push(`address = $${paramCount++}`);
      values.push(updates.address);
    }
    if (updates.settings) {
      setClause.push(`settings = $${paramCount++}`);
      values.push(JSON.stringify(updates.settings));
    }
    if (updates.socialLinks !== undefined) { // Use !== undefined to allow null/empty object
      setClause.push(`social_links = $${paramCount++}`);
      values.push(JSON.stringify(updates.socialLinks));
    }

    setClause.push(`updated_at = NOW()`);
    values.push(userId);

    const query = `
      UPDATE business_profiles 
      SET ${setClause.join(', ')}
      WHERE user_id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return this.mapRowToBusinessProfile(result.rows[0]);
  }

  /**
   * Retrieves the effective working hours for a given business and date.
   * It looks through the workingHoursHistory to find the most recent entry
   * that is effective on or before the specified date.
   * @param userId The ID of the business owner.
   * @param date The date for which to get working hours.
   * @returns An array of WorkingDay objects.
   */
  static async getEffectiveWorkingHours(userId: string, date: Date): Promise<WorkingDay[]> {
    const businessProfile = await this.findByUserId(userId);
    if (!businessProfile || !businessProfile.settings.workingHoursHistory) {
      return []; // No history, so no working hours
    }

    const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()); // Normalize to start of day

    // Find the most recent working hours entry effective on or before the target date
    const effectiveEntry = businessProfile.settings.workingHoursHistory
      .filter(entry => new Date(entry.effectiveFrom) <= targetDate)
      .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];

    return effectiveEntry ? effectiveEntry.days : [];
  }

  private static mapRowToBusinessProfile(row: any): BusinessProfile {
    const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    const socialLinks = typeof row.social_links === 'string' ? JSON.parse(row.social_links) : row.social_links || {};

    // Ensure new settings fields are initialized if they don't exist in old data
    if (settings.hasSetWorkingHours === undefined) {
      // If we have working hours but no flag set, check if they have at least one working day
      if (settings.workingHours && settings.workingHours.length > 0) {
        const hasValidWorkingDay = settings.workingHours.some((wh: WorkingDay) => 
          wh.isWorkingDay && wh.startTime && wh.endTime
        );
        settings.hasSetWorkingHours = hasValidWorkingDay;
      } else {
        settings.hasSetWorkingHours = false;
      }
    }
    
    if (!settings.workingHoursHistory) {
      settings.workingHoursHistory = [];
      // If old workingHours exist and no history, migrate them as the first entry
      if (settings.workingHours && settings.workingHours.length > 0 && settings.hasSetWorkingHours) {
        settings.workingHoursHistory.push({
          effectiveFrom: new Date().toISOString().split('T')[0], // Set effective from today
          days: settings.workingHours
        });
      }
    }
    
    // Add missing bookingWindowDays if not present
    if (!settings.bookingWindowDays) {
      settings.bookingWindowDays = 30; // Default to 30 days
    }

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatar_url,
      handle: row.handle,
      rating: row.rating,
      reviewCount: row.review_count,
      phone: row.phone,
      address: row.address,
      settings: settings,
      socialLinks: socialLinks,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
