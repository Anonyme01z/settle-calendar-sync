import express from 'express';
import { ServiceService } from '../services/serviceService';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const createServiceSchema = Joi.object({
  title: Joi.string().required(),
  bookingType: Joi.string().valid('appointment', 'service-window', 'on-demand').required(),
  description: Joi.string().required(),
  location: Joi.string().required(),
  locationType: Joi.string().valid('online', 'onsite').optional(),
  meetingLink: Joi.string().uri().allow('').optional(),
  address: Joi.string().allow('').optional(),
  currency: Joi.string().length(3).default('USD'),
  customerNotesEnabled: Joi.boolean().default(false),
  
  // Appointment-specific fields
  durationMinutes: Joi.number().min(15).max(480).when('bookingType', { 
    is: 'appointment', 
    then: Joi.required(), 
    otherwise: Joi.optional() 
  }),
  totalPrice: Joi.number().min(0).when('bookingType', { 
    is: 'appointment', 
    then: Joi.required(), 
    otherwise: Joi.optional() 
  }),
  depositPercentage: Joi.number().min(0).max(100).when('bookingType', { 
    is: 'appointment', 
    then: Joi.required(), 
    otherwise: Joi.optional() 
  }),
  
  // Service Window-specific fields
  windowDuration: Joi.number().min(15).max(480).when('bookingType', { 
    is: 'service-window', 
    then: Joi.required(), 
    otherwise: Joi.optional() 
  }),
  estimatedDuration: Joi.number().min(1).when('bookingType', { 
    is: 'service-window', 
    then: Joi.optional(), 
    otherwise: Joi.optional() 
  }),
  startingPrice: Joi.number().min(0).when('bookingType', { 
    is: 'service-window', 
    then: Joi.required(), 
    otherwise: Joi.optional() 
  }),
  
  // On-Demand specific fields
  requiresApproval: Joi.boolean().when('bookingType', { 
    is: 'on-demand', 
    then: Joi.required(), 
    otherwise: Joi.optional() 
  }),
  
  // Legacy fields (for backward compatibility)
  pricing: Joi.object({
    rate: Joi.number().min(0).required(),
    per: Joi.string().allow(null)
  }).optional()
});

const updateServiceSchema = Joi.object({
  title: Joi.string(),
  bookingType: Joi.string().valid('appointment', 'service-window', 'on-demand'),
  description: Joi.string(),
  location: Joi.string(),
  locationType: Joi.string().valid('online', 'onsite'),
  meetingLink: Joi.string().uri().allow(''),
  address: Joi.string().allow(''),
  currency: Joi.string().length(3),
  customerNotesEnabled: Joi.boolean(),
  
  // Appointment-specific fields
  durationMinutes: Joi.number().min(15).max(480),
  totalPrice: Joi.number().min(0),
  depositPercentage: Joi.number().min(0).max(100),
  
  // Service Window-specific fields
  windowDuration: Joi.number().min(15).max(480),
  estimatedDuration: Joi.number().min(1),
  startingPrice: Joi.number().min(0),
  
  // On-Demand specific fields
  requiresApproval: Joi.boolean(),
  
  // Legacy fields
  pricing: Joi.object({
    rate: Joi.number().min(0).required(),
    per: Joi.string().allow(null)
  }).optional()
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

    const service = await ServiceService.createService(userId, value);
    res.status(201).json(service);
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
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

/**
 * @openapi
 * /api/services/booking-types:
 *   get:
 *     summary: Get available booking types
 *     responses:
 *       200:
 *         description: List of available booking types
 */
router.get('/services/booking-types', async (req, res) => {
  try {
    const bookingTypes = [
      {
        value: 'appointment',
        label: 'Appointment',
        description: 'Fixed time slots with specific duration and price',
        requiredFields: ['durationMinutes', 'totalPrice', 'depositPercentage']
      },
      {
        value: 'service-window',
        label: 'Service Window',
        description: 'Flexible time windows with starting price',
        requiredFields: ['windowDuration', 'startingPrice']
      },
      {
        value: 'on-demand',
        label: 'On-Demand',
        description: 'Custom requests requiring approval',
        requiredFields: ['requiresApproval']
      }
    ];

    res.json(bookingTypes);
  } catch (error) {
    console.error('Get booking types error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
