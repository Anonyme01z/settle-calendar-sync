import express from 'express';
import { UserService } from '../services/userService';
import { EmailService } from '../services/emailService';
import pool from '../config/database';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Create password reset requests table (idempotent operation for migration)
async function createPasswordResetTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email ON password_reset_codes(email);
      CREATE INDEX IF NOT EXISTS idx_password_reset_codes_code ON password_reset_codes(code);
      CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at ON password_reset_codes(expires_at);
    `);
  } catch (error) {
    console.error('Error creating password reset table:', error);
  }
}

// Initialize table on module load
createPasswordResetTable();

// Validation schemas
const requestPasswordResetSchema = Joi.object({
  email: Joi.string().email().required()
});

const verifyPasswordResetSchema = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().length(6).required()
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().length(6).required(),
  password: Joi.string().min(6).required()
});

// Generate a 6-digit OTP code
function generateOTPCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Per-route rate limiters
const ipLimiterStrict = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req: any) => (req.body && req.body.email ? `email:${req.body.email.toLowerCase()}` : req.ip),
  standardHeaders: true,
  legacyHeaders: false,
});
const ipLimiterLenient = rateLimit({ windowMs: 10 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false });

// Request password reset
router.post('/request-password-reset', ipLimiterStrict, emailLimiter, async (req, res) => {
  try {
    const { error, value } = requestPasswordResetSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email } = value;

    // Check if user exists
    const user = await UserService.findByEmail(email);
    if (!user) {
      // Don't reveal if user doesn't exist for security
      return res.json({ message: 'If the email exists, you will receive a password reset code.' });
    }

    // Clean up expired codes for this email
    await pool.query(`
      DELETE FROM password_reset_codes 
      WHERE email = $1 AND (expires_at < NOW() OR used = TRUE)
    `, [email]);

    // Generate OTP code
    const code = generateOTPCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Store the code
    await pool.query(`
      INSERT INTO password_reset_codes (email, code, expires_at) 
      VALUES ($1, $2, $3)
    `, [email, code, expiresAt]);

    // Send email with OTP code (async, don't wait for it)
    EmailService.sendPasswordResetEmail(email, code).catch(error => {
      console.error('Error sending password reset email:', error);
    });

    res.json({ message: 'If the email exists, you will receive a password reset code.' });
  } catch (err: any) {
    console.error('Error requesting password reset:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify password reset code
router.post('/verify-password-reset', ipLimiterLenient, emailLimiter, async (req, res) => {
  try {
    const { error, value } = verifyPasswordResetSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, code } = value;

    // Check if valid code exists
    const result = await pool.query(`
      SELECT id FROM password_reset_codes 
      WHERE email = $1 AND code = $2 AND expires_at > NOW() AND used = FALSE
    `, [email, code]);

    const isValid = result.rows.length > 0;

    res.json({ valid: isValid });
  } catch (err: any) {
    console.error('Error verifying password reset code:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password with code
router.post('/reset-password', ipLimiterLenient, emailLimiter, async (req, res) => {
  try {
    const { error, value } = resetPasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, code, password } = value;

    // Check if valid code exists and mark as used in one query
    const result = await pool.query(`
      UPDATE password_reset_codes 
      SET used = TRUE 
      WHERE email = $1 AND code = $2 AND expires_at > NOW() AND used = FALSE
      RETURNING id
    `, [email, code]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    // Find user
    const user = await UserService.findByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update user password
    await pool.query(`
      UPDATE users 
      SET password_hash = $1, updated_at = NOW() 
      WHERE id = $2
    `, [passwordHash, user.id]);

    // Clean up all reset codes for this email
    await pool.query(`
      DELETE FROM password_reset_codes 
      WHERE email = $1
    `, [email]);

    res.json({ message: 'Password reset successfully' });
  } catch (err: any) {
    console.error('Error resetting password:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
