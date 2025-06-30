// Signed URL 사용을 위한 설정 변경
const { S3Client, DeleteBucketPolicyCommand, PutPublicAccessBlockCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

async function enableSignedUrlOnly() {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const bucketName = process.env.AWS_S3_BUCKET || 'speakflow-audio-files';

  try {
    console.log('🔧 Signed URL 사용을 위한 설정 변경 중...');

    // 1. 버킷 정책 제거
    console.log('📋 버킷 정책 제거 중...');
    try {
      const deletePolicyCommand = new DeleteBucketPolicyCommand({ Bucket: bucketName });
      await s3Client.send(deletePolicyCommand);
      console.log('✅ 버킷 정책 제거 완료');
    } catch (error) {
      console.log('⚠️  버킷 정책 제거 실패 (정책이 없을 수 있음):', error.message);
    }

    // 2. Public Access Block 설정 (모든 public 접근 차단)
    console.log('🔒 Public Access Block 설정 중...');
    const publicAccessParams = {
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,        // ACL 차단
        IgnorePublicAcls: true,       // ACL 무시
        BlockPublicPolicy: true,      // 버킷 정책 차단
        RestrictPublicBuckets: true,  // 모든 public 접근 차단
      },
    };

    const publicAccessCommand = new PutPublicAccessBlockCommand(publicAccessParams);
    await s3Client.send(publicAccessCommand);
    console.log('✅ Public Access Block 설정 완료');

    console.log('\n🎉 Signed URL 전용 설정 완료!');
    console.log('📝 이제 다음이 가능합니다:');
    console.log('- Signed URL을 통한 임시 접근만 허용');
    console.log('- 보안 강화: 직접 URL 접근 불가');
    console.log('- 시간 제한: URL 만료 후 접근 불가');
    
    console.log('\n⚠️  주의사항:');
    console.log('- Public URL은 더 이상 작동하지 않음');
    console.log('- 모든 접근이 Signed URL을 통해서만 가능');

  } catch (error) {
    console.error('❌ 설정 실패:', error.message);
  }
}

// 실행
enableSignedUrlOnly(); 