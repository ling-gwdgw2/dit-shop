# Multi-stage Dockerfile for Dit Shop
FROM node:20-alpine AS base

WORKDIR /app

# Copy package files from backend
COPY backend/package*.json ./backend/

WORKDIR /app/backend
RUN npm ci --omit=dev

WORKDIR /app

# Copy backend source code and frontend assets
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY database/ ./database/

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
