import { ImageProvider, ImageRequest, ImageResponse } from './types';
import { OpenAIImageProvider } from './providers/openai';
import { GetImgProvider } from './providers/getimg';
import { GeminiImageProvider } from './providers/gemini';
import { getImageModelConfig, getDefaultImageModel, getNsfwImageModel } from './config';
import { moderateContent } from '../../controllers/images';
import { ImageError } from './errors';

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
 * Get backup image model name
 */
export function getBackupImageModel(): string {
  return process.env.IMAGE_MODEL_BACKUP || 'gpt-5';
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
 * Result of image generation with fallback info
 */
export interface ImageGenerationResult {
  response: ImageResponse;
  usedFallback: boolean;
  originalError?: ImageError;
}

/**
 * Generate image with automatic fallback to backup model on overload errors
 * 
 * @returns ImageGenerationResult with fallback info
 * @throws ImageError if both main and backup models fail
 */
export async function generateImageWithFallback(request: ImageRequest): Promise<ImageGenerationResult> {
  const mainModel = request.model || getDefaultImageModel();
  const backupModel = getBackupImageModel();
  
  // Run content moderation first
  const moderation = await moderateContent(request.prompt);
  
  // If NSFW, use dedicated provider (no fallback logic needed)
  if (moderation.flagged && moderation.scores.sexual > 0.9) {
    console.log('[Image] Content flagged, using NSFW provider');
    
    const nsfwModel = getNsfwImageModel();
    const nsfwConfig = getImageModelConfig(nsfwModel);
    const provider = getProvider(nsfwConfig.provider);
    
    const response = await provider.generate({
      ...request,
      model: nsfwModel
    });
    
    return { response, usedFallback: false };
  }
  
  // Try main model first
  try {
    console.log(`[Image] Trying main model: ${mainModel}`);
    const config = getImageModelConfig(mainModel);
    const provider = getProvider(config.provider);
    
    const response = await provider.generate({
      ...request,
      model: mainModel
    });
    
    return { response, usedFallback: false };
    
  } catch (error: any) {
    // Check if error is retryable
    const isRetryable = error instanceof ImageError && error.isRetryable();
    
    if (!isRetryable) {
      // Not a retryable error, throw it
      throw error;
    }
    
    console.log(`[Image] Main model failed with retryable error: ${error.message}`);
    console.log(`[Image] Switching to backup model: ${backupModel}`);
    
    // Try backup model
    try {
      const backupConfig = getImageModelConfig(backupModel);
      const backupProvider = getProvider(backupConfig.provider);
      
      const response = await backupProvider.generate({
        ...request,
        model: backupModel
      });
      
      return { 
        response, 
        usedFallback: true,
        originalError: error
      };
      
    } catch (backupError: any) {
      console.error(`[Image] Backup model also failed: ${backupError.message}`);
      // Throw the backup error, but could also throw original
      throw backupError;
    }
  }
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