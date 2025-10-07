# Stage 1: Builder - Install dependencies and build TypeScript
FROM node:22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache libc6-compat curl

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript to dist/
RUN npm run build

# Stage 2: Production Runtime - Minimal image with only production dependencies
FROM node:22-alpine AS runner

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package.json package-lock.json* ./

# Install only production dependencies (skip prepare scripts like husky)
RUN npm ci --omit=dev --ignore-scripts

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy database migrations (needed for container initialization)
COPY --from=builder /app/database ./database

# Change ownership to node user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose port 7000 (internal and external)
EXPOSE 7000

# Set port environment variable to 7000
ENV PORT=7000

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:7000/health || exit 1

# Start the application
CMD ["node", "dist/src/index.js"]
