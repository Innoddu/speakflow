const axios = require('axios');
require('dotenv').config();

// Test direct caption download using YouTube's transcript API
async function testDirectDownload() {
  console.log('🧪 Testing direct caption download...');
  
  const videoId = 'YhA63RT3d8c';
  
  // Try different approaches to get captions directly
  const approaches = [
    // Approach 1: Try YouTube's transcript API
    {
      name: 'YouTube Transcript API',
      url: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`
    },
    // Approach 2: Try SRT format
    {
      name: 'YouTube SRT Format',
      url: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srt`
    },
    // Approach 3: Try VTT format
    {
      name: 'YouTube VTT Format',
      url: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=vtt`
    },
    // Approach 4: Try ASR (auto-generated)
    {
      name: 'YouTube ASR Format',
      url: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3&kind=asr`
    }
  ];
  
  for (const approach of approaches) {
    console.log(`\n📥 Testing: ${approach.name}`);
    console.log(`🔗 URL: ${approach.url}`);
    
    try {
      const response = await axios.get(approach.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      
      console.log(`✅ Status: ${response.status}`);
      console.log(`📄 Content-Type: ${response.headers['content-type']}`);
      console.log(`📊 Content Length: ${response.data.length || 'N/A'}`);
      
      if (response.data) {
        const content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const lines = content.split('\n').slice(0, 10);
        console.log('📝 First few lines:');
        lines.forEach(line => console.log(`   ${line}`));
        
        if (content.length > 100) {
          console.log('🎉 Successfully downloaded captions!');
        }
      }
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
      }
    }
  }
}

// Test using different video IDs
async function testMultipleVideos() {
  console.log('\n🧪 Testing multiple videos...');
  
  const testVideos = [
    { id: 'YhA63RT3d8c', name: 'Test Video' },
    { id: 'dQw4w9WgXcQ', name: 'Rick Roll' },
    { id: '1iLF--DgWyg', name: 'Original Failing Video' }
  ];
  
  for (const video of testVideos) {
    console.log(`\n📹 Testing: ${video.name} (${video.id})`);
    
    const url = `https://www.youtube.com/api/timedtext?v=${video.id}&lang=en&fmt=srt`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      
      console.log(`✅ Status: ${response.status}`);
      console.log(`📊 Content Length: ${response.data.length || 'N/A'}`);
      
      if (response.data && response.data.length > 50) {
        console.log('🎉 Has captions!');
      } else {
        console.log('⚠️  No captions or empty response');
      }
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting direct caption download tests...\n');
  
  await testDirectDownload();
  await testMultipleVideos();
  
  console.log('\n🎉 All tests completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testDirectDownload,
  testMultipleVideos
}; 