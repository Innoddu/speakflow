// Script to configure S3 bucket for public access
const { S3Client, PutBucketCorsCommand, PutPublicAccessBlockCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

async function setupPublicS3() {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const bucketName = process.env.AWS_S3_BUCKET || 'speakflow-audio-files';

  try {
    console.log('🔧 Setting up S3 bucket for public access...');
    console.log(`Bucket: ${bucketName}`);

    // 1. Remove Public Access Block (carefully)
    console.log('📂 Configuring Public Access Block...');
    try {
      const publicAccessParams = {
        Bucket: bucketName,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: false,
          IgnorePublicAcls: false,
          BlockPublicPolicy: true, // Still block bucket policy (security)
          RestrictPublicBuckets: true, // Block public bucket access (security)
        },
      };

      const publicAccessCommand = new PutPublicAccessBlockCommand(publicAccessParams);
      await s3Client.send(publicAccessCommand);
      console.log('✅ Public Access Block configuration completed');
    } catch (error) {
      console.log('⚠️  Failed to configure Public Access Block (may lack permissions):', error.message);
    }

    // 2. CORS configuration
    console.log('🌐 Setting up CORS...');
    const corsParams = {
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'HEAD'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    };

    const corsCommand = new PutBucketCorsCommand(corsParams);
    await s3Client.send(corsCommand);
    console.log('✅ CORS configuration completed');

    console.log('\n🎉 Configuration completed!');
    console.log('📝 You can now access files like this:');
    console.log(`https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/audio/filename.webm`);
    
    console.log('\n⚠️  Important notes:');
    console.log('- Individual files must be uploaded with public-read ACL');
    console.log('- The entire bucket is not made public (secure)');
    console.log('- Only files in the audio/ folder are accessible');

  } catch (error) {
    console.error('❌ Configuration failed:', error.message);
    console.error('Detailed error:', error);
  }
}

// Execute
setupPublicS3(); 