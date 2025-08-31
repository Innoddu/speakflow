import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Animated,
} from 'react-native';
import {
  PanGestureHandler,
  State,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import type {
  PanGestureHandlerGestureEvent,
  PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { getPracticeTranscript, PracticeSentence, getAudioUrl, AudioInfo, getVideoDetails } from '../services/youtubeService';
import * as Speech from 'expo-speech';
import TTSService from '../services/ttsService';
import { Audio } from 'expo-av';
import VideoPlayer, { VideoPlayerRef } from '../components/VideoPlayer';
import VoiceSelector from '../components/VoiceSelector';
import AudioPlayer, { AudioPlayerRef } from '../components/AudioPlayer';
import { getTranscriptData, ProcessedSentence, testConnection } from '../services/whisperService';
import { addToHistory, updateAudioStatus } from '../services/historyService';
import { API_CONFIG } from '../config/api';

type ScriptPracticeScreenRouteProp = RouteProp<RootStackParamList, 'ScriptPractice'>;

const { width } = Dimensions.get('window');

// Utility functions
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface SentenceItemProps {
  sentence: PracticeSentence;
  index: number;
  isCurrentSentence: boolean;
  showingTranslation: boolean;
  swipeAnim: Animated.Value;
  onPress: () => void;
  onGestureEvent: (event: any) => void;
  onGestureStateChange: (event: any) => void;
}

const SentenceItem: React.FC<SentenceItemProps> = React.memo(({ 
  sentence, 
  index, 
  isCurrentSentence,
  showingTranslation,
  swipeAnim,
  onPress,
  onGestureEvent,
  onGestureStateChange 
}) => (
  <PanGestureHandler
    onGestureEvent={onGestureEvent}
    onHandlerStateChange={onGestureStateChange}
  >
    <Animated.View
      style={[
        styles.sentenceContainer,
        isCurrentSentence && styles.currentSentence,
        showingTranslation && styles.translationMode,
        {
          transform: [{ translateX: swipeAnim }]
        }
      ]}
    >
      <TouchableOpacity
        style={styles.sentenceContent}
        onPress={onPress}
      >
        <View style={styles.sentenceHeader}>
          <Text style={[
            styles.sentenceNumber,
            isCurrentSentence && styles.currentSentenceNumber
          ]}>
            Sentence {index + 1}
          </Text>
          <Text style={[
            styles.sentenceTime,
            isCurrentSentence && styles.currentSentenceTime
          ]}>
            {formatTime(sentence.start)} - {formatTime(sentence.end)}
          </Text>
        </View>
        
        <Text style={[
          styles.sentenceText,
          isCurrentSentence && styles.currentSentenceText
        ]}>
          {sentence.text}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  </PanGestureHandler>
));

export default function ScriptPracticeScreen() {
  const route = useRoute<ScriptPracticeScreenRouteProp>();
  const { videoId, videoTitle } = route.params;

  const [sentences, setSentences] = useState<PracticeSentence[]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [audioInfo, setAudioInfo] = useState<AudioInfo | null>(null);
  const [audioLoading, setAudioLoading] = useState(true);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<'tts' | 'original' | 'video' | null>(null);
  const [selectedVoice, setSelectedVoice] = useState('nova');
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  const [isGlobalPlaying, setIsGlobalPlaying] = useState(false); // Global playback state
  const [showVideo, setShowVideo] = useState(true); // Video display toggle
  const [translations, setTranslations] = useState<{[key: number]: string}>({}); // Translation cache
  const [showingTranslation, setShowingTranslation] = useState<{[key: number]: boolean}>({}); // Translation display state
  const [translating, setTranslating] = useState<{[key: number]: boolean}>({}); // Translation in progress state
  const swipeAnimations = useRef<{[key: number]: Animated.Value}>({}).current; // Swipe animations
  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const audioPlayerRef = useRef<AudioPlayerRef>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const sentenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoHeightAnim = useRef(new Animated.Value(1)).current; // Video height animation
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [currentSentence, setCurrentSentence] = useState<PracticeSentence | null>(null);
  // State for tracking sentence positions
  const [sentenceLayouts, setSentenceLayouts] = useState<{[key: number]: number}>({});
  const [showModeAlert, setShowModeAlert] = useState(false);

  const handleSentenceLayout = (index: number, layout: any) => {
    setSentenceLayouts(prev => ({
      ...prev,
      [index]: layout.y
    }));
  };

  useEffect(() => {
    // Test connection first
    testNetworkConnection();
    
    // Configure audio session for better playback
    configureAudioSession();
    loadTranscript();
    loadAudio();
    
    // Add to history when video is accessed
    addVideoToHistory();

    // Cleanup function
    return () => {
      if (sentenceTimerRef.current) {
        clearTimeout(sentenceTimerRef.current);
        sentenceTimerRef.current = null;
      }
    };
  }, []);

  const testNetworkConnection = async () => {
    try {
      console.log('🔬 Testing network connection...');
      const isConnected = await testConnection();
      console.log('🔬 Connection test result:', isConnected);
      if (!isConnected) {
        Alert.alert('Connection Error', 'Cannot connect to server. Please check if the backend is running.');
      }
    } catch (error) {
      console.error('🔬 Connection test error:', error);
      Alert.alert('Connection Error', 'Network test failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const configureAudioSession = async () => {
    try {
      if (Platform.OS === 'ios') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          playsInSilentModeIOS: true, // This is crucial for iOS
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        console.log('✅ Audio session configured for iOS');
      }
    } catch (error) {
      console.error('❌ Failed to configure audio session:', error);
    }
  };

  const addVideoToHistory = async () => {
    try {
      // Get video details for history entry
      const videoDetails = await getVideoDetails(videoId);
      
      await addToHistory({
        videoId,
        title: videoTitle || videoDetails.title,
        thumbnail: videoDetails.thumbnail,
        channelTitle: videoDetails.channelTitle,
        duration: videoDetails.duration,
        transcriptSource: 'youtube' // Will be updated based on actual source used
      });
      
      console.log('✅ Video added to history:', videoTitle);
    } catch (error) {
      console.error('⚠️ Failed to add video to history:', error);
      // Don't show error to user - history is not critical functionality
    }
  };

  const loadTranscript = async () => {
    try {
      console.log('🔍 Loading transcript with Whisper/YouTube integration...');
      const result = await getTranscriptData(videoId);
      
      if (result.success && result.sentences.length > 0) {
        console.log(`✅ Transcript loaded from ${result.source}:`, result.sentences.length, 'sentences');
        
        // Convert ProcessedSentence to PracticeSentence format
        const practiceSentences: PracticeSentence[] = result.sentences.map((sentence: ProcessedSentence, index: number) => ({
          text: sentence.text,
          start: sentence.start,
          end: sentence.end,
          duration: sentence.duration,
          // Add any missing fields for compatibility
          correctedWords: sentence.text,
          originalWords: sentence.text,
        }));
        
        setSentences(practiceSentences);
        
        // Update history with transcript source
        await addToHistory({
          videoId,
          title: videoTitle,
          thumbnail: '', // Will be filled by getVideoDetails
          channelTitle: '',
          transcriptSource: result.source
        });
        
      } else {
        throw new Error('No transcript data available');
      }
    } catch (error) {
      console.error('❌ Failed to load transcript:', error);
      
      // Handle specific error cases
      let userMessage = 'Failed to load transcript. Please try again.';
      
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('no english subtitles') || 
            errorMessage.includes('no subtitles available') ||
            errorMessage.includes('no english captions')) {
          userMessage = '❌ This video doesn\'t have English subtitles.\n\n' +
                       '💡 Please try a different video with English subtitles or closed captions (CC).';
        } else if (errorMessage.includes('video not accessible') ||
                   errorMessage.includes('private') ||
                   errorMessage.includes('age-restricted')) {
          userMessage = '🚫 This video is not accessible.\n\n' +
                       '💡 Please try a publicly available video without age restrictions.';
        } else if (errorMessage.includes('network') || 
                   errorMessage.includes('connection')) {
          userMessage = '🌐 Network connection failed.\n\n' +
                       '💡 Please check your internet connection and try again.';
        } else if (errorMessage.includes('both youtube subtitles and whisper')) {
          userMessage = '❌ This video doesn\'t have English subtitles and audio extraction failed.\n\n' +
                       '💡 Please try a different video with English subtitles.';
        }
      }
      
      setTranscriptError(userMessage);
      
      // Show alert only on native platforms
      if (Platform.OS !== 'web') {
        Alert.alert('Transcript Error', userMessage);
      } else {
        console.error('🚨 Web transcript error:', userMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadAudio = async () => {
    try {
      setAudioLoading(true);
      console.log('⏳ Starting to load audio for video:', videoId);
      console.log('⚠️ This may take 1-2 minutes for first-time downloads...');
      console.log('🌐 API Base URL:', API_CONFIG.BASE_URL);
      console.log('📱 Platform:', Platform.OS);
      
      const audio = await getAudioUrl(videoId);
      setAudioInfo(audio);
      console.log('✅ Audio info loaded successfully:', {
        title: audio.title,
        duration: audio.duration,
        format: audio.format,
        cached: audio.cached,
        source: audio.source,
        audioUrlLength: audio.audioUrl.length,
        audioUrlStart: audio.audioUrl.substring(0, 50) + '...'
      });
      
      // Update history with audio status
      await updateAudioStatus(videoId, true, audio.source);
    } catch (error) {
      console.error('❌ Failed to load audio:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
        videoId,
        platform: Platform.OS,
        apiUrl: API_CONFIG.BASE_URL
      });
      setAudioInfo(null);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('timeout');
      const isNetworkError = errorMessage.includes('Network Error') || errorMessage.includes('CORS');
      
      if (Platform.OS === 'web') {
        // For web, don't show alert - just log and continue with video fallback
        console.log('🌐 Web platform: Using video player fallback due to audio loading error');
        console.log('🔍 Error type:', isTimeout ? 'Timeout' : isNetworkError ? 'Network/CORS' : 'Other');
      } else {
        Alert.alert(
          'Audio Loading Error', 
          isTimeout 
            ? 'Audio download timed out. This can happen with longer videos.\n\nYou can:\n• Try again later\n• Use video playback instead\n• Choose a shorter video'
            : 'Failed to load audio. Video will be used instead.\n\nError: ' + errorMessage,
          [
            { text: 'Use Video', style: 'default' },
            { text: 'Try Again', onPress: loadAudio, style: 'cancel' }
          ]
        );
      }
    } finally {
      setAudioLoading(false);
    }
  };

  const speakSentence = async (text: string) => {
    try {
      console.log('🗣️ TTS speaking:', text.substring(0, 50) + '...');
      setIsTTSPlaying(true);
      setIsGlobalPlaying(true);
      
      // For immediate response: Start expo-speech immediately, try OpenAI in background
      console.log('🚀 Starting immediate TTS with expo-speech for instant response');
      
      // Start expo-speech immediately for zero delay
      TTSService.speakWithExpoSpeech(text).then(() => {
        setIsTTSPlaying(false);
        setIsGlobalPlaying(false);
      }).catch(() => {
        setIsTTSPlaying(false);
        setIsGlobalPlaying(false);
      });
      
      // Optional: Try OpenAI TTS in background for future improvements
      // (This won't block the immediate response)
      TTSService.speakWithOpenAI(text, { 
        voice: selectedVoice as any,
        speed: 1.0
      }).catch(() => {
        // Silently fail - expo-speech is already running
      });
      
    } catch (error) {
      console.error('❌ TTS error:', error);
      setIsTTSPlaying(false);
      setIsGlobalPlaying(false);
    }
  };

  const scrollToCurrentSentence = (index: number) => {
    // Scroll to current sentence position
    if (scrollViewRef.current) {
      // Use measured layout position if available, otherwise estimate
      const scrollPosition = sentenceLayouts[index] || (index * 120);
      
      console.log(`📜 Scrolling to sentence ${index + 1} at position ${scrollPosition}px`);
      
      scrollViewRef.current.scrollTo({
        y: scrollPosition,
        animated: true,
      });
    }
  };

  // Unified play/pause control function
  const toggleGlobalPlayback = async () => {
    if (isGlobalPlaying) {
      // Pause: stop all playback
      console.log('⏸️ Global pause - stopping all playback');
      
      // Stop TTS
      if (isTTSPlaying) {
        await TTSService.stop();
        setIsTTSPlaying(false);
      }
      
      // Stop original audio
      if (isAudioPlaying && audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        setIsAudioPlaying(false);
      }
      
      // Stop Auto Play
      if (isAutoPlay) {
        setIsAutoPlay(false);
      }
      
      // Clear timers
      if (sentenceTimerRef.current) {
        clearTimeout(sentenceTimerRef.current);
        sentenceTimerRef.current = null;
      }
      
      setIsGlobalPlaying(false);
      
    } else {
      // Play: start playback according to current mode
      console.log('▶️ Global play - starting playback');
      const currentSentence = sentences[currentSentenceIndex];
      
      if (!currentSentence) return;
      
      setIsGlobalPlaying(true);
      
      if (playbackMode === 'tts') {
        console.log('🗣️ Starting TTS playback');
        speakSentence(currentSentence.text);
      } else if (playbackMode === 'original') {
        console.log('🎵 Starting Original playback');
        playSentenceOnly(currentSentence);
      } else {
        // Set to Original mode if no mode is selected
        setPlaybackMode('original');
        playSentenceOnly(currentSentence);
      }
    }
  };

  const playVideoSentence = (sentence: PracticeSentence) => {
    // Use video player to seek to the specified section
    if (videoPlayerRef.current) {
      videoPlayerRef.current.seekTo(sentence.start);
      
      // Start playback after a slight delay (wait for seekTo completion)
      setTimeout(() => {
        videoPlayerRef.current?.play();
      }, 500);
      
      // Pause after sentence duration
      sentenceTimerRef.current = setTimeout(() => {
        videoPlayerRef.current?.pause();
        setIsPlaying(false);
        setIsGlobalPlaying(false);
        
        // Auto-advance to next sentence if Auto Play is enabled
        if (isAutoPlay && currentSentenceIndex < sentences.length - 1) {
          const nextIndex = currentSentenceIndex + 1;
          setCurrentSentenceIndex(nextIndex);
          setTimeout(() => {
            playVideoSentence(sentences[nextIndex]);
          }, 1000); // 1 second interval
        }
      }, sentence.duration * 1000);
      
    } else {
      console.log('❌ No video player available');
      setIsGlobalPlaying(false);
    }
  };

  const playSentenceOnly = (sentence: PracticeSentence) => {
    if (!audioPlayerRef.current) return;

    console.log('🎵 Playing sentence audio:', sentence);
    setCurrentSentence(sentence);
    setIsPlaying(true);

    // Seek to sentence start
    audioPlayerRef.current.seekTo(sentence.start);
    
    // Calculate sentence end time
    const endTime = sentence.start + sentence.duration;
    
    // Use AI-powered Voice Activity Detection for more accurate stopping
    if (Platform.OS === 'web' && audioPlayerRef.current.playWithVAD) {
      audioPlayerRef.current.playWithVAD(() => {
        console.log('🔇 AI detected silence, stopping audio');
        setIsPlaying(false);
        setCurrentSentence(null);
        
        // Auto-advance to next sentence if Auto Play is enabled
        if (isAutoPlay) {
          const currentIndex = sentences.findIndex(s => s.start === sentence.start);
          if (currentIndex < sentences.length - 1) {
            setTimeout(() => {
              playSentenceOnly(sentences[currentIndex + 1]);
            }, 500); // Small delay before next sentence
          }
        }
      }, endTime); // Pass the end time to playWithVAD
    } else {
      // Fallback to timer-based approach for native or when VAD is not available
      audioPlayerRef.current.play();
      
      // Auto-stop after sentence duration with some padding
      const paddingMs = 200; // 200ms padding to ensure complete playback
      const stopTimer = setTimeout(() => {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.pause();
          console.log('⏰ Timer-based stop after', sentence.duration + paddingMs, 'ms');
          setIsPlaying(false);
          setCurrentSentence(null);
          
          // Auto-advance to next sentence if Auto Play is enabled
          if (isAutoPlay) {
            const currentIndex = sentences.findIndex(s => s.start === sentence.start);
            if (currentIndex < sentences.length - 1) {
              setTimeout(() => {
                playSentenceOnly(sentences[currentIndex + 1]);
              }, 500); // Small delay before next sentence
            }
          }
        }
      }, sentence.duration * 1000 + paddingMs);

      // Store the timer reference for cleanup
      if (sentenceTimerRef.current) {
        clearTimeout(sentenceTimerRef.current);
      }
      sentenceTimerRef.current = stopTimer;
    }
  };

  const handleSentencePress = async (index: number) => {
    // Stop if currently playing
    if (isPlaying || isTTSPlaying) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        setIsPlaying(false);
      }
      TTSService.stop();
      setIsTTSPlaying(false);
      return;
    }

    // Scroll to current sentence
    scrollToCurrentSentence(index);
    setCurrentSentenceIndex(index);
    
    // Show mode selection alert if no playback mode is selected
    if (!playbackMode) {
      setShowModeAlert(true);
      // Auto hide after 3 seconds
      setTimeout(() => setShowModeAlert(false), 3000);
      return;
    }
    
    // Clear timers
    if (sentenceTimerRef.current) {
      clearTimeout(sentenceTimerRef.current);
      sentenceTimerRef.current = null;
    }
    
    const sentence = sentences[index];
    
    // Play according to selected mode
    if (playbackMode === 'tts') {
      console.log('🗣️ Playing with TTS mode');
      TTSService.stop();
      await speakSentence(sentence.text);
    } else if (playbackMode === 'original') {
      console.log('🎵 Playing with Original mode');
      playSentenceOnly(sentence);
    }
  };

  const handleAutoPlay = () => {
     if (isAutoPlay) {
       // Stop Auto Play when pausing
       setIsAutoPlay(false);
       setIsGlobalPlaying(false);
       
       // Stop all playback
       setIsPlaying(false);
       setIsTTSPlaying(false);
       setIsAudioPlaying(false);
       
       if (audioPlayerRef.current) {
         audioPlayerRef.current.pause();
         setIsAudioPlaying(false);
       }
       if (isTTSPlaying) {
         TTSService.stop();
         setIsTTSPlaying(false);
       }
       if (sentenceTimerRef.current) {
         clearTimeout(sentenceTimerRef.current);
         sentenceTimerRef.current = null;
       }
     } else {
       // Start Auto Play when starting
       setIsAutoPlay(true);
       
       // Set to Original mode and start playing from current sentence
       if (!playbackMode) {
         setPlaybackMode('original');
       }
       
      startAutoPlay();
    }
  };

  const startAutoPlay = () => {
    if (!isAutoPlay || currentSentenceIndex >= sentences.length) {
      // Stop Auto Play when completed
      setIsGlobalPlaying(false);
      return;
    }

    const sentence = sentences[currentSentenceIndex];
    
    // Play next sentence (sentence duration + 1 second interval)
    const playNextSentence = () => {
      const nextIndex = currentSentenceIndex + 1;
      if (nextIndex < sentences.length && isAutoPlay) {
      setTimeout(() => {
          setCurrentSentenceIndex(nextIndex);
          scrollToCurrentSentence(nextIndex);
          
          // Play next sentence according to current mode
          if (playbackMode === 'original') {
            playSentenceOnly(sentences[nextIndex]);
          } else if (playbackMode === 'tts') {
            speakSentence(sentences[nextIndex].text);
          }
          
          startAutoPlay();
        }, (sentences[currentSentenceIndex]?.duration || 3) * 1000 + 1000);
      } else {
        // Auto Play 완료 시 글로벌 재생 상태 업데이트
        setIsGlobalPlaying(false);
        setIsAutoPlay(false);
      }
    };

    playNextSentence();
  };

  const toggleVideo = () => {
    if (showVideo) {
      // Hide video: change state after animation
      Animated.timing(videoHeightAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start(() => {
        setShowVideo(false);
      });
    } else {
      // Show video: animate after state change
      setShowVideo(true);
      Animated.timing(videoHeightAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  };

  const translateSentence = async (text: string, index: number) => {
    // If already translated, just toggle state
    if (translations[index]) {
      const newShowingState = { ...showingTranslation };
      newShowingState[index] = !newShowingState[index];
      setShowingTranslation(newShowingState);
      
      // Animate swipe effect
      animateSwipe(index, newShowingState[index]);
      return;
    }

    // Prevent duplicate calls if already translating
    if (translating[index]) {
      console.log('Translation already in progress for sentence', index);
      return;
    }

    try {
      // Set translation start state
      const newTranslatingState = { ...translating };
      newTranslatingState[index] = true;
      setTranslating(newTranslatingState);

      console.log('🌐 Starting translation for sentence:', index, text);

      // Call translation API
      const response = await fetch(`${API_CONFIG.BASE_URL}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          targetLanguage: 'ko'
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Translation response:', data);

      if (data.success && data.translatedText) {
        // Store translation result in cache
        const newTranslations = { ...translations };
        newTranslations[index] = data.translatedText;
        setTranslations(newTranslations);

        // Enable translation display state
        const newShowingState = { ...showingTranslation };
        newShowingState[index] = true;
        setShowingTranslation(newShowingState);

        // Animate swipe effect
        animateSwipe(index, true);
      } else {
        throw new Error(data.error || 'Translation failed');
      }
    } catch (error) {
      console.error('❌ Translation error:', error);
      Alert.alert(
        'Translation Error',
        'Failed to translate the sentence.\n\n' +
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
        'Please check your network connection and try again.'
      );
    } finally {
      // Reset translation state
      const newTranslatingState = { ...translating };
      newTranslatingState[index] = false;
      setTranslating(newTranslatingState);
    }
  };

  const getSwipeAnimation = (index: number) => {
    if (!swipeAnimations[index]) {
      swipeAnimations[index] = new Animated.Value(0);
    }
    return swipeAnimations[index];
  };

  const animateSwipe = (index: number, toTranslation: boolean) => {
    const animation = getSwipeAnimation(index);
    
    Animated.timing(animation, {
      toValue: toTranslation ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const handleSwipeLeft = (index: number) => {
    // English → Korean translation
    const sentence = sentences[index];
    if (sentence && sentence.text) {
      translateSentence(sentence.text, index);
    }
  };

  const handleSwipeRight = (index: number) => {
    // Korean → English
    const newShowingState = { ...showingTranslation };
    newShowingState[index] = false;
    setShowingTranslation(newShowingState);
    
    // Animate swipe effect
    animateSwipe(index, false);
  };

  // 제스처 이벤트 핸들러
  const handleGestureEvent = (event: any, index: number) => {
    if (swipeAnimations[index]) {
      swipeAnimations[index].setValue(event.nativeEvent.translationX);
    }
  };

  // 제스처 상태 변경 핸들러
  const handleGestureStateChange = (event: any, index: number) => {
    if (event.nativeEvent.state === State.END) {
      const { translationX } = event.nativeEvent;
      
      if (translationX < -100) {
        handleSwipeLeft(index);
      } else if (translationX > 100) {
        handleSwipeRight(index);
      }

      Animated.spring(swipeAnimations[index], {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }
  };

  // 컨트롤 버튼 렌더링 컴포넌트
  const renderControlButtons = () => (
    <View style={styles.controlButtons}>
      <TouchableOpacity
        style={[
          styles.controlButton,
          styles.originalButton,
          playbackMode === 'original' && styles.activeButton
        ]}
        onPress={() => {
          if (playbackMode === 'original' && isPlaying) {
            // 재생 중이면 중지
            if (audioPlayerRef.current) {
              audioPlayerRef.current.pause();
              setIsPlaying(false);
            }
          } else {
            // 재생 시작
            setPlaybackMode('original');
            if (currentSentenceIndex < sentences.length) {
              playSentenceOnly(sentences[currentSentenceIndex]);
            }
          }
        }}
      >
        <Text style={[
          styles.controlButtonText,
          playbackMode === 'original' && styles.activeButtonText
        ]}>
          {playbackMode === 'original' && isPlaying ? 'Pause' : 'Original'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.controlButton,
          styles.ttsButton,
          playbackMode === 'tts' && styles.activeButton
        ]}
        onPress={() => {
          if (playbackMode === 'tts' && isTTSPlaying) {
            // TTS 재생 중이면 중지
            TTSService.stop();
            setIsTTSPlaying(false);
          } else {
            // TTS 재생 시작
            setPlaybackMode('tts');
            if (currentSentenceIndex < sentences.length) {
              speakSentence(sentences[currentSentenceIndex].text);
            }
          }
        }}
      >
        <Text style={[
          styles.controlButtonText,
          playbackMode === 'tts' && styles.activeButtonText
        ]}>
          {playbackMode === 'tts' && isTTSPlaying ? 'Pause' : 'TTS'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.controlButton,
          styles.playButton,
          isAutoPlay && styles.activeButton
        ]}
        onPress={() => {
          setIsAutoPlay(!isAutoPlay);
          if (!isAutoPlay && currentSentenceIndex < sentences.length - 1) {
            // 자동 재생 시작
            if (playbackMode === 'tts') {
              speakSentence(sentences[currentSentenceIndex].text);
            } else if (playbackMode === 'original') {
              playSentenceOnly(sentences[currentSentenceIndex]);
            }
          }
        }}
      >
        <Text style={[
          styles.controlButtonText,
          isAutoPlay && styles.activeButtonText
        ]}>
          {isAutoPlay ? 'Stop Auto' : 'Auto Play'}
        </Text>
      </TouchableOpacity>
    </View>
  );

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
          
          {/* Video Toggle Control - Compact and elegant button */}
          <TouchableOpacity
            style={styles.videoToggleButton}
            onPress={toggleVideo}
            activeOpacity={0.7}
          >
            <Text style={styles.videoToggleIcon}>
              {showVideo ? '📹' : '📱'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.controlsContainer}>
          {/* Current Sentence Label - Moved to top */}
          <Text style={styles.currentSentenceLabel}>
            Current Sentence {currentSentenceIndex + 1}
            {playbackMode && (
              <Text style={styles.modeIndicator}>
                {' '}({playbackMode === 'tts' ? '🗣️ TTS Mode' : '🎵 Original Mode'})
              </Text>
            )}
          </Text>
          
          {/* Arrange all control buttons in two rows */}
          <View style={styles.allControlsRow}>
                         <TouchableOpacity
               style={[styles.compactButton, styles.autoPlayButton, isAutoPlay && styles.activeButton]}
               onPress={handleAutoPlay}
             >
              <Text style={[styles.compactButtonText, isAutoPlay && styles.activeButtonText]}>
                {isAutoPlay ? '⏹️ Stop' : '▶️ Auto'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.compactButton, styles.playPauseButton, isGlobalPlaying && styles.activeButton]}
              onPress={toggleGlobalPlayback}
            >
              <Text style={[styles.compactButtonText, isGlobalPlaying && styles.activeButtonText]}>
                {isGlobalPlaying ? '⏸️ Pause' : '▶️ Play'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.compactButton, 
                styles.ttsButton,
                playbackMode === 'tts' && styles.activeButton
              ]}
              onPress={() => {
                setPlaybackMode('tts');
                console.log('🎛️ Mode set to TTS');
              }}
              onLongPress={() => {
                setShowVoiceSelector(true);
              }}
            >
              <Text style={[
                styles.compactButtonText,
                playbackMode === 'tts' && styles.activeButtonText
              ]}>
                🗣️ TTS
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.compactButton, 
                styles.originalButton,
                playbackMode === 'original' && styles.activeButton
              ]}
              onPress={() => {
                setPlaybackMode('original');
                console.log('🎛️ Mode set to Original');
              }}
            >
              <Text style={[
                styles.compactButtonText,
                playbackMode === 'original' && styles.activeButtonText
              ]}>
                🎵 Original
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Animated.View 
        style={[
          styles.videoContainer,
          {
            height: videoHeightAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 200], // 0에서 200px로 애니메이션
            }),
            opacity: videoHeightAnim,
          }
        ]}
      >
        <VideoPlayer videoId={videoId} ref={videoPlayerRef} />
      </Animated.View>

      {audioLoading ? (
        <View style={styles.audioLoadingContainer}>
          <ActivityIndicator size="small" color="#667eea" />
          <Text style={styles.audioLoadingText}>Loading audio...</Text>
        </View>
      ) : audioInfo ? (
        <AudioPlayer audioUrl={audioInfo.audioUrl} ref={audioPlayerRef} />
      ) : (
        <View style={styles.audioErrorContainer}>
          <Text style={styles.audioErrorText}>📹 Using video player for audio</Text>
          <Text style={styles.audioErrorSubText}>Audio conversion failed - using video as fallback</Text>
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        style={styles.scriptContainer}
        showsVerticalScrollIndicator={false}
      >
        {sentences.map((sentence, index) => (
          <TouchableOpacity
            key={`sentence-${index}`}
            style={[
              styles.sentenceContainer,
              index === currentSentenceIndex && styles.currentSentence,
              showingTranslation[index] && styles.translationMode,
            ]}
            onPress={() => handleSentencePress(index)}
            onLayout={(event) => handleSentenceLayout(index, event.nativeEvent.layout)}
          >
            <View style={styles.sentenceHeader}>
              <Text style={[
                styles.sentenceNumber,
                index === currentSentenceIndex && styles.currentSentenceNumber
              ]}>
                Sentence {index + 1}
              </Text>
              <Text style={[
                styles.sentenceTime,
                index === currentSentenceIndex && styles.currentSentenceTime
              ]}>
                {formatTime(sentence.start)} - {formatTime(sentence.end)}
              </Text>
            </View>
            
            <Text style={[
              styles.sentenceText,
              index === currentSentenceIndex && styles.currentSentenceText
            ]}>
              {sentence.text}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          Sentence {currentSentenceIndex + 1} of {sentences.length}
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentSentenceIndex + 1) / sentences.length) * 100}%` },
            ]}
          />
        </View>
      </View>

      <VoiceSelector
        visible={showVoiceSelector}
        onClose={() => setShowVoiceSelector(false)}
        onSelect={(voiceId) => setSelectedVoice(voiceId)}
        selectedVoice={selectedVoice}
      />

      {/* Mode Selection Alert */}
      {showModeAlert && (
        <View style={styles.alertContainer}>
          <Text style={styles.alertText}>상단의 모드를 먼저 선택해주세요</Text>
        </View>
      )}

    </GestureHandlerRootView>
  );
}

const colors = {
  primary: '#667eea',
  background: '#f8fafc',
  white: '#fff',
  border: '#e0e0e0',
  text: {
    primary: '#333',
    secondary: '#666',
    light: '#999',
  },
};

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
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 12,
  },
  videoToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
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
  controlsContainer: {
    gap: 8,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
  },
  allControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  currentSentenceLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  modeIndicator: {
    fontSize: 11,
    fontWeight: 'normal',
    color: '#667eea',
  },
  controlButton: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    backgroundColor: '#f5f5f5',
  },
  compactButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  autoPlayButton: {
    backgroundColor: '#e3f2fd',
  },
  playPauseButton: {
    backgroundColor: '#f3e5f5',
  },
  ttsButton: {
    backgroundColor: '#e3f2fd',
  },
  originalButton: {
    backgroundColor: '#e8f5e9',
  },
  activeButton: {
    backgroundColor: '#667eea',
  },
  controlButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  compactButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    textAlign: 'center',
  },
  activeButtonText: {
    color: '#fff',
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sentenceContent: {
    flex: 1,
  },
  currentSentence: {
    backgroundColor: '#667eea',
  },
  translationMode: {
    backgroundColor: '#f0f8ff',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
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
  currentSentenceNumber: {
    color: '#fff',
  },
  sentenceTime: {
    fontSize: 12,
    color: '#666',
  },
  currentSentenceTime: {
    color: '#fff',
  },
  sentenceText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  currentSentenceText: {
    color: '#fff',
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
  audioLoadingContainer: {
    height: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    margin: 8,
    flexDirection: 'row',
  },
  audioLoadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  audioErrorContainer: {
    height: 50,
    backgroundColor: '#ffe6e6',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    margin: 8,
    borderWidth: 1,
    borderColor: '#ffcccc',
  },
  audioErrorText: {
    fontSize: 14,
    color: '#cc6666',
    fontStyle: 'italic',
  },
  audioErrorSubText: {
    fontSize: 12,
    color: '#cc6666',
    marginTop: 4,
    textAlign: 'center',
  },
  controlButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },

  controlButton: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    backgroundColor: '#f5f5f5',
  },

  originalButton: {
    backgroundColor: '#e8f5e9',
  },

  ttsButton: {
    backgroundColor: '#e3f2fd',
  },

  playButton: {
    backgroundColor: '#fff3e0',
  },

  activeButton: {
    backgroundColor: '#667eea',
  },

  controlButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },

  activeButtonText: {
    color: '#fff',
  },

  bottomControls: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0, // iOS에서 하단 여백 추가
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  modalButton: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    width: '45%',
  },
  originalModalButton: {
    backgroundColor: '#e8f5e9',
  },
  ttsModalButton: {
    backgroundColor: '#e3f2fd',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  modalButtonSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  modalCloseButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  modalCloseButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
  },
  alertContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: '#fff3cd',
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  alertText: {
    color: '#856404',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
}); 