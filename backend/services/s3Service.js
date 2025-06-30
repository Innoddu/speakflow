const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, PutBucketCorsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');

class S3Service {
  constructor() {
    // Credential verification
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not found in environment variables');
    }

    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY.trim(),
      },
      // Add explicit configuration
      maxAttempts: 3,
      requestHandler: {
        metadata: { handlerProtocol: "https/1.1" }
      }
    });
    
    this.bucketName = process.env.AWS_S3_BUCKET || 'speakflow-audio-files';
    console.log(`S3 Service initialized with bucket: ${this.bucketName} in region: ${process.env.AWS_REGION || 'us-east-2'}`);
  }

  /**
   * Setup CORS for the bucket to allow public access
   */
  async setupBucketCORS() {
    try {
      const corsParams = {
        Bucket: this.bucketName,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ['*'],
              AllowedMethods: ['GET', 'HEAD'],
              AllowedOrigins: ['*'],
              ExposeHeaders: [],
              MaxAgeSeconds: 3000,
            },
          ],
        },
      };

      const command = new PutBucketCorsCommand(corsParams);
      await this.s3Client.send(command);
      console.log('✅ CORS configuration updated for bucket');
      return true;
    } catch (error) {
      console.error('❌ Failed to setup CORS:', error.message);
      return false;
    }
  }

  /**
   * Upload audio file to S3
   * @param {string} videoId - YouTube video ID
   * @param {string} localFilePath - Path to local audio file
   * @returns {Promise<string>} S3 object key
   */
  async uploadAudioFile(videoId, localFilePath) {
    try {
      const fileName = `${videoId}.mp3`;
      const fileContent = fs.readFileSync(localFilePath);
      
      const uploadParams = {
        Bucket: this.bucketName,
        Key: `audio/${fileName}`,
        Body: fileContent,
        ContentType: 'audio/mpeg',
        CacheControl: 'max-age=31536000', // 1 year cache
        // No ACL needed - using bucket policy
        Metadata: {
          'video-id': videoId,
          'upload-date': new Date().toISOString(),
        },
      };

      const command = new PutObjectCommand(uploadParams);
      const result = await this.s3Client.send(command);
      
      console.log(`Audio file uploaded to S3: audio/${fileName}`);
      return `audio/${fileName}`;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error(`Failed to upload to S3: ${error.message}`);
    }
  }

  /**
   * Check if audio file exists in S3
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<boolean>} Whether file exists
   */
  async audioFileExists(videoId) {
    try {
      const fileName = `audio/${videoId}.mp3`;
      const headParams = {
        Bucket: this.bucketName,
        Key: fileName,
      };

      const command = new HeadObjectCommand(headParams);
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      console.error('S3 head object error:', error);
      throw error;
    }
  }

  /**
   * Get URL for audio file (Public URL - fast and reliable)
   * @param {string} videoId - YouTube video ID
   * @param {number} expiresIn - Not used for public URLs (kept for compatibility)
   * @returns {Promise<string>} Public URL
   */
  async getAudioFileUrl(videoId, expiresIn = 3600) {
    try {
      const fileName = `audio/${videoId}.webm`;
      
      // Check file existence
      const exists = await this.audioFileExists(videoId);
      if (!exists) {
        throw new Error(`Audio file not found: ${fileName}`);
      }

      // Use Public URL (fast and reliable)
      const publicUrl = this.getPublicAudioUrl(videoId);
      console.log(`Using public URL for ${fileName}`);
      return publicUrl;
    } catch (error) {
      console.error('S3 get URL error:', error);
      throw error;
    }
  }

  /**
   * Get public URL for audio file (fallback)
   * @param {string} videoId - YouTube video ID
   * @returns {string} Public URL
   */
  getPublicAudioUrl(videoId) {
    const fileName = `audio/${videoId}.mp3`;
    const region = process.env.AWS_REGION || 'us-east-2';
    return `https://${this.bucketName}.s3.${region}.amazonaws.com/${fileName}`;
  }

  /**
   * Delete local file after successful S3 upload
   * @param {string} filePath - Path to local file
   */
  cleanupLocalFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Local file cleaned up: ${filePath}`);
      }
    } catch (error) {
      console.error('Error cleaning up local file:', error);
    }
  }
}

module.exports = new S3Service(); 