
import pool from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { BusinessProfile, BusinessSettings, SocialLinks } from '../types';

export class BusinessService {
  static async createBusinessProfile(
    userId: string, 
    name: string, 
    email: string, 
    handle: string,
    settings: BusinessSettings,
    socialLinks: SocialLinks = {}
  ): Promise<BusinessProfile> {
    const id = uuidv4();
    
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
    if (updates.socialLinks) {
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

  private static mapRowToBusinessProfile(row: any): BusinessProfile {
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
      settings: JSON.parse(row.settings),
      socialLinks: JSON.parse(row.social_links || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
