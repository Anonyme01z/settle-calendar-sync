// Route: Root API router (public booking + feedback subroutes)
import express from 'express';
const router = express.Router();
import publicBookingRouter from './publicBooking';
import feedbackRouter from './feedback';

router.use('/public', publicBookingRouter);
router.use('/public', feedbackRouter);

export default router; 
