// Route: Public feedback endpoint (rate limited)
import express from 'express';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import { EmailService } from '../services/emailService';

const router = express.Router();

// Per-route rate limiter: 10 requests per hour per IP
const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const feedbackSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  email: Joi.string().email().required(),
  message: Joi.string().min(1).max(2000).required(),
});

router.post('/feedback', feedbackLimiter, async (req, res) => {
  try {
    const { error, value } = feedbackSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, email, message } = value;

    await EmailService.sendFeedbackNotification({ name, email, message });

    res.json({ success: true });
  } catch (err) {
    console.error('Error handling feedback:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

export default router;

