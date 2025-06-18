
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
  businessName: Joi.string().required(),
  businessHandle: Joi.string().alphanum().min(3).max(20).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, businessName, businessHandle } = value;

    // Check if user already exists
    const existingUser = await UserService.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Check if handle is taken
    const existingHandle = await BusinessService.findByHandle(businessHandle);
    if (existingHandle) {
      return res.status(400).json({ error: 'Business handle already taken' });
    }

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
      businessProfile
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
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
    res.status(500).json({ error: 'Failed to initiate Google OAuth' });
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
    const { tokens } = await oauth2Client.getAccessToken(code as string);
    
    if (!tokens.access_token) {
      return res.status(400).json({ error: 'Failed to get access token' });
    }

    // Store tokens
    await UserService.updateGoogleTokens(
      userId,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expiry_date
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

    // Redirect to frontend with success
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?calendar=connected`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?calendar=error`);
  }
});

export default router;
