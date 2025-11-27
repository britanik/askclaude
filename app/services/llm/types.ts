// Unified LLM Provider Types

// Content types for messages
export interface LLMTextContent {
  type: 'text';
  text: string;
}

export interface LLMImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface LLMToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface LLMToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// Web search result (Claude-specific but useful to standardize)
export interface LLMWebSearchResult {
  type: 'web_search_tool_result';
  content: Array<{
    type: 'web_search_result';
    title: string;
    url: string;
  }>;
}

export type LLMContentPart = 
  | LLMTextContent 
  | LLMImageContent 
  | LLMToolUseContent 
  | LLMToolResultContent
  | LLMWebSearchResult;

// Message format
export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string | LLMContentPart[];
}

// Tool definition (Claude format - providers convert if needed)
export interface LLMTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// Web search tool (Claude-specific)
export interface LLMWebSearchTool {
  type: 'web_search_20250305';
  name: 'web_search';
  max_uses: number;
}

// Request to LLM
export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  system?: string;
  tools?: (LLMTool | LLMWebSearchTool)[];
  max_tokens?: number;
  temperature?: number;
  provider?: 'anthropic' | 'openai';
  reasoning_effort?: 'low' | 'medium' | 'high';
  response_format?: {
    type: 'json_schema';
    json_schema: {
      name: string;
      schema: Record<string, any>;
    };
  };
}

// Usage stats
export interface LLMUsage {
  input_tokens: number;
  output_tokens: number;
  server_tool_use?: {
    web_search_requests?: number;
  };
}

// Response from LLM
export interface LLMResponse {
  content: LLMContentPart[];
  usage: LLMUsage;
  model: string;
  stop_reason?: string;
}

// Provider interface
export interface LLMProvider {
  name: string;
  call(request: LLMRequest): Promise<LLMResponse>;
}

export const RESPONSE_FORMAT_ANALYZE = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'conversation_analysis',
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['new', 'continue'] },
        search: { type: 'boolean' },
        assistant: { type: 'string', enum: ['normal', 'finance'] },
        why: { type: 'string' }
      },
      required: ['action', 'search', 'assistant', 'why'],
      additionalProperties: false
    }
  }
};

// Type guard for tool_use content
export function isToolUse(content: LLMContentPart): content is LLMToolUseContent {
  return content.type === 'tool_use';
}