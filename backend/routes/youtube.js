const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { getSubtitles } = require('youtube-captions-scraper');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const natural = require('natural');
const ytdl = require('@distube/ytdl-core');
const s3Service = require('../services/s3Service');
const youtubeCaptions = require('../services/youtube-captions');

// Create audio directory if it doesn't exist
const audioDir = path.join(__dirname, '..', 'public', 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// Initialize YouTube API
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

// Initialize OpenAI (if API key is provided)
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Removed Python transcript function - using Node.js only approach

// Function to split text into sentences using Natural.js
const splitTextWithNatural = async (fullText, timestamps) => {
  try {
    // Natural.js sentence tokenizer correct usage
    const tokenizer = new natural.SentenceTokenizer();
    const sentences = tokenizer.tokenize(fullText);
    
    if (!sentences || sentences.length === 0) {
      return null;
    }
    
    // Map timing information to each sentence
    const result = [];
    let textIndex = 0;
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence.length < 5) continue; // Exclude sentences that are too short
      
      // Find where the current sentence is located in the full text
      const sentenceStart = fullText.indexOf(sentence, textIndex);
      const sentenceEnd = sentenceStart + sentence.length;
      
      // Calculate timestamps (approximate mapping)
      const progress = sentenceStart / fullText.length;
      const endProgress = sentenceEnd / fullText.length;
      
      const totalDuration = timestamps.length > 0 ? 
        timestamps[timestamps.length - 1].start + (timestamps[timestamps.length - 1].dur || 0) : 
        100;
      
      const startTime = progress * totalDuration;
      const endTime = endProgress * totalDuration;
      
      result.push({
        text: sentence,
        start: Math.max(0, startTime),
        end: Math.min(totalDuration, endTime),
        duration: Math.max(1, endTime - startTime)
      });
      
      textIndex = sentenceEnd;
    }
    
    return result;
  } catch (error) {
    console.error('Natural.js processing error:', error);
    return null;
  }
};

// Removed complex AI functions to simplify processing and avoid timeouts

// Function to map split sentences to original transcript timing
const mapCorrectedSentencesToTiming = (splitSentences, transcript, originalText) => {
  const result = [];
  
  console.log(`🔍 Mapping ${splitSentences.length} split sentences to original timing...`);
  
  // Create word-level mapping between original and split text
  const originalWords = originalText.toLowerCase().split(/\s+/);
  const splitText = splitSentences.join(' ').toLowerCase();
  const splitWords = splitText.split(/\s+/);
  
  console.log(`📊 Original: ${originalWords.length} words, Split: ${splitWords.length} words`);
  
  let originalWordIndex = 0;
  let splitWordIndex = 0;
  
  for (let i = 0; i < splitSentences.length; i++) {
    const sentence = splitSentences[i].trim();
    const sentenceWords = sentence.toLowerCase().split(/\s+/);
    const sentenceStartWordIndex = splitWordIndex;
    const sentenceEndWordIndex = splitWordIndex + sentenceWords.length;
    
    // Find approximate timing by mapping to original words
    let startTime = null;
    let endTime = null;
    
    // Try to find similar words in original text for timing
    let bestMatchStart = originalWordIndex;
    let bestMatchEnd = Math.min(originalWordIndex + sentenceWords.length, originalWords.length);
    
    // Simple matching since text should be preserved exactly
    for (let j = Math.max(0, originalWordIndex - 2); j < Math.min(originalWords.length - sentenceWords.length + 1, originalWordIndex + 5); j++) {
      let matchScore = 0;
      for (let k = 0; k < Math.min(sentenceWords.length, originalWords.length - j); k++) {
        const splitWord = sentenceWords[k];
        const originalWord = originalWords[j + k];
        
        // Check for exact match (should be exact since we preserve original text)
        if (splitWord === originalWord) {
          matchScore++;
        }
      }
      
      if (matchScore > (sentenceWords.length * 0.8)) { // At least 80% match since text is preserved
        bestMatchStart = j;
        bestMatchEnd = j + sentenceWords.length;
        break;
      }
    }
    
    // Map word positions to transcript timing
    const { start: mappedStart, end: mappedEnd } = mapWordsToTranscriptTiming(
      bestMatchStart, 
      Math.min(bestMatchEnd, originalWords.length), 
      originalWords, 
      transcript
    );
    
    startTime = mappedStart;
    endTime = mappedEnd;
    
    // Ensure minimum duration
    const duration = Math.max(0.5, endTime - startTime);
    
    result.push({
      text: sentence,
      start: Math.max(0, startTime),
      end: endTime,
      duration: duration,
      originalWords: originalWords.slice(bestMatchStart, bestMatchEnd).join(' '),
      splitWords: sentenceWords.join(' ')
    });
    
    splitWordIndex = sentenceEndWordIndex;
    originalWordIndex = bestMatchEnd;
    
    console.log(`📍 Sentence ${i + 1}: "${sentence.substring(0, 40)}..."`);
    console.log(`   ⏰ Timing: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`);
    console.log(`   🔄 Original: "${originalWords.slice(bestMatchStart, bestMatchEnd).join(' ')}"`);
  }
  
  console.log(`✅ Successfully mapped ${result.length} split sentences`);
  return result;
};

// Helper function to calculate Levenshtein distance
const levenshteinDistance = (str1, str2) => {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
};

// Helper function to map word range to transcript timing
const mapWordsToTranscriptTiming = (startWordIndex, endWordIndex, originalWords, transcript) => {
  let currentWordIndex = 0;
  let startTime = 0;
  let endTime = 0;
  
  for (let i = 0; i < transcript.length; i++) {
    const segment = transcript[i];
    const segmentWords = segment.text.toLowerCase().split(/\s+/);
    const segmentStart = segment.start;
    const segmentDuration = segment.dur || segment.duration || 0;
    const segmentEnd = segmentStart + segmentDuration;
    
    // Check if our target word range overlaps with this segment
    if (currentWordIndex <= startWordIndex && startWordIndex < currentWordIndex + segmentWords.length) {
      // Start time is in this segment
      const wordPositionInSegment = startWordIndex - currentWordIndex;
      startTime = segmentStart + (wordPositionInSegment / segmentWords.length) * segmentDuration;
    }
    
    if (currentWordIndex < endWordIndex && endWordIndex <= currentWordIndex + segmentWords.length) {
      // End time is in this segment
      const wordPositionInSegment = endWordIndex - currentWordIndex;
      endTime = segmentStart + (wordPositionInSegment / segmentWords.length) * segmentDuration;
      break;
    } else if (currentWordIndex < endWordIndex) {
      // End time extends beyond this segment
      endTime = segmentEnd;
    }
    
    currentWordIndex += segmentWords.length;
  }
  
  return { start: startTime, end: endTime };
};

// Function to map AI-generated sentences to original transcript timing (legacy)
const mapSentencesToTiming = (aiSentences, transcript) => {
  const result = [];
  const fullText = transcript.map(entry => entry.text).join(' ');
  
  console.log(`🔍 Mapping ${aiSentences.length} AI sentences to transcript timing...`);
  
  let searchStartIndex = 0;
  
  for (let i = 0; i < aiSentences.length; i++) {
    const sentence = aiSentences[i].trim();
    
    // Find sentence position in full text
    const sentenceStart = fullText.indexOf(sentence, searchStartIndex);
    if (sentenceStart === -1) {
      console.warn(`❌ Could not find sentence: "${sentence.substring(0, 30)}..."`);
      continue;
    }
    
    const sentenceEnd = sentenceStart + sentence.length;
    
    // Find which transcript segments contain this sentence
    let startTime = null;
    let endTime = null;
    let currentPos = 0;
    let foundSegments = [];
    
    for (let j = 0; j < transcript.length; j++) {
      const segment = transcript[j];
      const segmentTextStart = currentPos;
      const segmentTextEnd = currentPos + segment.text.length;
      
      // Check if this segment overlaps with our sentence
      const overlapStart = Math.max(sentenceStart, segmentTextStart);
      const overlapEnd = Math.min(sentenceEnd, segmentTextEnd);
      
      if (overlapStart < overlapEnd) {
        // This segment contains part of our sentence
        const segmentStart = segment.start;
        const segmentDuration = segment.dur || segment.duration || 0;
        const segmentEnd = segmentStart + segmentDuration;
        
        // Calculate precise timing within this segment
        const overlapStartInSegment = overlapStart - segmentTextStart;
        const overlapEndInSegment = overlapEnd - segmentTextStart;
        const segmentTextLength = segment.text.length;
        
        const preciseStart = segmentStart + (overlapStartInSegment / segmentTextLength) * segmentDuration;
        const preciseEnd = segmentStart + (overlapEndInSegment / segmentTextLength) * segmentDuration;
        
        foundSegments.push({
          segmentIndex: j,
          segmentText: segment.text,
          overlapText: sentence.substring(overlapStart - sentenceStart, overlapEnd - sentenceStart),
          preciseStart: preciseStart,
          preciseEnd: preciseEnd
        });
        
        // Set sentence boundaries
        if (startTime === null) {
          startTime = preciseStart;
        }
        endTime = preciseEnd;
      }
      
      currentPos = segmentTextEnd + 1; // +1 for space
    }
    
    // Fallback if no segments found
    if (startTime === null || endTime === null) {
      console.warn(`⚠️ No segments found for sentence, using proportional timing`);
      const progress = sentenceStart / fullText.length;
      const endProgress = sentenceEnd / fullText.length;
      const totalDuration = transcript.length > 0 ? 
        transcript[transcript.length - 1].start + (transcript[transcript.length - 1].dur || 0) : 
        100;
      
      startTime = progress * totalDuration;
      endTime = endProgress * totalDuration;
    }
    
    const duration = Math.max(0.5, endTime - startTime); // Minimum 0.5 seconds
    
    result.push({
      text: sentence,
      start: Math.max(0, startTime),
      end: endTime,
      duration: duration
    });
    
    searchStartIndex = sentenceEnd;
    
    console.log(`📍 Sentence ${i + 1}: "${sentence.substring(0, 40)}..."`);
    console.log(`   ⏰ Timing: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s (${duration.toFixed(2)}s)`);
    console.log(`   📊 Segments: ${foundSegments.length} segments involved`);
    
    // Log segment details for debugging
    foundSegments.forEach((seg, idx) => {
      console.log(`      Segment ${seg.segmentIndex}: "${seg.overlapText}" (${seg.preciseStart.toFixed(2)}s - ${seg.preciseEnd.toFixed(2)}s)`);
    });
  }
  
  console.log(`✅ Successfully mapped ${result.length} sentences with precise timing`);
  return result;
};

// Function to split text into sentences using AI (legacy)
const splitTextWithAI = async (fullText, timestamps) => {
  if (!openai) {
    console.log('OpenAI API key not provided, using fallback method');
    return null;
  }

  try {
    const prompt = `Split the following transcript text into natural, complete sentences. Each sentence should be on a separate line. Keep the original text exactly as is, just add line breaks between sentences:

${fullText}`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that splits text into natural sentences. Return only the split text with each sentence on a new line, preserving the original text exactly."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.1,
    });

    const splitText = response.choices[0].message.content.trim();
    const sentences = splitText.split('\n').filter(s => s.trim().length > 0);
    
    // Map sentences to timestamps
    const result = [];
    let currentIndex = 0;
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      const startTime = timestamps[Math.min(currentIndex, timestamps.length - 1)]?.start || 0;
      const endTime = timestamps[Math.min(currentIndex + Math.ceil(sentence.length / 20), timestamps.length - 1)]?.end || startTime + 3;
      
      result.push({
        text: sentence,
        start: startTime,
        end: endTime,
        duration: endTime - startTime
      });
      
      currentIndex += Math.ceil(sentence.length / 20);
    }
    
    return result;
  } catch (error) {
    console.error('OpenAI API error:', error);
    return null;
  }
};

// Function to merge transcript segments into natural sentences
const mergeIntoSentences = (transcript) => {
  if (!transcript || transcript.length === 0) return [];
  
  const sentences = [];
  let currentSentence = {
    text: '',
    start: transcript[0].start,
    end: transcript[0].start + (transcript[0].dur || transcript[0].duration || 0),
    duration: 0
  };
  
  for (let i = 0; i < transcript.length; i++) {
    const segment = transcript[i];
    const text = segment.text.trim();
    
    // Add current segment to the sentence
    currentSentence.text += (currentSentence.text ? ' ' : '') + text;
    currentSentence.end = segment.start + (segment.dur || segment.duration || 0);
    currentSentence.duration = currentSentence.end - currentSentence.start;
    
    // Check various conditions for sentence ending
    const endsWithPunctuation = /[.!?]$/.test(text);
    const endsWithComma = /,$/.test(text);
    const isLastSegment = i === transcript.length - 1;
    const nextSegmentStartsCapital = i < transcript.length - 1 && 
      /^[A-Z]/.test(transcript[i + 1].text.trim());
    const nextSegmentStartsConjunction = i < transcript.length - 1 && 
      /^(And|But|So|However|Therefore|Meanwhile|After|Before|Since|While|Although|Because)\s/.test(transcript[i + 1].text.trim());
    
    // More natural sentence splitting
    const shouldSplit = endsWithPunctuation || 
                       isLastSegment || 
                       (endsWithComma && nextSegmentStartsCapital) ||
                       (endsWithComma && nextSegmentStartsConjunction) ||
                       (currentSentence.text.length > 40 && nextSegmentStartsCapital) ||
                       (currentSentence.text.length > 60);
    
    if (shouldSplit) {
      // Only add if sentence has meaningful content
      if (currentSentence.text.length > 5) {
        sentences.push({
          text: currentSentence.text.trim(),
          start: currentSentence.start,
          end: currentSentence.end,
          duration: currentSentence.duration
        });
      }
      
      // Start new sentence if not the last segment
      if (!isLastSegment) {
        const nextSegment = transcript[i + 1];
        currentSentence = {
          text: '',
          start: nextSegment.start,
          end: nextSegment.start + (nextSegment.dur || nextSegment.duration || 0),
          duration: 0
        };
      }
    }
  }
  
  return sentences;
};

// Function to convert WebM to MP3 using FFmpeg
const convertWebMToMP3 = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    console.log(`Converting ${inputPath} to ${outputPath}`);
    
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,           // Input file
      '-vn',                     // No video
      '-ar', '44100',           // Audio sample rate
      '-ac', '2',               // Audio channels (stereo)
      '-b:a', '192k',           // Audio bitrate
      '-f', 'mp3',              // Output format
      '-y',                     // Overwrite output file if exists
      outputPath                // Output file
    ]);

    let errorOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log(`Successfully converted to MP3: ${outputPath}`);
        // Clean up the original WebM file
        if (fs.existsSync(inputPath)) {
          fs.unlinkSync(inputPath);
          console.log(`Cleaned up WebM file: ${inputPath}`);
        }
        resolve();
      } else {
        console.error(`FFmpeg conversion failed with code ${code}`);
        console.error('FFmpeg error output:', errorOutput);
        reject(new Error(`FFmpeg conversion failed: ${errorOutput}`));
      }
    });

    ffmpeg.on('error', (error) => {
      console.error('FFmpeg spawn error:', error);
      reject(error);
    });
  });
};

// Helper function to parse ISO 8601 duration to seconds
const parseDurationToSeconds = (duration) => {
  if (!duration) return null;
  
  // Parse ISO 8601 duration format (PT1M30S = 1 minute 30 seconds)
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  
  return hours * 3600 + minutes * 60 + seconds;
};

// Helper function to format seconds to readable duration
const formatDuration = (seconds) => {
  if (!seconds) return 'Unknown';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
};

// Search YouTube videos with 10-minute filter and relevance sorting
router.get('/search', async (req, res) => {
  try {
    const { query, maxResults = 20 } = req.query; // Increased to filter more
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log(`🔍 Searching for: "${query}" (max ${maxResults} results, filtering for ≤10min videos)`);

    // Step 1: Search with relevance order for better accuracy
    const searchResponse = await youtube.search.list({
      part: 'snippet',
      q: query,
      maxResults: parseInt(maxResults) * 2, // Get more results to filter
      type: 'video',
      order: 'relevance', // Changed to relevance for accuracy
      relevanceLanguage: 'en', // English videos
      videoDuration: 'medium', // Medium videos (4-20 minutes)
      videoCaption: 'closedCaption' // Only videos with captions
    });

    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      return res.json({ videos: [] });
    }

    // Step 2: Get detailed info including duration for each video
    const videoIds = searchResponse.data.items.map(item => item.id.videoId);
    
    const detailsResponse = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      id: videoIds.join(',')
    });

    // Step 3: Filter and process videos
    const filteredVideos = [];
    
    for (const video of detailsResponse.data.items) {
      const durationSeconds = parseDurationToSeconds(video.contentDetails.duration);
      
      // Filter: Only videos 10 minutes (600 seconds) or less
      if (durationSeconds && durationSeconds <= 600) {
        const videoInfo = {
          id: video.id,
          title: video.snippet.title,
          description: video.snippet.description,
          thumbnail: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url,
          channelTitle: video.snippet.channelTitle,
          publishedAt: video.snippet.publishedAt,
          duration: formatDuration(durationSeconds),
          durationSeconds: durationSeconds,
          viewCount: parseInt(video.statistics.viewCount || 0),
          likeCount: parseInt(video.statistics.likeCount || 0)
        };
        
        filteredVideos.push(videoInfo);
      }
    }

    // Step 4: Sort by relevance factors (view count, like ratio, recency)
    filteredVideos.sort((a, b) => {
      // Calculate relevance score
      const scoreA = calculateRelevanceScore(a, query);
      const scoreB = calculateRelevanceScore(b, query);
      
      return scoreB - scoreA; // Higher score first
    });

    // Step 5: Limit to requested results
    const finalVideos = filteredVideos.slice(0, parseInt(maxResults));
    
    console.log(`✅ Found ${filteredVideos.length} videos ≤10min, returning top ${finalVideos.length}`);
    
    res.json({ 
      videos: finalVideos,
      totalFound: filteredVideos.length,
      filtered: true,
      maxDuration: '10:00'
    });
    
  } catch (error) {
    console.error('❌ YouTube search error:', error);
    res.status(500).json({ error: 'Failed to search YouTube videos' });
  }
});

// Helper function to calculate relevance score
const calculateRelevanceScore = (video, searchQuery) => {
  let score = 0;
  
  const query = searchQuery.toLowerCase();
  const title = video.title.toLowerCase();
  const description = video.description.toLowerCase();
  
  // Title relevance (highest weight)
  if (title.includes(query)) score += 100;
  const titleWords = query.split(' ');
  titleWords.forEach(word => {
    if (title.includes(word)) score += 20;
  });
  
  // Description relevance
  if (description.includes(query)) score += 50;
  titleWords.forEach(word => {
    if (description.includes(word)) score += 10;
  });
  
  // View count factor (logarithmic to prevent bias toward viral videos)
  if (video.viewCount > 0) {
    score += Math.log10(video.viewCount) * 5;
  }
  
  // Duration preference (5-7 minutes is ideal for learning)
  const idealDuration = 360; // 6 minutes
  const durationDiff = Math.abs(video.durationSeconds - idealDuration);
  const durationScore = Math.max(0, 20 - (durationDiff / 30)); // Penalty for being far from ideal
  score += durationScore;
  
  // Recency bonus (newer videos get slight boost)
  const publishDate = new Date(video.publishedAt);
  const daysSincePublish = (Date.now() - publishDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePublish < 365) { // Videos less than 1 year old
    score += Math.max(0, 10 - (daysSincePublish / 36.5)); // Max 10 points for very recent
  }
  
  return score;
};

// Get video details
router.get('/video/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const response = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      id: videoId
    });

    if (!response.data.items.length) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const video = response.data.items[0];
    const videoDetails = {
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail: video.snippet.thumbnails.high.url,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      duration: video.contentDetails.duration,
      viewCount: video.statistics.viewCount,
      likeCount: video.statistics.likeCount
    };

    res.json({ video: videoDetails });
  } catch (error) {
    console.error('Video details error:', error);
    res.status(500).json({ error: 'Failed to get video details' });
  }
});

// Get video transcript (Node.js only)
router.get('/transcript/:videoId', async (req, res) => {
  const { videoId } = req.params;
  let transcript = [];
  try {
    // Try Node.js method only
    transcript = await getSubtitles({ videoID: videoId, lang: 'en' });
    if (!transcript.length) {
      transcript = await getSubtitles({ videoID: videoId, lang: 'a.en' });
    }
    
    if (!transcript.length) {
      return res.status(404).json({ 
        error: 'No English captions found for this video.',
        details: 'This video may not have English subtitles'
      });
    }
    
    res.json({
      transcript,
      fullScript: transcript.map(entry => entry.text).join(' '),
      totalDuration: transcript.length > 0 ? transcript[transcript.length - 1].start : 0
    });
  } catch (error) {
    console.error('Transcript error:', error);
    res.status(500).json({ error: 'Failed to get video transcript', details: error.message || error });
  }
});

// Get video transcript with timing for practice (yt-dlp priority version)
router.get('/transcript-practice/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    console.log(`🎯 Getting practice transcript for video: ${videoId}`);
    
    // Step 1: Try yt-dlp first (most reliable)
    try {
      console.log('🚀 Trying yt-dlp for caption extraction...');
      const ytDlpResult = await youtubeCaptions.getCaptions(videoId, 'en');
      
      if (ytDlpResult.success && ytDlpResult.captions.length > 0) {
        console.log(`✅ yt-dlp success: ${ytDlpResult.captions.length} caption entries`);
        
        // Merge captions into sentences
        const sentences = mergeIntoSentences(ytDlpResult.captions);
        console.log(`📄 Merged into ${sentences.length} sentences`);
        
        return res.json({
          sentences,
          totalDuration: sentences.length > 0 ? sentences[sentences.length - 1].end : 0,
          processed: true,
          source: 'yt-dlp',
          captionCount: ytDlpResult.captions.length
        });
      }
    } catch (ytDlpError) {
      console.error('yt-dlp failed:', ytDlpError.message);
      console.log('🔄 Falling back to YouTube Data API v3...');
    }
    
    // Step 2: Fallback to YouTube Data API v3
    let captionTracks = [];
    try {
      const captionsResponse = await youtube.captions.list({
        part: 'snippet',
        videoId: videoId
      });
      
      captionTracks = captionsResponse.data.items || [];
      console.log(`📝 Found ${captionTracks.length} caption tracks`);
      
      // Find English captions (prefer manual over auto-generated)
      const manualEnglish = captionTracks.find(track => 
        track.snippet.language === 'en' && track.snippet.trackKind === 'standard'
      );
      const autoEnglish = captionTracks.find(track => 
        track.snippet.language === 'en' && track.snippet.trackKind === 'ASR'
      );
      
      const selectedTrack = manualEnglish || autoEnglish;
      
      if (!selectedTrack) {
        console.log('❌ No English captions found');
        return res.status(404).json({ 
          error: 'No English subtitles available',
          details: 'This video does not have English subtitles or auto-generated captions. Please try a different video with English subtitles.',
          videoId: videoId,
          suggestion: 'Look for videos with the "CC" (closed captions) icon or try searching for videos from English-speaking channels.',
          availableTracks: captionTracks.map(track => ({
            language: track.snippet.language,
            name: track.snippet.name,
            kind: track.snippet.trackKind
          }))
        });
      }
      
      console.log(`✅ Using ${selectedTrack.snippet.trackKind} English captions`);
      
      // Step 3: Download caption content
      const captionId = selectedTrack.id;
      const captionDownloadResponse = await youtube.captions.download({
        id: captionId,
        tfmt: 'srt' // SubRip format
      });
      
      const srtContent = captionDownloadResponse.data;
      console.log(`📄 Downloaded SRT content (${srtContent.length} characters)`);
      
      // Step 4: Parse SRT to extract timing and text
      const transcript = parseSRTContent(srtContent);
      console.log(`🔄 Parsed ${transcript.length} subtitle segments`);
      
      if (transcript.length === 0) {
        return res.status(404).json({ 
          error: 'Empty subtitles',
          details: 'The subtitle file was downloaded but appears to be empty.',
          videoId: videoId
        });
      }
      
      // Step 5: Merge into sentences
      const sentences = mergeIntoSentences(transcript);
      console.log(`📄 Merged into ${sentences.length} sentences`);
      
      res.json({
        sentences,
        totalDuration: sentences.length > 0 ? sentences[sentences.length - 1].end : 0,
        processed: true,
        source: 'youtube-api',
        captionType: selectedTrack.snippet.trackKind,
        language: selectedTrack.snippet.language
      });
      
    } catch (apiError) {
      console.error('YouTube Data API error:', apiError.message);
      
      // Step 3: Final fallback to youtube-captions-scraper
      console.log('🔄 Final fallback to youtube-captions-scraper...');
      try {
        let transcript = await getSubtitles({ videoID: videoId, lang: 'en' });
        if (!transcript.length) {
          transcript = await getSubtitles({ videoID: videoId, lang: 'a.en' });
        }
        
        if (transcript.length > 0) {
          console.log(`✅ Fallback success: ${transcript.length} entries`);
          const sentences = mergeIntoSentences(transcript);
          
          return res.json({
            sentences,
            totalDuration: sentences.length > 0 ? sentences[sentences.length - 1].end : 0,
            processed: true,
            source: 'youtube-scraper'
          });
        }
      } catch (fallbackError) {
        console.error('Final fallback also failed:', fallbackError.message);
      }
      
      return res.status(404).json({ 
        error: 'No English subtitles available',
        details: 'This video does not have English subtitles or auto-generated captions. All extraction methods failed. Please try a different video with English subtitles.',
        videoId: videoId,
        suggestion: 'Look for videos with the "CC" (closed captions) icon or try searching for videos from English-speaking channels.',
        methods: {
          ytDlp: 'Failed',
          youtubeApi: apiError.message,
          scraper: 'Failed'
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Practice transcript error:', error);
    res.status(500).json({ 
      error: 'Failed to get practice transcript', 
      details: error.message || 'Unknown error occurred',
      videoId: req.params.videoId
    });
  }
});

// Helper function to parse SRT content
function parseSRTContent(srtContent) {
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
            dur: endTime - startTime,
            duration: endTime - startTime
          });
        }
      }
    }
  }
  
  return transcript;
}

// Download and serve audio file for a video with S3 integration
router.get('/audio/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const audioFileName = `${videoId}.mp3`;
    const audioFilePath = path.join(audioDir, audioFileName);
    
    console.log(`Attempting to get audio for video: ${videoId}`);
    
    // Step 1: Check if audio file exists in S3
    const existsInS3 = await s3Service.audioFileExists(videoId);
    if (existsInS3) {
      console.log(`Audio file found in S3: ${audioFileName}`);
      const s3Url = await s3Service.getAudioFileUrl(videoId, 3600); // 1 hour expiry
      return res.json({
        audioUrl: s3Url,
        duration: 'unknown',
        title: 'S3 Cached Audio',
        format: {
          bitrate: '192k',
          codec: 'mp3',
          container: 'mp3'
        },
        fileSize: 'unknown',
        cached: true,
        source: 's3'
      });
    }
    
    // Step 2: Check if audio file exists locally
    if (fs.existsSync(audioFilePath)) {
      console.log(`Audio file found locally: ${audioFileName}`);
      
      try {
        // Upload existing local file to S3
        await s3Service.uploadAudioFile(videoId, audioFilePath);
        console.log(`Local file uploaded to S3: ${audioFileName}`);
        
        // Get S3 URL and return it
        const s3Url = await s3Service.getAudioFileUrl(videoId, 3600);
        
        // Optionally clean up local file to save space
        // s3Service.cleanupLocalFile(audioFilePath);
        
        return res.json({
          audioUrl: s3Url,
          duration: 'unknown',
          title: 'Migrated to S3',
          format: {
            bitrate: '192k',
            codec: 'mp3',
            container: 'mp3'
          },
          fileSize: 'unknown',
          cached: true,
          source: 's3'
        });
      } catch (s3Error) {
        console.error('Failed to upload to S3, serving local file:', s3Error);
        // Fallback to local serving if S3 upload fails
        const stats = fs.statSync(audioFilePath);
        return res.json({
          audioUrl: `/audio/${audioFileName}`,
          duration: 'unknown',
          title: 'Local Cached Audio',
          format: {
            bitrate: '192k',
            codec: 'mp3',
            container: 'mp3'
          },
          fileSize: stats.size,
          cached: true,
          source: 'local'
        });
      }
    }

    // Step 2.5: Check if old WebM file exists and convert it
    const oldWebMPath = path.join(audioDir, `${videoId}.webm`);
    if (fs.existsSync(oldWebMPath)) {
      console.log(`Found old WebM file, converting to MP3: ${oldWebMPath}`);
      
      try {
        // Convert existing WebM to MP3
        await convertWebMToMP3(oldWebMPath, audioFilePath);
        console.log(`Converted old WebM to MP3: ${audioFilePath}`);
        
        const stats = fs.statSync(audioFilePath);
        
        try {
          // Upload converted MP3 to S3
          await s3Service.uploadAudioFile(videoId, audioFilePath);
          console.log(`Converted MP3 uploaded to S3: ${audioFileName}`);
          
          // Get S3 URL
          const s3Url = await s3Service.getAudioFileUrl(videoId, 3600);
          
          return res.json({
            audioUrl: s3Url,
            duration: 'unknown',
            title: 'Converted from WebM',
            format: {
              bitrate: '192k',
              codec: 'mp3',
              container: 'mp3'
            },
            fileSize: stats.size,
            cached: true,
            source: 's3'
          });
        } catch (s3Error) {
          console.error('Failed to upload converted MP3 to S3:', s3Error);
          // Fallback to local serving
          return res.json({
            audioUrl: `/audio/${audioFileName}`,
            duration: 'unknown',
            title: 'Converted from WebM (Local)',
            format: {
              bitrate: '192k',
              codec: 'mp3',
              container: 'mp3'
            },
            fileSize: stats.size,
            cached: true,
            source: 'local'
          });
        }
      } catch (conversionError) {
        console.error('Failed to convert old WebM file:', conversionError);
        // Continue to download new file
      }
    }
    
    // Step 3: Download new audio file
    if (!ytdl.validateURL(videoUrl)) {
      return res.status(400).json({ 
        error: 'Invalid YouTube URL',
        details: 'The provided video ID is not valid for YouTube.',
        videoId: videoId
      });
    }
    
    // Get video info with faster timeout
    console.log('⏰ Getting video info...');
    let info;
    try {
      info = await ytdl.getInfo(videoUrl, {
        requestOptions: {
          timeout: 10000 // Reduced to 10 seconds
        }
      });
    } catch (infoError) {
      console.error('Failed to get video info:', infoError.message);
      return res.status(404).json({ 
        error: 'Video not accessible',
        details: 'This video may be private, age-restricted, or not available in your region. Please try a different video.',
        videoId: videoId,
        suggestion: 'Try searching for publicly available videos without age restrictions.'
      });
    }
    
    console.log(`Video info retrieved: ${info.videoDetails.title}`);
    
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    
    if (audioFormats.length === 0) {
      return res.status(404).json({ 
        error: 'No audio format available',
        details: 'This video does not have extractable audio formats. The video may be protected or have restricted access.',
        videoId: videoId,
        suggestion: 'Try a different video that allows audio extraction.'
      });
    }
    
    // Choose a good balance between quality and speed
    const bestAudio = audioFormats.find(format => 
      format.container === 'mp4' && parseInt(format.audioBitrate) >= 128
    ) || audioFormats.find(format => 
      parseInt(format.audioBitrate) >= 128
    ) || audioFormats[0];
    
    console.log(`Downloading audio: ${bestAudio.audioCodec} at ${bestAudio.audioBitrate}kbps`);
    
    // Create temporary WebM file path for download
    const tempWebMPath = path.join(audioDir, `${videoId}_temp.webm`);
    
    // Download audio file with optimized settings
    console.log('📥 Starting audio download...');
    const audioStream = ytdl(videoUrl, {
      filter: 'audioonly',
      quality: 'highestaudio',
      requestOptions: {
        timeout: 45000, // Increased timeout for download
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    });
    
    const writeStream = fs.createWriteStream(tempWebMPath);
    
    const downloadPromise = new Promise((resolve, reject) => {
      let downloadStartTime = Date.now();
      let downloadedBytes = 0;
      
      audioStream.pipe(writeStream);
      
      // Progress tracking
      audioStream.on('progress', (chunkLength) => {
        downloadedBytes += chunkLength;
        const elapsed = (Date.now() - downloadStartTime) / 1000;
        const speed = (downloadedBytes / 1024 / 1024 / elapsed).toFixed(2);
        console.log(`📊 Download progress: ${(downloadedBytes / 1024 / 1024).toFixed(2)}MB at ${speed}MB/s`);
      });
      
      audioStream.on('error', (error) => {
        console.error('❌ Audio stream error:', error);
        if (fs.existsSync(tempWebMPath)) {
          fs.unlinkSync(tempWebMPath);
        }
        reject(error);
      });
      
      writeStream.on('error', (error) => {
        console.error('❌ Write stream error:', error);
        if (fs.existsSync(tempWebMPath)) {
          fs.unlinkSync(tempWebMPath);
        }
        reject(error);
      });
      
      writeStream.on('finish', async () => {
        console.log(`WebM file downloaded successfully: ${tempWebMPath}`);
        
        try {
          // Convert WebM to MP3
          await convertWebMToMP3(tempWebMPath, audioFilePath);
          console.log(`Audio conversion completed: ${audioFilePath}`);
          
          const stats = fs.statSync(audioFilePath);
          
          try {
            // Upload MP3 to S3 after successful conversion
            await s3Service.uploadAudioFile(videoId, audioFilePath);
            console.log(`MP3 file uploaded to S3: ${audioFileName}`);
            
            // Get S3 URL
            const s3Url = await s3Service.getAudioFileUrl(videoId, 3600);
            
            // Clean up local file to save space (optional)
            // s3Service.cleanupLocalFile(audioFilePath);
            
            resolve({
              audioUrl: s3Url,
              duration: info.videoDetails.lengthSeconds,
              title: info.videoDetails.title,
              format: {
                bitrate: '192k',
                codec: 'mp3',
                container: 'mp3'
              },
              fileSize: stats.size,
              cached: false,
              source: 's3'
            });
          } catch (s3Error) {
            console.error('S3 upload failed, serving local file:', s3Error);
            // Fallback to local serving if S3 upload fails
            resolve({
              audioUrl: `/audio/${audioFileName}`,
              duration: info.videoDetails.lengthSeconds,
              title: info.videoDetails.title,
              format: {
                bitrate: '192k',
                codec: 'mp3',
                container: 'mp3'
              },
              fileSize: stats.size,
              cached: false,
              source: 'local'
            });
          }
        } catch (conversionError) {
          console.error('Audio conversion failed:', conversionError);
          // Clean up temp file
          if (fs.existsSync(tempWebMPath)) {
            fs.unlinkSync(tempWebMPath);
          }
          reject(conversionError);
        }
      });
    });
    
    // Handle the promise and send response
    try {
      const result = await downloadPromise;
      res.json(result);
    } catch (downloadError) {
      console.error('❌ Download process failed:', downloadError);
      return res.status(500).json({
        error: 'Audio download failed',
        details: downloadError.message,
        videoId: videoId,
        suggestion: 'This video may not support audio extraction or may be region-restricted.'
      });
    }
    
  } catch (error) {
    console.error('Audio download error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      videoId: req.params.videoId
    });
    res.status(500).json({ 
      error: 'Failed to download audio', 
      details: error.message,
      videoId: req.params.videoId
    });
  }
});

// Debug endpoint to test if latest code is deployed
router.get('/debug/test', (req, res) => {
  res.json({
    message: 'Latest code is deployed!',
    timestamp: new Date().toISOString(),
    version: '2025-07-05-v2',
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      hasYouTubeAPI: !!process.env.YOUTUBE_API_KEY,
      hasOpenAI: !!process.env.OPENAI_API_KEY
    }
  });
});

module.exports = router;