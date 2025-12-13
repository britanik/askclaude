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
    
    const model = request.model || 'gemini-3-pro-image-preview';
    
    if (model === 'gemini-imagen-4' || model.startsWith('imagen')) {
      return this.generateWithImagen(request);
    } else {
      return this.generateWithGemini(request, model);
    }
  }

  private async generateWithGemini(request: ImageRequest, model: string): Promise<ImageResponse> {
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    
    // Build contents based on available data
    let contents: any[] = [];
    
    // Check for native multi-turn data
    const previousResponse = request.image?.multiTurnData?.lastModelResponse;
    
    if (previousResponse) {
      // Native multi-turn: send last model response + new prompt
      contents = [
        previousResponse,
        { role: 'user', parts: [{ text: request.prompt }] }
      ];
      console.log('[Image:Gemini] Native multi-turn with lastModelResponse');
      
    } else if (request.imageBase64) {
      // Cross-provider fallback: send image as inline data
      contents = [{
        role: 'user',
        parts: [
          { 
            inlineData: { 
              mimeType: 'image/jpeg', 
              data: request.imageBase64 
            } 
          },
          { text: 'Edit this image: ' + request.prompt }
        ]
      }];
      console.log('[Image:Gemini] Cross-provider edit with base64 image');
      
    } else {
      // New image generation
      contents = [{
        role: 'user',
        parts: [{ text: request.prompt }]
      }];
    }
    
    let response: any;
    try {
      response = await axios.post(
        baseUrl,
        {
          contents,
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig: {
              imageSize: '1K',
              aspectRatio: '1:1'
            }
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
      const errorMessage = this.extractAxiosError(error);
      throw new ImageError(
        errorMessage,
        'gemini',
        error.response?.data,
        'api_error',
        error.response?.status
      );
    }

    const blockInfo = this.extractBlockInfo(response.data);
    if (blockInfo) {
      throw new ImageError(
        blockInfo.message,
        'gemini',
        response.data,
        blockInfo.reason
      );
    }

    const base64 = this.extractImageFromGenerateContent(response.data);
    
    if (!base64) {
      throw new ImageError(
        'No image data in Gemini response',
        'gemini',
        response.data,
        'no_image'
      );
    }

    const lastModelResponse = response.data.candidates?.[0]?.content;

    return {
      base64,
      provider: 'gemini',
      multiTurnData: lastModelResponse ? { lastModelResponse } : undefined
    };
  }

  private async generateWithImagen(request: ImageRequest): Promise<ImageResponse> {
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict';
    
    let response: any;
    
    try {
      response = await axios.post(
        baseUrl,
        {
          instances: [{ prompt: request.prompt }],
          parameters: { sampleCount: 1 }
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
      const errorMessage = this.extractAxiosError(error);
      throw new ImageError(
        errorMessage,
        'gemini',
        error.response?.data,
        'api_error',
        error.response?.status
      );
    }

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
      // Imagen doesn't support multi-turn
    };
  }

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

  private extractBlockInfo(data: any): { message: string; reason: string } | null {
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

    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        const safetyRatings = candidate.safetyRatings || [];
        const highRisk = safetyRatings
          .filter((r: any) => r.probability === 'HIGH' || r.probability === 'MEDIUM')
          .map((r: any) => r.category?.replace('HARM_CATEGORY_', ''))
          .join(', ');

        return {
          message: `Gemini stopped: ${candidate.finishReason}${highRisk ? ` (${highRisk})` : ''}`,
          reason: candidate.finishReason.toLowerCase()
        };
      }
    }

    return null;
  }

  private extractImageFromGenerateContent(data: any): string | null {
    if (!data.candidates || data.candidates.length === 0) {
      return null;
    }

    const content = data.candidates[0].content;
    if (!content || !content.parts) {
      return null;
    }

    for (const part of content.parts) {
      if (part.inlineData && part.inlineData.data) {
        return part.inlineData.data;
      }
    }
    
    return null;
  }

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