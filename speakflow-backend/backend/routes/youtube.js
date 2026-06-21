// YouTube 라우트 — 검색 / 영상 상세.
// 오디오는 더 이상 추출하지 않는다(프론트의 YouTube 임베드 플레이어로 재생).
const express = require('express');
const { google } = require('googleapis');

const router = express.Router();

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
// 10분 이하 영상을 관련도순으로 반환. (Gemini가 어떤 영상이든 전사하므로 자막 유무 무관)
router.get('/search', async (req, res) => {
  try {
    const { query, maxResults = 15 } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log(`🔍 Searching "${query}" (≤10분 영상)`);

    const searchResponse = await youtube.search.list({
      part: 'snippet',
      q: query,
      maxResults: parseInt(maxResults) * 2,
      type: 'video',
      order: 'relevance',
      videoDuration: 'medium',
    });

    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      return res.json({ videos: [] });
    }

    const videoIds = searchResponse.data.items.map((item) => item.id.videoId);
    const detailsResponse = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      id: videoIds.join(','),
    });

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

    filteredVideos.sort((a, b) => calculateRelevanceScore(b, query) - calculateRelevanceScore(a, query));
    const finalVideos = filteredVideos.slice(0, parseInt(maxResults));

    console.log(`✅ ${filteredVideos.length}개 중 상위 ${finalVideos.length}개 반환`);
    res.json({ videos: finalVideos, totalFound: filteredVideos.length, maxDuration: '10:00' });
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

module.exports = router;
