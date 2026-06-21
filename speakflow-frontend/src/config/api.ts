import { Platform } from 'react-native';

// Environment detection
const isDevelopment = __DEV__;

// Get the appropriate base URL based on environment
const getBaseUrl = () => {
  if (isDevelopment) {
    // Development environment
    if (Platform.OS === 'web') {
      return 'http://localhost:5030/api';
    } else {
      // For iOS/Android simulators/devices, use localhost (works with Expo tunneling)
      // If this doesn't work, use your computer's IP: http://172.29.34.222:5030/api
      return 'http://localhost:5030/api';
    }
  } else {
    // Production environment (Railway URL)
    return 'https://speakflow-backend-production.up.railway.app/api';
  }
};

// API Configuration
export const API_CONFIG = {
  // Automatically switch between development and production URLs
  BASE_URL: getBaseUrl(),
  
  // API timeout in milliseconds
  TIMEOUT: 120000, // Increased to 120 seconds for audio conversion
  
  // Retry attempts for failed requests
  RETRY_ATTEMPTS: 3,
  
  // Environment info for debugging
  IS_DEVELOPMENT: isDevelopment,
  PLATFORM: Platform.OS,
};

// YouTube API Configuration
export const YOUTUBE_CONFIG = {
  // Maximum number of videos to fetch in search (filtered to ≤10min)
  MAX_SEARCH_RESULTS: 15,
  
  // Default language for transcripts
  DEFAULT_LANGUAGE: 'en',
  
  // Video duration filter - now handled server-side for 10min max
  MAX_DURATION_MINUTES: 10,
  
  // Ideal duration for learning (in minutes)
  IDEAL_DURATION_MINUTES: 6,
};

// Log current configuration for debugging
console.log('🔧 API Configuration:', {
  baseUrl: API_CONFIG.BASE_URL,
  isDevelopment: API_CONFIG.IS_DEVELOPMENT,
  platform: API_CONFIG.PLATFORM,
});