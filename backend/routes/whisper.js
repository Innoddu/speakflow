// Convert to ESM imports
const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const s3Service = require('../services/s3Service');
const { google } = require('googleapis');
const { getSubtitles } = require('youtube-captions-scraper');
const natural = require('natural');

// Initialize sentence tokenizer (fallback)
const naturalTokenizer = new natural.SentenceTokenizer();

// Add cleanup function for memory optimization
function cleanupMemory() {
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Clear require cache for Python subprocess modules
  delete require.cache[require.resolve('child_process')];
}

// Test spaCy availability
let spacyAvailable = false;
(async () => {
  try {
    // Test if spaCy is available by running a simple Python command
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    await execAsync('python3 -c "import spacy; nlp = spacy.load(\'en_core_web_sm\'); print(\'spaCy test successful\')"');
    spacyAvailable = true;
    console.log('✅ spaCy English model loaded successfully');
  } catch (error) {
    console.warn('⚠️ spaCy not available, falling back to natural tokenizer');
    console.warn('Error:', error.message);
  }
})();

// Function to tokenize sentences using spaCy
async function tokenizeWithSpacy(text) {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', ['-c', `
import spacy
import sys
import json

try:
    nlp = spacy.load('en_core_web_sm')
    text = sys.stdin.read()
    doc = nlp(text)
    sentences = [sent.text.strip() for sent in doc.sents if sent.text.strip()]
    print(json.dumps(sentences))
    
    # Cleanup
    del nlp
    del doc
    del sentences
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`]);

    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    python.on('close', (code) => {
      // Ensure process is cleaned up
      python.kill();
      
      // Call cleanup function
      setTimeout(cleanupMemory, 100);
      
      if (code === 0) {
        try {
          const sentences = JSON.parse(output.trim());
          resolve(sentences);
        } catch (parseError) {
          reject(new Error(`Failed to parse spaCy output: ${parseError.message}`));
        }
      } else {
        reject(new Error(`spaCy process failed: ${errorOutput}`));
      }
    });

    python.on('error', (error) => {
      python.kill();
      cleanupMemory();
      reject(error);
    });

    python.stdin.write(text);
    python.stdin.end();
    
    // Set timeout to prevent hanging
    setTimeout(() => {
      if (!python.killed) {
        python.kill('SIGKILL');
        cleanupMemory();
        reject(new Error('Python process timeout'));
      }
    }, 30000); // 30 second timeout
  });
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to convert audio file to MP3 using ffmpeg
const convertToMp3 = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,           // Input file
      '-acodec', 'mp3',         // Audio codec
      '-ab', '192k',            // Audio bitrate
      '-ar', '44100',           // Audio sample rate
      '-y',                     // Overwrite output file
      outputPath                // Output file
    ]);

    let stderr = '';
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Audio conversion completed:', outputPath);
        resolve(outputPath);
      } else {
        console.error('❌ FFmpeg conversion failed:', stderr);
        reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on('error', (error) => {
      console.error('❌ FFmpeg spawn error:', error);
      reject(error);
    });
  });
};

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for Whisper API
  },
});

// Create cache directory for Whisper results
const whisperCacheDir = path.join(__dirname, '..', 'cache', 'whisper');
if (!fs.existsSync(whisperCacheDir)) {
  fs.mkdirSync(whisperCacheDir, { recursive: true });
}

// Quick cache existence check (check both local and S3)
router.get('/cache-exists/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const cacheFilePath = path.join(whisperCacheDir, `${videoId}.json`);
    
    // Check local cache first
    const localExists = fs.existsSync(cacheFilePath);
    
    // Check S3 cache
    let s3Exists = false;
    try {
      s3Exists = await s3Service.whisperCacheExists(videoId);
    } catch (s3Error) {
      console.log('S3 cache check failed:', s3Error.message);
    }
    
    const exists = localExists || s3Exists;
    
    res.json({ 
      exists,
      videoId,
      cached: exists,
      localCache: localExists,
      s3Cache: s3Exists,
      ...(localExists && { localCachedAt: fs.statSync(cacheFilePath).mtime })
    });
  } catch (error) {
    console.error('❌ Cache existence check error:', error);
    res.status(500).json({ error: 'Failed to check cache' });
  }
});

// Get cached Whisper result by video ID (check both local and S3)
router.get('/cached/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const cacheFilePath = path.join(whisperCacheDir, `${videoId}.json`);
    
    // Try local cache first
    if (fs.existsSync(cacheFilePath)) {
      console.log('✅ Whisper: Found cached result locally for video:', videoId);
      const cachedData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      
      return res.json({
        ...cachedData,
        cached: true,
        source: 'local',
        cachedAt: fs.statSync(cacheFilePath).mtime
      });
    }
    
    // Try S3 cache if local not found
    try {
      const s3CacheExists = await s3Service.whisperCacheExists(videoId);
      if (s3CacheExists) {
        console.log('✅ Whisper: Found cached result in S3 for video:', videoId);
        let cachedData = await s3Service.getWhisperCache(videoId);
        
        // Apply spaCy improvement to S3 cached results if requested
        const useSpacy = req.body.useSpacy !== 'false'; // Default to true
        if (useSpacy && cachedData.sentences && cachedData.sentences.length > 0 && !cachedData.spacyImproved) {
          console.log('🧠 Applying spaCy improvement to S3 cached Whisper results...');
          try {
            cachedData.sentences = await improveSentencesWithSpacy(cachedData.sentences);
            cachedData.spacyImproved = true;
            cachedData.source = 's3+spacy';
            console.log('✅ spaCy improvement applied to S3 cached results');
          } catch (spacyError) {
            console.warn('⚠️ spaCy improvement failed for S3 cached results:', spacyError.message);
          }
        }
        
        // Save to local cache for faster access next time
        try {
          fs.writeFileSync(cacheFilePath, JSON.stringify(cachedData, null, 2));
          console.log('💾 Whisper: S3 cache saved locally for video:', videoId);
        } catch (localSaveError) {
          console.warn('⚠️ Failed to save S3 cache locally:', localSaveError.message);
        }
        
        return res.json({
          ...cachedData,
          cached: true,
          source: cachedData.source || 's3',
          cachedAt: new Date().toISOString()
        });
      }
    } catch (s3Error) {
      console.log('S3 cache retrieval failed:', s3Error.message);
    }
    
    // No cache found
    return res.status(404).json({ error: 'No cached result found' });
  } catch (error) {
    console.error('❌ Cache retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve cached result' });
  }
});

// Transcribe audio with Whisper AI (with S3 caching)
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    const videoId = req.body.videoId;
    const audioUrl = req.body.audioUrl;
    
    // Handle both file upload and URL download
    if (!req.file && !audioUrl) {
      return res.status(400).json({ error: 'No audio file or URL provided' });
    }

    // Check cache first (both local and S3)
    if (videoId) {
      const cacheFilePath = path.join(whisperCacheDir, `${videoId}.json`);
      
      // Check local cache
      if (fs.existsSync(cacheFilePath)) {
        console.log('🎯 Whisper: Using local cached result for video:', videoId);
        
        // Clean up uploaded file if exists
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        
        let cachedData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        
        // Apply spaCy improvement to cached results if requested
        const useSpacy = req.body.useSpacy !== 'false'; // Default to true
        if (useSpacy && cachedData.sentences && cachedData.sentences.length > 0 && !cachedData.spacyImproved) {
          console.log('🧠 Applying spaCy improvement to cached Whisper results...');
          try {
            cachedData.sentences = await improveSentencesWithSpacy(cachedData.sentences);
            cachedData.spacyImproved = true;
            cachedData.source = 'local+spacy';
            console.log('✅ spaCy improvement applied to cached results');
          } catch (spacyError) {
            console.warn('⚠️ spaCy improvement failed for cached results:', spacyError.message);
          }
        }
        
        return res.json({
          ...cachedData,
          cached: true,
          source: cachedData.source || 'local',
          cachedAt: fs.statSync(cacheFilePath).mtime
        });
      }
      
      // Check S3 cache
      try {
        const s3CacheExists = await s3Service.whisperCacheExists(videoId);
        if (s3CacheExists) {
          console.log('🎯 Whisper: Using S3 cached result for video:', videoId);
          
          // Clean up uploaded file if exists
          if (req.file) {
            fs.unlinkSync(req.file.path);
          }
          
          const cachedData = await s3Service.getWhisperCache(videoId);
          
          // Save to local cache for faster access next time
          try {
            fs.writeFileSync(cacheFilePath, JSON.stringify(cachedData, null, 2));
            console.log('💾 Whisper: S3 cache saved locally for video:', videoId);
          } catch (localSaveError) {
            console.warn('⚠️ Failed to save S3 cache locally:', localSaveError.message);
          }
          
          return res.json({
            ...cachedData,
            cached: true,
            source: 's3',
            cachedAt: new Date().toISOString()
          });
        }
      } catch (s3Error) {
        console.log('S3 cache check failed:', s3Error.message);
      }
    }

    let audioFilePath;
    let isDownloaded = false;
    
    if (req.file) {
      // File uploaded directly
      console.log('🎤 Whisper: Starting NEW transcription for:', req.file.originalname);
      console.log('📁 File size:', (req.file.size / 1024 / 1024).toFixed(2), 'MB');
      audioFilePath = req.file.path;
    } else {
      // Download from URL (for web platform)
      console.log('🌐 Whisper: Downloading audio from URL for video:', videoId);
      console.log('🔗 Audio URL:', audioUrl.substring(0, 100) + '...');
      
      // Create temporary file for download
      const tempFileName = `temp_${videoId}_${Date.now()}.audio`;
      audioFilePath = path.join(__dirname, '..', 'uploads', tempFileName);
      
      // Download audio file
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      await new Promise((resolve, reject) => {
        const parsedUrl = url.parse(audioUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        const file = fs.createWriteStream(audioFilePath);
        const request = client.get(audioUrl, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download audio: ${response.statusCode}`));
            return;
          }
          
          response.pipe(file);
          
          file.on('finish', () => {
            file.close();
            const stats = fs.statSync(audioFilePath);
            console.log('📁 Downloaded file size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
            isDownloaded = true;
            resolve();
          });
        });
        
        request.on('error', (err) => {
          fs.unlink(audioFilePath, () => {}); // Clean up on error
          reject(err);
        });
        
        file.on('error', (err) => {
          fs.unlink(audioFilePath, () => {}); // Clean up on error
          reject(err);
        });
      });
    }

    let finalAudioPath = audioFilePath;

    // Convert to MP3 if the file is not already in a compatible format
    const fileExtension = path.extname(audioFilePath).toLowerCase();
    if (fileExtension !== '.mp3' && fileExtension !== '.wav' && fileExtension !== '.m4a') {
      console.log('🔄 Converting audio to MP3 format...');
      const mp3Path = audioFilePath + '.mp3';
      
      try {
        await convertToMp3(audioFilePath, mp3Path);
        finalAudioPath = mp3Path;
        console.log('✅ Audio converted to MP3:', mp3Path);
      } catch (conversionError) {
        console.error('❌ Audio conversion failed:', conversionError);
        // Try with original file anyway
        console.log('⚠️ Proceeding with original file format...');
      }
    }

    // Call OpenAI Whisper API
    console.log('🎤 Sending to Whisper API:', finalAudioPath);
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(finalAudioPath),
      model: 'whisper-1',
      response_format: 'verbose_json', // Get detailed timing information
      timestamp_granularities: ['word', 'segment'], // Get both word and segment level timestamps
    });

    console.log('✅ Whisper: Transcription completed');
    console.log('📊 Segments found:', transcription.segments?.length || 0);
    console.log('📝 Words found:', transcription.words?.length || 0);

    // Clean up files
    fs.unlinkSync(audioFilePath);
    if (finalAudioPath !== audioFilePath && fs.existsSync(finalAudioPath)) {
      fs.unlinkSync(finalAudioPath);
    }

    // Process the transcription to create sentences with precise timing
    let processedSentences = await processSentencesFromWhisper(transcription);
    
    // Apply spaCy improvement to Whisper results (default enabled)
    const useSpacy = req.body.useSpacy !== 'false'; // Default to true unless explicitly disabled
    if (useSpacy && processedSentences.length > 0) {
      console.log('🧠 Applying spaCy improvement to Whisper results...');
      try {
        processedSentences = await improveSentencesWithSpacy(processedSentences);
        console.log('✅ spaCy improvement applied to Whisper results');
      } catch (spacyError) {
        console.warn('⚠️ spaCy improvement failed for Whisper, using original results:', spacyError.message);
      }
    }

    const result = {
      success: true,
      transcription: transcription.text,
      segments: transcription.segments,
      words: transcription.words,
      sentences: processedSentences,
      duration: transcription.duration,
      cached: false,
      source: useSpacy ? 'whisper+spacy' : 'whisper',
      spacyImproved: useSpacy,
      processedAt: new Date().toISOString()
    };

    // Save to cache if videoId is available
    if (videoId) {
      try {
        // Save to local cache
        const cacheFilePath = path.join(whisperCacheDir, `${videoId}.json`);
        fs.writeFileSync(cacheFilePath, JSON.stringify(result, null, 2));
        console.log('💾 Whisper: Result cached locally for video:', videoId);
        
        // Save to S3 cache for production deployment
        try {
          await s3Service.uploadWhisperCache(videoId, result);
          console.log('☁️ Whisper: Result cached in S3 for video:', videoId);
        } catch (s3Error) {
          console.warn('⚠️ Failed to cache Whisper result in S3:', s3Error.message);
        }
      } catch (cacheError) {
        console.error('⚠️ Failed to cache Whisper result:', cacheError);
        // Don't fail the request if caching fails
      }
    }

    res.json(result);

  } catch (error) {
    console.error('❌ Whisper transcription error:', error);
    
    // Clean up files if they exist
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    // Clean up converted file if it exists
    const mp3Path = req.file?.path + '.mp3';
    if (mp3Path && fs.existsSync(mp3Path)) {
      fs.unlinkSync(mp3Path);
    }

    res.status(500).json({ 
      error: 'Transcription failed', 
      details: error.message 
    });
  }
});

// Process Whisper segments into sentences with precise timing
async function processSentencesFromWhisper(transcription) {
  if (!transcription.segments) {
    return [];
  }

  // Combine all text
  let fullText = transcription.segments
    .map(segment => segment.text.trim())
    .join(' ');

  console.log('🔍 DEBUG: Full text length:', fullText.length);
  console.log('🔍 DEBUG: Full text preview:', fullText.substring(0, 200) + '...');
  console.log('🔍 DEBUG: Total segments from Whisper:', transcription.segments.length);

  let sentences;
  
  // Use spaCy for sentence segmentation if available
  if (spacyAvailable) {
    try {
      sentences = await tokenizeWithSpacy(fullText);
      console.log('🔄 spaCy sentences found:', sentences.length);
      console.log('🔍 DEBUG: spaCy sentences preview:', sentences.slice(0, 3));
    } catch (error) {
      console.warn('⚠️ spaCy failed, using natural tokenizer:', error.message);
      sentences = naturalTokenizer.tokenize(fullText);
      console.log('🔄 Natural tokenizer sentences found:', sentences.length);
      console.log('🔍 DEBUG: Natural sentences preview:', sentences.slice(0, 3));
    }
  } else {
    // Fallback to natural tokenizer
    sentences = naturalTokenizer.tokenize(fullText);
    console.log('🔄 Natural tokenizer sentences found:', sentences.length);
    console.log('🔍 DEBUG: Natural sentences preview:', sentences.slice(0, 3));
  }

  let currentPosition = 0;
  let processedSentences = [];

  // Create character position map for segments
  let segmentPositions = [];
  let textPosition = 0;
  
  for (const segment of transcription.segments) {
    const segmentText = segment.text.trim();
    segmentPositions.push({
      segment: segment,
      startChar: textPosition,
      endChar: textPosition + segmentText.length,
      text: segmentText
    });
    textPosition += segmentText.length + 1; // +1 for space
  }

  console.log('🔍 DEBUG: Created segment position map for', segmentPositions.length, 'segments');

  for (const sentence of sentences) {
    const sentenceText = sentence.trim();
    if (!sentenceText) continue;
    
    console.log('🔍 DEBUG: Processing sentence:', sentenceText.substring(0, 50) + '...');
    
    // Find sentence position in full text
    const sentenceStartChar = fullText.indexOf(sentenceText, currentPosition);
    const sentenceEndChar = sentenceStartChar + sentenceText.length;

    console.log('🔍 DEBUG: Sentence char range:', sentenceStartChar, '-', sentenceEndChar);

    // Find overlapping segments
    let matchedSegments = [];
    let sentenceStart = null;
    let sentenceEnd = null;
    let sentenceWords = [];

    for (const segPos of segmentPositions) {
      // Check if this segment overlaps with the sentence
      const hasOverlap = !(segPos.endChar <= sentenceStartChar || segPos.startChar >= sentenceEndChar);
      
      if (hasOverlap) {
        matchedSegments.push(segPos.segment);
        
        if (sentenceStart === null || segPos.segment.start < sentenceStart) {
          sentenceStart = segPos.segment.start;
        }
        if (sentenceEnd === null || segPos.segment.end > sentenceEnd) {
          sentenceEnd = segPos.segment.end;
        }

        // Add word information
        if (segPos.segment.words) {
          sentenceWords = sentenceWords.concat(segPos.segment.words);
        }
      }
    }

    console.log('🔍 DEBUG: Matched segments for sentence:', matchedSegments.length);
    console.log('🔍 DEBUG: Sentence timing:', sentenceStart, '-', sentenceEnd);

    // Only add valid sentences
    if (sentenceStart !== null && sentenceEnd !== null) {
      const wordCount = sentenceText.split(/\s+/).length;
      const duration = sentenceEnd - sentenceStart;

      console.log('🔍 DEBUG: Word count:', wordCount, 'Duration:', duration);

      // Apply filtering conditions
      if (
        wordCount >= 3 && 
        duration >= 1.0 &&
        duration <= 15.0 &&
        sentenceText.length > 0
      ) {
        processedSentences.push({
          text: sentenceText,
          start: sentenceStart,
          end: sentenceEnd,
          duration: duration,
          words: sentenceWords,
          wordCount: wordCount
        });
        console.log('✅ DEBUG: Sentence added to final list');
      } else {
        console.log('❌ DEBUG: Sentence filtered out - wordCount:', wordCount, 'duration:', duration);
      }
    } else {
      console.log('❌ DEBUG: No timing info found for sentence');
    }

    // Update position for next sentence search
    currentPosition = sentenceEndChar;
  }

  // Debug information
  console.log('✅ Processed sentences:', processedSentences.length);
  console.log('📊 Average sentence length:', 
    Math.round(processedSentences.reduce((sum, s) => sum + s.wordCount, 0) / processedSentences.length || 0),
    'words');
  console.log('⏱️ Average sentence duration:', 
    Math.round(processedSentences.reduce((sum, s) => sum + s.duration, 0) / processedSentences.length || 0),
    'seconds');

  return processedSentences;
}

// Helper function to improve sentence boundaries using spaCy (copied from youtube.js)
async function improveSentencesWithSpacy(sentences) {
  try {
    // Combine all subtitle text
    const fullText = sentences.map(s => s.text).join(' ');
    
    // Use spaCy for better sentence segmentation
    const spacySentences = await new Promise((resolve, reject) => {
      const python = spawn('python3', ['-c', `
import spacy
import sys
import json

try:
    nlp = spacy.load('en_core_web_sm')
    text = sys.stdin.read()
    doc = nlp(text)
    sentences = [sent.text.strip() for sent in doc.sents if sent.text.strip()]
    print(json.dumps(sentences))
    
    # Cleanup
    del nlp
    del doc
    del sentences
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`]);

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (code) => {
        // Ensure process is cleaned up
        python.kill();
        
        // Call cleanup function
        setTimeout(cleanupMemory, 100);
        
        if (code === 0) {
          try {
            const sentences = JSON.parse(output.trim());
            resolve(sentences);
          } catch (parseError) {
            reject(new Error(`Failed to parse spaCy output: ${parseError.message}`));
          }
        } else {
          reject(new Error(`spaCy process failed: ${errorOutput}`));
        }
      });

      python.on('error', (error) => {
        python.kill();
        cleanupMemory();
        reject(error);
      });

      python.stdin.write(fullText);
      python.stdin.end();
      
      // Set timeout to prevent hanging
      setTimeout(() => {
        if (!python.killed) {
          python.kill('SIGKILL');
          cleanupMemory();
          reject(new Error('Python process timeout'));
        }
      }, 30000); // 30 second timeout
    });

    console.log(`🔄 spaCy improved sentences: ${sentences.length} → ${spacySentences.length}`);

    // Map spaCy sentences back to timing information
    const improvedSentences = [];
    
    for (const spacySentence of spacySentences) {
      // Find this sentence in the full text
      const sentenceStart = fullText.indexOf(spacySentence);
      const sentenceEnd = sentenceStart + spacySentence.length;
      
      console.log(`🔍 Mapping sentence: "${spacySentence.substring(0, 50)}..."`);
      console.log(`📍 Text position: ${sentenceStart} - ${sentenceEnd}`);
      
      // Find overlapping original sentences for timing
      let earliestStart = null;
      let latestEnd = null;
      let matchedOriginals = [];
      
      // Build character position map for original sentences
      let charPosition = 0;
      for (const originalSentence of sentences) {
        const origStart = charPosition;
        const origEnd = charPosition + originalSentence.text.length;
        
        // Check if this original sentence overlaps with spaCy sentence
        const hasOverlap = !(origEnd <= sentenceStart || origStart >= sentenceEnd);
        
        if (hasOverlap) {
          matchedOriginals.push(originalSentence);
          console.log(`  ✅ Matched: "${originalSentence.text.substring(0, 30)}..." (${originalSentence.start}s - ${originalSentence.end}s)`);
          
          if (earliestStart === null || originalSentence.start < earliestStart) {
            earliestStart = originalSentence.start;
          }
          if (latestEnd === null || originalSentence.end > latestEnd) {
            latestEnd = originalSentence.end;
          }
        }
        
        charPosition += originalSentence.text.length + 1; // +1 for space separator
      }
      
      console.log(`📊 Found ${matchedOriginals.length} matching segments`);
      
      if (earliestStart !== null && latestEnd !== null) {
        const rawDuration = latestEnd - earliestStart;
        
        // Calculate more accurate duration based on text length and speaking rate
        const wordCount = spacySentence.split(/\s+/).length;
        const averageSpeakingRate = 2.5; // words per second (normal speaking rate)
        const estimatedDuration = wordCount / averageSpeakingRate;
        
        // Use the shorter of raw duration or estimated duration to prevent overly long playback
        // But ensure minimum duration for very short sentences
        const minDuration = Math.max(0.8, wordCount * 0.25); // Reduced from 0.3 to 0.25s per word
        const maxDuration = Math.min(rawDuration, estimatedDuration + 0.5); // Reduced buffer from 1.0 to 0.5s
        
        // For very short sentences (≤5 words), be more conservative
        let finalDuration;
        if (wordCount <= 5) {
          finalDuration = Math.max(minDuration, Math.min(maxDuration, wordCount * 0.4 + 0.5)); // More conservative for short sentences
        } else {
          finalDuration = Math.max(minDuration, Math.min(maxDuration, 8.0)); // Cap at 8 seconds for longer sentences
        }
        
        console.log(`📏 Duration calculation for "${spacySentence.substring(0, 30)}...":
          - Raw duration: ${rawDuration.toFixed(2)}s
          - Estimated (${wordCount} words): ${estimatedDuration.toFixed(2)}s  
          - Final duration: ${finalDuration.toFixed(2)}s
          - Start time: ${earliestStart.toFixed(2)}s
          - End time: ${(earliestStart + finalDuration).toFixed(2)}s
          - Matched ${matchedOriginals.length} original segments`);
        
        improvedSentences.push({
          text: spacySentence,
          start: earliestStart,
          end: earliestStart + finalDuration, // Use calculated duration
          duration: finalDuration,
          wordCount: wordCount,
          improved: true,
          originalCount: matchedOriginals.length,
          rawDuration: rawDuration, // Keep original for reference
          estimatedDuration: estimatedDuration
        });
      } else {
        console.log(`❌ No timing found for: "${spacySentence.substring(0, 50)}..."`);
      }
    }

    console.log(`✅ spaCy sentence improvement completed: ${improvedSentences.length} final sentences`);
    return improvedSentences;

  } catch (error) {
    console.warn('⚠️ spaCy sentence improvement failed:', error.message);
    console.log('📝 Using original YouTube sentences');
    return sentences;
  }
}

// Get YouTube subtitles (fallback) - Updated to use yt-dlp with multiple fallbacks
router.get('/youtube-subtitles/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { useSpacy = 'true' } = req.query; // Allow disabling spaCy via query param
    
    console.log('📺 Fetching YouTube subtitles for:', videoId);
    console.log(`🧠 spaCy enhancement: ${useSpacy === 'true' ? 'enabled' : 'disabled'}`);

    // Import the new YouTube captions service
    const { getCaptions } = require('../services/youtube-captions');
    
    // Try the new yt-dlp service first
    try {
      console.log('🚀 Trying yt-dlp caption extraction...');
      const captionResult = await getCaptions(videoId, 'en');
      
      if (captionResult.success && captionResult.captions.length > 0) {
        console.log(`✅ yt-dlp success: ${captionResult.captions.length} captions`);
        
        // Convert to the format expected by frontend
        let processedSentences = captionResult.captions.map(caption => ({
          text: caption.text,
          start: caption.start,
          end: caption.start + caption.dur,
          duration: caption.dur
        }));
        
        // Apply spaCy improvement if enabled
        if (useSpacy === 'true') {
          processedSentences = await improveSentencesWithSpacy(processedSentences);
        }
        
        return res.json({
          success: true,
          source: useSpacy === 'true' ? captionResult.method + '+spacy' : captionResult.method,
          sentences: processedSentences,
          captionCount: captionResult.count,
          spacyImproved: useSpacy === 'true',
          raw: captionResult.captions
        });
      }
    } catch (ytdlpError) {
      console.error('yt-dlp failed:', ytdlpError.message);
      console.log('🔄 Falling back to YouTube Data API v3...');
    }

    // Fallback 1: YouTube Data API v3
    try {
      const { google } = require('googleapis');
      const youtube = google.youtube({
        version: 'v3',
        auth: process.env.YOUTUBE_API_KEY
      });

      // Step 1: Get caption tracks using YouTube Data API v3
      const captionsResponse = await youtube.captions.list({
        part: 'snippet',
        videoId: videoId
      });
      
      const captionTracks = captionsResponse.data.items || [];
      console.log(`📝 Found ${captionTracks.length} caption tracks via API`);
      
      // Find English captions (prefer manual over auto-generated)
      const manualEnglish = captionTracks.find(track => 
        track.snippet.language === 'en' && track.snippet.trackKind === 'standard'
      );
      const autoEnglish = captionTracks.find(track => 
        track.snippet.language === 'en' && track.snippet.trackKind === 'ASR'
      );
      
      const selectedTrack = manualEnglish || autoEnglish;
      
      if (selectedTrack) {
        console.log(`✅ Using ${selectedTrack.snippet.trackKind} English captions via API`);
        
        // Step 2: Download caption content
        const captionId = selectedTrack.id;
        const captionDownloadResponse = await youtube.captions.download({
          id: captionId,
          tfmt: 'srt' // SubRip format
        });
        
        const srtContent = captionDownloadResponse.data;
        console.log(`📄 Downloaded SRT content (${srtContent.length} characters)`);
        
        // Step 3: Parse SRT to extract timing and text
        const transcript = parseSRTContentForWhisper(srtContent);
        console.log(`🔄 Parsed ${transcript.length} subtitle segments`);
        
        if (transcript.length > 0) {
          // Step 4: Process into sentences
          const processedSentences = processYouTubeSubtitles(transcript);
          
          return res.json({
            success: true,
            source: 'youtube-api',
            sentences: processedSentences,
            captionType: selectedTrack.snippet.trackKind,
            language: selectedTrack.snippet.language,
            raw: transcript
          });
        }
      }
    } catch (apiError) {
      console.error('YouTube Data API failed:', apiError.message);
      console.log('🔄 Falling back to scraper method...');
    }
    
    // Fallback 2: Old scraper method
    try {
      const { getSubtitles } = require('youtube-captions-scraper');
      const subtitles = await getSubtitles({
        videoID: videoId,
        lang: 'en'
      });

      if (subtitles && subtitles.length > 0) {
        console.log('✅ Fallback scraper found subtitles:', subtitles.length, 'entries');
        const processedSentences = processYouTubeSubtitles(subtitles);
        
        return res.json({
          success: true,
          source: 'youtube-scraper',
          sentences: processedSentences,
          raw: subtitles
        });
      }
    } catch (scraperError) {
      console.error('Scraper fallback also failed:', scraperError.message);
    }
    
    // All methods failed
    return res.status(404).json({
      success: false,
      error: 'No subtitles found for this video',
      details: 'All caption extraction methods failed (yt-dlp, YouTube API, scraper)',
      suggestion: 'Please try a different video with English subtitles or closed captions (CC)'
    });

  } catch (error) {
    console.error('❌ YouTube subtitles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch YouTube subtitles',
      details: error.message
    });
  }
});

// Helper function to parse SRT content for Whisper route
function parseSRTContentForWhisper(srtContent) {
  const transcript = [];
  const blocks = srtContent.split('\n\n').filter(block => block.trim());
  
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      
      if (timeMatch) {
        const startTime = parseFloat(timeMatch[1]) * 3600 + parseFloat(timeMatch[2]) * 60 + 
                         parseFloat(timeMatch[3]) + parseFloat(timeMatch[4]) / 1000;
        const endTime = parseFloat(timeMatch[5]) * 3600 + parseFloat(timeMatch[6]) * 60 + 
                       parseFloat(timeMatch[7]) + parseFloat(timeMatch[8]) / 1000;
        
        const text = lines.slice(2).join(' ').replace(/<[^>]*>/g, '').trim(); // Remove HTML tags
        
        if (text) {
          transcript.push({
            text: text,
            start: startTime,
            dur: endTime - startTime
          });
        }
      }
    }
  }
  
  return transcript;
}

// Process YouTube subtitles into sentences
function processYouTubeSubtitles(subtitles) {
  const sentences = [];
  let currentSentence = {
    text: '',
    start: 0,
    end: 0
  };

  subtitles.forEach((subtitle, index) => {
    const text = subtitle.text.trim();
    const start = parseFloat(subtitle.start);
    const duration = parseFloat(subtitle.dur);
    const end = start + duration;

    if (currentSentence.text === '') {
      // Start new sentence
      currentSentence.text = text;
      currentSentence.start = start;
      currentSentence.end = end;
    } else {
      // Continue current sentence
      currentSentence.text += ' ' + text;
      currentSentence.end = end;
    }

    // Check if this subtitle ends with sentence-ending punctuation
    if (/[.!?]$/.test(text) || index === subtitles.length - 1) {
      sentences.push({
        text: currentSentence.text.trim(),
        start: currentSentence.start,
        end: currentSentence.end,
        duration: currentSentence.end - currentSentence.start
      });
      
      // Reset for next sentence
      currentSentence = { text: '', start: 0, end: 0 };
    }
  });

  console.log('🔄 Processed YouTube sentences:', sentences.length);
  return sentences;
}

// Debug endpoint to check Python and yt-dlp environment
router.get('/debug/environment', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const results = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      checks: {}
    };
    
    // Check Python
    try {
      const { stdout: pythonVersion } = await execAsync('python --version');
      results.checks.python = {
        available: true,
        version: pythonVersion.trim(),
        command: 'python --version'
      };
    } catch (error) {
      try {
        const { stdout: python3Version } = await execAsync('python3 --version');
        results.checks.python = {
          available: true,
          version: python3Version.trim(),
          command: 'python3 --version'
        };
      } catch (error3) {
        results.checks.python = {
          available: false,
          error: error3.message,
          tried: ['python --version', 'python3 --version']
        };
      }
    }
    
    // Check pip
    try {
      const { stdout: pipVersion } = await execAsync('pip --version');
      results.checks.pip = {
        available: true,
        version: pipVersion.trim()
      };
    } catch (error) {
      try {
        const { stdout: pip3Version } = await execAsync('pip3 --version');
        results.checks.pip = {
          available: true,
          version: pip3Version.trim()
        };
      } catch (error3) {
        results.checks.pip = {
          available: false,
          error: error3.message
        };
      }
    }
    
    // Check yt-dlp
    try {
      const { stdout: ytdlpVersion } = await execAsync('yt-dlp --version');
      results.checks.ytdlp = {
        available: true,
        version: ytdlpVersion.trim(),
        command: 'yt-dlp --version'
      };
    } catch (error) {
      results.checks.ytdlp = {
        available: false,
        error: error.message
      };
    }
    
    // Check youtube-dl-exec package
    try {
      const youtubeDlExec = require('youtube-dl-exec');
      results.checks.youtubeDlExec = {
        available: true,
        packageLoaded: true
      };
    } catch (error) {
      results.checks.youtubeDlExec = {
        available: false,
        error: error.message
      };
    }
    
    // Check ffmpeg
    try {
      const { stdout: ffmpegVersion } = await execAsync('ffmpeg -version');
      results.checks.ffmpeg = {
        available: true,
        version: ffmpegVersion.split('\n')[0]
      };
    } catch (error) {
      results.checks.ffmpeg = {
        available: false,
        error: error.message
      };
    }
    
    // Check environment variables
    results.environmentVariables = {
      hasYouTubeApiKey: !!process.env.YOUTUBE_API_KEY,
      hasOpenAiApiKey: !!process.env.OPENAI_API_KEY,
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT
    };
    
    res.json(results);
    
  } catch (error) {
    console.error('❌ Environment debug error:', error);
    res.status(500).json({
      error: 'Failed to check environment',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router; 