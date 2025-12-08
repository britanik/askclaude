import { ImageGenProvider, ImageGenRequest, ImageGenResponse } from './types';
import { OpenAIImageProvider } from './providers/openai';
import { GetImgProvider } from './providers/getimg';
import { getImageModelConfig, getDefaultImageModel, getNsfwImageModel } from './config';
import { logApiError } from '../../helpers/errorLogger';
import { moderateContent } from '../../controllers/images';

// Provider instances (lazy loaded)
let openaiProvider: OpenAIImageProvider | null = null;
let getimgProvider: GetImgProvider | null = null;

/**
 * Get provider instance by name
 */
function getProvider(name: 'openai' | 'getimg'): ImageGenProvider {
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

    default:
      throw new Error(`Unknown image provider: ${name}`);
  }
}

/**
 * Generate image with automatic provider selection
 * 
 * - Runs content moderation first
 * - If flagged as NSFW → uses GetImg provider
 * - Otherwise → uses default provider (OpenAI)
 */
export async function generateImage(request: ImageGenRequest): Promise<ImageGenResponse> {
  // Determine model to use
  const modelName = request.model || getDefaultImageModel();
  
  try {
    // Run content moderation
    const moderation = await moderateContent(request.prompt);
    
    if (moderation.flagged) {
      console.log('[ImageGen] Content flagged, using NSFW provider');
      
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

  } catch (error) {
    await logApiError('imagegen', error, `Image generation failed for model ${modelName}`);
    throw error;
  }
}

/**
 * Generate image with specific provider (skip moderation)
 * Used for regeneration where we already know the provider
 */
export async function generateImageWithProvider(
  request: ImageGenRequest, 
  providerName: 'openai' | 'getimg'
): Promise<ImageGenResponse> {
  const provider = getProvider(providerName);
  return await provider.generate(request);
}

// Re-export types
export * from './types';
export { getDefaultImageModel, getNsfwImageModel } from './config';