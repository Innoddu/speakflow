#!/bin/bash

echo "🚀 Starting SpeakFlow App..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Check if Expo CLI is installed
if ! command -v expo &> /dev/null; then
    echo "📦 Installing Expo CLI..."
    npm install -g @expo/cli
fi

echo "📋 Prerequisites check completed!"

echo ""
echo "🔧 Setup Instructions:"
echo "1. Get a YouTube Data API v3 key from Google Cloud Console"
echo "2. Copy env.example to .env in the backend directory"
echo "3. Add your YouTube API key to the .env file"
echo "4. Update the API_BASE_URL in mobile/src/services/youtubeService.ts"
echo ""

echo "🎯 To start the backend server:"
echo "   cd backend && npm run dev"
echo ""
echo "📱 To start the mobile app:"
echo "   cd mobile && npm start"
echo ""

echo "✅ Setup complete! Follow the instructions above to start the app." 