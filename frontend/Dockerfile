# syntax=docker/dockerfile:1.7
# Multi-stage build for the Next.js frontend.
#
# Stage 1: install dependencies and build the standalone output
# Stage 2: minimal runtime image with only the built artifact

# ── Builder ─────────────────────────────────────────────────────────────────
FROM oven/bun:1-slim AS builder

WORKDIR /app

# Install all dependencies (including devDependencies for the build).
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy the rest of the source and build the standalone output.
COPY . .

# `output: "standalone"` is set in next.config.ts so the build emits
# ``.next/standalone`` and ``.next/static``.  We disable telemetry and
# linting during the image build to keep it deterministic.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN bun run build

# ── Runner ─────────────────────────────────────────────────────────────────
FROM oven/bun:1-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

# Create a non-root user to run the application.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# Copy the standalone server bundle, the static assets, and any public
# files.  The ``public`` directory is intentionally optional.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
CMD ["bun", "server.js"]
