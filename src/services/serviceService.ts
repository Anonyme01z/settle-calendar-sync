// Service: Service CRUD and mapping between DB and API shape
import pool from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { Service } from '../types';

export class ServiceService {
  static async createService(
    userId: string,
    data: {
      bookingType: 'fixed' | 'flexible';
      title: string;
      description: string;
      durationMinutes: number;
      location: string;
      locationType: 'online' | 'offline';
      meetingLink?: string;
      address?: string;
      price: number;
      currency: string;
      customerNotesEnabled?: boolean;
      isActive?: boolean;
      capacity?: number;
      depositPercentage?: number;
    }
  ): Promise<Service> {
    try {
      const id = uuidv4();
      const query = `
        INSERT INTO services (
            id, user_id, booking_type, title, description, duration_minutes, location, location_type, 
            meeting_link, address, price, deposit_percentage, currency, is_active, customer_notes_enabled,
            capacity, created_at, updated_at
        )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
        RETURNING *
      `;
      const result = await pool.query(query, [
        id,
        userId,
        data.bookingType,
        data.title,
        data.description,
        data.durationMinutes,
        data.location,
        data.locationType,
        data.meetingLink ?? null,
        data.address ?? null,
        data.price,
        data.depositPercentage ?? 0,
        data.currency,
        data.isActive ?? true,
        data.customerNotesEnabled ?? false,
        data.bookingType === 'flexible' ? data.capacity : null
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

  static async updateService(serviceId: string, userId: string, updates: Partial<Service>): Promise<Service | null> {
    const setClause = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = [
      'bookingType', 'title', 'description', 'location', 'locationType', 
      'meetingLink', 'address', 'price', 'depositPercentage', 'currency', 'customerNotesEnabled',
      'capacity', 'durationMinutes', 'windowDuration', 'estimatedDuration', 'requiresApproval', 'isActive'
    ];
    
    allowedFields.forEach(field => {
      if (updates[field as keyof Service] !== undefined) {
        const dbField = 
          field === 'bookingType' ? 'booking_type' :
          field === 'locationType' ? 'location_type' :
          field === 'meetingLink' ? 'meeting_link' :
          field === 'depositPercentage' ? 'deposit_percentage' :
          field === 'customerNotesEnabled' ? 'customer_notes_enabled' :
          field === 'durationMinutes' ? 'duration_minutes' :
          field === 'windowDuration' ? 'window_duration' :
          field === 'estimatedDuration' ? 'estimated_duration' :
          field === 'requiresApproval' ? 'requires_approval' :
          field === 'isActive' ? 'is_active' :
          field;
        setClause.push(`${dbField} = $${paramCount++}`);
        values.push(updates[field as keyof Service]);
      }
    });

    if (setClause.length === 0) {
      return this.findById(serviceId, userId);
    }

    if (updates.bookingType === 'fixed') {
      setClause.push(`capacity = NULL`);
    }

    setClause.push(`updated_at = NOW()`);
    values.push(serviceId, userId);

    const query = `
      UPDATE services 
      SET ${setClause.join(', ')}
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING *
    `;

    try {
        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) {
            return null;
        }

        return this.mapRowToService(result.rows[0]);
    } catch (error) {
        console.error('Update service error:', error);
        throw new Error('Failed to update service: ' + (error instanceof Error ? error.message : String(error)));
    }
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
      price: Number(row.price),
      currency: row.currency,
      isActive: row.is_active,
      customerNotesEnabled: row.customer_notes_enabled,
      capacity: row.capacity,
      depositPercentage: row.deposit_percentage,
      durationMinutes: row.duration_minutes,
      windowDuration: row.window_duration,
      estimatedDuration: row.estimated_duration,
      requiresApproval: row.requires_approval,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
