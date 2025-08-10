import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './swagger.js';

// Import routes
import authRoutes from './routes/auth';
import businessRoutes from './routes/business';
import serviceRoutes from './routes/services';
import calendarRoutes from './routes/calendar';
import adminRoutes from './routes/admin'; // Import new admin routes
import apiRoutes from './routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Version endpoint for deployment verification
app.get('/api/version', (req, res) => {
  res.json({ version: 'NEW_BOOKING_MODEL' });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/admin', adminRoutes); // Use new admin routes
app.use('/api', apiRoutes);

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);
  if (err instanceof Error) {
    res.status(500).json({ error: err.message });
  } else {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Settle API server running on port ${PORT}`);
  console.log(`📅 Google Calendar integration enabled`);
  console.log(`🔒 CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:8080'}`);
});

export default app;
