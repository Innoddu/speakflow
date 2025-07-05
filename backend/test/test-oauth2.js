const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// OAuth2 setup for YouTube Data API v3
async function setupOAuth2() {
  console.log('🔐 Setting up OAuth2 for YouTube Data API v3...');
  
  // Check if we have the required environment variables
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.log('⚠️  Missing Google OAuth2 credentials');
    console.log('📝 You need to set up:');
    console.log('   - GOOGLE_CLIENT_ID');
    console.log('   - GOOGLE_CLIENT_SECRET');
    console.log('   - GOOGLE_REDIRECT_URI (optional, defaults to http://localhost:3000/oauth2callback)');
    console.log('');
    console.log('🔗 Get these from: https://console.cloud.google.com/apis/credentials');
    return null;
  }
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
  );
  
  // Check if we have a stored token
  const tokenPath = path.join(__dirname, 'token.json');
  
  if (fs.existsSync(tokenPath)) {
    console.log('✅ Found existing token file');
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oauth2Client.setCredentials(token);
    
    // Check if token is still valid
    try {
      await oauth2Client.getAccessToken();
      console.log('✅ Token is still valid');
      return oauth2Client;
    } catch (error) {
      console.log('⚠️  Token expired, need to refresh');
      fs.unlinkSync(tokenPath);
    }
  }
  
  // Generate auth URL with more permissions
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ]
  });
  
  console.log('🔗 Please visit this URL to authorize the application:');
  console.log(authUrl);
  console.log('');
  console.log('📋 After authorization, you will get a code. Run:');
  console.log(`   node test/save-token.js "YOUR_CODE_HERE"`);
  
  return null;
}

// Test function to download captions with OAuth2
async function testCaptionDownload() {
  console.log('🧪 Testing caption download with OAuth2...');
  
  const oauth2Client = await setupOAuth2();
  if (!oauth2Client) {
    console.log('❌ OAuth2 setup failed');
    return;
  }
  
  const youtube = google.youtube({
    version: 'v3',
    auth: oauth2Client,
  });
  
  const videoId = 'YhA63RT3d8c';
  
  try {
    // Get captions list
    const captionsResponse = await youtube.captions.list({
      part: 'snippet',
      videoId: videoId,
    });
    
    const captions = captionsResponse.data.items;
    console.log(`📝 Found ${captions.length} caption tracks`);
    
    // Show all available captions
    captions.forEach((caption, index) => {
      console.log(`   ${index + 1}. Language: ${caption.snippet.language}, Kind: ${caption.snippet.trackKind}, Name: ${caption.snippet.name || 'No name'}`);
    });
    
    // Find English captions
    const englishCaptions = captions.filter(caption => 
      caption.snippet.language === 'en' || caption.snippet.language.startsWith('en-')
    );
    
    if (englishCaptions.length === 0) {
      console.log('⚠️  No English captions found');
      return;
    }
    
    // Prefer manual captions over auto-generated
    const manualCaptions = englishCaptions.filter(caption => 
      caption.snippet.trackKind !== 'ASR'
    );
    
    const selectedCaption = manualCaptions.length > 0 ? manualCaptions[0] : englishCaptions[0];
    console.log(`🎯 Selected caption: ${selectedCaption.snippet.name || 'No name'} (${selectedCaption.snippet.language}, ${selectedCaption.snippet.trackKind})`);
    
    // Download the caption
    console.log('📥 Downloading caption...');
    const captionResponse = await youtube.captions.download({
      id: selectedCaption.id,
      tfmt: 'srt', // SRT format
    });
    
    const srtContent = captionResponse.data;
    console.log(`📝 Downloaded SRT content (${srtContent.length} characters)`);
    
    // Show first few lines
    const lines = srtContent.split('\n').slice(0, 15);
    console.log('📄 First few lines:');
    lines.forEach(line => console.log(`   ${line}`));
    
    console.log('✅ Successfully downloaded captions with OAuth2!');
    
    // Test parsing
    const parsedCaptions = parseSRTContent(srtContent);
    console.log(`🔍 Parsed ${parsedCaptions.length} caption entries`);
    
    if (parsedCaptions.length > 0) {
      console.log('📋 First few parsed entries:');
      parsedCaptions.slice(0, 3).forEach((entry, index) => {
        console.log(`   ${index + 1}. [${entry.start} --> ${entry.end}] "${entry.text}"`);
      });
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data:`, error.response.data);
    }
  }
}

// Helper function to parse SRT content
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

// Run the test
async function runTest() {
  console.log('🚀 Starting OAuth2 caption download test...\n');
  
  await testCaptionDownload();
  
  console.log('\n🎉 Test completed!');
}

// Run test if this file is executed directly
if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = {
  setupOAuth2,
  testCaptionDownload
}; 