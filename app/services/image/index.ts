import { ImageProvider, ImageRequest, ImageResponse } from './types';
import { OpenAIImageProvider } from './providers/openai';
import { GetImgProvider } from './providers/getimg';
import { GeminiImageProvider } from './providers/gemini';
import { getImageModelConfig, getDefaultImageModel, getNsfwImageModel } from './config';
import { moderateContent } from '../../controllers/images';

// Provider instances (lazy loaded)
let openaiProvider: OpenAIImageProvider | null = null;
let getimgProvider: GetImgProvider | null = null;
let geminiProvider: GeminiImageProvider | null = null;

/**
 * Get provider instance by name
 */
function getProvider(name: 'openai' | 'getimg' | 'gemini'): ImageProvider {
  switch (name) {
    case 'openai':
      if (!openaiProvider) {
        openaiProvider = new OpenAIImageProvider();
      }
      return openaiProvider;

    case 'getimg':
      if (!getimgProvider) {
        getimgProvider = new GetImgProvider();
      }
      return getimgProvider;

    case 'gemini':
      if (!geminiProvider) {
        geminiProvider = new GeminiImageProvider();
      }
      return geminiProvider;

    default:
      throw new Error(`Unknown image provider: ${name}`);
  }
}

/**
 * Generate image with automatic provider selection
 * 
 * - Runs content moderation first
 * - If flagged as NSFW → uses GetImg provider
 * - Otherwise → uses default provider (Gemini)
 * 
 * Note: Error logging happens at the caller level (assistants.ts)
 */
export async function generateImage(request: ImageRequest): Promise<ImageResponse> {
  // Determine model to use
  const modelName = request.model || getDefaultImageModel();
  
  // Run content moderation
  const moderation = await moderateContent(request.prompt);
  
  if (moderation.flagged && moderation.scores.sexual > 0.9) {
    console.log('[Image] Content flagged, using NSFW provider');
    
    // Use NSFW-safe provider (GetImg)
    const nsfwModel = getNsfwImageModel();
    const nsfwConfig = getImageModelConfig(nsfwModel);
    const provider = getProvider(nsfwConfig.provider);
    
    return await provider.generate({
      ...request,
      model: nsfwModel
    });
  }
  
  // Use default provider
  const config = getImageModelConfig(modelName);
  const provider = getProvider(config.provider);
  
  return await provider.generate({
    ...request,
    model: modelName
  });
}

/**
 * Generate image with specific provider (skip moderation)
 * Used for regeneration where we already know the provider
 */
export async function generateImageWithProvider(
  request: ImageRequest, 
  providerName: 'openai' | 'getimg' | 'gemini'
): Promise<ImageResponse> {
  const provider = getProvider(providerName);
  return await provider.generate(request);
}

// Re-export types
export * from './types';