# Stage 1: Builder
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Stage 2: Runner
FROM node:18-alpine AS runner

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
# Copy database folder (schema + migrations needed at runtime by migrate.js)
COPY --from=builder /app/database ./database

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S settle -u 1001

# Set ownership
RUN chown -R settle:nodejs /app

USER settle

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]
