import React, { useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = {
  videoId: string;
};

export type VideoPlayerRef = {
  seekTo: (timeInSeconds: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: (callback: (time: number) => void) => void;
};

// ── 웹: YouTube IFrame Player API (프로그램 제어 가능) ───────────────
const WebVideoPlayer = forwardRef<VideoPlayerRef, Props>(({ videoId }, ref) => {
  const playerRef = useRef<any>(null);
  const elemId = useRef(`yt-player-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    let cancelled = false;

    const createPlayer = () => {
      const YT = (window as any).YT;
      if (cancelled || !YT?.Player || !document.getElementById(elemId)) return;
      playerRef.current = new YT.Player(elemId, {
        videoId,
        playerVars: { autoplay: 0, controls: 1, rel: 0, modestbranding: 1, playsinline: 1 },
      });
    };

    if ((window as any).YT?.Player) {
      createPlayer();
    } else {
      if (!document.getElementById('yt-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
      const prev = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        createPlayer();
      };
    }

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {}
      playerRef.current = null;
    };
  }, [videoId, elemId]);

  useImperativeHandle(ref, () => ({
    seekTo: (t: number) => {
      try {
        playerRef.current?.seekTo?.(Math.max(0, t), true);
      } catch {}
    },
    play: () => {
      try {
        playerRef.current?.playVideo?.();
      } catch {}
    },
    pause: () => {
      try {
        playerRef.current?.pauseVideo?.();
      } catch {}
    },
    getCurrentTime: (cb: (time: number) => void) => {
      try {
        cb(playerRef.current?.getCurrentTime?.() ?? 0);
      } catch {
        cb(0);
      }
    },
  }));

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        {/* YT.Player가 이 div를 iframe으로 교체 */}
        {/* @ts-ignore - 웹 전용 DOM 엘리먼트 */}
        <div id={elemId} style={{ width: '100%', height: '100%' }} />
      </View>
    );
  }
  return <View style={styles.container} />;
});

// ── 네이티브: WebView + YouTube IFrame API (injectJavaScript 제어) ───
const NativeVideoPlayer = forwardRef<VideoPlayerRef, Props>(({ videoId }, ref) => {
  const webViewRef = useRef<WebView>(null);
  const lastTimeRef = useRef(0);

  const run = (js: string) => {
    webViewRef.current?.injectJavaScript(js + '; true;');
  };

  useImperativeHandle(ref, () => ({
    seekTo: (t: number) => run(`if(window.player&&player.seekTo){player.seekTo(${Math.max(0, t)}, true);}`),
    play: () => run('if(window.player&&player.playVideo){player.playVideo();}'),
    pause: () => run('if(window.player&&player.pauseVideo){player.pauseVideo();}'),
    getCurrentTime: (cb: (time: number) => void) => cb(lastTimeRef.current),
  }));

  const onMessage = (e: any) => {
    const m = e?.nativeEvent?.data;
    if (typeof m === 'string' && m.startsWith('TIME:')) {
      lastTimeRef.current = parseFloat(m.slice(5)) || 0;
    }
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>body{margin:0;padding:0;background:#000;}#player{width:100%;height:100vh;}</style></head>
    <body>
      <div id="player"></div>
      <script>
        var tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(tag);
        function onYouTubeIframeAPIReady() {
          window.player = new YT.Player('player', {
            videoId: '${videoId}',
            playerVars: { autoplay: 0, controls: 1, rel: 0, modestbranding: 1, playsinline: 1 },
            events: {
              'onReady': function() {
                setInterval(function() {
                  if (window.player && player.getCurrentTime) {
                    window.ReactNativeWebView.postMessage('TIME:' + player.getCurrentTime());
                  }
                }, 200);
              }
            }
          });
        }
      </script>
    </body>
    </html>`;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        source={{ html }}
        onMessage={onMessage}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
      />
    </View>
  );
});

const VideoPlayer = forwardRef<VideoPlayerRef, Props>(({ videoId }, ref) => {
  return Platform.OS === 'web' ? (
    <WebVideoPlayer ref={ref} videoId={videoId} />
  ) : (
    <NativeVideoPlayer ref={ref} videoId={videoId} />
  );
});

VideoPlayer.displayName = 'VideoPlayer';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
});

export default VideoPlayer;
