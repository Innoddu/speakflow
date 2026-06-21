# SpeakFlow Backend

English speaking practice app backend with YouTube integration and AI-powered transcription.

## Features

- 🎥 YouTube video search and audio extraction
- 🗣️ AI-powered transcription (OpenAI Whisper)
- 🌐 Translation service (OpenAI GPT)
- 📱 Text-to-Speech integration
- 📊 Practice history tracking
- ☁️ AWS S3 audio caching

## Quick Start

### Local Development

```bash
npm install
npm run dev
```

### Railway Deployment

1. **Fork this repository** to your GitHub account

2. **Sign up at Railway**: https://railway.app

3. **Connect GitHub** and select this repository

4. **Set Environment Variables** in Railway dashboard:
   ```
   OPENAI_API_KEY=your_openai_api_key
   YOUTUBE_API_KEY=your_youtube_api_key
   NODE_ENV=production
   ```

5. **Deploy** - Railway will automatically build and deploy!

## Required Environment Variables

- `OPENAI_API_KEY`: Get from https://platform.openai.com/
- `YOUTUBE_API_KEY`: Get from Google Cloud Console
- `PORT`: Automatically set by Railway
- `NODE_ENV`: Set to 'production' for deployment

## Optional Environment Variables

- `AWS_ACCESS_KEY_ID`: For S3 audio caching
- `AWS_SECRET_ACCESS_KEY`: For S3 audio caching  
- `AWS_REGION`: AWS region (default: ap-northeast-2)
- `AWS_BUCKET_NAME`: S3 bucket name

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/youtube/search` - Search YouTube videos
- `GET /api/youtube/audio/:videoId` - Get video audio
- `POST /api/whisper/transcribe` - Transcribe audio
- `POST /api/translate` - Translate text
- `GET /api/history` - Get practice history

## Tech Stack

- Node.js + Express
- OpenAI (Whisper + GPT)
- YouTube Data API
- AWS S3
- Railway (Deployment) 