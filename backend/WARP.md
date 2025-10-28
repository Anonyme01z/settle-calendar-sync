# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development Commands

### Environment Setup
```bash
# Install dependencies
npm install

# Copy environment template and configure
cp .env.example .env
# Edit .env with your actual configuration values

# Database setup (PostgreSQL required)
createdb settle_booking
psql settle_booking < database/schema.sql
```

### Running the Application
```bash
# Development mode with auto-reload
npm run dev

# Build for production
npm run build

# Run production build
npm start

# TypeScript compiler watch mode
npm run watch
```

### Docker Development
```bash
# Start entire stack (PostgreSQL + API server)
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

### Database Operations
```bash
# Apply database migrations (run in order)
psql settle_booking < database/migration_mvp_phase1.sql
psql settle_booking < database/migration_add_availability_features.sql
psql settle_booking < database/migration_cleanup_price_columns.sql
psql settle_booking < database/migration_rename_total_price.sql

# Connect to database
psql settle_booking

# Reset database (careful in production)
dropdb settle_booking && createdb settle_booking
psql settle_booking < database/schema.sql
```

### Testing & Debugging
```bash
# Test email functionality
npx ts-node test-email.ts
npx ts-node test-sendgrid.js

# Test wallet endpoints
node test-wallet-endpoints.js
```

## High-Level Architecture

### Core Technology Stack
- **Backend**: Node.js with TypeScript and Express.js
- **Database**: PostgreSQL with manual SQL migrations
- **Authentication**: JWT tokens with Google OAuth 2.0 integration
- **Calendar**: Real Google Calendar API integration for availability checking
- **Payments**: Paystack integration with comprehensive wallet system
- **Email**: SendGrid for transactional emails

### Application Structure

#### API Route Organization
The application follows a modular route structure:
- **Authentication Routes** (`/api/auth/*`): User registration, login, Google OAuth flow
- **Business Routes** (`/api/business/*`): Business profile management and settings
- **Service Routes** (`/api/services/*`): Service CRUD operations with flexible booking types
- **Calendar Routes** (`/api/calendar/*`): Availability checking and booking creation
- **Payment Routes** (`/api/payments/*`): Wallet management, payment processing, withdrawals
- **Admin Routes** (`/api/admin/*`): Administrative functions

#### Database Schema Overview
The database uses a relational structure with automatic triggers for `updated_at` timestamps:

**Core Tables:**
- `users`: Authentication and Google token storage with encryption
- `business_profiles`: Business information with JSONB settings for working hours
- `services`: Service offerings with support for both fixed-time and flexible bookings
- `bookings`: Booking records linked to Google Calendar events

**Financial System:**
- `wallets`: Business wallet accounts with balance tracking
- `wallet_transactions`: All financial transactions with audit trail
- `payment_intents`: Paystack payment tracking with expiration management

#### Google Calendar Integration
Real-time integration for authentic availability checking:
- OAuth 2.0 flow with secure token encryption at rest
- Automatic availability slot generation based on business working hours
- Conflict detection with existing calendar events
- Support for buffer times and minimum booking notice periods

#### Payment & Wallet System
Production-ready financial management:
- Paystack integration for customer payments
- Business wallet system for deposit collection
- Withdrawal system with bank account validation
- Complete transaction audit trail with status tracking

### Key Architectural Patterns

#### Service Layer Architecture
Business logic is separated into dedicated service classes:
- `userService.ts`: User management and authentication
- `businessService.ts`: Business profile operations
- `calendarService.ts`: Google Calendar integration and availability logic
- `walletService.ts`: Financial transaction management
- `paystackService.ts`: Payment processing integration

#### Security Implementation
- JWT tokens for API authentication
- Rate limiting (100 requests per 15 minutes per IP)
- CORS protection with configurable origins
- Helmet security headers
- Encrypted Google token storage using AES encryption
- Input validation using Joi schemas

#### Error Handling Strategy
Centralized error handling with:
- Global Express error middleware
- Consistent JSON error response format
- Proper HTTP status codes (400, 401, 403, 404, 409, 500)
- Comprehensive logging for debugging

## Environment Configuration

### Required Environment Variables
Critical configuration that must be set:

**Database & Server:**
- `DATABASE_URL`: PostgreSQL connection string
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment mode
- `JWT_SECRET`: JWT signing secret (must be secure in production)
- `ENCRYPTION_KEY`: 32-character key for Google token encryption

**Google Integration:**
- `GOOGLE_CLIENT_ID`: From Google Cloud Console
- `GOOGLE_CLIENT_SECRET`: From Google Cloud Console  
- `GOOGLE_REDIRECT_URI`: OAuth callback URL
- `FRONTEND_URL`: For CORS and OAuth redirects

**Payment System:**
- `PAYSTACK_SECRET_KEY`: Paystack API secret key
- `PAYSTACK_PUBLIC_KEY`: Paystack publishable key
- `PAYSTACK_BASE_URL`: Paystack API endpoint

**Email System:**
- `SENDGRID_API_KEY`: SendGrid API key for transactional emails
- `MAIL_FROM`: Sender email address
- `MAIL_FROM_NAME`: Sender display name

### Google Calendar API Setup
Required scopes for calendar integration:
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/calendar.readonly`  
- `https://www.googleapis.com/auth/calendar.freebusy`

## Business Logic Specifics

### Booking System Models
The application supports two booking models:
- **Fixed Bookings**: Traditional appointment slots with specific duration
- **Flexible Bookings**: Time windows where customers can book within capacity limits

### Working Hours Management
Business working hours are stored in JSONB format with:
- Support for different hours per day of the week
- Buffer time configuration between bookings
- Minimum booking notice periods
- Booking window limits (how far in advance customers can book)

### Financial Flow
1. Customer creates booking → Payment intent generated
2. Customer pays deposit via Paystack → Funds credited to business wallet
3. Business can withdraw funds → Bank transfer initiated
4. All transactions logged for audit and reconciliation

### Calendar Availability Logic
Sophisticated availability calculation considering:
- Business working hours and non-working days
- Existing Google Calendar events (busy times)
- Buffer times between appointments
- Service duration requirements
- Booking window restrictions

## Development Guidelines

### TypeScript Usage
The codebase uses strict TypeScript configuration with:
- Centralized type definitions in `src/types/index.ts`
- Interface definitions for all major entities
- Proper typing for API requests and responses

### Database Best Practices
- All tables include `created_at` and `updated_at` timestamps
- Proper indexing on foreign keys and frequently queried columns
- Database triggers for automatic timestamp updates
- UUID primary keys for security and scalability

### API Design Patterns
- RESTful endpoint structure
- Consistent error response format
- Proper HTTP status code usage
- JWT middleware for protected routes
- Request validation using Joi schemas

## Deployment Considerations

### Production Requirements
- Secure environment variable management
- HTTPS configuration for secure token handling
- Database connection pooling and monitoring
- Regular database backups
- Application performance monitoring

### Health Monitoring
- Health check endpoint at `/health`
- Version endpoint at `/api/version` for deployment verification
- Comprehensive logging for debugging and monitoring
- Database connection monitoring

### Security Checklist
- Secure JWT secrets and encryption keys
- Proper CORS configuration for production domains
- Rate limiting appropriately configured
- Google token encryption enabled
- Database credentials secured
- Paystack keys properly managed (test vs. production)