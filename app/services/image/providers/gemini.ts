import axios from 'axios';
import { ImageProvider, ImageRequest, ImageResponse } from '../types';
import { ImageError } from '../errors';

export class GeminiImageProvider implements ImageProvider {
  name: 'gemini' = 'gemini';
  
  private apiKey: string;
  private timeout: number;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.timeout = +(process.env.TIMEOUT_IMAGE || 120000);
  }

  async generate(request: ImageRequest): Promise<ImageResponse> {
    console.log('[Image:Gemini] Generating image');
    console.log('[Image:Gemini] Prompt:', request.prompt.slice(0, 100) + '...');
    
    // Determine which model to use
    const model = request.model || 'gemini-3-pro-image-preview';
    
    // Use different API based on model
    if (model === 'gemini-imagen-4' || model.startsWith('imagen')) {
      return this.generateWithImagen(request);
    } else {
      return this.generateWithGemini(request, model);
    }
  }

  /**
   * Generate image using Gemini 3 Pro Image (generateContent API)
   */
  private async generateWithGemini(request: ImageRequest, model: string): Promise<ImageResponse> {
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    
    let response: any;
    
    try {
      response = await axios.post(
        baseUrl,
        {
          contents: [{
            role: 'user',
            parts: [
              { text: request.prompt }
            ]
          }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT']
          }
        },
        {
          headers: {
            'x-goog-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );
    } catch (error: any) {
      // Network or HTTP error
      const errorMessage = this.extractAxiosError(error);
      throw new ImageError(
        errorMessage,
        'gemini',
        error.response?.data,
        'api_error',
        error.response?.status
      );
    }

    // Check for block reason or other issues
    const blockInfo = this.extractBlockInfo(response.data);
    if (blockInfo) {
      throw new ImageError(
        blockInfo.message,
        'gemini',
        response.data,
        blockInfo.reason
      );
    }

    // Extract base64 image from response
    const base64 = this.extractImageFromGenerateContent(response.data);
    
    if (!base64) {
      // No image but also no clear block reason - include full response for debugging
      throw new ImageError(
        'No image data in Gemini response',
        'gemini',
        response.data,
        'no_image'
      );
    }

    return {
      base64,
      provider: 'gemini'
    };
  }

  /**
   * Generate image using Imagen 4.0 (predict API)
   */
  private async generateWithImagen(request: ImageRequest): Promise<ImageResponse> {
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict';
    
    let response: any;
    
    try {
      response = await axios.post(
        baseUrl,
        {
          instances: [
            {
              prompt: request.prompt
            }
          ],
          parameters: {
            sampleCount: 1
          }
        },
        {
          headers: {
            'x-goog-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );
    } catch (error: any) {
      // Network or HTTP error
      const errorMessage = this.extractAxiosError(error);
      throw new ImageError(
        errorMessage,
        'gemini',
        error.response?.data,
        'api_error',
        error.response?.status
      );
    }

    // Extract base64 image from response
    const base64 = this.extractImageFromPredict(response.data);
    
    if (!base64) {
      throw new ImageError(
        'No image data in Imagen response',
        'gemini-imagen',
        response.data,
        'no_image'
      );
    }

    return {
      base64,
      provider: 'gemini'
    };
  }

  /**
   * Extract meaningful error message from axios error
   */
  private extractAxiosError(error: any): string {
    if (error.response?.data?.error?.message) {
      return error.response.data.error.message;
    }
    if (error.response?.data?.error) {
      return JSON.stringify(error.response.data.error);
    }
    if (error.message) {
      return error.message;
    }
    return 'Unknown API error';
  }

  /**
   * Check if response contains block/safety info
   */
  private extractBlockInfo(data: any): { message: string; reason: string } | null {
    // Check promptFeedback for blocking
    if (data.promptFeedback?.blockReason) {
      const reason = data.promptFeedback.blockReason;
      const safetyRatings = data.promptFeedback.safetyRatings || [];
      const highRisk = safetyRatings
        .filter((r: any) => r.probability === 'HIGH' || r.probability === 'MEDIUM')
        .map((r: any) => r.category?.replace('HARM_CATEGORY_', ''))
        .join(', ');
      
      return {
        message: `Blocked by Gemini: ${reason}${highRisk ? ` (${highRisk})` : ''}`,
        reason: 'blocked'
      };
    }

    // Check candidates for finish reason
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        const safetyRatings = candidate.safetyRatings || [];
        const highRisk = safetyRatings
          .filter((r: any) => r.probability === 'HIGH' || r.probability === 'MEDIUM')
          .map((r: any) => r.category?.replace('HARM_CATEGORY_', ''))
          .join(', ');

        return {
          message: `Generation stopped: ${candidate.finishReason}${highRisk ? ` (${highRisk})` : ''}`,
          reason: candidate.finishReason.toLowerCase()
        };
      }
    }

    return null;
  }

  /**
   * Extract base64 image data from generateContent response (Gemini 3 Pro Image)
   */
  private extractImageFromGenerateContent(data: any): string | null {
    if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
      return null;
    }

    const content = data.candidates[0]?.content;
    if (!content || !content.parts || !Array.isArray(content.parts)) {
      return null;
    }

    // Find the first part with inlineData (image)
    for (const part of content.parts) {
      if (part.inlineData && part.inlineData.data) {
        return part.inlineData.data;
      }
    }
    
    return null;
  }

  /**
   * Extract base64 image data from predict response (Imagen 4.0)
   */
  private extractImageFromPredict(data: any): string | null {
    if (data.predictions && Array.isArray(data.predictions) && data.predictions.length > 0) {
      const prediction = data.predictions[0];
      if (prediction.bytesBase64Encoded) {
        return prediction.bytesBase64Encoded;
      }
    }
    
    return null;
  }
}