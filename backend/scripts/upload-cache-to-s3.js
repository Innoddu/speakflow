const fs = require('fs');
const path = require('path');
require('dotenv').config();

const s3Service = require('../services/s3Service');

async function uploadCacheToS3() {
  try {
    console.log('🚀 Starting cache upload to S3...');
    
    const whisperCacheDir = path.join(__dirname, '..', 'cache', 'whisper');
    
    if (!fs.existsSync(whisperCacheDir)) {
      console.log('❌ Whisper cache directory not found:', whisperCacheDir);
      return;
    }
    
    const cacheFiles = fs.readdirSync(whisperCacheDir).filter(file => file.endsWith('.json'));
    
    if (cacheFiles.length === 0) {
      console.log('📁 No cache files found to upload');
      return;
    }
    
    console.log(`📦 Found ${cacheFiles.length} cache files to upload`);
    
    let uploadedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const fileName of cacheFiles) {
      try {
        const videoId = fileName.replace('.json', '');
        const filePath = path.join(whisperCacheDir, fileName);
        
        console.log(`\n🔍 Processing: ${fileName}`);
        
        // Check if already exists in S3
        const existsInS3 = await s3Service.whisperCacheExists(videoId);
        if (existsInS3) {
          console.log(`⏭️  Already exists in S3, skipping: ${videoId}`);
          skippedCount++;
          continue;
        }
        
        // Read local cache file
        const cacheData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`📊 Cache data: ${cacheData.sentences?.length || 0} sentences`);
        
        // Upload to S3
        await s3Service.uploadWhisperCache(videoId, cacheData);
        console.log(`✅ Uploaded to S3: ${videoId}`);
        uploadedCount++;
        
      } catch (error) {
        console.error(`❌ Error uploading ${fileName}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n📈 Upload Summary:');
    console.log(`✅ Uploaded: ${uploadedCount} files`);
    console.log(`⏭️  Skipped: ${skippedCount} files`);
    console.log(`❌ Errors: ${errorCount} files`);
    console.log(`📦 Total processed: ${cacheFiles.length} files`);
    
    if (uploadedCount > 0) {
      console.log('\n🎉 Cache upload completed successfully!');
      console.log('🚀 Production deployment should now have access to cached transcripts');
    }
    
  } catch (error) {
    console.error('❌ Cache upload failed:', error);
    process.exit(1);
  }
}

// Run the upload
uploadCacheToS3(); 