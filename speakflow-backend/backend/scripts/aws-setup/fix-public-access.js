// Script to check and fix Public Access Block settings
const { S3Client, PutPublicAccessBlockCommand, GetPublicAccessBlockCommand, PutObjectAclCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

async function fixPublicAccess() {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const bucketName = process.env.AWS_S3_BUCKET || 'speakflow-audio-files';

  try {
    console.log('🔍 Checking current Public Access Block settings...');
    
    // 1. Check current settings
    try {
      const getCommand = new GetPublicAccessBlockCommand({ Bucket: bucketName });
      const currentSettings = await s3Client.send(getCommand);
      console.log('Current settings:', currentSettings.PublicAccessBlockConfiguration);
    } catch (error) {
      console.log('Cannot retrieve current settings:', error.message);
    }

    // 2. Change to correct settings
    console.log('🔧 Modifying Public Access Block settings...');
    const publicAccessParams = {
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,        // Allow public access through ACLs
        IgnorePublicAcls: false,       // Do not ignore public ACLs
        BlockPublicPolicy: true,       // Block public access through bucket policy (security)
        RestrictPublicBuckets: true,   // Restrict public bucket access (security)
      },
    };

    const putCommand = new PutPublicAccessBlockCommand(publicAccessParams);
    await s3Client.send(putCommand);
    console.log('✅ Public Access Block settings completed');

    // 3. Apply public-read ACL to existing files
    console.log('📁 Applying public-read ACL to existing files...');
    try {
      const aclCommand = new PutObjectAclCommand({
        Bucket: bucketName,
        Key: 'audio/V3pud9d2ybQ.webm',
        ACL: 'public-read'
      });
      
      await s3Client.send(aclCommand);
      console.log('✅ Existing file ACL settings completed');
    } catch (error) {
      console.log('⚠️  Failed to set existing file ACL:', error.message);
    }

    // 4. Generate test URL
    const testUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/audio/V3pud9d2ybQ.webm`;
    console.log('\n🧪 Test URL:', testUrl);
    console.log('Please open the above URL in your browser!');

  } catch (error) {
    console.error('❌ Configuration failed:', error.message);
    console.error('Detailed error:', error);
  }
}

// Execute
fixPublicAccess(); 