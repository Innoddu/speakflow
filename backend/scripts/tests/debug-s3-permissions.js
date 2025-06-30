// S3 권한 설정과 Signed URL 실패 원인 분석
const { S3Client, GetBucketPolicyCommand, GetPublicAccessBlockCommand, GetBucketAclCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

async function debugS3Permissions() {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const bucketName = process.env.AWS_S3_BUCKET || 'speakflow-audio-files';

  try {
    console.log('🔍 S3 권한 설정 분석 중...');
    console.log(`버킷: ${bucketName}\n`);

    // 1. Public Access Block 설정 확인
    console.log('📂 Public Access Block 설정:');
    try {
      const publicAccessCommand = new GetPublicAccessBlockCommand({ Bucket: bucketName });
      const publicAccessResult = await s3Client.send(publicAccessCommand);
      console.log(JSON.stringify(publicAccessResult.PublicAccessBlockConfiguration, null, 2));
    } catch (error) {
      console.log('Public Access Block 정보 없음:', error.message);
    }

    // 2. 버킷 정책 확인
    console.log('\n📋 버킷 정책:');
    try {
      const policyCommand = new GetBucketPolicyCommand({ Bucket: bucketName });
      const policyResult = await s3Client.send(policyCommand);
      console.log(JSON.stringify(JSON.parse(policyResult.Policy), null, 2));
    } catch (error) {
      console.log('버킷 정책 없음:', error.message);
    }

    // 3. 문제 분석
    console.log('\n🤔 Signed URL 실패 원인 분석:');
    console.log('1. 버킷 정책이 있으면서 Public Access Block에서 정책을 허용하는 경우');
    console.log('2. Signed URL은 개별 파일 권한을 사용하려 하지만');
    console.log('3. 버킷 정책이 이미 모든 접근을 제어하고 있음');
    console.log('4. 두 권한 시스템이 충돌하여 403 에러 발생');

    console.log('\n💡 해결 방법:');
    console.log('A. Public URL usage (current method) - using bucket policy');
    console.log('B. 버킷 정책 제거 + Signed URL 사용');
    console.log('C. IAM 권한 조정');

  } catch (error) {
    console.error('❌ 분석 실패:', error.message);
  }
}

// 실행
debugS3Permissions(); 