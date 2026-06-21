import { API_CONFIG } from '../config/api';

export interface HistoryVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration: string;
  durationSeconds: number;
  transcriptSource: 'youtube' | 'whisper';
  firstAccessed: string;
  lastAccessed: string;
  accessCount: number;
  hasAudio: boolean;
  hasTranscript: boolean;
  hasWhisperCache: boolean;
  audioSource?: 'local' | 's3' | 'stream';
  lastUpdated?: string;
}

export interface HistoryResponse {
  success: boolean;
  history: HistoryVideo[];
  totalVideos: number;
}

export interface AddToHistoryData {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration?: string;
  durationSeconds?: number;
  transcriptSource: 'youtube' | 'whisper';
}

// Get all history
export const getHistory = async (): Promise<HistoryVideo[]> => {
  try {
    console.log('📖 Getting history...');
    
    const response = await fetch(`${API_CONFIG.BASE_URL}/history`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch history');
    }
    
    const data: HistoryResponse = await response.json();
    
    console.log(`✅ History loaded: ${data.totalVideos} videos`);
    
    return data.history;
  } catch (error) {
    console.error('❌ Error getting history:', error);
    throw new Error('Failed to get history: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};

// Add video to history
export const addToHistory = async (videoData: AddToHistoryData): Promise<void> => {
  try {
    console.log('➕ Adding to history:', videoData.title);
    
    const response = await fetch(`${API_CONFIG.BASE_URL}/history/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(videoData),
    });
    
    if (!response.ok) {
      throw new Error('Failed to add to history');
    }
    
    const data = await response.json();
    console.log(`✅ ${data.message}:`, videoData.title);
    
  } catch (error) {
    console.error('❌ Error adding to history:', error);
    // Don't throw error - history is not critical functionality
  }
};

// Update audio status for a video
export const updateAudioStatus = async (
  videoId: string, 
  hasAudio: boolean, 
  audioSource?: string
): Promise<void> => {
  try {
    console.log(`🎵 Updating audio status for ${videoId}: ${hasAudio}`);
    
    const response = await fetch(`${API_CONFIG.BASE_URL}/history/update-audio/${videoId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hasAudio, audioSource }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to update audio status');
    }
    
    console.log(`✅ Audio status updated for ${videoId}`);
    
  } catch (error) {
    console.error('❌ Error updating audio status:', error);
    // Don't throw error - history updates are not critical
  }
};

// Delete video from history
export const removeFromHistory = async (videoId: string): Promise<void> => {
  try {
    console.log('🗑️ Removing from history:', videoId);
    
    const response = await fetch(`${API_CONFIG.BASE_URL}/history/${videoId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error('Failed to remove from history');
    }
    
    console.log(`✅ Removed from history: ${videoId}`);
    
  } catch (error) {
    console.error('❌ Error removing from history:', error);
    throw new Error('Failed to remove from history: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};

// Delete video from history with complete cache cleanup (including S3)
export const removeFromHistoryWithCache = async (videoId: string): Promise<{
  success: boolean;
  videoTitle: string;
  cacheCleanup: any;
}> => {
  try {
    console.log('🗑️ Completely removing from history with cache cleanup:', videoId);
    
    const response = await fetch(`${API_CONFIG.BASE_URL}/history/${videoId}?deleteCache=true`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error('Failed to remove from history');
    }
    
    const data = await response.json();
    console.log(`✅ Completely removed from history with cache:`, data);
    
    return data;
    
  } catch (error) {
    console.error('❌ Error removing from history with cache:', error);
    throw new Error('Failed to remove from history: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};

// Clear all history
export const clearHistory = async (): Promise<void> => {
  try {
    console.log('🗑️ Clearing all history...');
    
    const response = await fetch(`${API_CONFIG.BASE_URL}/history`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error('Failed to clear history');
    }
    
    console.log('✅ History cleared');
    
  } catch (error) {
    console.error('❌ Error clearing history:', error);
    throw new Error('Failed to clear history: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};

// Clear all history with cache cleanup for all videos
export const clearHistoryWithCache = async (): Promise<void> => {
  try {
    console.log('🗑️ Clearing all history with cache cleanup...');
    
    // First get all videos in history
    const historyData = await getHistory();
    
    // Delete each video individually with cache cleanup
    const deletePromises = historyData.map(video => 
      removeFromHistoryWithCache(video.videoId).catch(error => {
        console.error(`Failed to delete ${video.videoId}:`, error);
        return null;
      })
    );
    
    await Promise.all(deletePromises);
    
    console.log('✅ All history and cache cleared');
    
  } catch (error) {
    console.error('❌ Error clearing history with cache:', error);
    throw new Error('Failed to clear history with cache: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};

// Get video from history
export const getVideoFromHistory = async (videoId: string): Promise<HistoryVideo | null> => {
  try {
    console.log('🔍 Getting video from history:', videoId);
    
    const response = await fetch(`${API_CONFIG.BASE_URL}/history/${videoId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Video not in history
      }
      throw new Error('Failed to get video from history');
    }
    
    const data = await response.json();
    console.log(`✅ Found video in history: ${data.video.title}`);
    
    return data.video;
  } catch (error) {
    console.error('❌ Error getting video from history:', error);
    return null; // Return null instead of throwing for non-critical functionality
  }
};

// Check if video is in history
export const isVideoInHistory = async (videoId: string): Promise<boolean> => {
  try {
    const video = await getVideoFromHistory(videoId);
    return video !== null;
  } catch (error) {
    console.error('❌ Error checking if video is in history:', error);
    return false;
  }
}; 