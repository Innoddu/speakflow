// S3 bucket region check script
const { S3Client, GetBucketLocationCommand, ListBucketsCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

async function checkBucketRegion() {
  const s3Client = new S3Client({
    region: 'us-east-1', // Start with default region
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    // 1. List all buckets
    console.log('🔍 Available buckets:');
    const listCommand = new ListBucketsCommand({});
    const listResponse = await s3Client.send(listCommand);
    
    listResponse.Buckets.forEach(bucket => {
      console.log(`  - ${bucket.Name} (created: ${bucket.CreationDate})`);
    });

    // 2. Check specific bucket region
    const bucketName = process.env.AWS_S3_BUCKET || 'speakflow-audio-files';
    console.log(`\n🌍 Checking region for bucket '${bucketName}'...`);
    
    const locationCommand = new GetBucketLocationCommand({
      Bucket: bucketName
    });
    
    const locationResponse = await s3Client.send(locationCommand);
    const region = locationResponse.LocationConstraint || 'us-east-1';
    
    console.log(`✅ Bucket region: ${region}`);
    console.log(`📝 Value to set in .env file: AWS_REGION=${region}`);
    
    return region;
  } catch (error) {
    console.error('❌ Failed to check bucket region:', error.message);
    
    if (error.message.includes('NoSuchBucket')) {
      console.log('💡 Solution: Please create a bucket in AWS console.');
    } else if (error.message.includes('credentials')) {
      console.log('💡 Solution: Please check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
    }
    
    return null;
  }
}

// Execute
checkBucketRegion(); 