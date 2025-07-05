const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Helper script to save OAuth2 token
async function saveToken(code) {
  console.log('💾 Saving OAuth2 token...');
  
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('❌ Missing Google OAuth2 credentials');
    return;
  }
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
  );
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Save token to file
    const tokenPath = path.join(__dirname, 'token.json');
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    
    console.log('✅ Token saved successfully!');
    console.log('📁 Token saved to:', tokenPath);
    console.log('🚀 Now you can run: node test/test-oauth2.js');
    
  } catch (error) {
    console.error('❌ Error saving token:', error.message);
  }
}

// Get code from command line arguments
const code = process.argv[2];

if (!code) {
  console.error('❌ Please provide the authorization code');
  console.log('Usage: node test/save-token.js "YOUR_CODE_HERE"');
  process.exit(1);
}

saveToken(code); 