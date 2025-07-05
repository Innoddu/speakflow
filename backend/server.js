const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Request logging middleware for debugging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url} - From: ${req.ip}`);
  next();
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static audio files
app.use('/audio', express.static(path.join(__dirname, 'public', 'audio')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/youtube', require('./routes/youtube'));
app.use('/api/tts', require('./routes/tts'));
app.use('/api/whisper', require('./routes/whisper'));
app.use('/api/history', require('./routes/history'));
app.use('/api/translate', require('./routes/translate'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'SpeakFlow API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Connect to MongoDB (if using)
// if (process.env.MONGO_URI) {
//   mongoose.connect(process.env.MONGO_URI)
//     .then(() => console.log('MongoDB Connected'))
//     .catch(err => console.error('MongoDB connection error:', err));
// }

const PORT = process.env.PORT || 5030;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`SpeakFlow server running on ${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`YouTube API Key: ${process.env.YOUTUBE_API_KEY ? 'Configured' : 'Missing'}`);
  console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Missing'}`);
  console.log(`Health check endpoint: http://${HOST}:${PORT}/api/health`);
  console.log(`Server started successfully at ${new Date().toISOString()}`);
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err);
  process.exit(1);
});
