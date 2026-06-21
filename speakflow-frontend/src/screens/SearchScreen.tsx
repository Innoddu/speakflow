import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { searchVideos } from '../services/youtubeService';

type SearchScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Search'>;

interface Video {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  duration?: string;
  durationSeconds?: number;
  viewCount?: number;
}

export default function SearchScreen() {
  const navigation = useNavigation<SearchScreenNavigationProp>();
  const [query, setQuery] = useState('');
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      Alert.alert('Error', 'Please enter a search term');
      return;
    }

    setLoading(true);
    try {
      console.log(`🔍 Searching for: "${query}" (filtering for ≤10min videos with captions)`);
      const results = await searchVideos(query);
      console.log(`✅ Found ${results.length} videos matching criteria`);
      setVideos(results);
    } catch (error) {
      console.error('❌ Search failed:', error);
      Alert.alert('Error', 'Failed to search videos. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVideoPress = (video: Video) => {
    navigation.navigate('VideoDetail', {
      videoId: video.id,
      videoTitle: video.title,
    });
  };

  const renderVideoItem = ({ item }: { item: Video }) => (
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
        <View style={styles.metaInfo}>
          <Text style={styles.publishedAt}>
            {new Date(item.publishedAt).toLocaleDateString()}
          </Text>
          {item.duration && (
            <Text style={styles.duration}>• {item.duration}</Text>
          )}
          {item.viewCount && (
            <Text style={styles.viewCount}>
              • {item.viewCount.toLocaleString()} views
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search for videos..."
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>Searching videos...</Text>
          <Text style={styles.filterInfo}>Looking for videos ≤10 minutes with English captions</Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          renderItem={renderVideoItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.videoList}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  searchButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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
  filterInfo: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
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
    marginBottom: 2,
  },
  publishedAt: {
    fontSize: 12,
    color: '#999',
  },
  metaInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  duration: {
    fontSize: 12,
    color: '#667eea',
    fontWeight: '600',
    marginLeft: 4,
  },
  viewCount: {
    fontSize: 12,
    color: '#999',
    marginLeft: 4,
  },
}); 