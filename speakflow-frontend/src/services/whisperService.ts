// 스크립트(자막) 서비스 — captions-only.
// 백엔드 /whisper/youtube-subtitles 에서 영어 자막을 문장 단위로 받아온다.
import { API_CONFIG } from '../config/api';

// 서버 연결 확인
export const testConnection = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}/health`);
    return response.ok;
  } catch (error) {
    console.error('🧪 Connection test failed:', error);
    return false;
  }
};

export interface ProcessedSentence {
  text: string;
  start: number;
  end: number;
  duration: number;
}

export interface TranscriptResult {
  success: boolean;
  source: string;
  sentences: ProcessedSentence[];
}

// 영상의 영어 자막을 문장 단위로 가져온다.
export const getTranscriptData = async (videoId: string): Promise<TranscriptResult> => {
  console.log('🔍 Getting transcript for video:', videoId);

  const url = `${API_CONFIG.BASE_URL}/whisper/youtube-subtitles/${videoId}?useSpacy=true`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.success && data.sentences?.length > 0) {
    console.log(`✅ Transcript loaded (${data.source}):`, data.sentences.length, 'sentences');
    return {
      success: true,
      source: data.source,
      sentences: data.sentences,
    };
  }

  throw new Error(data.details || data.error || '이 영상은 영어 자막이 없습니다. 자막 있는 영상을 선택해 주세요.');
};
