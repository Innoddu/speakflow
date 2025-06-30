// API Configuration
export const API_CONFIG = {
  // Change this to your backend server URL
  // For local development: Use your computer's IP address
  // For production: 'https://your-backend-domain.com/api'
  BASE_URL: 'http://localhost:5030/api',
  
  // API timeout in milliseconds
  TIMEOUT: 120000, // Increased to 120 seconds for audio conversion
  
  // Retry attempts for failed requests
  RETRY_ATTEMPTS: 3,
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