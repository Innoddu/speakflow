#!/usr/bin/env python3
"""
YouTube 영어 자막 추출 / 존재 확인 스크립트.

사용법:
    python3 fetch_transcript.py fetch <videoId>   # 자막 추출 → {success, captions:[{text,start,duration}]}
    python3 fetch_transcript.py check <videoId>   # 영어 자막 존재 확인 → {success, hasEnglish}

stdout 으로 JSON 한 줄을 출력한다. (Node 측에서 파싱)
"""
import sys
import json

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
)

EN_LANGS = ["en", "en-US", "en-GB"]


def fetch(video_id):
    # 수동 자막 우선, 없으면 자동 생성 영어 자막
    transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=EN_LANGS)
    # [{text, start, duration}, ...] 형태를 그대로 반환
    return {"success": True, "captions": transcript}


def check(video_id):
    tl = YouTubeTranscriptApi.list_transcripts(video_id)
    has_en = any(t.language_code.startswith("en") for t in tl)
    return {"success": True, "hasEnglish": has_en}


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "usage: <fetch|check> <videoId>"}))
        sys.exit(1)

    mode, video_id = sys.argv[1], sys.argv[2]

    try:
        if mode == "check":
            result = check(video_id)
        else:
            result = fetch(video_id)
        print(json.dumps(result))
    except (TranscriptsDisabled, NoTranscriptFound):
        print(json.dumps({"success": False, "error": "no_captions"}))
    except VideoUnavailable:
        print(json.dumps({"success": False, "error": "video_unavailable"}))
    except Exception as e:  # noqa: BLE001 - 어떤 오류든 JSON 으로 전달
        print(json.dumps({"success": False, "error": str(e)}))


if __name__ == "__main__":
    main()
