FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Railway sets PORT automatically; default 3000 for local
ENV PORT=3000

EXPOSE $PORT

CMD ["node", "server.js"]
