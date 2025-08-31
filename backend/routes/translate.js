const express = require('express');
const OpenAI = require('openai');

const router = express.Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Text translation API
router.post('/', async (req, res) => {
  try {
    const { text, targetLanguage = 'ko' } = req.body;

    if (!text) {
      return res.status(400).json({ 
        error: 'Text is required',
        details: 'Please provide text to translate'
      });
    }

    console.log(`🌐 Translating text to ${targetLanguage}:`, text.substring(0, 100) + '...');

    // Translation using OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the given English text to Korean naturally and accurately. Only respond with the Korean translation, no explanations or additional text.`
        },
        {
          role: 'user',
          content: text
        }
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    const translation = completion.choices[0].message.content.trim();

    console.log(`✅ Translation completed:`, translation.substring(0, 100) + '...');

    res.json({
      success: true,
      translatedText: translation,
      originalText: text,
      targetLanguage: targetLanguage
    });

  } catch (error) {
    console.error('❌ Translation error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      type: error.type,
      status: error.status
    });
    
    if (error.code === 'insufficient_quota') {
      res.status(429).json({ 
        error: 'API quota exceeded',
        details: 'OpenAI API quota has been exceeded. Please try again later.'
      });
    } else if (error.code === 'invalid_api_key') {
      res.status(401).json({ 
        error: 'Invalid API key',
        details: 'OpenAI API key is invalid or missing.'
      });
    } else if (error.status === 401) {
      res.status(401).json({ 
        error: 'Authentication failed',
        details: 'OpenAI API key authentication failed. Please check your API key.'
      });
    } else if (error.status === 429) {
      res.status(429).json({ 
        error: 'Rate limit exceeded',
        details: 'Too many requests. Please wait a moment and try again.'
      });
    } else {
      res.status(500).json({ 
        error: 'Translation failed',
        details: error.message || 'Unknown error occurred during translation'
      });
    }
  }
});

module.exports = router; 