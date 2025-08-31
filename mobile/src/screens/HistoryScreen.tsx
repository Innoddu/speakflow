import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { getHistory, removeFromHistory, clearHistory, HistoryVideo, removeFromHistoryWithCache, clearHistoryWithCache } from '../services/historyService';
import { Ionicons } from '@expo/vector-icons';
import WebAlert from '../components/WebAlert';

type HistoryScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'History'>;

export default function HistoryScreen() {
  const navigation = useNavigation<HistoryScreenNavigationProp>();
  const [history, setHistory] = useState<HistoryVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const historyData = await getHistory();
      setHistory(historyData);
    } catch (error) {
      console.error('Failed to load history:', error);
      Alert.alert('Error', 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  // Reload history when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const handleVideoPress = (video: HistoryVideo) => {
    navigation.navigate('VideoDetail', {
      videoId: video.videoId,
      videoTitle: video.title,
      // Pass additional info if available
      fromHistory: true,
    });
  };

  const handleRemoveVideo = (videoId: string, title: string) => {
    WebAlert.alert(
      'Delete Video Data',
      `Do you want to permanently delete "${title}" and all its cached data?\n\n• Video will be removed from history\n• Audio files will be deleted from S3\n• Transcript cache will be cleared\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove Only from History', 
          onPress: async () => {
            try {
              await removeFromHistory(videoId);
              setHistory(prev => prev.filter(item => item.videoId !== videoId));
              WebAlert.alert('Removed', 'Video removed from history (cache preserved)');
            } catch (error) {
              WebAlert.alert('Error', 'Failed to remove video from history');
            }
          }
        },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await removeFromHistoryWithCache(videoId);
              setHistory(prev => prev.filter(item => item.videoId !== videoId));
              
              // Show detailed result
              const cacheInfo = result.cacheCleanup;
              let message = `"${result.videoTitle}" has been completely removed.`;
              
              if (cacheInfo && cacheInfo.summary) {
                message += `\n\n📊 Cache cleanup: ${cacheInfo.summary.totalFilesDeleted} files deleted`;
                if (cacheInfo.s3Cache.audioDeleted) message += '\n• S3 audio file deleted';
                if (cacheInfo.s3Cache.whisperDeleted) message += '\n• S3 transcript cache deleted';
                if (cacheInfo.localCache.audioDeleted) message += '\n• Local audio file deleted';
                if (cacheInfo.localCache.whisperDeleted) message += '\n• Local transcript cache deleted';
              }
              
              WebAlert.alert('Deleted Successfully', message);
            } catch (error) {
              WebAlert.alert('Error', 'Failed to delete video data: ' + (error instanceof Error ? error.message : 'Unknown error'));
            }
          },
        },
      ]
    );
  };

  const handleClearHistory = () => {
    WebAlert.alert(
      'Clear All History',
      `Choose how to clear your learning history:\n\n📋 History Only: Keep cache for faster loading\n🗑️ Everything: Delete all cached data (audio files, transcripts)\n\nTotal videos: ${history.length}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear History Only',
          onPress: async () => {
            try {
              await clearHistory();
              setHistory([]);
              WebAlert.alert('Cleared', 'History cleared (cache preserved for faster loading)');
            } catch (error) {
              WebAlert.alert('Error', 'Failed to clear history');
            }
          },
        },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            WebAlert.alert(
              'Confirm Complete Deletion',
              `This will permanently delete:\n• All ${history.length} videos from history\n• All audio files from S3\n• All transcript caches\n\nThis may take a moment and cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete All',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setLoading(true);
                      await clearHistoryWithCache();
                      setHistory([]);
                      WebAlert.alert('Success', 'All learning history and cached data have been permanently deleted.');
                    } catch (error) {
                      WebAlert.alert('Error', 'Failed to clear history with cache: ' + (error instanceof Error ? error.message : 'Unknown error'));
                    } finally {
                      setLoading(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const formatAccessCount = (count: number) => {
    if (count === 1) return '1 time';
    return `${count} times`;
  };

  const formatLastAccessed = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    if (diffDays <= 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  const getStatusIcons = (video: HistoryVideo) => {
    const icons = [];
    
    if (video.hasTranscript) {
      icons.push(
        <View key="transcript" style={styles.statusIcon}>
          <Ionicons name="document-text" size={12} color="#667eea" />
        </View>
      );
    }
    
    if (video.hasAudio) {
      icons.push(
        <View key="audio" style={styles.statusIcon}>
          <Ionicons name="volume-high" size={12} color="#10b981" />
        </View>
      );
    }
    
    if (video.hasWhisperCache) {
      icons.push(
        <View key="whisper" style={styles.statusIcon}>
          <Ionicons name="mic" size={12} color="#f59e0b" />
        </View>
      );
    }
    
    return icons;
  };

  const renderVideoItem = ({ item }: { item: HistoryVideo }) => (
    <TouchableOpacity
      style={styles.videoItem}
      onPress={() => handleVideoPress(item)}
    >
      <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
      <View style={styles.videoInfo}>
        <Text style={styles.videoTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.channelTitle}>{item.channelTitle}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.duration}>{item.duration}</Text>
          <View style={styles.statusIcons}>
            {getStatusIcons(item)}
          </View>
        </View>
        <View style={styles.activityInfo}>
          <Text style={styles.accessCount}>
            Practiced {formatAccessCount(item.accessCount)}
          </Text>
          <Text style={styles.lastAccessed}>
            {formatLastAccessed(item.lastAccessed)}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => handleRemoveVideo(item.videoId, item.title)}
      >
        <Ionicons name="trash-outline" size={20} color="#ef4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading your learning history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Learning History</Text>
        {history.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearHistory}
          >
            <Ionicons name="trash" size={20} color="#ef4444" />
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="time-outline" size={64} color="#d1d5db" />
          <Text style={styles.emptyTitle}>No Learning History</Text>
          <Text style={styles.emptyText}>
            Videos you practice with will appear here for easy access
          </Text>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => navigation.navigate('Search')}
          >
            <Text style={styles.searchButtonText}>Find Videos to Practice</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{history.length}</Text>
              <Text style={styles.statLabel}>Videos</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {history.reduce((sum, video) => sum + video.accessCount, 0)}
              </Text>
              <Text style={styles.statLabel}>Practice Sessions</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {history.filter(v => v.hasWhisperCache).length}
              </Text>
              <Text style={styles.statLabel}>AI Transcripts</Text>
            </View>
          </View>

          <FlatList
            data={history}
            renderItem={renderVideoItem}
            keyExtractor={(item) => item.videoId}
            contentContainerStyle={styles.videoList}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  clearButtonText: {
    marginLeft: 4,
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#374151',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 24,
  },
  searchButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#667eea',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  videoList: {
    padding: 16,
  },
  videoItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  thumbnail: {
    width: 120,
    height: 68,
    borderRadius: 8,
    marginRight: 12,
  },
  videoInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  channelTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  duration: {
    fontSize: 12,
    color: '#667eea',
    fontWeight: '600',
  },
  statusIcons: {
    flexDirection: 'row',
  },
  statusIcon: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 2,
    marginLeft: 4,
  },
  activityInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accessCount: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
  },
  lastAccessed: {
    fontSize: 12,
    color: '#999',
  },
  removeButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 