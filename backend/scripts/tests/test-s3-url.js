// S3 Signed URL 테스트 스크립트
require('dotenv').config(); // 먼저 환경 변수 로드
const s3Service = require('./services/s3Service');

async function testS3SignedUrl() {
  try {
    console.log('🔍 S3 Signed URL 테스트 시작...');
    
    const videoId = 'V3pud9d2ybQ'; // 기존에 업로드된 파일
    
    // 1. 파일 존재 확인
    console.log('📋 파일 존재 확인 중...');
    const exists = await s3Service.audioFileExists(videoId);
    console.log(`파일 존재: ${exists ? '✅' : '❌'}`);
    
    if (!exists) {
      console.log('❌ 파일이 S3에 없습니다. 먼저 파일을 업로드해주세요.');
      return;
    }
    
    // 2. Signed URL 생성
    console.log('🔗 Signed URL 생성 중...');
    const signedUrl = await s3Service.getAudioFileUrl(videoId, 300); // 5분 유효
    
    console.log('✅ Signed URL 생성 성공!');
    console.log('URL:', signedUrl);
    console.log('URL 길이:', signedUrl.length);
    
    // 3. URL 구조 분석
    const url = new URL(signedUrl);
    console.log('\n📊 URL 분석:');
    console.log('Host:', url.hostname);
    console.log('Path:', url.pathname);
    console.log('Query Parameters:');
    url.searchParams.forEach((value, key) => {
      if (key.startsWith('X-Amz')) {
        console.log(`  ${key}: ${value.substring(0, 20)}...`);
      }
    });
    
    return signedUrl;
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    console.error('상세 에러:', error);
  }
}

// 실행
testS3SignedUrl(); 