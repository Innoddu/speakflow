const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const s3Service = require('../services/s3Service');

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
        
        const cachedData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        return res.json({
          ...cachedData,
          cached: true,
          source: 'local',
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
    const processedSentences = processSentencesFromWhisper(transcription);

    const result = {
      success: true,
      transcription: transcription.text,
      segments: transcription.segments,
      words: transcription.words,
      sentences: processedSentences,
      duration: transcription.duration,
      cached: false,
      source: 'new',
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
function processSentencesFromWhisper(transcription) {
  if (!transcription.segments) {
    return [];
  }

  const sentences = [];
  let currentSentence = {
    text: '',
    start: 0,
    end: 0,
    words: []
  };

  transcription.segments.forEach((segment, index) => {
    const text = segment.text.trim();
    
    // Enhanced sentence splitting with multiple punctuation and conjunctions
    const sentenceParts = text.split(/[.!?]+|(?:\s+(?:and|but|so|however|therefore|meanwhile|furthermore|moreover|additionally)\s+)/i)
      .filter(part => part.trim().length > 0);
    
    if (sentenceParts.length === 1) {
      // Single sentence or sentence fragment
      if (currentSentence.text === '') {
        // Start new sentence
        currentSentence.text = text;
        currentSentence.start = segment.start;
        currentSentence.end = segment.end;
        currentSentence.words = segment.words || [];
      } else {
        // Continue current sentence
        currentSentence.text += ' ' + text;
        currentSentence.end = segment.end;
        if (segment.words) {
          currentSentence.words = currentSentence.words.concat(segment.words);
        }
      }
      
      // Check if this segment ends with punctuation or is long enough
      const shouldEndSentence = /[.!?]$/.test(text) || 
                                currentSentence.text.split(' ').length >= 15 || // Max 15 words
                                (currentSentence.end - currentSentence.start) >= 8; // Max 8 seconds
      
      if (shouldEndSentence) {
        sentences.push({
          text: currentSentence.text.trim(),
          start: currentSentence.start,
          end: currentSentence.end,
          duration: currentSentence.end - currentSentence.start,
          words: currentSentence.words
        });
        
        // Reset for next sentence
        currentSentence = { text: '', start: 0, end: 0, words: [] };
      }
    } else {
      // Multiple sentences in this segment
      sentenceParts.forEach((part, partIndex) => {
        const partText = part.trim();
        if (partText.length === 0) return;
        
        // Estimate timing for this part of the segment
        const partStart = segment.start + (partIndex / sentenceParts.length) * (segment.end - segment.start);
        const partEnd = segment.start + ((partIndex + 1) / sentenceParts.length) * (segment.end - segment.start);
        
        if (currentSentence.text === '') {
          currentSentence.text = partText;
          currentSentence.start = partStart;
          currentSentence.end = partEnd;
        } else {
          currentSentence.text += ' ' + partText;
          currentSentence.end = partEnd;
        }
        
        // End of sentence
        sentences.push({
          text: currentSentence.text.trim(),
          start: currentSentence.start,
          end: currentSentence.end,
          duration: currentSentence.end - currentSentence.start,
          words: currentSentence.words
        });
        
        // Reset for next sentence
        currentSentence = { text: '', start: 0, end: 0, words: [] };
      });
    }
  });

  // Add any remaining sentence
  if (currentSentence.text.trim().length > 0) {
    sentences.push({
      text: currentSentence.text.trim(),
      start: currentSentence.start,
      end: currentSentence.end,
      duration: currentSentence.end - currentSentence.start,
      words: currentSentence.words
    });
  }

  // Filter out very short sentences (less than 3 words)
  const filteredSentences = sentences.filter(sentence => 
    sentence.text.split(' ').length >= 3 && sentence.duration >= 0.5
  );

  console.log('🔄 Processed sentences:', sentences.length, '→ Filtered:', filteredSentences.length);
  console.log('📊 Average sentence length:', 
    filteredSentences.reduce((sum, s) => sum + s.text.split(' ').length, 0) / filteredSentences.length || 0, 'words');
  console.log('⏱️ Average sentence duration:', 
    filteredSentences.reduce((sum, s) => sum + s.duration, 0) / filteredSentences.length || 0, 'seconds');
  
  return filteredSentences;
}

// Get YouTube subtitles (fallback) - Updated to use yt-dlp with multiple fallbacks
router.get('/youtube-subtitles/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    console.log('📺 Fetching YouTube subtitles for:', videoId);

    // Import the new YouTube captions service
    const { getCaptions } = require('../services/youtube-captions');
    
    // Try the new yt-dlp service first
    try {
      console.log('🚀 Trying yt-dlp caption extraction...');
      const captionResult = await getCaptions(videoId, 'en');
      
      if (captionResult.success && captionResult.captions.length > 0) {
        console.log(`✅ yt-dlp success: ${captionResult.captions.length} captions`);
        
        // Convert to the format expected by frontend
        const processedSentences = captionResult.captions.map(caption => ({
          text: caption.text,
          start: caption.start,
          end: caption.start + caption.dur,
          duration: caption.dur
        }));
        
        return res.json({
          success: true,
          source: captionResult.method,
          sentences: processedSentences,
          captionCount: captionResult.count,
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