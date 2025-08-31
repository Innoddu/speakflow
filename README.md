# SpeakFlow - English Speaking Practice App

SpeakFlow is a comprehensive mobile and web application designed to help users improve their English speaking skills by searching YouTube videos, generating accurate transcripts using AI, and practicing speaking with advanced features.

## ✨ Features

- 🎯 **YouTube Video Search**: Search for English videos on any topic
- 🤖 **AI-Powered Transcription**: Advanced transcript generation using Whisper AI and spaCy
- 📝 **Smart Sentence Segmentation**: Accurate sentence splitting with spaCy NLP
- 🗣️ **Script Practice**: Practice speaking with sentence-by-sentence breakdown
- 🔊 **Dual Audio Modes**: Original audio and Text-to-Speech options
- 🎵 **Precise Audio Control**: Click any sentence to play exact audio segment
- 📊 **Progress Tracking**: Visual progress through scripts with auto-scroll
- ☁️ **Cloud Storage**: AWS S3 integration for audio caching
- 🚀 **Auto Play Mode**: Continuous sentence playback for immersive practice
- 📱 **Cross-Platform**: Works on iOS, Android, and Web

## 🏗️ Project Structure

```
speakflow/
├── backend/                    # Node.js Express server
│   ├── routes/
│   │   ├── auth.js            # Authentication routes
│   │   ├── whisper.js         # Whisper AI transcription
│   │   ├── youtube.js         # YouTube API & captions
│   │   ├── tts.js             # Text-to-Speech services
│   │   ├── translate.js       # Translation services
│   │   └── history.js         # Practice history
│   ├── services/
│   │   ├── s3Service.js       # AWS S3 integration
│   │   └── youtube-captions.js # Caption extraction
│   ├── scripts/               # Utility scripts
│   ├── server.js              # Main server file
│   ├── package.json           # Backend dependencies
│   └── .env.example           # Environment variables template
├── mobile/                     # React Native Expo app
│   ├── src/
│   │   ├── screens/           # App screens
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── SearchScreen.tsx
│   │   │   ├── VideoDetailScreen.tsx
│   │   │   ├── ScriptPracticeScreen.tsx
│   │   │   └── HistoryScreen.tsx
│   │   ├── components/        # Reusable components
│   │   │   ├── AudioPlayer.tsx
│   │   │   ├── VideoPlayer.tsx
│   │   │   ├── VoiceSelector.tsx
│   │   │   └── WebAlert.tsx
│   │   ├── services/          # API services
│   │   │   ├── youtubeService.ts
│   │   │   ├── whisperService.ts
│   │   │   ├── ttsService.ts
│   │   │   └── historyService.ts
│   │   └── config/
│   │       └── api.ts         # API configuration
│   ├── App.tsx                # Main app component
│   ├── app.json               # Expo configuration
│   ├── eas.json               # Expo Application Services
│   └── package.json           # Mobile dependencies
├── Dockerfile                 # Docker configuration
├── railway.toml               # Railway deployment config
├── netlify.toml               # Netlify deployment config
├── nixpacks.toml              # Nixpacks build config
└── README.md                  # This file
```

## 🛠️ Prerequisites

- Node.js (v20 or higher)
- Python 3.8+ with spaCy and English model
- npm or yarn
- Expo CLI (for mobile development)
- YouTube Data API v3 key
- OpenAI API key (for Whisper AI)
- AWS S3 credentials (for audio caching)

## ⚙️ Setup Instructions

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install Node.js dependencies:
   ```bash
   npm install
   ```

3. Install Python dependencies:
   ```bash
   pip3 install spacy
   python3 -m spacy download en_core_web_sm
   pip3 install yt-dlp
   ```

4. Create environment file:
   ```bash
   cp .env.example .env
   ```

5. Edit `.env` file with your API keys:
   ```env
   # Server Configuration
   PORT=5030
   NODE_ENV=development
   HOST=0.0.0.0

   # API Keys
   YOUTUBE_API_KEY=your_youtube_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here

   # AWS S3 Configuration
   AWS_ACCESS_KEY_ID=your_aws_access_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key
   AWS_REGION=us-east-1
   AWS_S3_BUCKET=your-s3-bucket-name
   ```

6. Start the backend server:
   ```bash
   npm start
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

3. Install Expo modules:
   ```bash
   npx expo install expo-speech expo-av expo-linear-gradient expo-file-system
   ```

4. Update API configuration in `src/config/api.ts`:
   ```typescript
   export const API_CONFIG = {
     BASE_URL: 'http://your-backend-url:5030/api',
     TIMEOUT: 30000,
   };
   ```

5. Start the mobile app:
   ```bash
   npx expo start
   ```

### 3. API Keys Setup

#### YouTube Data API v3
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable YouTube Data API v3
4. Create API Key credentials
5. Add the key to your `.env` file

#### OpenAI API (Whisper)
1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Create an account and get API key
3. Add to `.env` file

#### AWS S3 Setup
1. Create AWS account and S3 bucket
2. Configure bucket permissions for public read access
3. Create IAM user with S3 permissions
4. Add credentials to `.env` file

## 🚀 Deployment

### Backend Deployment (Render)

1. Connect your GitHub repository to Render
2. Create new Web Service
3. Configure build settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Root Directory**: `backend`
4. Add environment variables in Render dashboard
5. Deploy!

### Mobile App Deployment (Expo EAS)

1. Install EAS CLI:
   ```bash
   npm install -g @expo/eas-cli
   ```

2. Login to Expo:
   ```bash
   eas login
   ```

3. Build for production:
   ```bash
   eas build --platform all
   ```

4. Submit to app stores:
   ```bash
   eas submit --platform all
   ```

## 📱 Usage

1. **Search Videos**: Find English YouTube videos by topic
2. **Select Video**: Choose from search results
3. **Choose Mode**: Select Auto, Play, TTS, or Original mode
4. **Practice**: Click sentences to hear precise audio segments
5. **Track Progress**: Visual progress bar and sentence highlighting
6. **Review History**: Access previously practiced videos

## 🔌 API Endpoints

### YouTube Routes
- `GET /api/youtube/search?query={term}` - Search videos
- `GET /api/youtube/video/{videoId}` - Get video details
- `GET /api/youtube/transcript/{videoId}` - Get video transcript
- `GET /api/youtube/transcript-practice/{videoId}` - Practice transcript
- `GET /api/youtube/audio/{videoId}` - Get audio URL

### Whisper AI Routes
- `POST /api/whisper/transcribe` - Transcribe audio with Whisper
- `GET /api/whisper/youtube-subtitles/{videoId}` - Enhanced subtitles
- `GET /api/whisper/cache/{videoId}` - Get cached transcription

### TTS Routes
- `POST /api/tts/speak` - Generate speech from text
- `GET /api/tts/voices` - List available voices

### History Routes
- `GET /api/history` - Get practice history
- `POST /api/history` - Add to history
- `DELETE /api/history/{videoId}` - Remove from history

## 🧠 AI Features

### spaCy Integration
- Advanced sentence boundary detection
- Better handling of complex punctuation
- Improved accuracy for various English dialects

### Whisper AI Transcription
- State-of-the-art speech recognition
- Automatic fallback when YouTube captions unavailable
- Precise word-level timing information

### Smart Caching
- AWS S3 integration for audio files
- Local and cloud caching for transcriptions
- Optimized for fast repeated access

## 🛠️ Development

### Backend Architecture
- Express.js with modular route structure
- CommonJS module system for stability
- Comprehensive error handling and logging
- Docker support for containerized deployment

### Frontend Architecture
- React Native with Expo for cross-platform support
- TypeScript for type safety
- Modern UI with gesture support
- Responsive design for various screen sizes

### Key Technologies
- **Backend**: Node.js, Express, Python, spaCy, Whisper AI
- **Frontend**: React Native, Expo, TypeScript
- **Cloud**: AWS S3, Render, Expo EAS
- **APIs**: YouTube Data API v3, OpenAI Whisper

## 🐛 Troubleshooting

### Common Issues

1. **spaCy Model Missing**:
   ```bash
   python3 -m spacy download en_core_web_sm
   ```

2. **AWS S3 Permissions**:
   - Ensure bucket has public read access
   - Verify IAM user has S3 permissions
   - Check CORS configuration

3. **YouTube API Quota**:
   - Monitor usage in Google Cloud Console
   - Implement caching to reduce API calls

4. **Audio Playback Issues**:
   - Check audio file accessibility
   - Verify S3 signed URLs are working
   - Test with different video sources

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 💬 Support

For support and questions:
- Open an issue in the repository
- Check existing documentation
- Review troubleshooting section

---

**Made with ❤️ for English learners worldwide** 