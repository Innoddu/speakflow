const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

// Test using yt-dlp to extract captions
async function testYtDlp() {
  console.log('🧪 Testing yt-dlp for caption extraction...');
  
  const videoId = 'YhA63RT3d8c';
  const outputDir = path.join(__dirname, 'temp');
  
  // Create temp directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  try {
    // Check if yt-dlp is available
    console.log('🔍 Checking yt-dlp availability...');
    await execAsync('yt-dlp --version');
    console.log('✅ yt-dlp is available');
    
    // Extract captions
    console.log('📥 Extracting captions with yt-dlp...');
    const command = `yt-dlp --write-auto-sub --write-sub --sub-lang en --sub-format srt --skip-download --output "${outputDir}/%(title)s.%(ext)s" https://www.youtube.com/watch?v=${videoId}`;
    
    const { stdout, stderr } = await execAsync(command);
    
    console.log('📄 yt-dlp output:');
    console.log(stdout);
    if (stderr) {
      console.log('⚠️  yt-dlp stderr:');
      console.log(stderr);
    }
    
    // Check for downloaded files
    const files = fs.readdirSync(outputDir);
    console.log(`📁 Downloaded files: ${files.length}`);
    
    files.forEach(file => {
      console.log(`   - ${file}`);
      
      if (file.endsWith('.srt')) {
        const filePath = path.join(outputDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        console.log(`📝 SRT content (${content.length} characters):`);
        
        const lines = content.split('\n').slice(0, 15);
        lines.forEach(line => console.log(`   ${line}`));
        
        console.log('✅ Successfully extracted captions with yt-dlp!');
      }
    });
    
  } catch (error) {
    console.error('❌ yt-dlp error:', error.message);
    
    if (error.message.includes('command not found')) {
      console.log('💡 Install yt-dlp with: brew install yt-dlp');
      console.log('   Or: pip install yt-dlp');
    }
  }
}

// Test using youtube-dl as fallback
async function testYoutubeDl() {
  console.log('\n🧪 Testing youtube-dl for caption extraction...');
  
  const videoId = 'YhA63RT3d8c';
  const outputDir = path.join(__dirname, 'temp');
  
  try {
    // Check if youtube-dl is available
    console.log('🔍 Checking youtube-dl availability...');
    await execAsync('youtube-dl --version');
    console.log('✅ youtube-dl is available');
    
    // Extract captions
    console.log('📥 Extracting captions with youtube-dl...');
    const command = `youtube-dl --write-auto-sub --write-sub --sub-lang en --sub-format srt --skip-download --output "${outputDir}/%(title)s.%(ext)s" https://www.youtube.com/watch?v=${videoId}`;
    
    const { stdout, stderr } = await execAsync(command);
    
    console.log('📄 youtube-dl output:');
    console.log(stdout);
    if (stderr) {
      console.log('⚠️  youtube-dl stderr:');
      console.log(stderr);
    }
    
    // Check for downloaded files
    const files = fs.readdirSync(outputDir);
    const newFiles = files.filter(f => f.endsWith('.srt'));
    
    if (newFiles.length > 0) {
      console.log('✅ Successfully extracted captions with youtube-dl!');
      
      newFiles.forEach(file => {
        const filePath = path.join(outputDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        console.log(`📝 ${file} (${content.length} characters)`);
      });
    }
    
  } catch (error) {
    console.error('❌ youtube-dl error:', error.message);
    
    if (error.message.includes('command not found')) {
      console.log('💡 Install youtube-dl with: brew install youtube-dl');
      console.log('   Or: pip install youtube-dl');
    }
  }
}

// Test using Node.js libraries with different approaches
async function testNodeLibraries() {
  console.log('\n🧪 Testing Node.js libraries...');
  
  const videoId = 'YhA63RT3d8c';
  
  // Try different npm packages
  const packages = [
    'node-youtube-dl',
    'youtube-dl-exec',
    'youtube-transcript-api'
  ];
  
  for (const pkg of packages) {
    console.log(`\n📦 Testing ${pkg}...`);
    
    try {
      const module = require(pkg);
      console.log(`✅ ${pkg} is available`);
      
      // Add specific implementation for each package
      if (pkg === 'node-youtube-dl') {
        // Implementation for node-youtube-dl
        console.log('⚠️  Implementation needed for node-youtube-dl');
      }
      
    } catch (error) {
      console.log(`❌ ${pkg} not available: ${error.message}`);
      console.log(`💡 Install with: npm install ${pkg}`);
    }
  }
}

// Cleanup function
function cleanup() {
  const tempDir = path.join(__dirname, 'temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('🧹 Cleaned up temp directory');
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Testing working caption extraction solutions...\n');
  
  await testYtDlp();
  await testYoutubeDl();
  await testNodeLibraries();
  
  console.log('\n🎉 All tests completed!');
  
  // Cleanup
  cleanup();
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testYtDlp,
  testYoutubeDl,
  testNodeLibraries
}; 