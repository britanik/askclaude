import axios from 'axios';
import { LLMProvider, LLMRequest, LLMResponse, LLMContentPart, LLMTool } from '../types';
import { logApiError } from '../../../helpers/errorLogger';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  
  private apiKey: string;
  private timeout: number;
  private baseUrl = 'https://api.openai.com/v1/chat/completions';

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.timeout = +(process.env.OPENAI_TIMEOUT || 60000);
  }

  async call(request: LLMRequest): Promise<LLMResponse> {
    console.log('Openai call')
    console.log('request.model: ', request.model)

    // Convert messages to OpenAI format
    const openaiMessages = this.convertMessages(request);
    
    // Build OpenAI request
    const openaiRequest: any = {
      model: request.model,
      messages: openaiMessages,
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature ?? 1,
    };

    // Add tools if provided (convert to OpenAI format)
    if (request.tools && request.tools.length > 0) {
      const convertedTools = this.convertTools(request.tools);
      if (convertedTools.length > 0) {
        openaiRequest.tools = convertedTools;
      }
    }

    try {
      const response = await axios.post(
        this.baseUrl,
        openaiRequest,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      // Map OpenAI response to unified format
      return this.convertResponse(response.data);

    } catch (error) {
      await logApiError('openai', error, 'OpenAI provider call failed');
      throw error;
    }
  }

  private convertMessages(request: LLMRequest): any[] {
    const messages: any[] = [];

    // Add system message if provided
    if (request.system) {
      messages.push({
        role: 'system',
        content: request.system
      });
    }

    // Convert each message
    for (const msg of request.messages) {
      if (typeof msg.content === 'string') {
        // Simple text message
        messages.push({
          role: msg.role,
          content: msg.content
        });
      } else {
        // Complex content (images, tool results, etc.)
        const converted = this.convertContentParts(msg.content, msg.role);
        messages.push(...converted);
      }
    }

    return messages;
  }

  private convertContentParts(parts: LLMContentPart[], role: string): any[] {
    const result: any[] = [];
    const contentParts: any[] = [];
    const toolCalls: any[] = [];
    const toolResults: any[] = [];

    for (const part of parts) {
      switch (part.type) {
        case 'text':
          contentParts.push({
            type: 'text',
            text: part.text
          });
          break;

        case 'image':
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${part.source.media_type};base64,${part.source.data}`
            }
          });
          break;

        case 'tool_use':
          toolCalls.push({
            id: part.id,
            type: 'function',
            function: {
              name: part.name,
              arguments: JSON.stringify(part.input)
            }
          });
          break;

        case 'tool_result':
          toolResults.push({
            role: 'tool',
            tool_call_id: part.tool_use_id,
            content: part.content
          });
          break;

        case 'web_search_tool_result':
          // Web search not supported in OpenAI - skip or convert to text
          break;
      }
    }

    // Build message(s) based on content type
    if (contentParts.length > 0 || toolCalls.length > 0) {
      const msg: any = { role };
      
      if (contentParts.length > 0) {
        msg.content = contentParts.length === 1 && contentParts[0].type === 'text' 
          ? contentParts[0].text 
          : contentParts;
      }
      
      if (toolCalls.length > 0) {
        msg.tool_calls = toolCalls;
      }
      
      result.push(msg);
    }

    // Add tool results as separate messages
    result.push(...toolResults);

    return result;
  }

  private convertTools(tools: (LLMTool | any)[]): any[] {
    const result: any[] = [];

    for (const tool of tools) {
      // Skip web search tool (OpenAI doesn't support it natively)
      if (tool.type === 'web_search_20250305') {
        continue;
      }

      // Convert function tool
      result.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema
        }
      });
    }

    return result;
  }

  private convertResponse(data: any): LLMResponse {
    const choice = data.choices?.[0];
    const message = choice?.message;
    const content: LLMContentPart[] = [];

    // Convert text content
    if (message?.content) {
      content.push({
        type: 'text',
        text: message.content
      });
    }

    // Convert tool calls
    if (message?.tool_calls) {
      for (const toolCall of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments || '{}')
        });
      }
    }

    return {
      content,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0
      },
      model: data.model,
      stop_reason: choice?.finish_reason
    };
  }
}