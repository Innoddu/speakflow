# SpeakFlow Backend Scripts

이 폴더에는 AWS S3 설정과 테스트를 위한 스크립트들이 포함되어 있습니다.

## 📁 폴더 구조

```
scripts/
├── aws-setup/          # AWS S3 설정 스크립트들
├── tests/              # 테스트 스크립트들
└── README.md           # 이 파일
```

## 🔧 AWS 설정 스크립트 (aws-setup/)

### `setup-bucket-policy.js`
- **목적**: S3 버킷에 Public URL 접근을 위한 정책 설정
- **사용법**: `node scripts/aws-setup/setup-bucket-policy.js`
- **설명**: audio/ 폴더의 파일들을 Public URL로 접근 가능하게 설정

### `check-bucket-region.js`
- **목적**: S3 버킷의 리전 확인
- **사용법**: `node scripts/aws-setup/check-bucket-region.js`

### `enable-signed-url.js`
- **목적**: Signed URL 사용을 위한 설정 (현재 미사용)
- **사용법**: `node scripts/aws-setup/enable-signed-url.js`

### `fix-public-access.js`
- **목적**: Public Access Block 설정 수정
- **사용법**: `node scripts/aws-setup/fix-public-access.js`

### `setup-s3-public.js`
- **목적**: S3 버킷 CORS 설정
- **사용법**: `node scripts/aws-setup/setup-s3-public.js`

## 🧪 테스트 스크립트 (tests/)

### `test-aws-connection.js`
- **목적**: AWS 연결 및 자격 증명 테스트
- **사용법**: `node scripts/tests/test-aws-connection.js`

### `test-s3-url.js`
- **목적**: S3 URL 생성 테스트
- **사용법**: `node scripts/tests/test-s3-url.js`

### `debug-s3-permissions.js`
- **목적**: S3 권한 설정 분석
- **사용법**: `node scripts/tests/debug-s3-permissions.js`

## 🚀 현재 운영 설정

**사용 중인 방식**: Public URL + 버킷 정책
- 빠른 접근 속도
- 간단한 URL 구조
- audio/ 폴더만 공개 접근 가능
- 버킷의 다른 파일들은 여전히 private

## ⚠️ 주의사항

- 이 스크립트들은 개발/설정 목적으로만 사용
- 실제 서비스는 `services/s3Service.js`에서 처리
- AWS 자격 증명이 `.env` 파일에 설정되어 있어야 함 