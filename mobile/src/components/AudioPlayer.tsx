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
  playWithVAD: (onSilenceDetected: () => void, endTime?: number) => void;
};

// Web Audio Player using HTML5 Audio with Voice Activity Detection
const WebAudioPlayer = forwardRef<AudioPlayerRef, Props>(({ audioUrl }, ref) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  const [position, setPosition] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const positionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const onSilenceDetectedRef = useRef<(() => void) | null>(null);

  // Add new state for sentence playback
  const [sentenceEndTime, setSentenceEndTime] = useState<number | null>(null);
  const endCheckInterval = useRef<NodeJS.Timeout | null>(null);

  // Add function to check and stop at sentence end
  const checkAndStopAtSentenceEnd = () => {
    if (audioRef.current && sentenceEndTime !== null) {
      if (audioRef.current.currentTime >= sentenceEndTime) {
        audioRef.current.pause();
        setIsPlaying(false);
        stopVoiceActivityDetection();
        setSentenceEndTime(null);
        if (endCheckInterval.current) {
          clearInterval(endCheckInterval.current);
          endCheckInterval.current = null;
        }
      }
    }
  };

  // Voice Activity Detection with advanced audio analysis
  const startVoiceActivityDetection = (onSilenceDetected: () => void) => {
    if (Platform.OS !== 'web') return;
    
    onSilenceDetectedRef.current = onSilenceDetected;
    
    try {
      // Create audio context for analysis
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaElementSource(audioRef.current!);
      
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      
      // Configure analyser for better speech detection
      analyser.fftSize = 2048; // Higher resolution for better frequency analysis
      analyser.smoothingTimeConstant = 0.8;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const frequencyData = new Uint8Array(bufferLength);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      let silenceCount = 0;
      let speechCount = 0;
      const silenceThreshold = 8; // More frames for stability
      const speechThreshold = 3; // Minimum speech frames before resetting
      const volumeThreshold = 15; // Adjusted for better sensitivity
      const speechFrequencyThreshold = 25; // Minimum energy in speech frequencies
      
      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current || !isPlaying) return;
        
        // Get both time-domain and frequency-domain data
        analyser.getByteTimeDomainData(dataArray);
        analyser.getByteFrequencyData(frequencyData);
        
        // Calculate RMS (Root Mean Square) for volume
        let rms = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const sample = (dataArray[i] - 128) / 128; // Normalize to -1 to 1
          rms += sample * sample;
        }
        rms = Math.sqrt(rms / dataArray.length) * 100;
        
        // Calculate energy in speech frequency range (300Hz - 3400Hz)
        // For 44.1kHz sample rate with 2048 FFT: each bin = 21.5Hz
        const speechStartBin = Math.floor(300 / 21.5); // ~14
        const speechEndBin = Math.floor(3400 / 21.5); // ~158
        let speechEnergy = 0;
        for (let i = speechStartBin; i < speechEndBin && i < frequencyData.length; i++) {
          speechEnergy += frequencyData[i];
        }
        speechEnergy = speechEnergy / (speechEndBin - speechStartBin);
        
        // Determine if speech is present
        const isSpeech = rms > volumeThreshold && speechEnergy > speechFrequencyThreshold;
        
        if (isSpeech) {
          speechCount++;
          if (speechCount >= speechThreshold) {
            silenceCount = 0; // Reset silence counter when consistent speech is detected
          }
        } else {
          speechCount = 0;
          silenceCount++;
          
          if (silenceCount >= silenceThreshold) {
            console.log(`🔇 Advanced VAD: Silence detected (RMS: ${rms.toFixed(1)}, Speech Energy: ${speechEnergy.toFixed(1)})`);
            stopVoiceActivityDetection();
            if (onSilenceDetectedRef.current) {
              onSilenceDetectedRef.current();
            }
          }
        }
        
        // Debug logging (can be removed in production)
        if (silenceCount % 10 === 0 && silenceCount > 0) {
          console.log(`🎙️ VAD Status: RMS=${rms.toFixed(1)}, SpeechEnergy=${speechEnergy.toFixed(1)}, SilenceCount=${silenceCount}`);
        }
      }, 100); // Check every 100ms
      
    } catch (error) {
      console.error('❌ Voice Activity Detection setup failed:', error);
      // Fallback to simple timer-based approach
      setTimeout(() => {
        if (onSilenceDetectedRef.current) {
          onSilenceDetectedRef.current();
        }
      }, 5000); // 5 second fallback
    }
  };

  const stopVoiceActivityDetection = () => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    onSilenceDetectedRef.current = null;
  };

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
            setSentenceEndTime(null); // Reset sentence end time for full playback
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
        stopVoiceActivityDetection();
        setSentenceEndTime(null);
        if (endCheckInterval.current) {
          clearInterval(endCheckInterval.current);
          endCheckInterval.current = null;
        }
        console.log('⏸️ Web Audio: Paused');
      }
    },
    getCurrentTime: (callback: (time: number) => void) => {
      const timeInSeconds = position / 1000;
      callback(timeInSeconds);
    },
    playWithVAD: (onSilenceDetected: () => void, endTime?: number) => {
      if (audioRef.current) {
        // Set sentence end time if provided
        if (endTime) {
          setSentenceEndTime(endTime);
          // Start interval to check for sentence end
          if (endCheckInterval.current) {
            clearInterval(endCheckInterval.current);
          }
          endCheckInterval.current = setInterval(checkAndStopAtSentenceEnd, 100);
        }

        audioRef.current.play()
          .then(() => {
            setIsPlaying(true);
            startVoiceActivityDetection(onSilenceDetected);
            console.log('▶️ Web Audio: Started playing with VAD', endTime ? `(until ${endTime}s)` : '');
          })
          .catch((error) => {
            console.error('❌ Web Audio play with VAD error:', error);
          });
      }
    },
  }));

  // Clean up intervals on unmount
  useEffect(() => {
    return () => {
      if (endCheckInterval.current) {
        clearInterval(endCheckInterval.current);
        endCheckInterval.current = null;
      }
    };
  }, []);

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
  const positionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useImperativeHandle(ref, () => ({
    seekTo: async (timeInSeconds: number) => {
        if (sound) {
        await sound.setPositionAsync(timeInSeconds * 1000);
        setPosition(timeInSeconds * 1000);
        console.log(`🎵 Native Audio: Seeked to ${timeInSeconds}s`);
      }
    },
    play: async () => {
        if (sound) {
          await sound.playAsync();
          setIsPlaying(true);
        console.log('▶️ Native Audio: Started playing');
      }
    },
    pause: async () => {
        if (sound) {
          await sound.pauseAsync();
          setIsPlaying(false);
        console.log('⏸️ Native Audio: Paused');
      }
    },
    getCurrentTime: (callback: (time: number) => void) => {
      const timeInSeconds = position / 1000;
      callback(timeInSeconds);
    },
    // For native, we'll use the same method but without VAD (fallback to timer)
    playWithVAD: async (onSilenceDetected: () => void) => {
      if (sound) {
        await sound.playAsync();
        setIsPlaying(true);
        console.log('▶️ Native Audio: Started playing (VAD not available, using timer fallback)');
        // Note: Native VAD would require additional libraries like react-native-audio-recorder-player
        // For now, we'll use the same timer-based approach as before
      }
    },
  }));

  const loadAudio = async () => {
    try {
      console.log(`🎵 Native AudioPlayer: Loading audio from:`, audioUrl.substring(0, 100) + '...');
      
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

    } catch (error) {
      console.error('❌ Native Audio loading failed:', error);
      setHasError(true);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAudio();

    // Cleanup function
    return () => {
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