import axios from 'axios';
import { LLMProvider, LLMRequest, LLMResponse, LLMContentPart, LLMTool } from '../types';
import { logApiError } from '../../../helpers/errorLogger';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  
  private apiKey: string;
  private timeout: number;
  private baseUrl = 'https://api.openai.com/v1/responses';

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.timeout = +(process.env.OPENAI_TIMEOUT || 60000);
  }

  async call(request: LLMRequest): Promise<LLMResponse> {
    console.log('OpenAI call (responses API)');
    console.log('request.model: ', request.model);
    console.log('request.system: ', request.system.slice(0, 50) + '...');

    // Convert messages to OpenAI input format
    const input = this.convertMessages(request);
    
    // Build OpenAI request for /responses API
    const openaiRequest: any = {
      model: request.model,
      input: input,
      max_output_tokens: request.max_tokens || 4096,
      temperature: request.temperature ?? 1,
    };

    // Add reasoning effort if provided (for reasoning models)
    if (request.reasoning_effort) {
      openaiRequest.reasoning = {
        effort: request.reasoning_effort
      };
    }

    // Add response format if provided (for JSON responses)
    if (request.response_format) {
      openaiRequest.text = {
        format: {
          type: 'json_schema',
          name: request.response_format.json_schema.name,
          schema: request.response_format.json_schema.schema
        }
      };
    }

    // Add system prompt as instructions
    if (request.system) {
      openaiRequest.instructions = request.system;
    }

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
    const input: any[] = [];

    // Convert each message to input format
    for (const msg of request.messages) {
      if (typeof msg.content === 'string') {
        // Simple text message
        input.push({
          role: msg.role,
          content: msg.content
        });
      } else {
        // Complex content (images, tool results, etc.)
        const converted = this.convertContentParts(msg.content, msg.role);
        input.push(...converted);
      }
    }

    return input;
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
            type: 'input_text',
            text: part.text
          });
          break;

        case 'image':
          contentParts.push({
            type: 'input_image',
            image_url: `data:${part.source.media_type};base64,${part.source.data}`
          });
          break;

        case 'tool_use':
          // Tool use from assistant - will be handled in tool calling update
          toolCalls.push({
            type: 'function_call',
            id: part.id,
            name: part.name,
            arguments: JSON.stringify(part.input)
          });
          break;

        case 'tool_result':
          // Tool result from user
          toolResults.push({
            type: 'function_call_output',
            call_id: part.tool_use_id,
            output: part.content
          });
          break;

        case 'web_search_tool_result':
          // Web search not supported in OpenAI - skip
          break;
      }
    }

    // Build message(s) based on content type
    if (contentParts.length > 0) {
      result.push({
        role,
        content: contentParts
      });
    }

    // Add tool calls as part of assistant message
    if (toolCalls.length > 0 && role === 'assistant') {
      // If we already have content, merge tool calls
      if (result.length > 0) {
        result[result.length - 1].content = [
          ...result[result.length - 1].content,
          ...toolCalls
        ];
      } else {
        result.push({
          role: 'assistant',
          content: toolCalls
        });
      }
    }

    // Add tool results as separate items in input
    result.push(...toolResults);

    return result;
  }

  private convertTools(tools: (LLMTool | any)[]): any[] {
    const result: any[] = [];

    for (const tool of tools) {
      // Convert Anthropic web search tool to OpenAI format
      if (tool.type === 'web_search_20250305') {
        result.push({
          type: 'web_search'
        });
        continue;
      }

      // Convert function tool
      result.push({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      });
    }

    return result;
  }

  private convertResponse(data: any): LLMResponse {
    const content: LLMContentPart[] = [];
    const webSearchResults: Array<{ type: 'web_search_result'; title: string; url: string }> = [];
    let webSearchRequestCount = 0;

    // Parse output array
    if (data.output && Array.isArray(data.output)) {
      for (const outputItem of data.output) {
        if (outputItem.type === 'message' && outputItem.content) {
          // Handle message output
          for (const contentItem of outputItem.content) {
            if (contentItem.type === 'output_text') {
              content.push({
                type: 'text',
                text: contentItem.text
              });
            }
          }
        } else if (outputItem.type === 'function_call') {
          // Handle function call output
          content.push({
            type: 'tool_use',
            id: outputItem.id || outputItem.call_id,
            name: outputItem.name,
            input: JSON.parse(outputItem.arguments || '{}')
          });
        } else if (outputItem.type === 'web_search_call') {
          // Handle web search call - count for usage tracking
          webSearchRequestCount++;
          
          // Extract search results if available
          if (outputItem.results && Array.isArray(outputItem.results)) {
            for (const result of outputItem.results) {
              webSearchResults.push({
                type: 'web_search_result',
                title: result.title || '',
                url: result.url || ''
              });
            }
          }
        }
      }
    }

    // Add web search results to content if any were found
    if (webSearchResults.length > 0) {
      content.push({
        type: 'web_search_tool_result',
        content: webSearchResults
      } as any);
    }

    return {
      content,
      usage: {
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
        server_tool_use: webSearchRequestCount > 0 ? {
          web_search_requests: webSearchRequestCount
        } : undefined
      },
      model: data.model,
      stop_reason: data.status
    };
  }
}