// youtube-transcript-api(Python)를 호출하는 Node 래퍼.
// 자막 있는 영상만 대상으로 하는 captions-only 전략의 핵심 서비스.
const { spawn } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'fetch_transcript.py');

// Python 스크립트를 실행하고 JSON 결과를 파싱한다.
function runPy(mode, videoId) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [SCRIPT, mode, videoId]);

    let out = '';
    let err = '';
    py.stdout.on('data', (d) => (out += d.toString()));
    py.stderr.on('data', (d) => (err += d.toString()));

    py.on('error', (e) => reject(e));
    py.on('close', (code) => {
      if (code !== 0) return reject(new Error(err || `python exited ${code}`));
      try {
        resolve(JSON.parse(out.trim()));
      } catch (e) {
        reject(new Error(`failed to parse python output: ${e.message}`));
      }
    });

    // 안전장치: 20초 타임아웃
    setTimeout(() => {
      if (!py.killed) {
        py.kill('SIGKILL');
        reject(new Error('transcript fetch timeout'));
      }
    }, 20000);
  });
}

// 영어 자막 추출 → [{ text, start, duration }]
async function fetchTranscript(videoId) {
  const r = await runPy('fetch', videoId);
  if (!r.success) throw new Error(r.error || 'transcript fetch failed');
  return r.captions;
}

// 영어 자막 존재 여부. 실패 시 false 로 간주(검색 필터용).
async function hasEnglishTranscript(videoId) {
  try {
    const r = await runPy('check', videoId);
    return r.success === true && r.hasEnglish === true;
  } catch {
    return false;
  }
}

module.exports = { fetchTranscript, hasEnglishTranscript };
