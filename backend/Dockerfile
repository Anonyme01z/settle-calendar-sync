# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app


# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Diagnostic: List build output
RUN ls -la /app/dist && ls -la /app

# Remove devDependencies after build
RUN npm prune --production

# Expose port
EXPOSE 3001

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S settle -u 1001

# Change ownership of the app directory
RUN chown -R settle:nodejs /app
USER settle

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]
