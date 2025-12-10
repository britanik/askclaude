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
      // Build request for Responses API with image_generation tool
      const openaiRequest: any = {
        model: request.model || 'gpt-5',
        input: 'Generate image: ' + request.prompt,
        tools: [{ type: 'image_generation' }]
      };

      // Add previous response ID for multi-turn editing
      if (request.previousResponseId) {
        openaiRequest.previous_response_id = request.previousResponseId;
        console.log('[Image:OpenAI] Multi-turn with previous:', request.previousResponseId);
      }

      // Build tool config with optional size and quality
      const imageGenTool: any = { type: 'image_generation' };

      if (request.size) {
        imageGenTool.size = request.size;
      }

      if (request.quality) {
        imageGenTool.quality = request.quality;
      }

      openaiRequest.tools = [imageGenTool];

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

      console.log('response.data.output[1].content', response.data.output[1].content)

      // Extract image data from response
      const imageData = this.extractImageData(response.data);
      
      if (!imageData) {
        throw new Error('No image data in response');
      }

      return {
        base64: imageData,
        responseId: response.data.id,
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

  /**
   * Extract base64 image data from Responses API output
   */
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