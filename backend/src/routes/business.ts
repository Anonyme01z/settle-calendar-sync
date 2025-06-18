
import express from 'express';
import { BusinessService } from '../services/businessService';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import Joi from 'joi';

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

// Get business profile
router.get('/:userId/profile', authenticateToken, async (req: AuthRequest, res) => {
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

// Update business settings
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
