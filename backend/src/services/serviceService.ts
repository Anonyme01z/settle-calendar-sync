import pool from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { Service } from '../types';

export class ServiceService {
  static async createService(
    userId: string,
    data: {
      title: string;
      durationMinutes?: number;
      location: string;
      totalPrice?: number;
      depositPercentage?: number;
      description: string;
      currency: string;
      bookingType: 'fixed' | 'flexible' | 'quote';
      pricing?: { rate: number; per: string | null };
      estimatedDuration?: number;
      requiresApproval?: boolean;
      customerNotesEnabled?: boolean;
    }
  ): Promise<Service> {
    const id = uuidv4();
    const query = `
      INSERT INTO services (
        id, user_id, title, duration_minutes, location, total_price, deposit_percentage, description, currency, is_active,
        booking_type, pricing, estimated_duration, requires_approval, customer_notes_enabled, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12, $13, $14, NOW(), NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [
      id,
      userId,
      data.title,
      data.durationMinutes ?? null,
      data.location,
      data.totalPrice ?? null,
      data.depositPercentage ?? null,
      data.description,
      data.currency,
      data.bookingType,
      data.pricing ? JSON.stringify(data.pricing) : null,
      data.estimatedDuration ?? null,
      data.requiresApproval ?? (data.bookingType === 'flexible' || data.bookingType === 'quote'),
      data.customerNotesEnabled ?? false
    ]);
    return this.mapRowToService(result.rows[0]);
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

    const allowedFields = ['title', 'durationMinutes', 'location', 'totalPrice', 'depositPercentage', 'description', 'currency'];
    
    allowedFields.forEach(field => {
      if (updates[field as keyof Service] !== undefined) {
        const dbField = field === 'durationMinutes' ? 'duration_minutes' : 
                       field === 'totalPrice' ? 'total_price' :
                       field === 'depositPercentage' ? 'deposit_percentage' : field;
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
      durationMinutes: row.duration_minutes,
      location: row.location,
      totalPrice: row.total_price,
      depositPercentage: row.deposit_percentage,
      description: row.description,
      currency: row.currency,
      isActive: row.is_active,
      bookingType: row.booking_type,
      pricing: row.pricing ? (typeof row.pricing === 'string' ? JSON.parse(row.pricing) : row.pricing) : undefined,
      estimatedDuration: row.estimated_duration,
      requiresApproval: row.requires_approval,
      customerNotesEnabled: row.customer_notes_enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
