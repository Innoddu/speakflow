const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Create history directory if it doesn't exist
const historyDir = path.join(__dirname, '..', 'data', 'history');
if (!fs.existsSync(historyDir)) {
  fs.mkdirSync(historyDir, { recursive: true });
}

const historyFilePath = path.join(historyDir, 'user_history.json');

// Initialize history file if it doesn't exist
if (!fs.existsSync(historyFilePath)) {
  fs.writeFileSync(historyFilePath, JSON.stringify([], null, 2));
}

// Helper function to read history
const readHistory = () => {
  try {
    const data = fs.readFileSync(historyFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading history:', error);
    return [];
  }
};

// Helper function to write history
const writeHistory = (history) => {
  try {
    fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('Error writing history:', error);
  }
};

// Get all history entries
router.get('/', async (req, res) => {
  try {
    const history = readHistory();
    
    // Sort by last accessed date (most recent first)
    const sortedHistory = history.sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed));
    
    console.log(`📖 History: Found ${sortedHistory.length} videos in history`);
    
    res.json({
      success: true,
      history: sortedHistory,
      totalVideos: sortedHistory.length
    });
  } catch (error) {
    console.error('❌ Error getting history:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// Add or update video in history
router.post('/add', async (req, res) => {
  try {
    const { 
      videoId, 
      title, 
      thumbnail, 
      channelTitle, 
      duration, 
      durationSeconds,
      transcriptSource // 'youtube' or 'whisper'
    } = req.body;

    if (!videoId || !title) {
      return res.status(400).json({ error: 'videoId and title are required' });
    }

    const history = readHistory();
    const now = new Date().toISOString();
    
    // Check if video already exists in history
    const existingIndex = history.findIndex(item => item.videoId === videoId);
    
    if (existingIndex !== -1) {
      // Update existing entry
      history[existingIndex] = {
        ...history[existingIndex],
        title,
        thumbnail,
        channelTitle,
        duration,
        durationSeconds,
        transcriptSource,
        lastAccessed: now,
        accessCount: (history[existingIndex].accessCount || 0) + 1
      };
      console.log(`🔄 History: Updated video ${videoId} (${title})`);
    } else {
      // Add new entry
      const newEntry = {
        videoId,
        title,
        thumbnail,
        channelTitle,
        duration,
        durationSeconds,
        transcriptSource,
        firstAccessed: now,
        lastAccessed: now,
        accessCount: 1,
        hasAudio: false, // Will be updated when audio is processed
        hasTranscript: true,
        hasWhisperCache: transcriptSource === 'whisper'
      };
      
      history.unshift(newEntry); // Add to beginning
      console.log(`➕ History: Added new video ${videoId} (${title})`);
    }
    
    // Keep only last 100 videos to prevent file from getting too large
    if (history.length > 100) {
      history.splice(100);
      console.log('🗑️ History: Trimmed to 100 most recent videos');
    }
    
    writeHistory(history);
    
    res.json({
      success: true,
      message: existingIndex !== -1 ? 'History updated' : 'Added to history',
      video: history[existingIndex !== -1 ? existingIndex : 0]
    });
    
  } catch (error) {
    console.error('❌ Error adding to history:', error);
    res.status(500).json({ error: 'Failed to add to history' });
  }
});

// Update audio status for a video
router.post('/update-audio/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { hasAudio, audioSource } = req.body;
    
    const history = readHistory();
    const videoIndex = history.findIndex(item => item.videoId === videoId);
    
    if (videoIndex !== -1) {
      history[videoIndex].hasAudio = hasAudio;
      if (audioSource) {
        history[videoIndex].audioSource = audioSource; // 'local', 's3', etc.
      }
      history[videoIndex].lastUpdated = new Date().toISOString();
      
      writeHistory(history);
      
      console.log(`🎵 History: Updated audio status for ${videoId}`);
      
      res.json({
        success: true,
        message: 'Audio status updated'
      });
    } else {
      res.status(404).json({ error: 'Video not found in history' });
    }
    
  } catch (error) {
    console.error('❌ Error updating audio status:', error);
    res.status(500).json({ error: 'Failed to update audio status' });
  }
});

// Delete video from history
router.delete('/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const history = readHistory();
    const filteredHistory = history.filter(item => item.videoId !== videoId);
    
    if (filteredHistory.length === history.length) {
      return res.status(404).json({ error: 'Video not found in history' });
    }
    
    writeHistory(filteredHistory);
    
    console.log(`🗑️ History: Deleted video ${videoId}`);
    
    res.json({
      success: true,
      message: 'Video removed from history'
    });
    
  } catch (error) {
    console.error('❌ Error deleting from history:', error);
    res.status(500).json({ error: 'Failed to delete from history' });
  }
});

// Clear all history
router.delete('/', async (req, res) => {
  try {
    writeHistory([]);
    
    console.log('🗑️ History: Cleared all history');
    
    res.json({
      success: true,
      message: 'History cleared'
    });
    
  } catch (error) {
    console.error('❌ Error clearing history:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// Get video details from history
router.get('/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const history = readHistory();
    const video = history.find(item => item.videoId === videoId);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found in history' });
    }
    
    res.json({
      success: true,
      video
    });
    
  } catch (error) {
    console.error('❌ Error getting video from history:', error);
    res.status(500).json({ error: 'Failed to get video from history' });
  }
});

module.exports = router; 