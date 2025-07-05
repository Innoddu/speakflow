const { google } = require('googleapis');
require('dotenv').config();

// Test function to check YouTube Data API v3 functionality
async function testYouTubeAPI() {
  console.log('🧪 Testing YouTube Data API v3...');
  
  // Check if API key is available
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('❌ YOUTUBE_API_KEY not found in environment variables');
    return;
  }
  
  console.log('✅ YouTube API key found');
  
  // Initialize YouTube API client
  const youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY,
  });
  
  // Test video IDs
  const testVideos = [
    '1iLF--DgWyg', // Video that was failing before
    'A-5chPHZ18E', // Another test video
    'dQw4w9WgXcQ', // Rick Roll (well-known video with captions)
  ];
  
  for (const videoId of testVideos) {
    console.log(`\n📹 Testing video: ${videoId}`);
    
    try {
      // List available captions
      const captionsResponse = await youtube.captions.list({
        part: 'snippet',
        videoId: videoId,
      });
      
      const captions = captionsResponse.data.items;
      console.log(`   Found ${captions.length} caption tracks`);
      
      if (captions.length === 0) {
        console.log('   ⚠️  No captions available for this video');
        continue;
      }
      
      // Show available caption tracks
      captions.forEach((caption, index) => {
        console.log(`   ${index + 1}. Language: ${caption.snippet.language}, Name: ${caption.snippet.name}, Kind: ${caption.snippet.trackKind}`);
      });
      
      // Try to find English captions
      const englishCaptions = captions.filter(caption => 
        caption.snippet.language === 'en' || caption.snippet.language.startsWith('en-')
      );
      
      if (englishCaptions.length === 0) {
        console.log('   ⚠️  No English captions found');
        continue;
      }
      
      // Prefer manual captions over auto-generated
      const manualCaptions = englishCaptions.filter(caption => 
        caption.snippet.trackKind !== 'ASR'
      );
      
      const selectedCaption = manualCaptions.length > 0 ? manualCaptions[0] : englishCaptions[0];
      console.log(`   🎯 Selected caption: ${selectedCaption.snippet.name} (${selectedCaption.snippet.language})`);
      
      // Download the caption
      const captionResponse = await youtube.captions.download({
        id: selectedCaption.id,
        tfmt: 'srt', // SRT format
      });
      
      const srtContent = captionResponse.data;
      console.log(`   📝 Downloaded SRT content (${srtContent.length} characters)`);
      
      // Show first few lines of SRT content
      const lines = srtContent.split('\n').slice(0, 10);
      console.log('   📄 First few lines:');
      lines.forEach(line => console.log(`      ${line}`));
      
      console.log('   ✅ Successfully downloaded captions');
      
    } catch (error) {
      console.error(`   ❌ Error testing video ${videoId}:`, error.message);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Data:`, error.response.data);
      }
    }
  }
  
  console.log('\n🏁 Test completed!');
}

// Helper function to parse SRT content (same as in our routes)
function parseSRTContent(srtContent) {
  const lines = srtContent.split('\n');
  const subtitles = [];
  let currentSubtitle = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) {
      if (currentSubtitle) {
        subtitles.push(currentSubtitle);
        currentSubtitle = null;
      }
      continue;
    }
    
    // Check if line is a number (subtitle index)
    if (/^\d+$/.test(line)) {
      currentSubtitle = { index: parseInt(line) };
      continue;
    }
    
    // Check if line is a timestamp
    if (line.includes('-->')) {
      const [start, end] = line.split('-->').map(t => t.trim());
      if (currentSubtitle) {
        currentSubtitle.start = start;
        currentSubtitle.end = end;
      }
      continue;
    }
    
    // This must be subtitle text
    if (currentSubtitle) {
      if (currentSubtitle.text) {
        currentSubtitle.text += ' ' + line;
      } else {
        currentSubtitle.text = line;
      }
    }
  }
  
  // Add the last subtitle if exists
  if (currentSubtitle) {
    subtitles.push(currentSubtitle);
  }
  
  return subtitles;
}

// Test the SRT parsing function
async function testSRTParsing() {
  console.log('\n🧪 Testing SRT parsing...');
  
  const sampleSRT = `1
00:00:01,000 --> 00:00:03,000
Hello world!

2
00:00:03,500 --> 00:00:06,000
This is a test subtitle.

3
00:00:06,500 --> 00:00:09,000
Multiple lines
in one subtitle.`;
  
  const parsed = parseSRTContent(sampleSRT);
  console.log('📊 Parsed subtitles:');
  parsed.forEach((sub, index) => {
    console.log(`   ${index + 1}. [${sub.start} --> ${sub.end}] "${sub.text}"`);
  });
  
  console.log('✅ SRT parsing test completed');
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting YouTube API tests...\n');
  
  await testSRTParsing();
  await testYouTubeAPI();
  
  console.log('\n🎉 All tests completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testYouTubeAPI,
  testSRTParsing,
  parseSRTContent
}; 