import express from 'express';
import { ServiceService } from '../services/serviceService';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const createServiceSchema = Joi.object({
  title: Joi.string().required(),
  durationMinutes: Joi.number().min(15).max(480),
  location: Joi.string().required(),
  totalPrice: Joi.number().min(0),
  depositPercentage: Joi.number().min(0).max(100),
  description: Joi.string().required(),
  currency: Joi.string().length(3).default('USD'),
  bookingType: Joi.string().valid('fixed', 'flexible', 'quote').required(),
  pricing: Joi.object({
    rate: Joi.number().min(0).required(),
    per: Joi.string().allow(null)
  }).when('bookingType', { is: Joi.valid('flexible'), then: Joi.required(), otherwise: Joi.optional() }),
  estimatedDuration: Joi.number().min(1).when('bookingType', { is: Joi.valid('flexible', 'quote'), then: Joi.optional() }),
  requiresApproval: Joi.boolean().default(true).when('bookingType', { is: Joi.valid('flexible', 'quote'), then: Joi.optional(), otherwise: Joi.default(false) }),
  customerNotesEnabled: Joi.boolean().optional()
}).custom((value, helpers) => {
  if (value.bookingType === 'fixed') {
    if (value.durationMinutes == null) return helpers.error('any.required', { key: 'durationMinutes' });
    if (value.totalPrice == null) return helpers.error('any.required', { key: 'totalPrice' });
    if (value.depositPercentage == null) return helpers.error('any.required', { key: 'depositPercentage' });
  }
  if (value.bookingType === 'flexible') {
    if (!value.pricing) return helpers.error('any.required', { key: 'pricing' });
  }
  return value;
});

const updateServiceSchema = Joi.object({
  title: Joi.string(),
  durationMinutes: Joi.number().min(15).max(480),
  location: Joi.string(),
  totalPrice: Joi.number().min(0),
  depositPercentage: Joi.number().min(0).max(100),
  description: Joi.string(),
  currency: Joi.string().length(3)
});

/**
 * @openapi
 * /api/{userId}/services:
 *   get:
 *     summary: Get all services for a user
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of services
 */
router.get('/:userId/services', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure user can only access their own services
    if (req.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const services = await ServiceService.findByUserId(userId);
    res.json(services);
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/{userId}/services:
 *   post:
 *     summary: Create a new service
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
 *               title:
 *                 type: string
 *               durationMinutes:
 *                 type: number
 *               location:
 *                 type: string
 *               totalPrice:
 *                 type: number
 *               depositPercentage:
 *                 type: number
 *               description:
 *                 type: string
 *               currency:
 *                 type: string
 *     responses:
 *       201:
 *         description: Service created
 */
router.post('/:userId/services', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure user can only create services for themselves
    if (req.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error, value } = createServiceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const service = await ServiceService.createService(
      userId,
      value.title,
      value.durationMinutes,
      value.location,
      value.totalPrice,
      value.depositPercentage,
      value.description,
      value.currency,
      value.bookingType,
      value.pricing,
      value.estimatedDuration,
      value.requiresApproval,
      value.customerNotesEnabled
    );

    res.status(201).json(service);
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a service
router.put('/:userId/services/:serviceId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId, serviceId } = req.params;
    
    // Ensure user can only update their own services
    if (req.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error, value } = updateServiceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const service = await ServiceService.updateService(serviceId, userId, value);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(service);
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a service
router.delete('/:userId/services/:serviceId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId, serviceId } = req.params;
    
    // Ensure user can only delete their own services
    if (req.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const success = await ServiceService.deleteService(serviceId, userId);
    if (!success) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
