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

module.exports = {
  getCaptions,
  extractCaptionsWithYtDlp,
  extractCaptionsWithYoutubeDlExec,
  parseSRTContent,
  formatCaptionsForFrontend,
  extractAudioWithYtDlp,
  cleanupTempDir
}; 