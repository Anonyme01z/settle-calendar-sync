import express from 'express';
import { ServiceService } from '../services/serviceService';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import Joi from 'joi';

const router = express.Router();

/**
 * @openapi
 * /api/services/booking-types:
 *   get:
 *     summary: Get available booking types
 *     responses:
 *       200:
 *         description: List of available booking types
 */
router.get('/booking-types', async (req, res) => {
  try {
    const bookingTypes = [
      {
        value: 'fixed',
        label: 'Fixed',
        description: 'Only one customer can book a slot at a time (e.g., therapist, consultant)',
        requiredFields: []
      },
      {
        value: 'flexible',
        label: 'Flexible',
        description: 'Multiple customers can book the same slot, up to the specified capacity (e.g., group class, salon with staff)',
        requiredFields: ['capacity']
      }
    ];

    res.json(bookingTypes);
  } catch (error) {
    console.error('Get booking types error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Validation schemas
const createServiceSchema = Joi.object({
  bookingType: Joi.string().valid('fixed', 'flexible').required(),
  title: Joi.string().required(),
  description: Joi.string().required(),
  durationMinutes: Joi.number().integer().min(1).required(),
  location: Joi.string().required(),
  locationType: Joi.string().valid('online', 'offline').required(),
  meetingLink: Joi.string().uri().when('locationType', {
    is: 'online',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  address: Joi.string().when('locationType', {
    is: 'offline',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  price: Joi.number().min(0).required(),
  currency: Joi.string().length(3).default('USD'),
  customerNotesEnabled: Joi.boolean().default(false),
  isActive: Joi.boolean(),
  capacity: Joi.number().integer().min(1).when('bookingType', {
    is: 'flexible',
    then: Joi.required(), 
    otherwise: Joi.forbidden()
  }),
  depositPercentage: Joi.number().integer().min(0).max(100).default(0)
});

const updateServiceSchema = Joi.object({
  bookingType: Joi.string().valid('fixed', 'flexible'),
  title: Joi.string(),
  description: Joi.string(),
  durationMinutes: Joi.number().integer().min(1),
  location: Joi.string(),
  locationType: Joi.string().valid('online', 'offline'),
  meetingLink: Joi.string().uri().when('locationType', {
    is: 'online',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  address: Joi.string().when('locationType', {
    is: 'offline',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  price: Joi.number().min(0),
  currency: Joi.string().length(3),
  customerNotesEnabled: Joi.boolean(),
  isActive: Joi.boolean(),
  capacity: Joi.number().integer().min(1).when('bookingType', {
    is: 'flexible',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  depositPercentage: Joi.number().integer().min(0).max(100)
});

/**
 * @openapi
 * /api/services/{userId}:
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
router.get('/:userId', authenticateToken, async (req: AuthRequest, res) => {
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
 * /api/services/{userId}:
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
router.post('/:userId', authenticateToken, async (req: AuthRequest, res) => {
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

    const service = await ServiceService.createService(userId, value);
    res.status(201).json(service);
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Update a service
router.put('/:userId/:serviceId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId, serviceId } = req.params;
    
    // Ensure user can only update their own services
    if (req.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log('Update service request body:', req.body);
    const { error, value } = updateServiceSchema.validate(req.body);
    if (error) {
      console.log('Validation error:', error.details);
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
router.delete('/:userId/:serviceId', authenticateToken, async (req: AuthRequest, res) => {
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
