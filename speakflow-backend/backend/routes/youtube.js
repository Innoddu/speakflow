// YouTube 라우트 — 검색 / 영상 상세 / 오디오 추출.
// captions-only 전략: 검색 시 영어 자막 있는 영상만 노출한다.
const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const s3Service = require('../services/s3Service');
const { extractAudioWithYtDlp } = require('../services/youtube-captions');
const { hasEnglishTranscript } = require('../services/transcript-api');

const router = express.Router();

// 오디오 캐시 디렉터리
const audioDir = path.join(__dirname, '..', 'public', 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// YouTube Data API
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

// ── 헬퍼: ISO 8601 길이 → 초 ────────────────────────────────────────
const parseDurationToSeconds = (duration) => {
  if (!duration) return null;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
};

// ── 헬퍼: 초 → 사람이 읽는 길이 ─────────────────────────────────────
const formatDuration = (seconds) => {
  if (!seconds) return 'Unknown';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    : `${minutes}:${secs.toString().padStart(2, '0')}`;
};

// ── 헬퍼: 검색 관련도 점수 ──────────────────────────────────────────
const calculateRelevanceScore = (video, searchQuery) => {
  let score = 0;
  const query = searchQuery.toLowerCase();
  const title = video.title.toLowerCase();
  const description = video.description.toLowerCase();

  if (title.includes(query)) score += 100;
  const titleWords = query.split(' ');
  titleWords.forEach((word) => {
    if (title.includes(word)) score += 20;
  });

  if (description.includes(query)) score += 50;
  titleWords.forEach((word) => {
    if (description.includes(word)) score += 10;
  });

  if (video.viewCount > 0) score += Math.log10(video.viewCount) * 5;

  const idealDuration = 360; // 6분
  const durationDiff = Math.abs(video.durationSeconds - idealDuration);
  score += Math.max(0, 20 - durationDiff / 30);

  const daysSincePublish = (Date.now() - new Date(video.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePublish < 365) score += Math.max(0, 10 - daysSincePublish / 36.5);

  return score;
};

// ── GET /search ─────────────────────────────────────────────────────
// 10분 이하 + 영어 자막 있는 영상만 반환한다.
router.get('/search', async (req, res) => {
  try {
    const { query, maxResults = 15 } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log(`🔍 Searching "${query}" (자막 있는 ≤10분 영상만)`);

    // 1) 검색 — videoCaption 필터로 자막 있는 영상 위주로 1차 압축
    const searchResponse = await youtube.search.list({
      part: 'snippet',
      q: query,
      maxResults: parseInt(maxResults) * 2, // 필터링 여유분
      type: 'video',
      order: 'relevance',
      videoDuration: 'medium',
      videoCaption: 'closedCaption',
    });

    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      return res.json({ videos: [] });
    }

    // 2) 상세 정보(길이 등) 조회
    const videoIds = searchResponse.data.items.map((item) => item.id.videoId);
    const detailsResponse = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      id: videoIds.join(','),
    });

    // 3) 10분 이하 필터
    const filteredVideos = [];
    for (const video of detailsResponse.data.items) {
      const durationSeconds = parseDurationToSeconds(video.contentDetails.duration);
      if (durationSeconds && durationSeconds <= 600) {
        filteredVideos.push({
          id: video.id,
          title: video.snippet.title,
          description: video.snippet.description,
          thumbnail: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url,
          channelTitle: video.snippet.channelTitle,
          publishedAt: video.snippet.publishedAt,
          duration: formatDuration(durationSeconds),
          durationSeconds,
          viewCount: parseInt(video.statistics.viewCount || 0),
          likeCount: parseInt(video.statistics.likeCount || 0),
        });
      }
    }

    // 4) 관련도 정렬
    filteredVideos.sort((a, b) => calculateRelevanceScore(b, query) - calculateRelevanceScore(a, query));

    // 5) 영어 자막 실제 존재 검증 (병렬) — 자동생성 자막만 있는 영상도 정확히 포함/제외
    const checked = await Promise.all(
      filteredVideos.map(async (v) => ({ v, ok: await hasEnglishTranscript(v.id) }))
    );
    const captioned = checked.filter((c) => c.ok).map((c) => c.v);

    const finalVideos = captioned.slice(0, parseInt(maxResults));
    console.log(`✅ 자막 검증 통과 ${captioned.length}개 → 상위 ${finalVideos.length}개 반환`);

    res.json({
      videos: finalVideos,
      totalFound: captioned.length,
      captionGuaranteed: true,
      maxDuration: '10:00',
    });
  } catch (error) {
    console.error('❌ YouTube search error:', error.message);
    res.status(500).json({ error: 'Failed to search YouTube videos' });
  }
});

// ── GET /video/:videoId ─────────────────────────────────────────────
router.get('/video/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const response = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      id: videoId,
    });

    if (!response.data.items.length) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const video = response.data.items[0];
    res.json({
      video: {
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnail: video.snippet.thumbnails.high.url,
        channelTitle: video.snippet.channelTitle,
        publishedAt: video.snippet.publishedAt,
        duration: video.contentDetails.duration,
        viewCount: video.statistics.viewCount,
        likeCount: video.statistics.likeCount,
      },
    });
  } catch (error) {
    console.error('Video details error:', error.message);
    res.status(500).json({ error: 'Failed to get video details' });
  }
});

// ── GET /audio/:videoId ─────────────────────────────────────────────
// 연습 중 원본 오디오 재생용. S3 캐시 → 로컬 → yt-dlp 추출 순.
router.get('/audio/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const audioFileName = `${videoId}.mp3`;
    const audioFilePath = path.join(audioDir, audioFileName);

    console.log(`🎵 Audio requested: ${videoId}`);

    // 1) S3 캐시 확인
    if (await s3Service.audioFileExists(videoId)) {
      const s3Url = await s3Service.getAudioFileUrl(videoId, 3600);
      return res.json({ audioUrl: s3Url, cached: true, source: 's3' });
    }

    // 2) 로컬 캐시 확인 → S3 업로드
    if (fs.existsSync(audioFilePath)) {
      try {
        await s3Service.uploadAudioFile(videoId, audioFilePath);
        const s3Url = await s3Service.getAudioFileUrl(videoId, 3600);
        return res.json({ audioUrl: s3Url, cached: true, source: 's3' });
      } catch (s3Error) {
        console.error('S3 upload failed, serving local:', s3Error.message);
        return res.json({ audioUrl: `/audio/${audioFileName}`, cached: true, source: 'local' });
      }
    }

    // 3) yt-dlp 로 추출
    const audioResult = await extractAudioWithYtDlp(videoId, audioDir);
    if (!audioResult.success) {
      return res.status(404).json({ error: 'Audio extraction failed', videoId });
    }

    // 추출 파일을 기대 경로로 이동
    if (audioResult.audioPath !== audioFilePath) {
      fs.copyFileSync(audioResult.audioPath, audioFilePath);
    }

    try {
      await s3Service.uploadAudioFile(videoId, audioFilePath);
      const s3Url = await s3Service.getAudioFileUrl(videoId, 3600);
      return res.json({ audioUrl: s3Url, cached: false, source: 's3' });
    } catch (s3Error) {
      console.error('S3 upload failed, serving local:', s3Error.message);
      return res.json({ audioUrl: `/audio/${audioFileName}`, cached: false, source: 'local' });
    }
  } catch (error) {
    console.error('Audio download error:', error.message);
    res.status(500).json({ error: 'Failed to download audio', details: error.message, videoId: req.params.videoId });
  }
});

module.exports = router;
