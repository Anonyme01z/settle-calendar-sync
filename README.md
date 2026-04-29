
# Settle Booking API Backend

A robust Node.js/Express.js backend with TypeScript for the Settle booking application, featuring real Google Calendar integration.

## 🚀 Features

- **User Authentication**: JWT-based authentication system
- **Google Calendar Integration**: Full OAuth 2.0 flow with real-time availability checking
- **Booking Management**: Create bookings with conflict detection
- **Business Profiles**: Complete CRUD operations for business settings and services
- **Security**: Rate limiting, CORS, Helmet security headers
- **Database**: PostgreSQL with proper indexing and relationships
- **API Documentation**: RESTful API design with comprehensive validation

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 12+
- Google Cloud Console project with Calendar API enabled
- npm or yarn

## 🛠️ Installation

### Option 1: Manual Setup

1. **Clone and install dependencies**:
```bash
cd backend
npm install
```

2. **Set up environment variables**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Set up PostgreSQL database**:
```bash
# Create database
createdb settle_booking

# Run schema
psql settle_booking < database/schema.sql
```

4. **Run the server**:
```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

### Option 2: Docker Setup

1. **Using Docker Compose** (includes PostgreSQL):
```bash
cd backend
docker-compose up -d
```

This will start both the API server and PostgreSQL database.

## 🔧 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` or `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/settle_booking` |
| `JWT_SECRET` | JWT signing secret | `your-super-secret-key` |
| `JWT_EXPIRE_TIME` | JWT expiration | `7d` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | From Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL | `http://localhost:3001/api/auth/google/callback` |
| `FRONTEND_URL` | Frontend application URL | `http://localhost:8080` |
| `ENCRYPTION_KEY` | 32-character key for token encryption | Generate a secure random string |

## 🔑 Google Calendar Setup

1. **Create Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create new project or select existing one

2. **Enable Calendar API**:
   - Navigate to APIs & Services > Library
   - Search for "Google Calendar API"
   - Click "Enable"

3. **Create OAuth 2.0 Credentials**:
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3001/api/auth/google/callback`

4. **Configure Scopes**:
   The application requests these scopes:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.freebusy`

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new business
- `POST /api/auth/login` - Login existing user
- `GET /api/auth/google/connect` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Handle OAuth callback

### Business Management
- `GET /api/business/:userId/profile` - Get business profile
- `PUT /api/business/:userId/settings` - Update business settings
- `PUT /api/business/:userId/profile` - Update profile info

### Services
- `GET /api/:userId/services` - Get all services
- `POST /api/:userId/services` - Create new service
- `PUT /api/:userId/services/:serviceId` - Update service
- `DELETE /api/:userId/services/:serviceId` - Delete service

### Calendar & Booking
- `GET /api/calendar/:userId/availability?date=YYYY-MM-DD&serviceId=uuid` - Get available slots
- `POST /api/calendar/:userId/book` - Create booking

## 🏗️ Database Schema

### Users Table
- User authentication and Google token storage

### Business Profiles Table
- Business information, settings, and social links

### Services Table
- Service offerings with pricing and duration

### Bookings Table
- Booking records linked to Google Calendar events

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Prevents API abuse
- **CORS Protection**: Configurable cross-origin requests
- **Helmet Security**: Security headers
- **Token Encryption**: Google tokens encrypted at rest
- **Input Validation**: Joi schema validation
- **SQL Injection Protection**: Parameterized queries

## 🚦 Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (access denied)
- `404` - Not Found
- `409` - Conflict (booking race condition)
- `500` - Internal Server Error

## 📊 Monitoring

- Health check endpoint: `GET /health`
- Comprehensive logging for debugging
- Database connection monitoring

## 🔄 Integration with Frontend

The frontend will need to update these areas:

1. **Authentication**: Store JWT token, handle login/logout
2. **API Calls**: Replace localStorage with API endpoints
3. **Google Calendar**: Use `/api/auth/google/connect` for OAuth
4. **Availability**: Call `/api/calendar/:userId/availability`
5. **Booking**: Use `/api/calendar/:userId/book` for real bookings

## 🚀 Deployment

### Production Considerations

1. **Environment Variables**: Use secure, production-ready values
2. **Database**: Use managed PostgreSQL service
3. **SSL**: Configure HTTPS with proper certificates
4. **Monitoring**: Set up application monitoring
5. **Backups**: Configure regular database backups

### Deployment Options

- **Heroku**: Easy deployment with Heroku Postgres addon
- **DigitalOcean**: App Platform with managed database
- **AWS**: EC2/ECS with RDS PostgreSQL
- **Google Cloud**: Cloud Run with Cloud SQL

## 🤝 Development

```bash
# Install dependencies
npm install

# Run in development mode with auto-reload
npm run dev

# Run TypeScript compiler in watch mode
npm run watch

# Build for production
npm run build

# Run production build
npm start
```

## 📝 License

MIT License - feel free to use this codebase for your projects.

---

This backend transforms your Settle booking application from a frontend simulation to a production-ready system with real Google Calendar integration! 🎉
