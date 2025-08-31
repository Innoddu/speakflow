import { API_CONFIG } from '../config/api';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

// Debug: Print API configuration on load
console.log('🔧 Whisper Service - API_CONFIG.BASE_URL:', API_CONFIG.BASE_URL);

// Test connection function
export const testConnection = async (): Promise<boolean> => {
  try {
    console.log('🧪 Testing connection to:', `${API_CONFIG.BASE_URL}/health`);
    const response = await fetch(`${API_CONFIG.BASE_URL}/health`);
    console.log('🧪 Connection test response status:', response.status);
    const data = await response.json();
    console.log('🧪 Connection test data:', data);
    return response.ok;
  } catch (error) {
    console.error('🧪 Connection test failed:', error);
    return false;
  }
};

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface WhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
  words?: WhisperWord[];
}

export interface WhisperTranscription {
  text: string;
  segments: WhisperSegment[];
  words: WhisperWord[];
  duration: number;
}

export interface ProcessedSentence {
  text: string;
  start: number;
  end: number;
  duration: number;
  words?: WhisperWord[];
}

export interface TranscriptResult {
  success: boolean;
  source: 'youtube' | 'whisper';
  sentences: ProcessedSentence[];
  transcription?: string;
  duration?: number;
}

// In-memory cache for source preferences (stores which method worked for each video)
const sourceCache = new Map<string, 'youtube' | 'whisper'>();

// Get transcript data - smart caching with source preference
export const getTranscriptData = async (videoId: string): Promise<TranscriptResult> => {
  try {
    console.log('🔍 Getting transcript for video:', videoId);

    // Check if we know which source worked before
    const preferredSource = sourceCache.get(videoId);
    
    if (preferredSource === 'whisper') {
      // We know YouTube subtitles don't exist, check Whisper cache directly
      console.log('🎯 Previous source was Whisper, checking cache directly...');
      try {
        const whisperResult = await transcribeWithWhisper(videoId);
        return whisperResult;
      } catch (error) {
        console.log('⚠️ Whisper failed, trying YouTube subtitles as backup...');
        console.error('Whisper error details:', error instanceof Error ? error.message : 'Unknown error');
        // Fall through to YouTube subtitles
      }
    } else if (preferredSource === 'youtube') {
      // We know YouTube subtitles worked before, try them first
      console.log('⚡ Previous source was YouTube, trying subtitles first...');
      try {
        const youtubeResult = await getYouTubeSubtitles(videoId, true);
        if (youtubeResult.success && youtubeResult.sentences.length > 0) {
          console.log('✅ YouTube subtitles found (cached preference):', youtubeResult.sentences.length, 'sentences');
          return youtubeResult;
        }
      } catch (error) {
        console.log('⚠️ YouTube subtitles failed, trying Whisper cache...');
        // Fall through to Whisper
      }
    }

    // 1. Try YouTube subtitles (either first time or preferred source)
    try {
      console.log('📺 Trying YouTube subtitles...');
      const youtubeResult = await getYouTubeSubtitles(videoId, true);
      if (youtubeResult.success && youtubeResult.sentences.length > 0) {
        console.log('✅ YouTube subtitles found:', youtubeResult.sentences.length, 'sentences');
        // Remember this worked
        sourceCache.set(videoId, 'youtube');
        return youtubeResult;
      }
    } catch (error) {
      console.log('⚠️ YouTube subtitles failed:', error instanceof Error ? error.message : 'Unknown error');
    }

    // 2. Fall back to Whisper AI
    console.log('🎤 Falling back to Whisper AI...');
    try {
      const whisperResult = await transcribeWithWhisper(videoId);
      
      // Remember that Whisper worked for this video
      sourceCache.set(videoId, 'whisper');
      return whisperResult;
    } catch (whisperError) {
      console.error('🚨 Both YouTube and Whisper failed!');
      console.error('YouTube error: No subtitles available');
      console.error('Whisper error:', whisperError instanceof Error ? whisperError.message : 'Unknown error');
      
      // Provide helpful error message
      const errorMessage = whisperError instanceof Error && whisperError.message.includes('Network request failed')
        ? 'Network connection failed. Please check your internet connection and try again.'
        : 'Both YouTube subtitles and Whisper AI are unavailable for this video. Please try a different video or check your connection.';
      
      throw new Error(errorMessage);
    }

  } catch (error) {
    console.error('❌ Failed to get transcript data:', error);
    throw new Error('Failed to get transcript: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};

// Get YouTube subtitles
export const getYouTubeSubtitles = async (videoId: string, useSpacy: boolean = true): Promise<TranscriptResult> => {
  try {
    const url = `${API_CONFIG.BASE_URL}/whisper/youtube-subtitles/${videoId}${useSpacy ? '?useSpacy=true' : '?useSpacy=false'}`;
    console.log('🌐 Attempting YouTube subtitles request to:', url);
    const response = await fetch(url);
    console.log('📡 YouTube subtitles response status:', response.status);
    const data = await response.json();

    if (data.success && data.sentences) {
      console.log(`🧠 spaCy enhancement: ${data.spacyImproved ? 'applied' : 'not applied'}`);
      console.log(`📝 Source: ${data.source}`);
      
      return {
        success: true,
        source: 'youtube',
        sentences: data.sentences
      };
    } else {
      throw new Error(data.error || 'No YouTube subtitles found');
    }
  } catch (error) {
    console.error('❌ YouTube subtitles error:', error);
    throw error;
  }
};

// Extract audio from YouTube video
export const extractAudio = async (videoId: string): Promise<string> => {
  try {
    console.log('🎵 Extracting audio for video:', videoId);
    
    // Get audio URL from existing YouTube service
    const response = await fetch(`${API_CONFIG.BASE_URL}/youtube/audio/${videoId}`);
    const data = await response.json();

    if (!data.audioUrl) {
      throw new Error('Failed to extract audio URL');
    }

    console.log('📁 Audio URL obtained, downloading...');
    
    // Platform-specific audio handling
    if (Platform.OS === 'web') {
      // For web, return the URL directly since we can't download files
      console.log('🌐 Web platform: Using direct audio URL');
      return data.audioUrl;
    } else {
      // For native platforms, download the file
      const audioFileName = `audio_${videoId}_${Date.now()}.m4a`;
      const audioUri = `${FileSystem.cacheDirectory}${audioFileName}`;
      
      const downloadResult = await FileSystem.downloadAsync(data.audioUrl, audioUri);
      
      if (downloadResult.status !== 200) {
        throw new Error('Failed to download audio file');
      }

      console.log('✅ Audio downloaded:', audioUri);
      const fileInfo = await FileSystem.getInfoAsync(audioUri);
      if (fileInfo.exists && 'size' in fileInfo) {
        console.log('📊 File size:', fileInfo.size, 'bytes');
      }
      
      return audioUri;
    }

  } catch (error) {
    console.error('❌ Audio extraction error:', error);
    throw new Error('Failed to extract audio: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};

// Quick cache check function
export const getWhisperFromCache = async (videoId: string): Promise<TranscriptResult | null> => {
  try {
    console.log('⚡ Quick cache check for video:', videoId);
    
    // Create timeout controller for compatibility
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const cacheResponse = await fetch(`${API_CONFIG.BASE_URL}/whisper/cached/${videoId}`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (cacheResponse.ok) {
      const cachedData = await cacheResponse.json();
      console.log('🎯 Found cached Whisper result!');
      console.log('📊 Cached sentences:', cachedData.sentences?.length || 0);
      
      return {
        success: true,
        source: 'whisper',
        sentences: cachedData.sentences || [],
        transcription: cachedData.transcription,
        duration: cachedData.duration
      };
    }
    
    return null;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('⏰ Cache check timed out (5s) - proceeding with new transcription');
      } else {
        console.log('⚠️ Cache check failed:', error.message);
      }
    } else {
      console.log('⚠️ Cache check failed: Unknown error');
    }
    return null;
  }
};

// Transcribe audio with Whisper AI (with caching)
export const transcribeWithWhisper = async (videoId: string): Promise<TranscriptResult> => {
  try {
    console.log('🎤 Starting Whisper transcription for video:', videoId);
    
    // 1. Quick cache check first
    const cachedResult = await getWhisperFromCache(videoId);
    if (cachedResult) {
      return cachedResult;
    }
    
    console.log('💸 No cache found, proceeding with new Whisper API call...');
    
    // 2. Extract audio file for new transcription
    const audioUri = await extractAudio(videoId);
    
    // Platform-specific form data preparation
    const formData = new FormData();
    
    if (Platform.OS === 'web') {
      // For web, we have the direct URL - let the backend handle the download
      console.log('🌐 Web platform: Sending audio URL to backend');
      formData.append('audioUrl', audioUri);
      formData.append('videoId', videoId);
    } else {
      // For native platforms, upload the downloaded file
      const audioInfo = await FileSystem.getInfoAsync(audioUri);
      if (!audioInfo.exists) {
        throw new Error('Audio file does not exist');
      }

      // Create file object for upload with proper format
      const audioBlob = {
        uri: audioUri,
        type: 'audio/mp4',
        name: `audio_${videoId}.mp4`
      } as any;

      formData.append('audio', audioBlob);
      formData.append('videoId', videoId);
    }

    console.log('📤 Uploading audio to Whisper API...');
    console.log('📄 Platform:', Platform.OS);
    
    // Upload to Whisper API
    const response = await fetch(`${API_CONFIG.BASE_URL}/whisper/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Whisper API error');
    }

    const data = await response.json();
    
    // Clean up downloaded audio file (only for native platforms)
    if (Platform.OS !== 'web') {
      await FileSystem.deleteAsync(audioUri, { idempotent: true });
    }

    console.log('✅ Whisper transcription completed');
    console.log('📊 Found sentences:', data.sentences?.length || 0);
    console.log('⏱️ Duration:', data.duration, 'seconds');

    return {
      success: true,
      source: 'whisper',
      sentences: data.sentences || [],
      transcription: data.transcription,
      duration: data.duration
    };

  } catch (error) {
    console.error('❌ Whisper transcription error:', error);
    throw new Error('Whisper transcription failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};

// Process YouTube subtitles (legacy function for compatibility)
export const processYouTubeSubtitles = (subtitles: any[]): ProcessedSentence[] => {
  const sentences: ProcessedSentence[] = [];
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

  return sentences;
};

// Process Whisper result (legacy function for compatibility)
export const processWhisperResult = (whisperData: WhisperTranscription): ProcessedSentence[] => {
  return whisperData.segments.map(segment => ({
    text: segment.text.trim(),
    start: segment.start,
    end: segment.end,
    duration: segment.end - segment.start,
    words: segment.words
  }));
}; 