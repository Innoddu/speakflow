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

# Install spaCy with pre-compiled wheels and download model separately
RUN pip3 install --no-cache-dir --break-system-packages spacy[lookups,transformers]

# Download spaCy model with retry logic
RUN python3 -m spacy download en_core_web_sm || \
    (echo "Retrying spaCy model download..." && python3 -m spacy download en_core_web_sm) || \
    (echo "Using alternative spaCy model..." && pip3 install --no-cache-dir --break-system-packages https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1-py3-none-any.whl)

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