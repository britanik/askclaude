export interface ImageRequest {
  prompt: string;
  size?: '1024x1024' | '1024x1536' | '1536x1024';
  quality?: 'low' | 'medium' | 'high' | 'auto'; // (OpenAI specific)
  previousMultiTurnData?: any; // Provider-specific data for multi-turn editing
  model?: string; // Model to use (resolved from config if not provided)
}

// Response from image generation
export interface ImageResponse {
  base64: string; // Base64-encoded image data (providers convert URL to base64 if needed)
  multiTurnData?: any; // Provider-specific data for next turn (OpenAI: responseId, Gemini: conversationHistory)
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