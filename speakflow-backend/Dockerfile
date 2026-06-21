# Node 전용 — Python/yt-dlp/ffmpeg/spaCy 불필요 (Gemini가 전사 담당)
FROM node:20-slim

WORKDIR /app

# 의존성 설치
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm install && cd backend && npm install

# 소스 복사
COPY . .

EXPOSE 5030

CMD ["npm", "start"]
