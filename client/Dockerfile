FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat curl
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time arguments for Next.js environment variables
# These are passed from docker-compose build args
ARG NEXT_PUBLIC_APPWRITE_ENDPOINT
ARG NEXT_PUBLIC_APPWRITE_PROJECT_ID
ARG APPWRITE_API_KEY
ARG NEXT_PUBLIC_LOG_LEVEL
ARG NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY
ARG DOUBLE_POLLING_FREQUENCY
ARG NEXT_PUBLIC_POLLING_ENABLED
ARG NEXT_PUBLIC_POLLING_DEBUG_MODE
ARG NEXT_PUBLIC_POLLING_TIMEOUT
ARG NEXT_PUBLIC_ENABLE_POLLING_MONITOR
ARG NEXT_PUBLIC_ENABLE_HEALTH_MONITORING
ARG NEXT_PUBLIC_HEALTH_CHECK_INTERVAL_MS

# Convert build args to environment variables for Next.js build
ENV NEXT_PUBLIC_APPWRITE_ENDPOINT=${NEXT_PUBLIC_APPWRITE_ENDPOINT}
ENV NEXT_PUBLIC_APPWRITE_PROJECT_ID=${NEXT_PUBLIC_APPWRITE_PROJECT_ID}
ENV APPWRITE_API_KEY=${APPWRITE_API_KEY}
ENV NEXT_PUBLIC_LOG_LEVEL=${NEXT_PUBLIC_LOG_LEVEL}
ENV NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY=${NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY}
ENV DOUBLE_POLLING_FREQUENCY=${DOUBLE_POLLING_FREQUENCY}
ENV NEXT_PUBLIC_POLLING_ENABLED=${NEXT_PUBLIC_POLLING_ENABLED}
ENV NEXT_PUBLIC_POLLING_DEBUG_MODE=${NEXT_PUBLIC_POLLING_DEBUG_MODE}
ENV NEXT_PUBLIC_POLLING_TIMEOUT=${NEXT_PUBLIC_POLLING_TIMEOUT}
ENV NEXT_PUBLIC_ENABLE_POLLING_MONITOR=${NEXT_PUBLIC_ENABLE_POLLING_MONITOR}
ENV NEXT_PUBLIC_ENABLE_HEALTH_MONITORING=${NEXT_PUBLIC_ENABLE_HEALTH_MONITORING}
ENV NEXT_PUBLIC_HEALTH_CHECK_INTERVAL_MS=${NEXT_PUBLIC_HEALTH_CHECK_INTERVAL_MS}

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install tsx globally for runtime script execution
RUN npm install -g tsx

RUN apk add --no-cache curl
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Copy package.json for runtime initialization
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Install only the dependencies needed for setup scripts (dotenv and node-appwrite)
RUN npm install dotenv node-appwrite

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

# Set hostname to localhost
ENV HOSTNAME="0.0.0.0"

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]