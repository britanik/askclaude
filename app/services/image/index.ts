import { ImageProvider, ImageRequest, ImageResponse } from './types';
import { OpenAIImageProvider } from './providers/openai';
import { GetImgProvider } from './providers/getimg';
import { GeminiImageProvider } from './providers/gemini';
import { getImageModelConfig, getDefaultImageModel, getNsfwImageModel } from './config';
import { moderateContent } from '../../controllers/images';
import { ImageError } from './errors';

/**
 * Provider instances cache
 * We use lazy loading because providers need env vars that load after module import
 */
let openaiProvider: OpenAIImageProvider | null = null;
let getimgProvider: GetImgProvider | null = null;
let geminiProvider: GeminiImageProvider | null = null;

function getProvider(name: 'openai' | 'getimg' | 'gemini'): ImageProvider {
  if (name === 'openai') {
    if (!openaiProvider) openaiProvider = new OpenAIImageProvider();
    return openaiProvider;
  }
  
  if (name === 'getimg') {
    if (!getimgProvider) getimgProvider = new GetImgProvider();
    return getimgProvider;
  }
  
  if (name === 'gemini') {
    if (!geminiProvider) geminiProvider = new GeminiImageProvider();
    return geminiProvider;
  }
  
  throw new Error(`Unknown image provider: ${name}`);
}

export function getBackupImageModel(): string {
  return process.env.IMAGE_MODEL_BACKUP || 'gpt-5';
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
 * Flow:
 * 1. Run content moderation
 * 2. If NSFW → use GetImg provider (no fallback)
 * 3. Otherwise → try main model, fallback to backup on overload
 */
export async function generateImageWithFallback(request: ImageRequest): Promise<ImageGenerationResult> {
  const mainModel = request.model || getDefaultImageModel();
  const backupModel = getBackupImageModel();
  
  // Step 1: Content moderation
  const moderation = await moderateContent(request.prompt);
  
  // Step 2: NSFW content goes to dedicated provider
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
  
  // Step 3: Try main model
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
    // Only retry on overload/rate limit errors
    const isRetryable = error instanceof ImageError && error.isRetryable();
    
    if (!isRetryable) {
      throw error;
    }
    
    console.log(`[Image] Main model failed: ${error.message}`);
    console.log(`[Image] Switching to backup: ${backupModel}`);
    
    // Step 4: Try backup model
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
      console.error(`[Image] Backup also failed: ${backupError.message}`);
      throw backupError;
    }
  }
}

// Re-export types
export * from './types';