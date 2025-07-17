
import pool from '../config/database';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../types';
import { encrypt, decrypt } from '../utils/encryption';

export class UserService {
  static async createUser(email: string, password: string): Promise<User> {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    
    const query = `
      INSERT INTO users (id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING *
    `;
    
    const result = await pool.query(query, [id, email, passwordHash]);
    return this.mapRowToUser(result.rows[0]);
  }

  static async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToUser(result.rows[0]);
  }

  static async findById(id: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToUser(result.rows[0]);
  }

  static async updateGoogleTokens(
    userId: string,
    accessToken?: string,
    refreshToken?: string,
    expiry?: number
  ): Promise<void> {
    const encryptedAccessToken = accessToken ? encrypt(accessToken) : null;
    const encryptedRefreshToken = refreshToken ? encrypt(refreshToken) : null;
    const expiryDate = expiry ? new Date(expiry) : null;

    const query = `
      UPDATE users 
      SET google_access_token = $1, google_refresh_token = $2, google_token_expiry = $3, updated_at = NOW()
      WHERE id = $4
    `;
    
    await pool.query(query, [encryptedAccessToken, encryptedRefreshToken, expiryDate, userId]);
  }

  static async getGoogleTokens(userId: string): Promise<{ accessToken: string; refreshToken?: string; expiry?: Date } | null> {
    const query = 'SELECT google_access_token, google_refresh_token, google_token_expiry FROM users WHERE id = $1';
    const result = await pool.query(query, [userId]);
    
    if (result.rows.length === 0 || !result.rows[0].google_access_token) {
      return null;
    }

    const row = result.rows[0];
    return {
      accessToken: decrypt(row.google_access_token),
      refreshToken: row.google_refresh_token ? decrypt(row.google_refresh_token) : undefined,
      expiry: row.google_token_expiry || undefined
    };
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private static mapRowToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      googleAccessToken: row.google_access_token,
      googleRefreshToken: row.google_refresh_token,
      googleTokenExpiry: row.google_token_expiry,
      googleCalendarId: row.google_calendar_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
