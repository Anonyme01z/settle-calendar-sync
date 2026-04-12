// Route: Business profile and settings (including avatar uploads)
import express from 'express';
import rateLimit from 'express-rate-limit';
import { BusinessService } from '../services/businessService';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import Joi from 'joi';
// @ts-ignore: If you haven't installed multer, run: npm install multer
import multer, { StorageEngine, FileFilterCallback } from 'multer';
import path from 'path';
import type { Express } from 'express';

const router = express.Router();

// Validation schemas
const updateSettingsSchema = Joi.object({
  workingHours: Joi.array().items(
    Joi.object({
      day: Joi.string().required(),
      startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      isWorkingDay: Joi.boolean().required()
    })
  ),
  bufferTimeMinutes: Joi.number().min(0).max(120),
  minBookingNoticeHours: Joi.number().min(0).max(168),
  bookingWindowDays: Joi.number().min(1).max(365),
  timeZone: Joi.string()
});

const updateProfileSchema = Joi.object({
  name: Joi.string(),
  email: Joi.string().email(),
  avatarUrl: Joi.string().uri().allow(''),
  phone: Joi.string().allow(''),
  address: Joi.string().allow(''),
  socialLinks: Joi.object({
    instagram: Joi.string().allow(''),
    twitter: Joi.string().allow(''),
    facebook: Joi.string().allow(''),
    website: Joi.string().uri().allow('')
  })
});

// Set up multer for file uploads
const storage: StorageEngine = multer.diskStorage({
  destination: function (req: any, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: function (req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req: any, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

/**
 * @openapi
 * /api/business/{userId}/avatar:
 *   post:
 *     summary: Upload avatar image
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar uploaded
 */
router.post('/:userId/avatar', authenticateToken, upload.single('avatar'), async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    if (req.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Construct the URL to the uploaded file
    const fileUrl = `/uploads/${file.filename}`;
    res.json({ url: fileUrl });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve uploaded files statically
router.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

/**
 * @openapi
 * /api/business/{userId}/profile:
 *   get:
 *     summary: Get business profile
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Business profile
 */

// Apply a more lenient rate limit specifically for the business profile GET endpoint
const getProfileLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: 'Too many requests for this profile, please try again later.'
});

router.get('/:userId/profile', getProfileLimiter, authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure user can only access their own profile
    if (req.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const businessProfile = await BusinessService.findByUserId(userId);
    if (!businessProfile) {
      return res.status(404).json({ error: 'Business profile not found' });
    }

    res.json(businessProfile);
  } catch (error) {
    console.error('Get business profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/business/{userId}/settings:
 *   put:
 *     summary: Update business settings
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workingHours:
 *                 type: array
 *                 items:
 *                   type: object
 *               bufferTimeMinutes:
 *                 type: number
 *               minBookingNoticeHours:
 *                 type: number
 *               bookingWindowDays:
 *                 type: number
 *               timeZone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated business settings
 */
router.put('/:userId/settings', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure user can only update their own settings
    if (req.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error, value } = updateSettingsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const businessProfile = await BusinessService.findByUserId(userId);
    if (!businessProfile) {
      return res.status(404).json({ error: 'Business profile not found' });
    }

    const updatedSettings = {
      ...businessProfile.settings,
      ...value
    };

    // If working hours are being updated, handle the working hours history and flag
    if (value.workingHours && value.workingHours.length > 0) {
      const today = new Date().toISOString().split('T')[0]; // Today's date in YYYY-MM-DD format
      
      // Initialize workingHoursHistory if it doesn't exist
      if (!updatedSettings.workingHoursHistory) {
        updatedSettings.workingHoursHistory = [];
      }
      
      // Add new entry to history
      updatedSettings.workingHoursHistory.push({
        effectiveFrom: today,
        days: value.workingHours
      });
      
      // Set the flag to indicate working hours have been configured
      updatedSettings.hasSetWorkingHours = true;
      
      // Keep the old workingHours for backward compatibility
      updatedSettings.workingHours = value.workingHours;
    }

    const updatedProfile = await BusinessService.updateProfile(userId, { settings: updatedSettings });
    
    res.json(updatedProfile);
  } catch (error) {
    console.error('Update business settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update business profile
router.put('/:userId/profile', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure user can only update their own profile
    if (req.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const updatedProfile = await BusinessService.updateProfile(userId, value);
    
    res.json(updatedProfile);
  } catch (error) {
    console.error('Update business profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
