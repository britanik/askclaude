export type ImageTier = 'top' | 'normal';

// Previous image data for editing/multi-turn
export interface PreviousImage {
  multiTurnData?: any;  // Provider-specific (responseId for OpenAI, lastModelResponse for Gemini)
  provider?: string;    // Provider that created the image
  path?: string;        // Local file path (for fallback via base64)
}

export interface ImageRequest {
  prompt: string;
  size?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto'; // (OpenAI specific)
  model?: string;
  tier?: ImageTier;
  image?: PreviousImage; // For editing previous image (same provider - native multi-turn)
  imageBase64?: string; // For cross-provider editing (base64 fallback)
  aspectRatio?: string;    // e.g. "3:4", "1:1", "16:9"
  imageQuality?: string;   // "low" | "standard" | "high"
  imageSize?: string;      // "1k" | "2k"
  imageProvider?: string;  // "gemini" | "openai"
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