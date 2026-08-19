# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS dependencies
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim AS development
ENV NODE_ENV=development
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=dependencies /app/frontend /app/frontend
WORKDIR /app/frontend
EXPOSE 3000
CMD ["/app/frontend/node_modules/.bin/next", "dev", "--webpack", "--hostname", "0.0.0.0", "--port", "3000"]

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/frontend/node_modules /app/frontend/node_modules
COPY frontend /app/frontend
WORKDIR /app/frontend
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV BACKEND_INTERNAL_URL=http://backend:8000

COPY --from=builder --chown=node:node /app/frontend/dist/standalone ./

USER node
EXPOSE 3000
CMD ["node", "server.js"]
