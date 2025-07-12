import pool from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { Service } from '../types';

export class ServiceService {
  static async createService(
    userId: string,
    data: {
      title: string;
      bookingType: 'appointment' | 'service-window' | 'on-demand';
      description: string;
      location: string;
      locationType?: 'online' | 'onsite';
      meetingLink?: string;
      address?: string;
      currency: string;
      customerNotesEnabled?: boolean;
      
      // Appointment-specific fields
      durationMinutes?: number;
      totalPrice?: number;
      depositPercentage?: number;
      
      // Service Window-specific fields
      windowDuration?: number;
      estimatedDuration?: number;
      startingPrice?: number;
      
      // On-Demand specific fields
      requiresApproval?: boolean;
      
      // Legacy fields
      pricing?: { rate: number; per: string | null };
    }
  ): Promise<Service> {
    try {
    const id = uuidv4();
    const query = `
      INSERT INTO services (
          id, user_id, title, booking_type, description, location, location_type, 
          meeting_link, address, currency, is_active, customer_notes_enabled,
          duration_minutes, total_price, deposit_percentage, window_duration, 
          estimated_duration, starting_price, requires_approval, pricing, 
          created_at, updated_at
      )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [
      id,
      userId,
      data.title,
        data.bookingType,
        data.description,
        data.location,
        data.locationType ?? null,
        data.meetingLink ?? null,
        data.address ?? null,
        data.currency,
        data.customerNotesEnabled ?? false,
      data.durationMinutes ?? null,
      data.totalPrice ?? null,
      data.depositPercentage ?? null,
        data.windowDuration ?? null,
      data.estimatedDuration ?? null,
        data.startingPrice ?? null,
        data.requiresApproval ?? null,
        data.pricing ? JSON.stringify(data.pricing) : null
    ]);
    return this.mapRowToService(result.rows[0]);
    } catch (error) {
      console.error('Create service error:', error);
      throw new Error('Failed to create service: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  static async findByUserId(userId: string): Promise<Service[]> {
    const query = 'SELECT * FROM services WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC';
    const result = await pool.query(query, [userId]);
    
    return result.rows.map(this.mapRowToService);
  }

  static async findById(serviceId: string, userId: string): Promise<Service | null> {
    const query = 'SELECT * FROM services WHERE id = $1 AND user_id = $2 AND is_active = true';
    const result = await pool.query(query, [serviceId, userId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToService(result.rows[0]);
  }

  static async updateService(serviceId: string, userId: string, updates: Partial<Service>): Promise<Service> {
    const setClause = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = [
      'title', 'bookingType', 'description', 'location', 'locationType', 
      'meetingLink', 'address', 'currency', 'customerNotesEnabled',
      'durationMinutes', 'totalPrice', 'depositPercentage', 
      'windowDuration', 'estimatedDuration', 'startingPrice', 
      'requiresApproval', 'pricing'
    ];
    
    allowedFields.forEach(field => {
      if (updates[field as keyof Service] !== undefined) {
        const dbField = field === 'durationMinutes' ? 'duration_minutes' : 
                       field === 'totalPrice' ? 'total_price' :
                       field === 'depositPercentage' ? 'deposit_percentage' : 
                       field === 'bookingType' ? 'booking_type' :
                       field === 'locationType' ? 'location_type' :
                       field === 'meetingLink' ? 'meeting_link' :
                       field === 'customerNotesEnabled' ? 'customer_notes_enabled' :
                       field === 'windowDuration' ? 'window_duration' :
                       field === 'estimatedDuration' ? 'estimated_duration' :
                       field === 'startingPrice' ? 'starting_price' :
                       field === 'requiresApproval' ? 'requires_approval' : field;
        setClause.push(`${dbField} = $${paramCount++}`);
        values.push(updates[field as keyof Service]);
      }
    });

    setClause.push(`updated_at = NOW()`);
    values.push(serviceId, userId);

    const query = `
      UPDATE services 
      SET ${setClause.join(', ')}
      WHERE id = $${paramCount++} AND user_id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return this.mapRowToService(result.rows[0]);
  }

  static async deleteService(serviceId: string, userId: string): Promise<boolean> {
    const query = 'UPDATE services SET is_active = false WHERE id = $1 AND user_id = $2';
    const result = await pool.query(query, [serviceId, userId]);
    
    return (result.rowCount ?? 0) > 0;
  }

  private static mapRowToService(row: any): Service {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      bookingType: row.booking_type,
      description: row.description,
      location: row.location,
      locationType: row.location_type,
      meetingLink: row.meeting_link,
      address: row.address,
      currency: row.currency,
      isActive: row.is_active,
      customerNotesEnabled: row.customer_notes_enabled,
      
      // Appointment-specific fields
      durationMinutes: row.duration_minutes,
      totalPrice: row.total_price,
      depositPercentage: row.deposit_percentage,
      
      // Service Window-specific fields
      windowDuration: row.window_duration,
      estimatedDuration: row.estimated_duration,
      startingPrice: row.starting_price,
      
      // On-Demand specific fields
      requiresApproval: row.requires_approval,
      
      // Legacy fields
      pricing: row.pricing ? (typeof row.pricing === 'string' ? JSON.parse(row.pricing) : row.pricing) : undefined,
      
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
