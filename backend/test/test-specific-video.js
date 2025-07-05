const ytdl = require('ytdl-core');
const axios = require('axios');
const { google } = require('googleapis');
const { getSubtitles } = require('youtube-captions-scraper');
require('dotenv').config();

// Test specific video: YhA63RT3d8c
const TEST_VIDEO_ID = 'YhA63RT3d8c';

// Test 1: ytdl-core approach
async function testYtdlCaptions() {
  console.log('🧪 Testing ytdl-core for video:', TEST_VIDEO_ID);
  
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;
    const info = await ytdl.getInfo(videoUrl);
    
    console.log(`📺 Title: ${info.videoDetails.title}`);
    console.log(`🎬 Duration: ${info.videoDetails.lengthSeconds}s`);
    console.log(`👁️  Views: ${info.videoDetails.viewCount}`);
    
    // Check for captions in player response
    if (info.player_response && info.player_response.captions) {
      const captions = info.player_response.captions;
      console.log(`📝 Captions object found:`, Object.keys(captions));
      
      if (captions.playerCaptionsTracklistRenderer) {
        const tracks = captions.playerCaptionsTracklistRenderer.captionTracks || [];
        console.log(`📋 Found ${tracks.length} caption tracks`);
        
        tracks.forEach((track, index) => {
          console.log(`   ${index + 1}. Language: ${track.languageCode}`);
          console.log(`      Name: ${track.name?.simpleText || 'No name'}`);
          console.log(`      Kind: ${track.kind || 'Unknown'}`);
          console.log(`      Base URL: ${track.baseUrl ? 'Available' : 'Not available'}`);
        });
        
        // Try to download the first English caption
        const englishTrack = tracks.find(track => 
          track.languageCode === 'en' || track.languageCode.startsWith('en-')
        );
        
        if (englishTrack && englishTrack.baseUrl) {
          console.log(`🎯 Downloading English captions...`);
          
          try {
            const response = await axios.get(englishTrack.baseUrl);
            const captionData = response.data;
            
            console.log(`📄 Caption data type: ${typeof captionData}`);
            console.log(`📊 Caption data length: ${captionData.length || 'N/A'}`);
            
            if (typeof captionData === 'string') {
              const lines = captionData.split('\n').slice(0, 10);
              console.log('📝 First few lines:');
              lines.forEach(line => console.log(`   ${line}`));
            }
            
            console.log('✅ Successfully downloaded captions via ytdl-core!');
            
          } catch (downloadError) {
            console.error(`❌ Download error: ${downloadError.message}`);
          }
        } else {
          console.log('⚠️  No English captions found or no base URL');
        }
      } else {
        console.log('⚠️  No playerCaptionsTracklistRenderer found');
      }
    } else {
      console.log('⚠️  No captions found in player response');
    }
    
  } catch (error) {
    console.error(`❌ ytdl-core error: ${error.message}`);
  }
}

// Test 2: YouTube Data API v3 approach
async function testYouTubeAPI() {
  console.log('\n🧪 Testing YouTube Data API v3 for video:', TEST_VIDEO_ID);
  
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('❌ YOUTUBE_API_KEY not found');
    return;
  }
  
  try {
    // Get video info
    const videoResponse = await axios.get(`https://www.googleapis.com/youtube/v3/videos`, {
      params: {
        part: 'snippet,contentDetails',
        id: TEST_VIDEO_ID,
        key: process.env.YOUTUBE_API_KEY
      }
    });
    
    const video = videoResponse.data.items[0];
    if (video) {
      console.log(`📺 Title: ${video.snippet.title}`);
      console.log(`📅 Published: ${video.snippet.publishedAt}`);
      console.log(`🎬 Duration: ${video.contentDetails.duration}`);
    }
    
    // Get captions info
    const captionsResponse = await axios.get(`https://www.googleapis.com/youtube/v3/captions`, {
      params: {
        part: 'snippet',
        videoId: TEST_VIDEO_ID,
        key: process.env.YOUTUBE_API_KEY
      }
    });
    
    const captions = captionsResponse.data.items;
    console.log(`📝 Found ${captions.length} caption tracks`);
    
    captions.forEach((caption, index) => {
      console.log(`   ${index + 1}. ${caption.snippet.language} (${caption.snippet.trackKind}) - ${caption.snippet.name || 'No name'}`);
    });
    
  } catch (error) {
    console.error(`❌ YouTube API error: ${error.message}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
    }
  }
}

// Test 3: youtube-captions-scraper approach
async function testCaptionsScraper() {
  console.log('\n🧪 Testing youtube-captions-scraper for video:', TEST_VIDEO_ID);
  
  try {
    const subtitles = await getSubtitles({
      videoID: TEST_VIDEO_ID,
      lang: 'en'
    });
    
    console.log(`✅ Found ${subtitles.length} subtitle entries`);
    
    if (subtitles.length > 0) {
      console.log('📝 First few entries:');
      subtitles.slice(0, 5).forEach((entry, index) => {
        console.log(`   ${index + 1}. [${entry.start}s] "${entry.text}"`);
      });
      
      console.log('✅ Successfully extracted captions via youtube-captions-scraper!');
    }
    
  } catch (error) {
    console.error(`❌ youtube-captions-scraper error: ${error.message}`);
  }
}

// Test 4: Try youtube-transcript library
async function testYouTubeTranscript() {
  console.log('\n🧪 Testing youtube-transcript for video:', TEST_VIDEO_ID);
  
  try {
    const { YoutubeTranscript } = require('youtube-transcript');
    
    const transcript = await YoutubeTranscript.fetchTranscript(TEST_VIDEO_ID);
    console.log(`✅ Found ${transcript.length} transcript entries`);
    
    if (transcript.length > 0) {
      console.log('📝 First few entries:');
      transcript.slice(0, 5).forEach((entry, index) => {
        console.log(`   ${index + 1}. [${entry.offset}s] "${entry.text}"`);
      });
      
      console.log('✅ Successfully extracted transcript via youtube-transcript!');
    }
    
  } catch (error) {
    console.error(`❌ youtube-transcript error: ${error.message}`);
  }
}

// Run all tests
async function runAllTests() {
  console.log(`🚀 Testing video: ${TEST_VIDEO_ID}\n`);
  
  await testYtdlCaptions();
  await testYouTubeAPI();
  await testCaptionsScraper();
  await testYouTubeTranscript();
  
  console.log('\n🎉 All tests completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testYtdlCaptions,
  testYouTubeAPI,
  testCaptionsScraper,
  testYouTubeTranscript
}; 