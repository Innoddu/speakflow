# SpeakFlow - English Speaking Practice App

SpeakFlow is a mobile application designed to help users improve their English speaking skills by searching YouTube videos, generating transcripts, and practicing speaking along with the scripts.

## Features

- 🎯 **YouTube Video Search**: Search for English videos on any topic
- 📝 **Automatic Transcript Generation**: Get accurate transcripts from YouTube videos
- 🗣️ **Script Practice**: Practice speaking with sentence-by-sentence breakdown
- 🔊 **Text-to-Speech**: Listen to sentences for pronunciation guidance
- 📊 **Progress Tracking**: Track your practice progress through the script

## Project Structure

```
speakflow/
├── backend/                 # Node.js backend server
│   ├── routes/
│   │   ├── auth.js         # Authentication routes
│   │   └── youtube.js      # YouTube API routes
│   ├── server.js           # Main server file
│   ├── package.json        # Backend dependencies
│   └── env.example         # Environment variables template
├── mobile/                  # React Native mobile app
│   ├── src/
│   │   ├── screens/        # App screens
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── SearchScreen.tsx
│   │   │   ├── VideoDetailScreen.tsx
│   │   │   └── ScriptPracticeScreen.tsx
│   │   └── services/       # API services
│   │       └── youtubeService.ts
│   ├── App.tsx             # Main app component
│   └── package.json        # Mobile app dependencies
└── README.md               # This file
```

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI
- YouTube Data API v3 key
- Python 3.7+ (for transcript processing)

## Setup Instructions

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp env.example .env
   ```

4. Edit `.env` file and add your YouTube API key:
   ```
   YOUTUBE_API_KEY=your_youtube_api_key_here
   PORT=5000
   ```

5. Start the backend server:
   ```bash
   npm run dev
   ```

### 2. Mobile App Setup

1. Navigate to the mobile directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install additional Expo modules:
   ```bash
   npx expo install expo-speech expo-av expo-linear-gradient
   ```

4. Update the API base URL in `src/services/youtubeService.ts`:
   ```typescript
   const API_BASE_URL = 'http://your-backend-ip:5000/api';
   ```

5. Start the mobile app:
   ```bash
   npm start
   ```

### 3. YouTube API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the YouTube Data API v3
4. Create credentials (API Key)
5. Copy the API key to your backend `.env` file

## Usage

1. **Search Videos**: Use the search function to find English YouTube videos
2. **Select Video**: Choose a video from the search results
3. **View Details**: See video information and statistics
4. **Practice Script**: Generate and practice with the video transcript
5. **Speak Along**: Use the text-to-speech feature to practice pronunciation

## API Endpoints

### YouTube Routes

- `GET /api/youtube/search?query={search_term}` - Search YouTube videos
- `GET /api/youtube/video/{videoId}` - Get video details
- `GET /api/youtube/transcript/{videoId}` - Get video transcript
- `GET /api/youtube/transcript-practice/{videoId}` - Get practice transcript

### Health Check

- `GET /api/health` - Check server status

## Development

### Backend Development

- The backend uses Express.js with YouTube Data API v3
- Transcript processing is handled by youtube-transcript-api
- CORS is enabled for mobile app communication

### Mobile Development

- Built with React Native and Expo
- Uses React Navigation for screen navigation
- Implements text-to-speech for pronunciation practice
- Modern UI with gradient backgrounds and card layouts

## Troubleshooting

### Common Issues

1. **YouTube API Quota Exceeded**: 
   - Check your API usage in Google Cloud Console
   - Consider implementing caching for search results

2. **Transcript Not Available**:
   - Some videos may not have captions/transcripts
   - Try videos with English captions

3. **Mobile App Connection Issues**:
   - Ensure backend server is running
   - Check API base URL in youtubeService.ts
   - Verify network connectivity

4. **Expo Speech Issues**:
   - Ensure expo-speech is properly installed
   - Check device permissions for audio

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please open an issue in the repository. 