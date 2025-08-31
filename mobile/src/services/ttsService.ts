import { Audio } from 'expo-av';
import { API_CONFIG } from '../config/api';
import * as FileSystem from 'expo-file-system';

export interface TTSOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?: number; // 0.25 to 4.0
}

class TTSService {
  private sound: Audio.Sound | null = null;
  private isPlaying: boolean = false;

  async speakWithOpenAI(text: string, options: TTSOptions = {}): Promise<void> {
    try {
      console.log('🎤 OpenAI TTS: Generating speech for:', text.substring(0, 50) + '...');
      
      // Stop any currently playing TTS (don't await for faster response)
      this.stop(); // Execute in parallel

      const response = await fetch(`${API_CONFIG.BASE_URL}/tts/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice: options.voice || 'nova',
          speed: options.speed || 1.0,
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`);
      }

      // Save response to temporary file
      const audioArrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(audioArrayBuffer);
      
      // Convert to base64 for React Native
      let binary = '';
      for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      
      // Use btoa if available, otherwise use manual base64 encoding
      const base64Audio = typeof btoa !== 'undefined' 
        ? btoa(binary)
        : this.arrayBufferToBase64(uint8Array);
      
      const tempUri = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(
        tempUri,
        base64Audio,
        { encoding: FileSystem.EncodingType.Base64 }
      );

      // Create and play audio immediately
      const { sound } = await Audio.Sound.createAsync(
        { uri: tempUri },
        { shouldPlay: true, volume: 1.0 }
      );

      this.sound = sound;
      this.isPlaying = true;
      console.log('✅ OpenAI TTS: Playing generated speech immediately');

      // Clean up when finished
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          this.isPlaying = false;
          this.cleanup();
        }
      });

    } catch (error) {
      console.error('❌ OpenAI TTS error:', error);
      throw error;
    }
  }

  async speakWithExpoSpeech(text: string): Promise<void> {
    const Speech = require('expo-speech');
    this.isPlaying = true;
    
    return new Promise((resolve) => {
      Speech.speak(text, {
        language: 'en',
        pitch: 1.0,
        rate: 0.9, // Slightly faster for quick response
        onDone: () => {
          this.isPlaying = false;
          resolve();
        },
        onStopped: () => {
          this.isPlaying = false;
          resolve();
        },
        onError: () => {
          this.isPlaying = false;
          resolve();
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
        this.sound = null;
        this.isPlaying = false;
        console.log('🛑 OpenAI TTS stopped');
      } catch (error) {
        console.error('Error stopping OpenAI TTS:', error);
      }
    }
    
    // Stop expo-speech
    const Speech = require('expo-speech');
    Speech.stop();
    this.isPlaying = false;
    console.log('🛑 TTS stopped');
  }

  async pause(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.pauseAsync();
        this.isPlaying = false;
        console.log('⏸️ OpenAI TTS paused');
      } catch (error) {
        console.error('Error pausing OpenAI TTS:', error);
      }
    }
    
    // Stop expo-speech (it doesn't support pause)
    const Speech = require('expo-speech');
    Speech.stop();
    this.isPlaying = false;
    console.log('⏸️ TTS paused');
  }

  async resume(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.playAsync();
        this.isPlaying = true;
        console.log('▶️ OpenAI TTS resumed');
      } catch (error) {
        console.error('Error resuming OpenAI TTS:', error);
      }
    }
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  private cleanup(): void {
    if (this.sound) {
      this.sound.unloadAsync();
      this.sound = null;
    }
  }

  private arrayBufferToBase64(buffer: Uint8Array): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;
    
    while (i < buffer.length) {
      const a = buffer[i++];
      const b = i < buffer.length ? buffer[i++] : 0;
      const c = i < buffer.length ? buffer[i++] : 0;
      
      const bitmap = (a << 16) | (b << 8) | c;
      
      result += chars.charAt((bitmap >> 18) & 63);
      result += chars.charAt((bitmap >> 12) & 63);
      result += i - 2 < buffer.length ? chars.charAt((bitmap >> 6) & 63) : '=';
      result += i - 1 < buffer.length ? chars.charAt(bitmap & 63) : '=';
    }
    
    return result;
  }
}

export default new TTSService(); 