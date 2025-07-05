# Use Node.js 20 as base image
FROM node:20-slim

# Install Python, yt-dlp and other dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-full \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages yt-dlp

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm install
RUN cd backend && npm install

# Copy app source
COPY . .

# Expose port
EXPOSE 5030

# Start the application
CMD ["npm", "start"] 