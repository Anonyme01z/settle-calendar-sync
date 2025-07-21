import express from 'express';
const router = express.Router();
import publicBookingRouter from './publicBooking';
router.use('/public', publicBookingRouter);
export default router; 