export type ImageTier = 'top' | 'normal';

// Previous image data for editing/multi-turn
export interface PreviousImage {
  multiTurnData?: any;  // Provider-specific (responseId for OpenAI, lastModelResponse for Gemini)
  provider?: string;    // Provider that created the image
  path?: string;        // Local file path (for fallback via base64)
}

export interface ImageRequest {
  prompt: string;
  size?: '1024x1024' | '1024x1536' | '1536x1024';
  quality?: 'low' | 'medium' | 'high' | 'auto'; // (OpenAI specific)
  model?: string;
  tier?: ImageTier;
  image?: PreviousImage; // For editing previous image (same provider - native multi-turn)
  imageBase64?: string; // For cross-provider editing (base64 fallback)
}

// Response from image generation
export interface ImageResponse {
  base64: string;
  multiTurnData?: any; // Provider-specific data for next turn
  provider: 'openai' | 'getimg' | 'gemini';
  originalUrl?: string;
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