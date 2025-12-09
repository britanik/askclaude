import axios from 'axios';
import { ImageProvider, ImageRequest, ImageResponse } from '../types';
import { logApiError } from '../../../helpers/errorLogger';

export class GetImgProvider implements ImageProvider {
  name: 'getimg' = 'getimg';
  
  private apiKey: string;
  private timeout: number;

  constructor() {
    this.apiKey = process.env.GETIMG_API_KEY || '';
    this.timeout = 120000; // 2 minutes for image generation
  }

  async generate(request: ImageRequest): Promise<ImageResponse> {
    console.log('[Image:GetImg] Generating image');
    console.log('[Image:GetImg] Prompt:', request.prompt.slice(0, 100) + '...');
    
    try {
      // Parse size to width/height
      const { width, height } = this.parseSize(request.size);

      const response = await axios.post(
        'https://api.getimg.ai/v1/essential/text-to-image',
        {
          style: 'photorealism',
          width,
          height,
          output_format: 'jpeg',
          response_format: 'url',
          prompt: request.prompt
        },
        {
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'authorization': `Bearer ${this.apiKey}`
          },
          timeout: this.timeout
        }
      );

      const imageUrl = response.data.url;
      
      if (!imageUrl) {
        throw new Error('No image URL in response');
      }

      // Download image and convert to base64
      const base64 = await this.downloadAsBase64(imageUrl);

      return {
        base64,
        provider: 'getimg',
        originalUrl: imageUrl
      };

    } catch (error) {
      await logApiError('getimg', error, 'GetImg image generation failed');
      throw error;
    }
  }

  /**
   * Parse size string to width/height
   */
  private parseSize(size?: string): { width: number; height: number } {
    switch (size) {
      case '1024x1536':
        return { width: 1024, height: 1536 };
      case '1536x1024':
        return { width: 1536, height: 1024 };
      case '1024x1024':
      default:
        return { width: 1024, height: 1024 };
    }
  }

  /**
   * Download image from URL and convert to base64
   */
  private async downloadAsBase64(url: string): Promise<string> {
    const response = await axios.get(url, { 
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    const buffer = Buffer.from(response.data, 'binary');
    return buffer.toString('base64');
  }
}