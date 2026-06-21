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
};

// ── 웹: HTML5 Audio ─────────────────────────────────────────────────
const WebAudioPlayer = forwardRef<AudioPlayerRef, Props>(({ audioUrl }, ref) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useImperativeHandle(ref, () => ({
    seekTo: (timeInSeconds: number) => {
      if (audioRef.current) audioRef.current.currentTime = timeInSeconds;
    },
    play: () => {
      if (!audioRef.current) return;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((error) => console.error('❌ Web Audio play error:', error));
    },
    pause: () => {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    },
  }));

  useEffect(() => {
    const audio = document.createElement('audio');
    audio.preload = 'auto';

    audio.oncanplaythrough = () => setIsLoading(false);
    audio.onerror = (event) => {
      console.error('❌ Web Audio loading error:', event);
      setHasError(true);
      setIsLoading(false);
    };
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);

    audio.src = audioUrl;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [audioUrl]);

  if (hasError) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Text style={styles.errorText}>⚠️ 오디오를 재생할 수 없습니다</Text>
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
      <Text style={styles.audioText}>🎵 오디오 준비됨</Text>
      {isPlaying && <Text style={styles.statusText}>재생 중</Text>}
    </View>
  );
});

// ── 네이티브: Expo Audio ────────────────────────────────────────────
const NativeAudioPlayer = forwardRef<AudioPlayerRef, Props>(({ audioUrl }, ref) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useImperativeHandle(ref, () => ({
    seekTo: async (timeInSeconds: number) => {
      if (soundRef.current) await soundRef.current.setPositionAsync(timeInSeconds * 1000);
    },
    play: async () => {
      if (soundRef.current) {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    },
    pause: async () => {
      if (soundRef.current) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      }
    },
  }));

  useEffect(() => {
    let active = true;

    const loadAudio = async () => {
      try {
        setIsLoading(true);
        setHasError(false);

        if (Platform.OS === 'ios') {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            staysActiveInBackground: false,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        }

        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: false, isLooping: false, volume: 1.0 }
        );

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded) setIsPlaying(status.isPlaying || false);
        });

        if (!active) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
        setIsLoading(false);
      } catch (error) {
        console.error('❌ Native Audio loading failed:', error);
        setHasError(true);
        setIsLoading(false);
      }
    };

    loadAudio();

    return () => {
      active = false;
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, [audioUrl]);

  if (hasError) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Text style={styles.errorText}>⚠️ 오디오를 재생할 수 없습니다</Text>
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
      <Text style={styles.audioText}>🎵 오디오 준비됨</Text>
      {isPlaying && <Text style={styles.statusText}>재생 중</Text>}
    </View>
  );
});

// ── 플랫폼 선택 ─────────────────────────────────────────────────────
const AudioPlayer = forwardRef<AudioPlayerRef, Props>(({ audioUrl }, ref) => {
  return Platform.OS === 'web' ? (
    <WebAudioPlayer ref={ref} audioUrl={audioUrl} />
  ) : (
    <NativeAudioPlayer ref={ref} audioUrl={audioUrl} />
  );
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
  errorText: {
    fontSize: 14,
    color: '#d68910',
    fontWeight: 'bold',
  },
});

export default AudioPlayer;
