// Route: Email verification for user signup
import express from 'express';
import { UserService } from '../services/userService';
import { EmailService } from '../services/emailService';
import pool from '../config/database';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Create email verification codes table (idempotent operation for migration)
async function createEmailVerificationTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email ON email_verification_codes(email);
      CREATE INDEX IF NOT EXISTS idx_email_verification_codes_code ON email_verification_codes(code);
      CREATE INDEX IF NOT EXISTS idx_email_verification_codes_expires_at ON email_verification_codes(expires_at);
    `);
  } catch (error) {
    console.error('Error creating email verification table:', error);
  }
}

// Initialize table on module load
createEmailVerificationTable();

// Validation schemas
const sendVerificationCodeSchema = Joi.object({
  email: Joi.string().email().required()
});

const verifyEmailSchema = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().length(6).required()
});

// Generate a 6-digit OTP code (uses DEFAULT_OTP env var in staging/dev)
function generateOTPCode(): string {
  if (process.env.DEFAULT_OTP) return process.env.DEFAULT_OTP;
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Per-route rate limiters
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour per email (increased for development)
  keyGenerator: (req: any) => (req.body && req.body.email ? `email:${req.body.email.toLowerCase()}` : req.ip),
  standardHeaders: true,
  legacyHeaders: false,
});

const ipLimiter = rateLimit({ 
  windowMs: 5 * 60 * 1000, // 5 minutes (reduced window)
  max: 50, // 50 requests per 5 minutes per IP (increased for development)
  standardHeaders: true, 
  legacyHeaders: false 
});

/**
 * @openapi
 * /api/auth/send-verification-code:
 *   post:
 *     summary: Send email verification code for new user signup
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification code sent successfully
 *       400:
 *         description: Invalid email format
 *       429:
 *         description: Too many requests
 */
router.post('/send-verification-code', ipLimiter, emailLimiter, async (req, res) => {
  try {
    const { error, value } = sendVerificationCodeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email } = value;
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await UserService.findByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Clean up expired codes for this email
    await pool.query(`
      DELETE FROM email_verification_codes 
      WHERE email = $1 AND (expires_at < NOW() OR used = TRUE)
    `, [normalizedEmail]);

    // Generate OTP code
    const code = generateOTPCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Store the code
    await pool.query(`
      INSERT INTO email_verification_codes (email, code, expires_at) 
      VALUES ($1, $2, $3)
    `, [normalizedEmail, code, expiresAt]);

    // Send email with OTP code (async, don't wait for it)
    EmailService.sendSignupOTPEmail(normalizedEmail, code).catch(error => {
      console.error('Error sending signup OTP email:', error);
    });

    res.json({ message: 'Verification code sent to your email address' });
  } catch (err: any) {
    console.error('Error sending verification code:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify email address with OTP code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired verification code
 *       429:
 *         description: Too many requests
 */
router.post('/verify-email', ipLimiter, async (req, res) => {
  try {
    const { error, value } = verifyEmailSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, code } = value;
    const normalizedEmail = email.trim().toLowerCase();

    // Check if valid code exists and mark as used in one query
    const result = await pool.query(`
      UPDATE email_verification_codes 
      SET used = TRUE 
      WHERE email = $1 AND code = $2 AND expires_at > NOW() AND used = FALSE
      RETURNING id
    `, [normalizedEmail, code]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    // Mark email as verified (this will be used when user completes registration)
    // For now, we just return success - the actual verification will happen during registration
    
    // Clean up all verification codes for this email
    await pool.query(`
      DELETE FROM email_verification_codes 
      WHERE email = $1
    `, [normalizedEmail]);

    res.json({ valid: true, message: 'Email verified successfully' });
  } catch (err: any) {
    console.error('Error verifying email:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/check-verification-status:
 *   post:
 *     summary: Check if email verification code is valid (without consuming it)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *     responses:
 *       200:
 *         description: Verification status checked
 *       400:
 *         description: Invalid request
 */
router.post('/check-verification-status', ipLimiter, async (req, res) => {
  try {
    const { error, value } = verifyEmailSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, code } = value;
    const normalizedEmail = email.trim().toLowerCase();

    // Check if valid code exists (without marking as used)
    const result = await pool.query(`
      SELECT id FROM email_verification_codes 
      WHERE email = $1 AND code = $2 AND expires_at > NOW() AND used = FALSE
    `, [normalizedEmail, code]);

    const isValid = result.rows.length > 0;

    res.json({ valid: isValid });
  } catch (err: any) {
    console.error('Error checking verification status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
