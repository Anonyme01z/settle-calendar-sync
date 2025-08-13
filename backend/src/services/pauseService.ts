import pool from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { PauseWindow, Booking } from '../types';

export class PauseService {
  static async createPauseWindow(
    userId: string,
    startDate: string, // YYYY-MM-DD
    endDate: string,   // YYYY-MM-DD
    reason: string | undefined,
    createdBy: string, // userId of the creator
    force: boolean = false
  ): Promise<PauseWindow | { conflicts: Booking[] }> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validate dates
    if (start > end) {
      throw new Error('Start date cannot be after end date.');
    }

    // Validate against booking window
    await this.validateBookingWindow(userId, start, end);

    // Check for existing confirmed bookings within the pause range
    const conflictQuery = `
      SELECT id, user_id, service_id, start_time, end_time, customer_name, customer_email, status, created_at, updated_at
      FROM bookings
      WHERE user_id = $1
        AND status = 'confirmed'
        AND start_time::date <= $3
        AND end_time::date >= $2;
    `;
    const conflictResult = await pool.query(conflictQuery, [userId, startDate, endDate]);
    const conflictingBookings: Booking[] = conflictResult.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      serviceId: row.service_id,
      slotStartTime: new Date(row.start_time), // Ensure it's a Date object
      slotEndTime: new Date(row.end_time),     // Ensure it's a Date object
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      status: row.status,
      createdAt: new Date(row.created_at), // Include createdAt
      updatedAt: new Date(row.updated_at)  // Include updatedAt
    }));

    if (conflictingBookings.length > 0 && !force) {
      return { conflicts: conflictingBookings };
    }

    // If force is true, cancel conflicting bookings
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
      await pool.query(cancelQuery, [bookingIdsToCancel, reason || 'Bookings paused by business.']);
      // TODO: Trigger notifications for cancelled bookings (optional/async)
      console.log(`Cancelled bookings with IDs: ${bookingIdsToCancel.join(', ')} due to pause window.`);
    }

    // Insert the new pause window
    const id = uuidv4();
    const insertQuery = `
      INSERT INTO pause_windows (id, user_id, start_date, end_date, reason, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const insertResult = await pool.query(insertQuery, [id, userId, startDate, endDate, reason, createdBy]);

    return this.mapRowToPauseWindow(insertResult.rows[0]);
  }

  private static async validateBookingWindow(userId: string, startDate: Date, endDate: Date): Promise<void> {
    // Get user's services to calculate max booking window
    const servicesQuery = `
      SELECT booking_window_days FROM services
      WHERE user_id = $1 AND is_active = true;
    `;
    const servicesResult = await pool.query(servicesQuery, [userId]);
    
    let maxBookingWindowDays = 365; // Default
    if (servicesResult.rows.length > 0) {
      maxBookingWindowDays = Math.max(
        ...servicesResult.rows.map(row => row.booking_window_days || 365)
      );
    }

    // Calculate max allowed date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxAllowedDate = new Date(today.getTime() + (maxBookingWindowDays * 24 * 60 * 60 * 1000));

    // Check if requested dates are within booking window
    if (startDate > maxAllowedDate || endDate > maxAllowedDate) {
      throw new Error(`Off days cannot be set beyond your booking window (${maxBookingWindowDays} days from today). Please select dates between today and ${maxAllowedDate.toLocaleDateString()}.`);
    }

    // Check if dates are in the past (except today)
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (startDate < today) {
      throw new Error('Off days cannot be set for past dates. Please select dates from today onwards.');
    }
  }

  static async getPauseWindows(userId: string, date?: string): Promise<PauseWindow[]> {
    let query = `
      SELECT * FROM pause_windows
      WHERE user_id = $1
    `;
    const values = [userId];

    if (date) {
      // Check if the given date falls within any pause window
      query += ` AND $2::date BETWEEN start_date AND end_date`;
      values.push(date);
    } else {
      // Get all active pause windows (not in the past)
      query += ` AND end_date >= NOW()::date`;
    }

    const result = await pool.query(query, values);
    return result.rows.map(this.mapRowToPauseWindow);
  }

  private static mapRowToPauseWindow(row: any): PauseWindow {
    return {
      id: row.id,
      userId: row.user_id,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      createdAt: row.created_at,
      createdBy: row.created_by
    };
  }
}
