import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
} from 'react-native';
import {
  PanGestureHandler,
  State,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { PracticeSentence, getVideoDetails } from '../services/youtubeService';
import VideoPlayer, { VideoPlayerRef } from '../components/VideoPlayer';
import { getTranscriptData, ProcessedSentence, testConnection } from '../services/whisperService';
import { addToHistory } from '../services/historyService';
import { API_CONFIG } from '../config/api';

type ScriptPracticeScreenRouteProp = RouteProp<RootStackParamList, 'ScriptPractice'>;

// 카드 보기 상태: 0=영어, 1=한국어 번역, 2=단어/구
type CardView = 0 | 1 | 2;
type KeywordItem = { term: string; meaning: string };

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default function ScriptPracticeScreen() {
  const route = useRoute<ScriptPracticeScreenRouteProp>();
  const { videoId, videoTitle } = route.params;

  const [sentences, setSentences] = useState<PracticeSentence[]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showVideo, setShowVideo] = useState(true);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [sentenceLayouts, setSentenceLayouts] = useState<{ [key: number]: number }>({});

  // 스와이프 카드 상태
  const [cardView, setCardView] = useState<{ [key: number]: CardView }>({});
  const [translations, setTranslations] = useState<{ [key: number]: string }>({});
  const [keywords, setKeywords] = useState<{ [key: number]: KeywordItem[] }>({});

  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const sentenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoHeightAnim = useRef(new Animated.Value(1)).current;

  const handleSentenceLayout = (index: number, layout: any) => {
    setSentenceLayouts((prev) => ({ ...prev, [index]: layout.y }));
  };

  useEffect(() => {
    testNetworkConnection();
    loadTranscript();
    addVideoToHistory();

    return () => {
      if (sentenceTimerRef.current) {
        clearInterval(sentenceTimerRef.current);
        sentenceTimerRef.current = null;
      }
    };
  }, []);

  const testNetworkConnection = async () => {
    try {
      const isConnected = await testConnection();
      if (!isConnected) {
        Alert.alert('Connection Error', 'Cannot connect to server. Please check if the backend is running.');
      }
    } catch (error) {
      console.error('🔬 Connection test error:', error);
    }
  };

  const addVideoToHistory = async () => {
    try {
      const videoDetails = await getVideoDetails(videoId);
      await addToHistory({
        videoId,
        title: videoTitle || videoDetails.title,
        thumbnail: videoDetails.thumbnail,
        channelTitle: videoDetails.channelTitle,
        duration: videoDetails.duration,
        transcriptSource: 'youtube',
      });
    } catch (error) {
      console.error('⚠️ Failed to add video to history:', error);
    }
  };

  const loadTranscript = async () => {
    try {
      const result = await getTranscriptData(videoId);

      if (result.success && result.sentences.length > 0) {
        const practiceSentences: PracticeSentence[] = result.sentences.map((sentence: ProcessedSentence) => ({
          text: sentence.text,
          start: sentence.start,
          end: sentence.end,
          duration: sentence.duration,
        }));
        setSentences(practiceSentences);
      } else {
        throw new Error('No transcript data available');
      }
    } catch (error) {
      console.error('❌ Failed to load transcript:', error);

      let userMessage = 'Failed to load transcript. Please try again.';
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('no english subtitles') || errorMessage.includes('no subtitles available')) {
          userMessage =
            "❌ This video doesn't have English subtitles.\n\n💡 Please try a different video with English subtitles or closed captions (CC).";
        } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
          userMessage = '🌐 Network connection failed.\n\n💡 Please check your internet connection and try again.';
        }
      }

      setTranscriptError(userMessage);
      if (Platform.OS !== 'web') {
        Alert.alert('Transcript Error', userMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const scrollToCurrentSentence = (index: number) => {
    if (scrollViewRef.current) {
      const scrollPosition = sentenceLayouts[index] || index * 120;
      scrollViewRef.current.scrollTo({ y: scrollPosition, animated: true });
    }
  };

  const stopPlayback = () => {
    if (videoPlayerRef.current) videoPlayerRef.current.pause();
    if (sentenceTimerRef.current) {
      clearInterval(sentenceTimerRef.current);
      sentenceTimerRef.current = null;
    }
    setIsPlaying(false);
  };

  // 해당 문장 구간을 YouTube 임베드 플레이어로 재생한다.
  // 고정 타이머가 아니라 "실제 재생 위치"를 보고 멈춘다 → seek/버퍼링 지연에 안전.
  const playSentence = (sentence: PracticeSentence) => {
    const player = videoPlayerRef.current;
    if (!player) return;

    setIsPlaying(true);
    player.seekTo(sentence.start);
    player.play();

    let entered = false; // 해당 구간에 실제로 진입했는지(seek 반영 확인)
    const startedAt = Date.now();

    const interval = setInterval(() => {
      const p = videoPlayerRef.current;
      if (!p) {
        clearInterval(interval);
        return;
      }
      p.getCurrentTime((t) => {
        const elapsed = Date.now() - startedAt;

        if (!entered) {
          // seek가 반영되어 구간 안으로 들어왔는지 확인
          if (t >= sentence.start - 1 && t < sentence.end + 2) {
            entered = true;
          } else if (elapsed > 12000) {
            // 12초 내 진입 못하면 안전 정지
            p.pause();
            setIsPlaying(false);
            clearInterval(interval);
            sentenceTimerRef.current = null;
          }
          return;
        }

        // 구간 끝에 도달하면 정지
        if (t >= sentence.end) {
          p.pause();
          setIsPlaying(false);
          clearInterval(interval);
          sentenceTimerRef.current = null;
        }
      });
    }, 150);

    sentenceTimerRef.current = interval;
  };

  // 문장 탭: 재생 중이면 멈추고, 아니면 그 문장을 재생한다.
  const handleSentencePress = (index: number) => {
    const isSamePlaying = isPlaying && currentSentenceIndex === index;
    stopPlayback();

    if (isSamePlaying) return;

    setCurrentSentenceIndex(index);
    scrollToCurrentSentence(index);
    playSentence(sentences[index]);
  };

  // 번역 가져오기 (캐시)
  const fetchTranslation = async (index: number) => {
    if (translations[index] !== undefined) return;
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentences[index].text, targetLanguage: 'ko' }),
      });
      const data = await res.json();
      setTranslations((p) => ({ ...p, [index]: data.success ? data.translatedText : '(번역을 불러오지 못했습니다)' }));
    } catch (e) {
      console.error('❌ Translation error:', e);
      setTranslations((p) => ({ ...p, [index]: '(번역을 불러오지 못했습니다)' }));
    }
  };

  // 단어/구 가져오기 (캐시)
  const fetchKeywords = async (index: number) => {
    if (keywords[index] !== undefined) return;
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/translate/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentences[index].text }),
      });
      const data = await res.json();
      setKeywords((p) => ({ ...p, [index]: data.success ? data.items : [] }));
    } catch (e) {
      console.error('❌ Keyword fetch error:', e);
      setKeywords((p) => ({ ...p, [index]: [] }));
    }
  };

  // 왼쪽 스와이프: 영어 → 번역 → 단어
  const swipeLeft = (index: number) => {
    const cur = cardView[index] ?? 0;
    const next = Math.min(2, cur + 1) as CardView;
    if (next === cur) return;
    setCardView((p) => ({ ...p, [index]: next }));
    if (next === 1) fetchTranslation(index);
    if (next === 2) fetchKeywords(index);
  };

  // 오른쪽 스와이프: 단어 → 번역 → 영어
  const swipeRight = (index: number) => {
    const cur = cardView[index] ?? 0;
    const prev = Math.max(0, cur - 1) as CardView;
    if (prev === cur) return;
    setCardView((p) => ({ ...p, [index]: prev }));
  };

  const handleSwipe = (index: number, translationX: number) => {
    if (translationX < -50) swipeLeft(index);
    else if (translationX > 50) swipeRight(index);
  };

  const toggleVideo = () => {
    if (showVideo) {
      Animated.timing(videoHeightAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start(() => {
        setShowVideo(false);
      });
    } else {
      setShowVideo(true);
      Animated.timing(videoHeightAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start();
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading transcript...</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{videoTitle}</Text>
          <TouchableOpacity style={styles.videoToggleButton} onPress={toggleVideo} activeOpacity={0.7}>
            <Text style={styles.videoToggleIcon}>{showVideo ? '📹' : '📱'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hintText}>탭: 음성 재생 🔊 · ← 스와이프: 번역 → 단어</Text>
      </View>

      <Animated.View
        style={[
          styles.videoContainer,
          {
            height: videoHeightAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 200] }),
            opacity: videoHeightAnim,
          },
        ]}
      >
        <VideoPlayer videoId={videoId} ref={videoPlayerRef} />
      </Animated.View>

      <ScrollView ref={scrollViewRef} style={styles.scriptContainer} showsVerticalScrollIndicator={false}>
        {sentences.map((sentence, index) => {
          const view = cardView[index] ?? 0;
          const isCurrent = index === currentSentenceIndex;
          const isPlayingThis = isCurrent && isPlaying;
          const isEnglishCurrent = isCurrent && view === 0;

          const rightText = isPlayingThis
            ? '🔊 재생 중'
            : view === 1
            ? '🇰🇷 번역'
            : view === 2
            ? '📚 단어'
            : `${formatTime(sentence.start)} - ${formatTime(sentence.end)}`;

          return (
            <PanGestureHandler
              key={`sentence-${index}`}
              activeOffsetX={[-15, 15]}
              onHandlerStateChange={(e) => {
                if (e.nativeEvent.state === State.END) {
                  handleSwipe(index, e.nativeEvent.translationX);
                }
              }}
            >
              <TouchableOpacity
                style={[
                  styles.sentenceContainer,
                  isEnglishCurrent && styles.currentSentence,
                  view === 1 && styles.koreanCard,
                  view === 2 && styles.vocabCard,
                ]}
                onPress={() => handleSentencePress(index)}
                onLayout={(event) => handleSentenceLayout(index, event.nativeEvent.layout)}
                activeOpacity={0.7}
              >
                <View style={styles.sentenceHeader}>
                  <Text style={[styles.sentenceNumber, isEnglishCurrent && styles.currentSentenceText]}>
                    Sentence {index + 1}
                  </Text>
                  <Text style={[styles.sentenceTime, isEnglishCurrent && styles.currentSentenceText]}>{rightText}</Text>
                </View>

                {/* 본문: 보기 상태에 따라 영어 / 한국어 / 단어 */}
                {view === 0 && (
                  <Text style={[styles.sentenceText, isEnglishCurrent && styles.currentSentenceText]}>
                    {sentence.text}
                  </Text>
                )}

                {view === 1 &&
                  (translations[index] === undefined ? (
                    <ActivityIndicator size="small" color="#888" style={styles.cardLoader} />
                  ) : (
                    <Text style={styles.koreanText}>{translations[index]}</Text>
                  ))}

                {view === 2 &&
                  (keywords[index] === undefined ? (
                    <ActivityIndicator size="small" color="#888" style={styles.cardLoader} />
                  ) : keywords[index].length > 0 ? (
                    <View style={styles.vocabList}>
                      {keywords[index].map((kw, i) => (
                        <View key={i} style={styles.vocabRow}>
                          <Text style={styles.vocabTerm}>{kw.term}</Text>
                          <Text style={styles.vocabMeaning}>{kw.meaning}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.vocabEmpty}>학습할 단어 정보를 불러오지 못했습니다</Text>
                  ))}

                {/* 보기 단계 표시 점 */}
                <View style={styles.dots}>
                  {[0, 1, 2].map((d) => (
                    <View key={d} style={[styles.dot, view === d && styles.dotActive]} />
                  ))}
                </View>
              </TouchableOpacity>
            </PanGestureHandler>
          );
        })}
      </ScrollView>

      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          Sentence {currentSentenceIndex + 1} of {sentences.length}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((currentSentenceIndex + 1) / sentences.length) * 100}%` }]} />
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 12,
  },
  hintText: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
  },
  videoToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  videoToggleIcon: {
    fontSize: 16,
  },
  videoContainer: {
    overflow: 'hidden',
  },
  scriptContainer: {
    flex: 1,
    padding: 16,
  },
  sentenceContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  currentSentence: {
    backgroundColor: '#667eea',
  },
  koreanCard: {
    backgroundColor: '#f0f8ff',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  vocabCard: {
    backgroundColor: '#fffaf0',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  sentenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sentenceNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  sentenceTime: {
    fontSize: 12,
    color: '#666',
  },
  sentenceText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  currentSentenceText: {
    color: '#fff',
  },
  koreanText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1a4d2e',
    fontWeight: '500',
  },
  cardLoader: {
    marginVertical: 12,
  },
  vocabList: {
    marginTop: 2,
  },
  vocabRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  vocabTerm: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#b35900',
    width: '45%',
    paddingRight: 8,
  },
  vocabMeaning: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  vocabEmpty: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginVertical: 8,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ccc',
  },
  dotActive: {
    backgroundColor: '#667eea',
    width: 18,
  },
  progressContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#667eea',
    borderRadius: 2,
  },
});
