FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy all source files
COPY . .

# Build the frontend
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies and tsx for running the server
RUN npm ci --omit=dev && npm install tsx

# Copy compiled frontend from build stage
COPY --from=builder /app/dist ./dist

# Copy backend source files
COPY . .

# Expose port 5000
EXPOSE 5000

# Start server using the start script in package.json
CMD ["npm", "start"]
