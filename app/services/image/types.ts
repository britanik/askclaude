export interface ImageRequest {
  prompt: string;
  size?: '1024x1024' | '1024x1536' | '1536x1024';
  quality?: 'low' | 'medium' | 'high' | 'auto'; // (OpenAI specific)
  previousResponseId?: string; // For multi-turn  
  model?: string; // Model to use (resolved from config if not provided)
}

// Response from image generation
export interface ImageResponse {
  base64: string; // Base64-encoded image data (providers convert URL to base64 if needed)
  responseId?: string; // Response ID for multi-turn conversations (OpenAI only)
  provider: 'openai' | 'getimg' | 'gemini'; // Provider that generated the image
  originalUrl?: string; // Original URL if available (for reference/logging)
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

// Provider interface
export interface ImageProvider {
  name: string;
  generate(request: ImageRequest): Promise<ImageResponse>;
}