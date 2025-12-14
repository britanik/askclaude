import axios from 'axios';
import { LLMProvider, LLMRequest, LLMResponse } from '../types';
import { logApiError } from '../../../helpers/errorLogger';

export class AnthropicProvider implements LLMProvider {
  name = 'claude';
  
  private apiKey: string;
  private timeout: number;
  private apiVersion = '2023-06-01';
  private baseUrl = 'https://api.anthropic.com/v1/messages';

  constructor() {
    this.apiKey = process.env.CLAUDE_TOKEN || '';
    this.timeout = +(process.env.CLAUDE_TIMEOUT || 60000);
  }

  async call(request: LLMRequest): Promise<LLMResponse> {
    console.log('Anthropic call')
    // console.log('Request messages:', request.messages)

    // Build Claude-specific request
    const claudeRequest: any = {
      model: request.model,
      messages: request.messages,
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature ?? 1,
      stream: false,
    };

    // Add system prompt if provided
    if (request.system) {
      claudeRequest.system = request.system;
    }

    // Add tools if provided
    if (request.tools && request.tools.length > 0) {
      claudeRequest.tools = request.tools;
    }

    try {
      const response = await axios.post(
        this.baseUrl,
        claudeRequest,
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': this.apiVersion,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      // Map Claude response to unified format
      return {
        content: response.data.content,
        usage: {
          input_tokens: response.data.usage?.input_tokens || 0,
          output_tokens: response.data.usage?.output_tokens || 0,
          server_tool_use: response.data.usage?.server_tool_use
        },
        model: response.data.model,
        stop_reason: response.data.stop_reason
      };

    } catch (error) {
      await logApiError('anthropic', error, 'Claude provider call failed');
      throw error;
    }
  }
}