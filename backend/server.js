// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const whisperRoutes = require('./routes/whisper');
const youtubeRoutes = require('./routes/youtube');
const translateRoutes = require('./routes/translate');
const ttsRoutes = require('./routes/tts');
const historyRoutes = require('./routes/history');
const authRoutes = require('./routes/auth');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/whisper', whisperRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'SpeakFlow API is running',
    timestamp: new Date().toISOString()
  });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Start server
const HOST = process.env.HOST || '0.0.0.0';
app.listen(port, HOST, () => {
  console.log(`🚀 SpeakFlow server running on ${HOST}:${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📺 YouTube API Key: ${process.env.YOUTUBE_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`🤖 OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`☁️ AWS Access Key: ${process.env.AWS_ACCESS_KEY_ID ? '✅ Configured' : '❌ Missing'}`);
  console.log(`🗄️ AWS S3 Bucket: ${process.env.AWS_S3_BUCKET || 'Not configured'}`);
  console.log(`🌎 AWS Region: ${process.env.AWS_REGION || 'Not configured'}`);
  console.log(`🔗 Health check: http://${HOST}:${port}/api/health`);
  console.log(`⏰ Server started at ${new Date().toISOString()}`);
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err);
  process.exit(1);
});
