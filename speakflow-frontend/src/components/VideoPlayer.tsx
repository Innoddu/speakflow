import React, { useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
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

// Web component using iframe
const WebVideoPlayer = forwardRef<VideoPlayerRef, Props>(({ videoId }, ref) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [key, setKey] = useState(0);

  useImperativeHandle(ref, () => ({
    seekTo: (timeInSeconds: number) => {
      console.log(`WebVideoPlayer: Seeking to ${timeInSeconds}s`);
      setStartTime(Math.floor(timeInSeconds));
      setKey(prev => prev + 1); // Force iframe reload
    },
    play: () => {
      console.log('📹 WebVideoPlayer: Play command (iframe limitation)');
      // Note: iframe doesn't allow programmatic play/pause
    },
    pause: () => {
      console.log('📹 WebVideoPlayer: Pause command (iframe limitation)');
      // Note: iframe doesn't allow programmatic play/pause
    },
    getCurrentTime: (callback: (time: number) => void) => {
      callback(currentTime);
    },
  }));

  const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&start=${startTime}&controls=1&rel=0&showinfo=0&modestbranding=1`;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <iframe
          key={key}
          src={embedUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: '#000',
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </View>
    );
  }

  // Fallback for unsupported platforms
  return <View style={styles.container} />;
});

// Native component using WebView
const NativeVideoPlayer = forwardRef<VideoPlayerRef, Props>(({ videoId }, ref) => {
  const webViewRef = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState(`https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0`);
  const [key, setKey] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const injectJavaScript = (code: string) => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(code);
    }
  };

  useImperativeHandle(ref, () => ({
    seekTo: (timeInSeconds: number) => {
      const startTime = Math.floor(timeInSeconds);
      const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&start=${startTime}`;
      
      console.log(`VideoPlayer: Seeking to ${startTime}s with embed URL`);
      
      setCurrentUrl(embedUrl);
      setKey(prev => prev + 1);
    },
    play: () => {
      console.log('📹 VideoPlayer: Play command');
      injectJavaScript('PLAY');
    },
    pause: () => {
      console.log('📹 VideoPlayer: Pause command');
      injectJavaScript('PAUSE');
    },
    getCurrentTime: (callback: (time: number) => void) => {
      callback(currentTime);
    },
  }));

  const onMessage = (event: any) => {
    const message = event.nativeEvent.data;
    
    if (message.startsWith('TIME:')) {
      const time = parseFloat(message.replace('TIME:', ''));
      setCurrentTime(time);
    }
  };

  const generateHTML = () => {
    const startTime = currentUrl.includes('start=') 
      ? currentUrl.split('start=')[1].split('&')[0] 
      : '0';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { margin: 0; padding: 0; background: black; }
        #player { width: 100%; height: 100vh; }
      </style>
    </head>
    <body>
      <div id="player"></div>
      <script>
        var tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        
        var player;
        function onYouTubeIframeAPIReady() {
          player = new YT.Player('player', {
            height: '100%',
            width: '100%',
            videoId: '${videoId}',
            playerVars: {
               'autoplay': 0,
               'start': ${startTime},
               'controls': 1,
               'rel': 0,
               'showinfo': 0,
               'modestbranding': 1
             },
            events: {
              'onReady': onPlayerReady,
              'onStateChange': onPlayerStateChange
            }
          });
        }
        
        function onPlayerReady(event) {
           setInterval(function() {
             if (player && player.getCurrentTime) {
               var currentTime = player.getCurrentTime();
               window.ReactNativeWebView.postMessage('TIME:' + currentTime);
             }
           }, 1000);
         }
         
         function onPlayerStateChange(event) {
           // Player state change
         }
        
        document.addEventListener('message', function(event) {
           var command = event.data;
           
           if (command === 'PLAY' && player) {
             player.playVideo();
           } else if (command === 'PAUSE' && player) {
             player.pauseVideo();
           }
         });
         
        window.addEventListener('message', function(event) {
           var command = event.data;
           
           if (command === 'PLAY' && player) {
             player.playVideo();
           } else if (command === 'PAUSE' && player) {
             player.pauseVideo();
           }
         });
      </script>
    </body>
    </html>
    `;
  };

  return (
    <View style={styles.container}>
      <WebView
        key={key}
        ref={webViewRef}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        source={{ html: generateHTML() }}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        startInLoadingState={true}
        onMessage={onMessage}
        originWhitelist={['*']}
      />
    </View>
  );
});

// Main component that chooses between web and native
const VideoPlayer = forwardRef<VideoPlayerRef, Props>(({ videoId }, ref) => {
  if (Platform.OS === 'web') {
    return <WebVideoPlayer ref={ref} videoId={videoId} />;
  } else {
    return <NativeVideoPlayer ref={ref} videoId={videoId} />;
  }
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