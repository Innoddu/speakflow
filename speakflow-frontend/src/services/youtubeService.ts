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

export interface PracticeSentence {
  text: string;
  start: number;
  end: number;
  duration: number;
  originalWords?: string; // Original transcript words for comparison
  correctedWords?: string; // AI-corrected words for comparison
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

 