import express from 'express';
import { UserService } from '../services/userService';
import { BusinessService } from '../services/businessService';
import { generateToken } from '../utils/jwt';
import { oauth2Client, SCOPES } from '../config/google';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  businessName: Joi.string().required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               businessName:
 *                 type: string
 *               businessHandle:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 */
// Helper to slugify business name
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Helper to generate a unique handle
async function generateUniqueHandle(businessName: string): Promise<string> {
  let base = slugify(businessName);
  let handle = base;
  let i = 1;
  while (await BusinessService.findByHandle(handle)) {
    handle = `${base}-${i++}`;
  }
  return handle;
}

router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, businessName } = value;

    // Check if user already exists
    const existingUser = await UserService.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Auto-generate unique handle from businessName
    const businessHandle = await generateUniqueHandle(businessName);

    // Create user
    const user = await UserService.createUser(email, password);

    // Create business profile with default settings
    const defaultSettings = {
      workingHours: [
        { day: 'monday', startTime: '09:00', endTime: '17:00', isWorkingDay: true },
        { day: 'tuesday', startTime: '09:00', endTime: '17:00', isWorkingDay: true },
        { day: 'wednesday', startTime: '09:00', endTime: '17:00', isWorkingDay: true },
        { day: 'thursday', startTime: '09:00', endTime: '17:00', isWorkingDay: true },
        { day: 'friday', startTime: '09:00', endTime: '17:00', isWorkingDay: true },
        { day: 'saturday', startTime: '09:00', endTime: '17:00', isWorkingDay: false },
        { day: 'sunday', startTime: '09:00', endTime: '17:00', isWorkingDay: false }
      ],
      bufferTimeMinutes: 15,
      minBookingNoticeHours: 24,
      bookingWindowDays: 30,
      calendarConnected: false,
      timeZone: 'America/New_York'
    };

    const businessProfile = await BusinessService.createBusinessProfile(
      user.id,
      businessName,
      email,
      businessHandle,
      defaultSettings
    );

    // Generate token
    const token = generateToken(user.id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email
      },
      businessProfile: {
        ...businessProfile,
        handle: businessHandle // Ensure handle is returned
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Login a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password } = value;

    // Find user
    const user = await UserService.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await UserService.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user.id);

    // Get business profile
    const businessProfile = await BusinessService.findByUserId(user.id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email
      },
      businessProfile
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Google OAuth - Initiate
router.get('/google/connect', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: req.userId // Pass user ID in state
    });

    res.json({ authUrl });
  } catch (error) {
    console.error('Google OAuth initiate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Google OAuth - Callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing authorization code or state' });
    }

    const userId = state as string;

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code as string);
    
    if (!tokens?.access_token) {
      return res.status(400).json({ error: 'Failed to get access token' });
    }

    // Store tokens
    await UserService.updateGoogleTokens(
      userId,
      tokens.access_token,
      tokens.refresh_token ?? undefined,
      tokens.expiry_date ?? undefined
    );

    // Update business profile to mark calendar as connected
    const businessProfile = await BusinessService.findByUserId(userId);
    if (businessProfile) {
      const updatedSettings = {
        ...businessProfile.settings,
        calendarConnected: true
      };
      await BusinessService.updateProfile(userId, { settings: updatedSettings });
    }

    // Redirect to frontend's Google callback handler with status and userId
    res.redirect(`${process.env.FRONTEND_URL}/auth/google/callback?status=success&userId=${userId}`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/auth/google/callback?status=error`);
  }
});

// Google Calendar Disconnect
router.post('/google/disconnect', authenticateToken, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  try {
    // Remove tokens from user
    await UserService.updateGoogleTokens(req.userId as string, null, null, null);
    // Update business profile
    const businessProfile = await BusinessService.findByUserId(req.userId as string);
    if (businessProfile) {
      const updatedSettings = {
        ...businessProfile.settings,
        calendarConnected: false
      };
      await BusinessService.updateProfile(req.userId as string, { settings: updatedSettings });
    }
    // Optionally, revoke token with Google (not required for local cleanup)
    res.json({ message: 'Google Calendar disconnected successfully' });
  } catch (error) {
    console.error('Google disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Google Calendar' });
  }
});

export default router;
