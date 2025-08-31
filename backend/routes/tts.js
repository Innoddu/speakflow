const express = require('express');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// OpenAI TTS endpoint
router.post('/speak', async (req, res) => {
  try {
    const { text, voice = 'nova', speed = 1.0 } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log('🎤 Generating TTS for:', text.substring(0, 50) + '...');
    console.log('🎛️ Voice:', voice, 'Speed:', speed);

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️ OpenAI API key not found, using fallback');
      return res.status(501).json({ 
        error: 'OpenAI TTS not configured',
        fallback: true 
      });
    }

    console.log('🔑 API Key configured:', process.env.OPENAI_API_KEY.substring(0, 10) + '...');

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1', // or 'tts-1-hd' for higher quality
        input: text,
        voice: voice,
        speed: speed,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OpenAI API error ${response.status}:`, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    // Get audio buffer and send response
    const audioBuffer = await response.arrayBuffer();
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'inline',
      'Content-Length': audioBuffer.byteLength.toString(),
    });

    res.send(Buffer.from(audioBuffer));
    console.log('✅ TTS audio sent successfully');

  } catch (error) {
    console.error('❌ TTS error:', error);
    res.status(500).json({ 
      error: 'Failed to generate speech',
      details: error.message 
    });
  }
});

// Voice options endpoint
router.get('/voices', (req, res) => {
  res.json({
    voices: [
      { id: 'alloy', name: 'Alloy', gender: 'neutral' },
      { id: 'echo', name: 'Echo', gender: 'male' },
      { id: 'fable', name: 'Fable', gender: 'neutral' },
      { id: 'onyx', name: 'Onyx', gender: 'male' },
      { id: 'nova', name: 'Nova', gender: 'female', recommended: true },
      { id: 'shimmer', name: 'Shimmer', gender: 'female' },
    ]
  });
});

module.exports = router; 