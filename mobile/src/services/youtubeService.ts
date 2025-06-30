import axios from 'axios';
import { API_CONFIG, YOUTUBE_CONFIG } from '../config/api';

export interface Video {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
}

export interface VideoDetails {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  duration: string;
  viewCount: string;
  likeCount: string;
}

export interface TranscriptEntry {
  text: string;
  start: number;
  duration: number;
  offset: number;
}

export interface TranscriptResponse {
  transcript: TranscriptEntry[];
  fullScript: string;
  totalDuration: number;
}

export interface PracticeSentence {
  text: string;
  start: number;
  end: number;
  duration: number;
  originalWords?: string; // Original transcript words for comparison
  correctedWords?: string; // AI-corrected words for comparison
}

export interface PracticeTranscriptResponse {
  sentences: PracticeSentence[];
  totalDuration: number;
}

export interface AudioInfo {
  audioUrl: string;
  duration: string;
  title: string;
  format: {
    bitrate: string;
    codec: string;
    container: string;
  };
  fileSize?: string | number;
  cached?: boolean;
  source?: 'local' | 's3' | 'stream';
}

// Create axios instance with configuration
const apiClient = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
});

// Search YouTube videos
export const searchVideos = async (query: string): Promise<Video[]> => {
  try {
    const response = await apiClient.get('/youtube/search', {
      params: { 
        query, 
        maxResults: YOUTUBE_CONFIG.MAX_SEARCH_RESULTS 
      }
    });
    return response.data.videos;
  } catch (error) {
    console.error('Error searching videos:', error);
    throw new Error('Failed to search videos');
  }
};

// Get video details
export const getVideoDetails = async (videoId: string): Promise<VideoDetails> => {
  try {
    const response = await apiClient.get(`/youtube/video/${videoId}`);
    return response.data.video;
  } catch (error) {
    console.error('Error getting video details:', error);
    throw new Error('Failed to get video details');
  }
};

// Get video transcript
export const getVideoTranscript = async (videoId: string): Promise<TranscriptResponse> => {
  try {
    const response = await apiClient.get(`/youtube/transcript/${videoId}`);
    return response.data;
  } catch (error) {
    console.error('Error getting transcript:', error);
    throw new Error('Failed to get video transcript');
  }
};

// Get practice transcript
export const getPracticeTranscript = async (videoId: string): Promise<PracticeTranscriptResponse> => {
  try {
    const response = await apiClient.get(`/youtube/transcript-practice/${videoId}`);
    return response.data;
  } catch (error) {
    console.error('Error getting practice transcript:', error);
    throw new Error('Failed to get practice transcript');
  }
};

// Get audio URL for a video
export const getAudioUrl = async (videoId: string): Promise<AudioInfo> => {
  try {
    const response = await apiClient.get(`/youtube/audio/${videoId}`);
    const audioInfo = response.data;
    
    // If the audioUrl is a relative path, make it absolute
    if (audioInfo.audioUrl.startsWith('/audio/')) {
      audioInfo.audioUrl = `${API_CONFIG.BASE_URL.replace('/api', '')}${audioInfo.audioUrl}`;
    }
    
    return audioInfo;
  } catch (error) {
    console.error('Error getting audio URL:', error);
    throw new Error('Failed to get audio URL');
  }
}; 