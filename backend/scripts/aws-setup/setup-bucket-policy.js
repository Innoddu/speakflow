// 버킷 정책을 사용하여 public 접근 허용하는 스크립트
const { S3Client, PutBucketPolicyCommand, PutPublicAccessBlockCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

async function setupBucketPolicy() {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const bucketName = process.env.AWS_S3_BUCKET || 'speakflow-audio-files';

  try {
    console.log('🔧 버킷 정책을 사용한 Public 접근 설정 중...');

    // 1. Public Access Block 설정 (버킷 정책 허용)
    console.log('📂 Public Access Block 설정 중...');
    const publicAccessParams = {
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,         // ACL 차단 (사용 안함)
        IgnorePublicAcls: true,        // ACL 무시
        BlockPublicPolicy: false,      // 버킷 정책 허용 ⭐️
        RestrictPublicBuckets: false,  // 버킷 정책을 통한 public 접근 허용 ⭐️
      },
    };

    const publicAccessCommand = new PutPublicAccessBlockCommand(publicAccessParams);
    await s3Client.send(publicAccessCommand);
    console.log('✅ Public Access Block 설정 완료');

    // 2. 버킷 정책 설정 (audio/ 폴더만 public 읽기 허용)
    console.log('📋 버킷 정책 설정 중...');
    const bucketPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadGetObject",
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${bucketName}/audio/*`
        }
      ]
    };

    const policyCommand = new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(bucketPolicy)
    });

    await s3Client.send(policyCommand);
    console.log('✅ 버킷 정책 설정 완료');

    // 3. 테스트 URL
    const testUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/audio/V3pud9d2ybQ.webm`;
    console.log('\n🎉 설정 완료!');
    console.log('🧪 테스트 URL:', testUrl);
    console.log('\n📝 이제 다음이 가능합니다:');
    console.log('- audio/ 폴더의 모든 파일에 public 접근 가능');
    console.log('- ACL 설정 불필요 (버킷 정책으로 자동 처리)');
    console.log('- 보안: audio/ 폴더 외의 파일은 여전히 private');

  } catch (error) {
    console.error('❌ 설정 실패:', error.message);
    console.error('상세 에러:', error);
  }
}

// 실행
setupBucketPolicy(); 