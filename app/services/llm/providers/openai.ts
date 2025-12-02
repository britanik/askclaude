import axios from 'axios';
import { LLMProvider, LLMRequest, LLMResponse, LLMContentPart, LLMTool } from '../types';
import { logApiError } from '../../../helpers/errorLogger';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  
  private apiKey: string;
  private timeout: number;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.timeout = +(process.env.OPENAI_TIMEOUT || 60000);
  }

  async call(request: LLMRequest): Promise<LLMResponse> {
    // Determine API type from model config (default to 'responses' for backward compatibility)
    const apiType = request._modelConfig?.apiType || 'responses';
    
    if (apiType === 'completions') {
      return this.callCompletionsAPI(request);
    } else {
      return this.callResponsesAPI(request);
    }
  }

  // ============================================================
  // RESPONSES API (/v1/responses)
  // ============================================================
  private async callResponsesAPI(request: LLMRequest): Promise<LLMResponse> {
    console.log('OpenAI call (responses API)');
    console.log('request.model: ', request.model);
    console.log('request.system: ', request.system?.slice(0, 50) + '...');

    // Convert messages to OpenAI input format
    const input = this.convertMessagesForResponses(request);
    
    // Build OpenAI request for /responses API
    const openaiRequest: any = {
      model: request.model,
      input: input,
      max_output_tokens: request.max_tokens || 4096,
      temperature: request.temperature ?? 1,
    };

    // Add reasoning effort if provided (nested for responses API)
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
      const convertedTools = this.convertToolsForResponses(request.tools);
      if (convertedTools.length > 0) {
        openaiRequest.tools = convertedTools;
      }
    }

    try {
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

      return this.convertResponseFromResponses(response.data);

    } catch (error) {
      await logApiError('openai', error, 'OpenAI responses API call failed');
      throw error;
    }
  }

  // ============================================================
  // COMPLETIONS API (/v1/chat/completions)
  // ============================================================
  private async callCompletionsAPI(request: LLMRequest): Promise<LLMResponse> {
    console.log('OpenAI call (completions API)');
    console.log('request.model: ', request.model);
    console.log('request.system: ', request.system?.slice(0, 50) + '...');

    // Convert messages to OpenAI chat format
    const messages = this.convertMessagesForCompletions(request);
    
    // Build OpenAI request for /chat/completions API
    const openaiRequest: any = {
      model: request.model,
      messages: messages,
      max_completion_tokens: request.max_tokens || 4096,
      temperature: request.temperature ?? 1,
    };

    // Add reasoning effort if provided (top-level for completions API)
    if (request.reasoning_effort) {
      openaiRequest.reasoning_effort = request.reasoning_effort;
    }

    // Add response format if provided (for JSON responses)
    if (request.response_format) {
      openaiRequest.response_format = {
        type: 'json_schema',
        json_schema: {
          name: request.response_format.json_schema.name,
          schema: request.response_format.json_schema.schema,
          strict: true
        }
      };
    }

    // Add tools if provided
    if (request.tools && request.tools.length > 0) {
      const convertedTools = this.convertToolsForCompletions(request.tools);
      if (convertedTools.length > 0) {
        openaiRequest.tools = convertedTools;
      }
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        openaiRequest,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      return this.convertResponseFromCompletions(response.data);

    } catch (error) {
      await logApiError('openai', error, 'OpenAI completions API call failed');
      throw error;
    }
  }

  // ============================================================
  // MESSAGE CONVERSION - RESPONSES API
  // ============================================================
  private convertMessagesForResponses(request: LLMRequest): any[] {
    const input: any[] = [];
  
    for (const msg of request.messages) {
      if (typeof msg.content === 'string') {
        input.push({ role: msg.role, content: msg.content });
      } else {
        logApiError('openai', new Error('Debug: content type check'), 
          `msg.content type: ${typeof msg.content}, isArray: ${Array.isArray(msg.content)}, value: ${JSON.stringify(msg.content)?.slice(0, 200)}`
        ).catch(() => {});
        
        const converted = this.convertContentPartsForResponses(msg.content, msg.role);
        input.push(...converted);
      }
    }
  
    return input;
  }

  private convertContentPartsForResponses(parts: LLMContentPart[], role: string): any[] {
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
          toolCalls.push({
            type: 'function_call',
            call_id: part.id,
            name: part.name,
            arguments: JSON.stringify(part.input)
          });
          break;

        case 'tool_result':
          toolResults.push({
            type: 'function_call_output',
            call_id: part.tool_use_id,
            output: part.content
          });
          break;

        case 'web_search_tool_result':
          break;
      }
    }

    if (contentParts.length > 0) {
      result.push({
        role,
        content: contentParts
      });
    }

    if (toolCalls.length > 0) {
      result.push(...toolCalls);
    }

    if (toolResults.length > 0) {
      result.push(...toolResults);
    }

    return result;
  }

  // ============================================================
  // MESSAGE CONVERSION - COMPLETIONS API
  // ============================================================
  private convertMessagesForCompletions(request: LLMRequest): any[] {
    const messages: any[] = [];

    // Add system message first
    if (request.system) {
      messages.push({
        role: 'system',
        content: request.system
      });
    }
  
    for (const msg of request.messages) {
      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content });
      } else {
        const converted = this.convertContentPartsForCompletions(msg.content, msg.role);
        messages.push(...converted);
      }
    }
  
    return messages;
  }

  private convertContentPartsForCompletions(parts: LLMContentPart[], role: string): any[] {
    const result: any[] = [];
    const contentParts: any[] = [];
    const toolCalls: any[] = [];

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
          // For completions, tool_calls are part of assistant message
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
          // Tool results are separate messages in completions API
          result.push({
            role: 'tool',
            tool_call_id: part.tool_use_id,
            content: part.content
          });
          break;

        case 'web_search_tool_result':
          break;
      }
    }

    // Build message with content
    if (contentParts.length > 0 || toolCalls.length > 0) {
      const message: any = { role };
      
      if (contentParts.length > 0) {
        message.content = contentParts;
      }
      
      if (toolCalls.length > 0 && role === 'assistant') {
        message.tool_calls = toolCalls;
      }
      
      result.unshift(message);
    }

    return result;
  }

  // ============================================================
  // TOOL CONVERSION
  // ============================================================
  private convertToolsForResponses(tools: (LLMTool | any)[]): any[] {
    const result: any[] = [];

    for (const tool of tools) {
      if (tool.type === 'web_search_20250305') {
        result.push({ type: 'web_search' });
        continue;
      }

      result.push({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      });
    }

    return result;
  }

  private convertToolsForCompletions(tools: (LLMTool | any)[]): any[] {
    const result: any[] = [];

    for (const tool of tools) {
      if (tool.type === 'web_search_20250305') {
        // Web search not directly supported in completions API
        continue;
      }

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

  // ============================================================
  // RESPONSE CONVERSION - RESPONSES API
  // ============================================================
  private convertResponseFromResponses(data: any): LLMResponse {
    const content: LLMContentPart[] = [];
    const webSearchResults: Array<{ type: 'web_search_result'; title: string; url: string }> = [];
    let webSearchRequestCount = 0;

    if (data.output && Array.isArray(data.output)) {
      for (const outputItem of data.output) {
        if (outputItem.type === 'message' && outputItem.content) {
          for (const contentItem of outputItem.content) {
            if (contentItem.type === 'output_text') {
              content.push({
                type: 'text',
                text: contentItem.text
              });
            }
          }
        } else if (outputItem.type === 'function_call') {
          content.push({
            type: 'tool_use',
            id: outputItem.id || outputItem.call_id,
            name: outputItem.name,
            input: JSON.parse(outputItem.arguments || '{}')
          });
        } else if (outputItem.type === 'web_search_call') {
          webSearchRequestCount++;
          
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

  // ============================================================
  // RESPONSE CONVERSION - COMPLETIONS API
  // ============================================================
  private convertResponseFromCompletions(data: any): LLMResponse {
    const content: LLMContentPart[] = [];

    const choice = data.choices?.[0];
    if (choice?.message) {
      // Handle text content
      if (choice.message.content) {
        content.push({
          type: 'text',
          text: choice.message.content
        });
      }

      // Handle tool calls
      if (choice.message.tool_calls) {
        for (const toolCall of choice.message.tool_calls) {
          if (toolCall.type === 'function') {
            content.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.function.name,
              input: JSON.parse(toolCall.function.arguments || '{}')
            });
          }
        }
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