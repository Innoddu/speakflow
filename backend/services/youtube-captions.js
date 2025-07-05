const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

// Try to import youtube-dl-exec for production environments
let youtubeDlExec = null;
try {
  youtubeDlExec = require('youtube-dl-exec');
} catch (error) {
  console.log('youtube-dl-exec not available, using system yt-dlp');
}

// Extract captions using youtube-dl-exec (Node.js wrapper)
async function extractCaptionsWithYoutubeDlExec(videoId, language = 'en') {
  console.log(`🎬 Extracting captions for video ${videoId} using youtube-dl-exec...`);
  
  if (!youtubeDlExec) {
    throw new Error('youtube-dl-exec not available');
  }
  
  // Create temporary directory
  const tempDir = path.join(os.tmpdir(), `ytdl-exec-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Extract captions using youtube-dl-exec
    const output = await youtubeDlExec(videoUrl, {
      writeAutoSub: true,
      writeSub: true,
      subLang: language,
      subFormat: 'srt',
      skipDownload: true,
      output: '%(title)s.%(ext)s',
      cwd: tempDir
    });
    
    console.log(`✅ youtube-dl-exec completed successfully`);
    
    // Find downloaded SRT files
    const files = fs.readdirSync(tempDir);
    const srtFiles = files.filter(file => file.endsWith('.srt'));
    
    if (srtFiles.length === 0) {
      throw new Error('No SRT files found. The video may not have captions available.');
    }
    
    // Read the first SRT file
    const srtFile = srtFiles[0];
    const srtPath = path.join(tempDir, srtFile);
    const srtContent = fs.readFileSync(srtPath, 'utf8');
    
    console.log(`📝 Successfully extracted ${srtContent.length} characters of captions`);
    
    // Parse SRT content
    const parsedCaptions = parseSRTContent(srtContent);
    
    return {
      success: true,
      captions: parsedCaptions,
      rawSRT: srtContent,
      filename: srtFile
    };
    
  } catch (error) {
    console.error(`❌ Error extracting captions with youtube-dl-exec: ${error.message}`);
    throw error;
    
  } finally {
    // Clean up temporary directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`🧹 Cleaned up temporary directory: ${tempDir}`);
    } catch (cleanupError) {
      console.warn(`⚠️  Failed to clean up temp directory: ${cleanupError.message}`);
    }
  }
}

// Extract captions using yt-dlp (system command)
async function extractCaptionsWithYtDlp(videoId, language = 'en') {
  console.log(`🎬 Extracting captions for video ${videoId} using yt-dlp...`);
  
  // Create temporary directory
  const tempDir = path.join(os.tmpdir(), `yt-dlp-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  try {
    // Check if yt-dlp is available
    await execAsync('yt-dlp --version');
    
    // Extract captions using yt-dlp
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const command = [
      'yt-dlp',
      '--write-auto-sub',
      '--write-sub',
      `--sub-lang ${language}`,
      '--sub-format srt',
      '--skip-download',
      '--output "%(title)s.%(ext)s"',
      `"${videoUrl}"`
    ].join(' ');
    
    console.log(`📥 Running command: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: tempDir,
      timeout: 30000 // 30 second timeout
    });
    
    console.log(`✅ yt-dlp completed successfully`);
    if (stderr) {
      console.log(`⚠️  yt-dlp stderr: ${stderr}`);
    }
    
    // Find downloaded SRT files
    const files = fs.readdirSync(tempDir);
    const srtFiles = files.filter(file => file.endsWith('.srt'));
    
    if (srtFiles.length === 0) {
      throw new Error('No SRT files found. The video may not have captions available.');
    }
    
    // Read the first SRT file
    const srtFile = srtFiles[0];
    const srtPath = path.join(tempDir, srtFile);
    const srtContent = fs.readFileSync(srtPath, 'utf8');
    
    console.log(`📝 Successfully extracted ${srtContent.length} characters of captions`);
    
    // Parse SRT content
    const parsedCaptions = parseSRTContent(srtContent);
    
    return {
      success: true,
      captions: parsedCaptions,
      rawSRT: srtContent,
      filename: srtFile
    };
    
  } catch (error) {
    console.error(`❌ Error extracting captions: ${error.message}`);
    
    if (error.message.includes('command not found')) {
      throw new Error('yt-dlp is not installed. Please install it using: brew install yt-dlp');
    }
    
    if (error.message.includes('timeout')) {
      throw new Error('Caption extraction timed out. The video may be too long or have network issues.');
    }
    
    throw new Error(`Failed to extract captions: ${error.message}`);
    
  } finally {
    // Clean up temporary directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`🧹 Cleaned up temporary directory: ${tempDir}`);
    } catch (cleanupError) {
      console.warn(`⚠️  Failed to clean up temp directory: ${cleanupError.message}`);
    }
  }
}

// Parse SRT content into structured format
function parseSRTContent(srtContent) {
  const lines = srtContent.split('\n');
  const subtitles = [];
  let currentSubtitle = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) {
      if (currentSubtitle) {
        subtitles.push(currentSubtitle);
        currentSubtitle = null;
      }
      continue;
    }
    
    // Check if line is a number (subtitle index)
    if (/^\d+$/.test(line)) {
      currentSubtitle = { index: parseInt(line) };
      continue;
    }
    
    // Check if line is a timestamp
    if (line.includes('-->')) {
      const [start, end] = line.split('-->').map(t => t.trim());
      if (currentSubtitle) {
        currentSubtitle.start = start;
        currentSubtitle.end = end;
      }
      continue;
    }
    
    // This must be subtitle text
    if (currentSubtitle) {
      if (currentSubtitle.text) {
        currentSubtitle.text += ' ' + line;
      } else {
        currentSubtitle.text = line;
      }
    }
  }
  
  // Add the last subtitle if exists
  if (currentSubtitle) {
    subtitles.push(currentSubtitle);
  }
  
  return subtitles;
}

// Convert parsed captions to the format expected by the frontend
function formatCaptionsForFrontend(captions) {
  return captions.map(caption => ({
    start: timeStringToSeconds(caption.start),
    dur: timeStringToSeconds(caption.end) - timeStringToSeconds(caption.start),
    text: caption.text.replace(/<[^>]*>/g, '').trim() // Remove HTML tags
  }));
}

// Convert SRT time format to seconds
function timeStringToSeconds(timeString) {
  // Format: 00:00:04,240
  const [time, milliseconds] = timeString.split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  
  return hours * 3600 + minutes * 60 + seconds + (parseInt(milliseconds) / 1000);
}

// Main function to get captions with multiple fallback methods
async function getCaptions(videoId, language = 'en') {
  try {
    console.log(`🎯 Getting captions for video ${videoId}...`);
    
    // Method 1: Try youtube-dl-exec first (works in production)
    if (youtubeDlExec) {
      try {
        console.log('🚀 Trying youtube-dl-exec...');
        const result = await extractCaptionsWithYoutubeDlExec(videoId, language);
        
        if (result.success && result.captions.length > 0) {
          const formattedCaptions = formatCaptionsForFrontend(result.captions);
          
          console.log(`✅ youtube-dl-exec success: ${formattedCaptions.length} caption entries`);
          
          return {
            success: true,
            captions: formattedCaptions,
            method: 'youtube-dl-exec',
            count: formattedCaptions.length
          };
        }
      } catch (youtubeDlExecError) {
        console.error('youtube-dl-exec failed:', youtubeDlExecError.message);
        console.log('🔄 Falling back to yt-dlp...');
      }
    }
    
    // Method 2: Try yt-dlp (system command)
    try {
      const result = await extractCaptionsWithYtDlp(videoId, language);
      
      if (result.success && result.captions.length > 0) {
        const formattedCaptions = formatCaptionsForFrontend(result.captions);
        
        console.log(`✅ yt-dlp success: ${formattedCaptions.length} caption entries`);
        
        return {
          success: true,
          captions: formattedCaptions,
          method: 'yt-dlp',
          count: formattedCaptions.length
        };
      }
    } catch (ytDlpError) {
      console.error('yt-dlp also failed:', ytDlpError.message);
    }
    
    throw new Error('All caption extraction methods failed');
    
  } catch (error) {
    console.error(`❌ Caption extraction failed: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      method: 'all-failed'
    };
  }
}

// Extract audio using yt-dlp
async function extractAudioWithYtDlp(videoId, outputDir = null) {
  console.log(`🎵 Extracting audio for video ${videoId} using yt-dlp...`);
  
  // Use provided output directory or create temporary one
  const tempDir = outputDir || path.join(os.tmpdir(), `yt-dlp-audio-${Date.now()}`);
  if (!outputDir) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  try {
    // Check if yt-dlp is available
    await execAsync('yt-dlp --version');
    
    // Extract audio using yt-dlp
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const outputTemplate = path.join(tempDir, `${videoId}.%(ext)s`);
    
    const command = [
      'yt-dlp',
      '--extract-audio',
      '--audio-format mp3',
      '--audio-quality 192K',
      '--no-playlist',
      `--output "${outputTemplate}"`,
      `"${videoUrl}"`
    ].join(' ');
    
    console.log(`📥 Running audio extraction command: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: tempDir,
      timeout: 120000 // 2 minute timeout for audio extraction
    });
    
    console.log(`✅ yt-dlp audio extraction completed successfully`);
    if (stderr) {
      console.log(`⚠️  yt-dlp stderr: ${stderr}`);
    }
    
    // Find downloaded audio file
    const files = fs.readdirSync(tempDir);
    const audioFiles = files.filter(file => 
      file.startsWith(videoId) && (file.endsWith('.mp3') || file.endsWith('.m4a') || file.endsWith('.webm'))
    );
    
    if (audioFiles.length === 0) {
      throw new Error('No audio file found. The video may not have extractable audio.');
    }
    
    // Return the first audio file
    const audioFile = audioFiles[0];
    const audioPath = path.join(tempDir, audioFile);
    const stats = fs.statSync(audioPath);
    
    console.log(`🎵 Successfully extracted audio: ${audioFile} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
    
    return {
      success: true,
      audioPath: audioPath,
      filename: audioFile,
      fileSize: stats.size,
      tempDir: outputDir ? null : tempDir // Only return tempDir if we created it
    };
    
  } catch (error) {
    console.error(`❌ Error extracting audio: ${error.message}`);
    
    if (error.message.includes('command not found')) {
      throw new Error('yt-dlp is not installed. Please install it using: brew install yt-dlp');
    }
    
    if (error.message.includes('timeout')) {
      throw new Error('Audio extraction timed out. The video may be too long or have network issues.');
    }
    
    throw new Error(`Failed to extract audio: ${error.message}`);
    
  } finally {
    // Clean up temporary directory only if we created it
    if (!outputDir) {
      try {
        // Don't clean up immediately - let the caller handle cleanup after using the file
        console.log(`📁 Audio extracted to temporary directory: ${tempDir}`);
      } catch (cleanupError) {
        console.warn(`⚠️  Note about temp directory: ${cleanupError.message}`);
      }
    }
  }
}

// Cleanup temporary directory
function cleanupTempDir(tempDir) {
  try {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`🧹 Cleaned up temporary directory: ${tempDir}`);
    }
  } catch (error) {
    console.warn(`⚠️  Failed to clean up temp directory: ${error.message}`);
  }
}

// Enhanced sentence boundary detection using AI analysis
function enhanceSentenceBoundaries(sentences) {
  console.log('🤖 Enhancing sentence boundaries with AI analysis...');
  
  return sentences.map((sentence, index) => {
    const nextSentence = sentences[index + 1];
    
    // Calculate natural pause duration based on sentence characteristics
    const pauseDuration = calculateNaturalPause(sentence, nextSentence);
    
    // Adjust sentence duration based on content analysis
    const adjustedDuration = adjustDurationForContent(sentence, pauseDuration);
    
    return {
      ...sentence,
      duration: adjustedDuration,
      originalDuration: sentence.duration,
      pauseDuration: pauseDuration,
      confidence: calculateConfidence(sentence)
    };
  });
}

// Calculate natural pause duration based on sentence characteristics
function calculateNaturalPause(sentence, nextSentence) {
  const text = sentence.text.trim();
  
  // Base pause duration (in seconds)
  let pauseDuration = 0.3;
  
  // Longer pause for sentence endings with punctuation
  if (text.endsWith('.') || text.endsWith('!') || text.endsWith('?')) {
    pauseDuration += 0.4;
  }
  
  // Shorter pause for commas or continuing thoughts
  if (text.endsWith(',') || text.endsWith(';') || text.endsWith(':')) {
    pauseDuration += 0.2;
  }
  
  // Longer pause for paragraph breaks or topic changes
  if (nextSentence && isTopicChange(sentence, nextSentence)) {
    pauseDuration += 0.6;
  }
  
  // Adjust based on sentence length (longer sentences need more processing time)
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 15) {
    pauseDuration += 0.2;
  }
  
  return pauseDuration;
}

// Adjust duration based on content analysis
function adjustDurationForContent(sentence, pauseDuration) {
  const text = sentence.text.trim();
  const wordCount = text.split(/\s+/).length;
  
  // Estimate speaking rate (words per minute)
  const averageWPM = 150; // Average English speaking rate
  const estimatedDuration = (wordCount / averageWPM) * 60; // Convert to seconds
  
  // Use the longer of: original duration or estimated duration
  const baseDuration = Math.max(sentence.duration, estimatedDuration);
  
  // Add natural pause
  const totalDuration = baseDuration + pauseDuration;
  
  // Apply content-based adjustments
  let adjustmentFactor = 1.0;
  
  // Slower for complex sentences
  if (text.includes(',') && text.includes('which') || text.includes('that')) {
    adjustmentFactor += 0.15; // 15% slower for complex sentences
  }
  
  // Slower for technical terms or difficult words
  if (hasComplexWords(text)) {
    adjustmentFactor += 0.1; // 10% slower for complex vocabulary
  }
  
  // Faster for simple, common phrases
  if (isSimplePhrase(text)) {
    adjustmentFactor -= 0.1; // 10% faster for simple phrases
  }
  
  return totalDuration * adjustmentFactor;
}

// Detect topic changes between sentences
function isTopicChange(sentence1, sentence2) {
  const text1 = sentence1.text.toLowerCase();
  const text2 = sentence2.text.toLowerCase();
  
  // Simple topic change indicators
  const topicChangeWords = ['now', 'next', 'however', 'meanwhile', 'furthermore', 'in addition', 'on the other hand'];
  
  return topicChangeWords.some(word => text2.startsWith(word));
}

// Check for complex words that might require slower speech
function hasComplexWords(text) {
  const complexWords = ['ということ', 'specifically', 'particularly', 'furthermore', 'nevertheless', 'consequently'];
  const words = text.toLowerCase().split(/\s+/);
  
  // Check for long words (>8 characters) or complex terms
  return words.some(word => word.length > 8 || complexWords.includes(word));
}

// Check for simple, common phrases
function isSimplePhrase(text) {
  const simplePatterns = [
    /^(yes|no|okay|alright|sure|of course)$/i,
    /^(hello|hi|hey|goodbye|bye)$/i,
    /^(thank you|thanks|please|sorry)$/i
  ];
  
  return simplePatterns.some(pattern => pattern.test(text.trim()));
}

// Calculate confidence score for the sentence boundary
function calculateConfidence(sentence) {
  const text = sentence.text.trim();
  let confidence = 0.5; // Base confidence
  
  // Higher confidence for sentences with clear punctuation
  if (text.endsWith('.') || text.endsWith('!') || text.endsWith('?')) {
    confidence += 0.3;
  }
  
  // Higher confidence for complete sentences
  if (text.split(/\s+/).length >= 3) {
    confidence += 0.2;
  }
  
  // Lower confidence for fragments or incomplete sentences
  if (text.length < 10 || !text.match(/[a-zA-Z]/)) {
    confidence -= 0.3;
  }
  
  return Math.max(0, Math.min(1, confidence));
}

module.exports = {
  getCaptions,
  extractCaptionsWithYtDlp,
  extractCaptionsWithYoutubeDlExec,
  parseSRTContent,
  formatCaptionsForFrontend,
  extractAudioWithYtDlp,
  cleanupTempDir,
  extractCaptionsWithAPI,
  mergeCaptionsIntoSentences,
  enhanceSentenceBoundaries
}; 