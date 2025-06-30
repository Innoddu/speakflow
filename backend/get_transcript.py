import sys
import json
from youtube_transcript_api import YouTubeTranscriptApi

def get_transcript(video_id):
    try:
        # Try to get English transcript first
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
        return transcript
    except Exception as e:
        # Try auto-generated English transcript
        try:
            transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en-US', 'en-GB'])
            return transcript
        except Exception as e2:
            # If both fail, raise the original error
            raise e

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python get_transcript.py <video_id>", file=sys.stderr)
        sys.exit(1)
    
    video_id = sys.argv[1]
    
    try:
        transcript = get_transcript(video_id)
        for entry in transcript:
            print(json.dumps(entry))
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
