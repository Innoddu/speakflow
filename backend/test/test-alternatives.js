const axios = require('axios');
require('dotenv').config();

// Test 1: Try youtube-transcript library
async function testYouTubeTranscript() {
  console.log('🧪 Testing youtube-transcript library...');
  
  try {
    const { YoutubeTranscript } = require('youtube-transcript');
    
    const testVideos = [
      '1iLF--DgWyg',
      'A-5chPHZ18E', 
      'dQw4w9WgXcQ'
    ];
    
    for (const videoId of testVideos) {
      console.log(`\n📹 Testing video: ${videoId}`);
      
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        console.log(`   ✅ Found ${transcript.length} transcript entries`);
        
        // Show first few entries
        transcript.slice(0, 3).forEach((entry, index) => {
          console.log(`   ${index + 1}. [${entry.offset}s] "${entry.text}"`);
        });
        
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ youtube-transcript library not available:', error.message);
    console.log('💡 Install with: npm install youtube-transcript');
  }
}

// Test 2: Try direct YouTube API approach (without downloading)
async function testYouTubeAPIInfo() {
  console.log('\n🧪 Testing YouTube Data API v3 (info only)...');
  
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('❌ YOUTUBE_API_KEY not found');
    return;
  }
  
  const testVideos = ['1iLF--DgWyg', 'A-5chPHZ18E', 'dQw4w9WgXcQ'];
  
  for (const videoId of testVideos) {
    console.log(`\n📹 Testing video: ${videoId}`);
    
    try {
      // Get video info
      const videoResponse = await axios.get(`https://www.googleapis.com/youtube/v3/videos`, {
        params: {
          part: 'snippet,contentDetails',
          id: videoId,
          key: process.env.YOUTUBE_API_KEY
        }
      });
      
      const video = videoResponse.data.items[0];
      if (video) {
        console.log(`   📺 Title: ${video.snippet.title}`);
        console.log(`   📅 Published: ${video.snippet.publishedAt}`);
        console.log(`   🎬 Duration: ${video.contentDetails.duration}`);
      }
      
      // Get captions info
      const captionsResponse = await axios.get(`https://www.googleapis.com/youtube/v3/captions`, {
        params: {
          part: 'snippet',
          videoId: videoId,
          key: process.env.YOUTUBE_API_KEY
        }
      });
      
      const captions = captionsResponse.data.items;
      console.log(`   📝 Found ${captions.length} caption tracks`);
      
      captions.forEach((caption, index) => {
        console.log(`   ${index + 1}. ${caption.snippet.language} (${caption.snippet.trackKind}) - ${caption.snippet.name || 'No name'}`);
      });
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
      }
    }
  }
}

// Test 3: Try youtube-captions-scraper with different approach
async function testCaptionsScraper() {
  console.log('\n🧪 Testing youtube-captions-scraper (current library)...');
  
  try {
    const { getSubtitles } = require('youtube-captions-scraper');
    
    const testVideos = [
      { videoID: '1iLF--DgWyg', lang: 'en' },
      { videoID: 'A-5chPHZ18E', lang: 'en' },
      { videoID: 'dQw4w9WgXcQ', lang: 'en' }
    ];
    
    for (const { videoID, lang } of testVideos) {
      console.log(`\n📹 Testing video: ${videoID}`);
      
      try {
        const subtitles = await getSubtitles({
          videoID,
          lang
        });
        
        console.log(`   ✅ Found ${subtitles.length} subtitle entries`);
        
        // Show first few entries
        subtitles.slice(0, 3).forEach((entry, index) => {
          console.log(`   ${index + 1}. [${entry.start}s] "${entry.text}"`);
        });
        
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ youtube-captions-scraper not available:', error.message);
  }
}

// Test 4: Try different languages and options
async function testDifferentOptions() {
  console.log('\n🧪 Testing different language options...');
  
  try {
    const { getSubtitles } = require('youtube-captions-scraper');
    
    const videoID = 'dQw4w9WgXcQ'; // Rick Roll - known to have captions
    const languages = ['en', 'en-US', 'en-GB', 'auto'];
    
    for (const lang of languages) {
      console.log(`\n🌐 Testing language: ${lang}`);
      
      try {
        const subtitles = await getSubtitles({
          videoID,
          lang
        });
        
        console.log(`   ✅ Found ${subtitles.length} subtitle entries`);
        
        if (subtitles.length > 0) {
          console.log(`   📝 First entry: "${subtitles[0].text}"`);
        }
        
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ youtube-captions-scraper not available:', error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting alternative YouTube transcript tests...\n');
  
  await testYouTubeTranscript();
  await testYouTubeAPIInfo();
  await testCaptionsScraper();
  await testDifferentOptions();
  
  console.log('\n🎉 All tests completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testYouTubeTranscript,
  testYouTubeAPIInfo,
  testCaptionsScraper,
  testDifferentOptions
}; 