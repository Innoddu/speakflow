import React, { forwardRef, useImperativeHandle, useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, Platform } from 'react-native';
import { Audio } from 'expo-av';

type Props = {
  audioUrl: string;
};

export type AudioPlayerRef = {
  seekTo: (timeInSeconds: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: (callback: (time: number) => void) => void;
};

// Web Audio Player using HTML5 Audio
const WebAudioPlayer = forwardRef<AudioPlayerRef, Props>(({ audioUrl }, ref) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  const [position, setPosition] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const positionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useImperativeHandle(ref, () => ({
    seekTo: (timeInSeconds: number) => {
      if (audioRef.current) {
        audioRef.current.currentTime = timeInSeconds;
        setPosition(timeInSeconds * 1000);
        console.log(`🎵 Web Audio: Seeked to ${timeInSeconds}s`);
      }
    },
    play: () => {
      if (audioRef.current) {
        audioRef.current.play()
          .then(() => {
            setIsPlaying(true);
            console.log('▶️ Web Audio: Started playing');
          })
          .catch((error) => {
            console.error('❌ Web Audio play error:', error);
          });
      }
    },
    pause: () => {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
        console.log('⏸️ Web Audio: Paused');
      }
    },
    getCurrentTime: (callback: (time: number) => void) => {
      const timeInSeconds = position / 1000;
      callback(timeInSeconds);
    },
  }));

  useEffect(() => {
    if (Platform.OS === 'web') {
      console.log('🎵 Web AudioPlayer: Loading audio from:', audioUrl.substring(0, 100) + '...');
      
      // Create audio element for web
      const audio = document.createElement('audio');
      audio.crossOrigin = 'anonymous';
      audio.preload = 'metadata';
      
      audio.onloadstart = () => {
        console.log('🎵 Web Audio: Loading started');
        setIsLoading(true);
        setHasError(false);
      };
      
      audio.oncanplaythrough = () => {
        console.log('✅ Web Audio: Can play through');
        setIsLoading(false);
        setDuration(audio.duration * 1000);
      };
      
      audio.onerror = (event: string | Event) => {
        console.error('❌ Web Audio loading error:', event);
        setHasError(true);
        setIsLoading(false);
      };
      
      audio.onplay = () => {
        setIsPlaying(true);
        // Start position tracking
        positionIntervalRef.current = setInterval(() => {
          if (audio.currentTime) {
            setPosition(audio.currentTime * 1000);
          }
        }, 1000);
      };
      
      audio.onpause = () => {
        setIsPlaying(false);
        if (positionIntervalRef.current) {
          clearInterval(positionIntervalRef.current);
          positionIntervalRef.current = null;
        }
      };
      
      audio.ontimeupdate = () => {
        setPosition(audio.currentTime * 1000);
      };
      
      audio.src = audioUrl;
      audioRef.current = audio;
      
      // Cleanup function
      return () => {
        if (positionIntervalRef.current) {
          clearInterval(positionIntervalRef.current);
        }
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.removeAttribute('src');
          audioRef.current.load();
        }
      };
    }
  }, [audioUrl]);

  if (hasError) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Text style={styles.errorText}>⚠️ Audio format not supported</Text>
        <Text style={styles.errorSubText}>Using video player instead</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#667eea" />
        <Text style={styles.loadingText}>Loading audio...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.audioText}>🎵 Web Audio Ready</Text>
      {isPlaying && (
        <Text style={styles.statusText}>Playing</Text>
      )}
      {duration > 0 && (
        <Text style={styles.durationText}>
          Duration: {Math.round(duration / 1000)}s
        </Text>
      )}
    </View>
  );
});

// Native Audio Player using Expo Audio
const NativeAudioPlayer = forwardRef<AudioPlayerRef, Props>(({ audioUrl }, ref) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  const [position, setPosition] = useState<number>(0);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine URL type for logging
  const isLocalFile = audioUrl.startsWith('/audio/') || audioUrl.includes('localhost');
  const isS3Url = audioUrl.includes('s3.') && audioUrl.includes('amazonaws.com');
  const isYouTubeUrl = audioUrl.includes('youtube.com') || audioUrl.includes('youtu.be');
  const urlType = isLocalFile ? 'Local' : isS3Url ? 'S3' : isYouTubeUrl ? 'YouTube' : 'External';

  useImperativeHandle(ref, () => ({
    seekTo: async (timeInSeconds: number) => {
      try {
        if (sound) {
          const timeInMillis = timeInSeconds * 1000;
          await sound.setPositionAsync(timeInMillis);
          console.log(`🎵 Audio: Seeked to ${timeInSeconds}s`);
        } else {
          console.warn('⚠️ Audio not loaded yet, cannot seek');
        }
      } catch (error) {
        console.error('❌ Audio seek error:', error);
      }
    },
    play: async () => {
      try {
        if (sound) {
          await sound.playAsync();
          setIsPlaying(true);
          console.log('▶️ Audio: Started playing');
        } else {
          console.warn('⚠️ Audio not loaded yet, cannot play');
        }
      } catch (error) {
        console.error('❌ Audio play error:', error);
      }
    },
    pause: async () => {
      try {
        if (sound) {
          await sound.pauseAsync();
          setIsPlaying(false);
          console.log('⏸️ Audio: Paused');
        } else {
          console.warn('⚠️ Audio not loaded yet, cannot pause');
        }
      } catch (error) {
        console.error('❌ Audio pause error:', error);
      }
    },
    getCurrentTime: (callback: (time: number) => void) => {
      // position is in milliseconds, convert to seconds
      const timeInSeconds = position / 1000;
      callback(timeInSeconds);
    },
  }));

  const loadAudio = async () => {
    try {
      console.log(`🎵 Native AudioPlayer: Loading ${urlType} audio from:`, audioUrl.substring(0, 100) + '...');
      
      setIsLoading(true);
      setHasError(false);

      // Configure audio session for iOS
      if (Platform.OS === 'ios') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      }

      // Create and load sound
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { 
          shouldPlay: false,
          isLooping: false,
          volume: 1.0,
        }
      );

      // Set up status update callback
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setDuration(status.durationMillis || 0);
          setPosition(status.positionMillis || 0);
          setIsPlaying(status.isPlaying || false);
        }
      });

      setSound(newSound);
      setIsLoading(false);
      console.log('✅ Native Audio loaded successfully');

      // Clear timeout if loading succeeds
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }

    } catch (error) {
      console.error('❌ Native Audio loading failed:', error);
      setHasError(true);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Set loading timeout
    loadingTimeoutRef.current = setTimeout(() => {
      if (isLoading) {
        console.error('⏰ Native Audio loading timeout');
        setHasError(true);
        setIsLoading(false);
      }
    }, 30000); // 30 seconds timeout

    loadAudio();

    // Cleanup function
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      if (sound) {
        console.log('🧹 Cleaning up native audio');
        sound.unloadAsync();
      }
    };
  }, [audioUrl]);

  if (hasError) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Text style={styles.errorText}>⚠️ Audio format not supported</Text>
        <Text style={styles.errorSubText}>Using video player instead</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#667eea" />
        <Text style={styles.loadingText}>Loading audio...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.audioText}>🎵 Native Audio Ready</Text>
      {isPlaying && (
        <Text style={styles.statusText}>Playing</Text>
      )}
      {duration > 0 && (
        <Text style={styles.durationText}>
          Duration: {Math.round(duration / 1000)}s
        </Text>
      )}
    </View>
  );
});

// Main AudioPlayer component that chooses between web and native
const AudioPlayer = forwardRef<AudioPlayerRef, Props>(({ audioUrl }, ref) => {
  if (Platform.OS === 'web') {
    return <WebAudioPlayer ref={ref} audioUrl={audioUrl} />;
  } else {
    return <NativeAudioPlayer ref={ref} audioUrl={audioUrl} />;
  }
});

AudioPlayer.displayName = 'AudioPlayer';

const styles = StyleSheet.create({
  container: {
    height: 60,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    margin: 8,
    paddingHorizontal: 12,
  },
  errorContainer: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffeaa7',
    borderWidth: 1,
  },
  loadingText: {
    marginTop: 4,
    fontSize: 12,
    color: '#666',
  },
  audioText: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: 'bold',
  },
  statusText: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  durationText: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  errorText: {
    fontSize: 14,
    color: '#d68910',
    fontWeight: 'bold',
  },
  errorSubText: {
    fontSize: 12,
    color: '#d68910',
    marginTop: 2,
  },
});

export default AudioPlayer; 