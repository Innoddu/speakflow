# 🎯 SpeakFlow Backend API

> **AI-powered English learning platform - Backend API Server**

## 🚀 **Overview**

SpeakFlow Backend provides the core API services for the SpeakFlow English learning platform, featuring:

- 🎤 **Whisper AI Transcription** - Convert YouTube audio to text with precise timing
- 🧠 **spaCy NLP Integration** - Smart English sentence segmentation  
- 🔊 **OpenAI TTS** - High-quality text-to-speech generation
- 📚 **YouTube Integration** - Fetch video details and captions
- ☁️ **AWS S3 Storage** - Scalable audio file management
- 📊 **Practice History** - User progress tracking

---

## 🏗️ **Project Structure**

```
speakflow-backend/
├── backend/
│   ├── routes/           # API endpoints
│   │   ├── auth.js       # Authentication
│   │   ├── whisper.js    # AI transcription  
│   │   ├── tts.js        # Text-to-speech
│   │   ├── youtube.js    # YouTube integration
│   │   ├── translate.js  # Translation services
│   │   └── history.js    # User history
│   ├── services/         # Business logic
│   │   ├── s3Service.js  # AWS S3 integration
│   │   └── youtube-captions.js
│   ├── scripts/          # Utility scripts
│   ├── cache/           # Local cache storage
│   ├── uploads/         # Temporary uploads
│   └── server.js        # Main server entry
├── Dockerfile           # Container configuration
├── nixpacks.toml       # Render deployment config
└── package.json        # Dependencies
```

---

## 🌐 **Frontend Applications**

The SpeakFlow frontend applications are maintained in separate repositories:

- **🚀 Frontend Repository**: [speakflow-frontend](https://github.com/Innoddu/speakflow-frontend)
- **📱 Mobile App**: React Native with Expo
- **💻 Web App**: Expo Web deployment

---

## 🛠️ Prerequisites

- Node.js (v20 or higher)
- Python 3.8+ with spaCy and English model
- npm or yarn
- YouTube Data API v3 key
- OpenAI API key (for Whisper AI)
- AWS S3 credentials (for audio caching)

## ⚙️ Backend Setup

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

## 🔑 API Keys Setup

### YouTube Data API v3
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable YouTube Data API v3
4. Create API Key credentials
5. Add the key to your `.env` file

### OpenAI API (Whisper)
1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Create an account and get API key
3. Add to `.env` file

### AWS S3 Setup
1. Create AWS account and S3 bucket
2. Configure bucket permissions for public read access
3. Create IAM user with S3 permissions
4. Add credentials to `.env` file

## 🚀 Deployment (Render)

1. Connect your GitHub repository to Render
2. Create new Web Service
3. Configure build settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Root Directory**: `backend`
4. Add environment variables in Render dashboard
5. Deploy!

## 📱 API Usage

The SpeakFlow Backend provides RESTful APIs for:

1. **YouTube Integration**: Search videos, get details, and extract captions
2. **AI Transcription**: Convert audio to text with precise timing using Whisper AI
3. **Smart Processing**: Enhanced sentence segmentation with spaCy NLP
4. **TTS Generation**: Convert text to speech with multiple voice options
5. **History Tracking**: Store and retrieve user practice sessions
6. **Audio Management**: Efficient caching and delivery via AWS S3

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

### Key Technologies
- **Backend**: Node.js, Express, Python, spaCy, Whisper AI
- **Cloud**: AWS S3, Render
- **APIs**: YouTube Data API v3, OpenAI Whisper, OpenAI TTS
- **AI/ML**: spaCy NLP, OpenAI Whisper transcription

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