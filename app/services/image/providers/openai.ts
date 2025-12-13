import axios from 'axios';
import { ImageProvider, ImageRequest, ImageResponse } from '../types';
import { logApiError } from '../../../helpers/errorLogger';

export class OpenAIImageProvider implements ImageProvider {
  name: 'openai' = 'openai';
  
  private apiKey: string;
  private timeout: number;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.timeout = +process.env.TIMEOUT_IMAGE;
  }

  async generate(request: ImageRequest): Promise<ImageResponse> {
    console.log('[Image:OpenAI] Generating image');
    console.log('[Image:OpenAI] Prompt:', request.prompt.slice(0, 100) + '...');
    
    try {
      const openaiRequest: any = {
        model: request.model || 'gpt-5',
        tools: [{ 
          type: 'image_generation',
          size: request.size || '1024x1024',
          quality: request.quality || 'medium'
        }]
      };

      // Build input based on available data
      if (request.image?.multiTurnData?.responseId) {
        // Native multi-turn: use previous response ID
        openaiRequest.previous_response_id = request.image.multiTurnData.responseId;
        openaiRequest.input = 'Edit the image: ' + request.prompt;
        console.log('[Image:OpenAI] Native multi-turn with responseId:', request.image.multiTurnData.responseId);
        
      } else if (request.imageBase64) {
        // Cross-provider fallback: send image as input with role
        openaiRequest.input = [{ 
          role: 'user', 
          content: [
            { type: 'input_image', image_url: `data:image/jpeg;base64,${request.imageBase64}` },
            { type: 'input_text', text: 'Edit this image: ' + request.prompt }
          ]
        }];
        console.log('[Image:OpenAI] Cross-provider edit with base64 image');
        
      } else {
        // New image generation
        openaiRequest.input = 'Generate image: ' + request.prompt;
      }

      const response = await axios.post(
        'https://api.openai.com/v1/responses',
        openaiRequest,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      console.log('response.data.output', response.data.output);

      const imageData = this.extractImageData(response.data);
      
      if (!imageData) {
        throw new Error('No image data in response');
      }

      return {
        base64: imageData,
        multiTurnData: { responseId: response.data.id },
        provider: 'openai',
        usage: {
          inputTokens: response.data.usage?.input_tokens,
          outputTokens: response.data.usage?.output_tokens
        }
      };

    } catch (error) {
      await logApiError('openai-image', error, 'OpenAI image generation failed');
      throw error;
    }
  }

  private extractImageData(data: any): string | null {
    if (!data.output || !Array.isArray(data.output)) {
      return null;
    }

    for (const outputItem of data.output) {
      if (outputItem.type === 'image_generation_call' && outputItem.result) {
        return outputItem.result;
      }
    }

    return null;
  }
}