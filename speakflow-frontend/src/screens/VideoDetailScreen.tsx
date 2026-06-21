import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { getVideoDetails, VideoDetails } from '../services/youtubeService';
import { WebView } from 'react-native-webview';
import VideoPlayer, { VideoPlayerRef } from '../components/VideoPlayer';

type VideoDetailScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'VideoDetail'>;
type VideoDetailScreenRouteProp = RouteProp<RootStackParamList, 'VideoDetail'>;

export default function VideoDetailScreen() {
  const route = useRoute<VideoDetailScreenRouteProp>();
  const navigation = useNavigation<VideoDetailScreenNavigationProp>();
  
  // Safely extract params with fallback values
  const videoId = route.params?.videoId || '';
  const videoTitle = route.params?.videoTitle || 'Unknown Video';

  const [videoDetails, setVideoDetails] = useState<VideoDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const videoPlayerRef = useRef<VideoPlayerRef>(null);

  useEffect(() => {
    if (videoId) {
      loadVideoDetails();
    } else {
      console.error('❌ No videoId provided to VideoDetailScreen');
      setLoading(false);
    }
  }, [videoId]);

  const loadVideoDetails = async () => {
    try {
      const details = await getVideoDetails(videoId);
      setVideoDetails(details);
    } catch (error) {
      Alert.alert('Error', 'Failed to load video details');
    } finally {
      setLoading(false);
    }
  };

  const handlePracticeScript = () => {
    navigation.navigate('ScriptPractice', {
      videoId,
      videoTitle: videoDetails?.title || videoTitle,
    });
  };

  const formatDuration = (duration: string) => {
    // Convert ISO 8601 duration to readable format
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return duration;

    const hours = match[1] ? match[1].replace('H', '') : '0';
    const minutes = match[2] ? match[2].replace('M', '') : '0';
    const seconds = match[3] ? match[3].replace('S', '') : '0';

    if (hours !== '0') {
      return `${hours}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.padStart(2, '0')}`;
  };

  const formatNumber = (num: string) => {
    const number = parseInt(num);
    if (number >= 1000000) {
      return `${(number / 1000000).toFixed(1)}M`;
    } else if (number >= 1000) {
      return `${(number / 1000).toFixed(1)}K`;
    }
    return number.toString();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading video details...</Text>
      </View>
    );
  }

  if (!videoId) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No video ID provided</Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!videoDetails) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load video details</Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <VideoPlayer videoId={videoId} ref={videoPlayerRef} />
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Duration</Text>
          <Text style={styles.statValue}>{formatDuration(videoDetails.duration)}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Views</Text>
          <Text style={styles.statValue}>{formatNumber(videoDetails.viewCount)}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Likes</Text>
          <Text style={styles.statValue}>{formatNumber(videoDetails.likeCount)}</Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={styles.title}>{videoDetails.title}</Text>
        <Text style={styles.channel}>{videoDetails.channelTitle}</Text>
        <Text style={styles.desc}>{videoDetails.description}</Text>
        <View style={styles.channelInfo}>
          <Text style={styles.channelTitle}>{videoDetails.channelTitle}</Text>
          <Text style={styles.publishedAt}>
            Published on {new Date(videoDetails.publishedAt).toLocaleDateString()}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.practiceButton}
          onPress={handlePracticeScript}
        >
          <Text style={styles.practiceButtonText}>Practice Script</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  info: { padding: 16 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  channel: { fontSize: 16, color: '#666', marginBottom: 8 },
  desc: { fontSize: 14, color: '#333' },
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  channelInfo: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  channelTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  publishedAt: {
    fontSize: 14,
    color: '#666',
  },
  practiceButton: {
    backgroundColor: '#667eea',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  practiceButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  videoPlayerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  videoPlayer: {
    flex: 1,
  },
  backButton: {
    backgroundColor: '#667eea',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
}); 