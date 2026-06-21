// YouTube 오디오 추출 (yt-dlp) — 연습 중 원본 오디오 재생용.
// 자막은 youtube-transcript-api(services/transcript-api.js)가 담당한다.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// yt-dlp 로 오디오(mp3) 추출.
// 실측상 YouTube 봇 차단 때문에 web/mweb 클라이언트는 실패하고 android 클라이언트가 동작한다.
async function extractAudioWithYtDlp(videoId, outputDir = null) {
  console.log(`🎵 Extracting audio for ${videoId} using yt-dlp...`);

  const tempDir = outputDir || path.join(os.tmpdir(), `yt-dlp-audio-${Date.now()}`);
  if (!outputDir) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    await execAsync('yt-dlp --version');

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const outputTemplate = path.join(tempDir, `${videoId}.%(ext)s`);

    const command = [
      'yt-dlp',
      '--extract-audio',
      '--audio-format mp3',
      '--audio-quality 192K',
      '--no-playlist',
      '--no-check-certificate',
      '--extractor-args "youtube:player_client=android"',
      '--retries 3',
      `--output "${outputTemplate}"`,
      `"${videoUrl}"`,
    ].join(' ');

    console.log(`📥 ${command}`);
    const { stderr } = await execAsync(command, { cwd: tempDir, timeout: 120000 });
    if (stderr) console.log(`⚠️ yt-dlp stderr: ${stderr.substring(0, 200)}`);

    const files = fs.readdirSync(tempDir);
    const audioFiles = files.filter(
      (file) => file.startsWith(videoId) && (file.endsWith('.mp3') || file.endsWith('.m4a') || file.endsWith('.webm'))
    );

    if (audioFiles.length === 0) {
      throw new Error('No audio file found. The video may not have extractable audio.');
    }

    const audioPath = path.join(tempDir, audioFiles[0]);
    const stats = fs.statSync(audioPath);
    console.log(`🎵 Extracted: ${audioFiles[0]} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);

    return {
      success: true,
      audioPath,
      filename: audioFiles[0],
      fileSize: stats.size,
      tempDir: outputDir ? null : tempDir,
    };
  } catch (error) {
    console.error(`❌ Audio extraction error: ${error.message}`);
    if (error.message.includes('command not found')) {
      throw new Error('yt-dlp is not installed. Install it: brew install yt-dlp');
    }
    if (error.message.includes('timeout')) {
      throw new Error('Audio extraction timed out. The video may be too long.');
    }
    throw new Error(`Failed to extract audio: ${error.message}`);
  }
}

module.exports = { extractAudioWithYtDlp };
