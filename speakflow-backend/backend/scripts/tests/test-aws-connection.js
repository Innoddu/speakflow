// AWS connection test script
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

async function testAWSConnection() {
  console.log('🔍 Testing AWS connection...');
  console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'Set ✅' : 'Not set ❌');
  console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'Set ✅' : 'Not set ❌');
  console.log('AWS_REGION:', process.env.AWS_REGION || 'ap-northeast-2');
  console.log('AWS_S3_BUCKET:', process.env.AWS_S3_BUCKET || 'speakflow-audio-files');
  
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Please set AWS keys in .env file!');
    return false;
  }

  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-northeast-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);
    
    console.log('✅ AWS connection successful!');
    console.log('📦 Available buckets:');
    
    if (response.Buckets && response.Buckets.length > 0) {
      response.Buckets.forEach(bucket => {
        console.log(`  - ${bucket.Name}`);
      });
    } else {
      console.log('  No buckets found. Please create a bucket in S3.');
    }
    
    return true;
  } catch (error) {
    console.error('❌ AWS connection failed:');
    console.error('Error:', error.message);
    
    if (error.message.includes('credentials')) {
      console.log('💡 Solution: Please check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    } else if (error.message.includes('region')) {
      console.log('💡 Solution: Please check AWS_REGION (e.g.: ap-northeast-2)');
    }
    
    return false;
  }
}

// Execute test
testAWSConnection(); 