import axios from 'axios';
import { ImageGenProvider, ImageGenRequest, ImageGenResponse } from '../types';
import { logApiError } from '../../../helpers/errorLogger';

export class GeminiImageProvider implements ImageGenProvider {
  name: 'gemini' = 'gemini';
  
  private apiKey: string;
  private timeout: number;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.timeout = +(process.env.TIMEOUT_IMAGE || 120000);
  }

  async generate(request: ImageGenRequest): Promise<ImageGenResponse> {
    console.log('[ImageGen:Gemini] Generating image');
    console.log('[ImageGen:Gemini] Prompt:', request.prompt.slice(0, 100) + '...');
    
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
  private async generateWithGemini(request: ImageGenRequest, model: string): Promise<ImageGenResponse> {
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    
    try {
      const response = await axios.post(
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

      // Extract base64 image from response
      const base64 = this.extractImageFromGenerateContent(response.data);
      
      if (!base64) {
        throw new Error('No image data in Gemini response');
      }

      return {
        base64,
        provider: 'gemini'
      };

    } catch (error) {
      await logApiError('gemini-imagegen', error, 'Gemini image generation failed');
      throw error;
    }
  }

  /**
   * Generate image using Imagen 4.0 (predict API)
   */
  private async generateWithImagen(request: ImageGenRequest): Promise<ImageGenResponse> {
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict';
    
    try {
      const response = await axios.post(
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

      // Extract base64 image from response
      const base64 = this.extractImageFromPredict(response.data);
      
      if (!base64) {
        throw new Error('No image data in Imagen response');
      }

      return {
        base64,
        provider: 'gemini'
      };

    } catch (error) {
      await logApiError('gemini-imagegen', error, 'Imagen image generation failed');
      throw error;
    }
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