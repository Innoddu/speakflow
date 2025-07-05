const ytdl = require('ytdl-core');

// Test function to extract captions using ytdl-core
async function testYtdlCaptions() {
  console.log('🧪 Testing ytdl-core for caption extraction...');
  
  const testVideos = [
    '1iLF--DgWyg',
    'A-5chPHZ18E', 
    'dQw4w9WgXcQ'
  ];
  
  for (const videoId of testVideos) {
    console.log(`\n📹 Testing video: ${videoId}`);
    
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const info = await ytdl.getInfo(videoUrl);
      
      console.log(`   📺 Title: ${info.videoDetails.title}`);
      console.log(`   🎬 Duration: ${info.videoDetails.lengthSeconds}s`);
      
      // Check for captions in player response
      if (info.player_response && info.player_response.captions) {
        const captions = info.player_response.captions;
        console.log(`   📝 Captions object found:`, Object.keys(captions));
        
        if (captions.playerCaptionsTracklistRenderer) {
          const tracks = captions.playerCaptionsTracklistRenderer.captionTracks || [];
          console.log(`   📋 Found ${tracks.length} caption tracks`);
          
          tracks.forEach((track, index) => {
            console.log(`   ${index + 1}. Language: ${track.languageCode}, Name: ${track.name?.simpleText || 'No name'}`);
            console.log(`      Base URL: ${track.baseUrl ? 'Available' : 'Not available'}`);
          });
          
          // Try to download the first English caption
          const englishTrack = tracks.find(track => 
            track.languageCode === 'en' || track.languageCode.startsWith('en-')
          );
          
          if (englishTrack && englishTrack.baseUrl) {
            console.log(`   🎯 Downloading English captions...`);
            
            try {
              const axios = require('axios');
              const response = await axios.get(englishTrack.baseUrl);
              const captionData = response.data;
              
              console.log(`   📄 Caption data type: ${typeof captionData}`);
              console.log(`   📊 Caption data length: ${captionData.length || 'N/A'}`);
              
              if (typeof captionData === 'string') {
                const lines = captionData.split('\n').slice(0, 5);
                console.log('   📝 First few lines:');
                lines.forEach(line => console.log(`      ${line}`));
              }
              
            } catch (downloadError) {
              console.error(`   ❌ Download error: ${downloadError.message}`);
            }
          }
        }
      } else {
        console.log('   ⚠️  No captions found in player response');
      }
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
}

// Test function to explore the full info structure
async function exploreVideoInfo() {
  console.log('\n🔍 Exploring video info structure...');
  
  const videoId = 'dQw4w9WgXcQ'; // Rick Roll
  
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await ytdl.getInfo(videoUrl);
    
    console.log('📊 Available info keys:');
    Object.keys(info).forEach(key => {
      console.log(`   - ${key}: ${typeof info[key]}`);
    });
    
    if (info.player_response) {
      console.log('\n📊 Player response keys:');
      Object.keys(info.player_response).forEach(key => {
        console.log(`   - ${key}: ${typeof info.player_response[key]}`);
      });
    }
    
  } catch (error) {
    console.error(`❌ Error exploring video info: ${error.message}`);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting ytdl-core caption tests...\n');
  
  await testYtdlCaptions();
  await exploreVideoInfo();
  
  console.log('\n🎉 All tests completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testYtdlCaptions,
  exploreVideoInfo
}; 