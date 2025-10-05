# Frontend Dockerfile
# Multi-stage build for Next.js application

# Stage 1: Dependencies
FROM node:18-alpine AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (including dev dependencies for build)
# Add required system libraries for Next.js/sharp on Alpine
RUN apk add --no-cache libc6-compat \
  && npm ci

# Stage 2: Builder
FROM node:18-alpine AS builder
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED 1

# Set production environment for build
ENV NODE_ENV production

# Build the Next.js application
# This will use the output: 'standalone' setting from next.config.js
RUN npm run build

# Stage 3: Runner
FROM node:18-alpine AS runner
WORKDIR /app

# Set environment to production
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Ensure required system libraries exist at runtime
RUN apk add --no-cache libc6-compat

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3001

# Set hostname and port
ENV PORT 3001
ENV HOSTNAME "0.0.0.0"

# Start the application
CMD ["node", "server.js"]