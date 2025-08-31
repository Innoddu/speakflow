# Use Node.js 20 as base image
FROM node:20-slim

# Install Python, yt-dlp and other dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    python3-venv \
    build-essential \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages separately for better error handling
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

# Install spaCy and download model
RUN pip3 install --no-cache-dir --break-system-packages spacy && \
    python3 -m spacy download en_core_web_sm

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