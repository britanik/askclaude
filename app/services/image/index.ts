import fs from 'fs';
import { ImageProvider, ImageRequest, ImageResponse, ImageTier, PreviousImage } from './types';
import { OpenAIImageProvider } from './providers/openai';
import { GetImgProvider } from './providers/getimg';
import { GeminiImageProvider } from './providers/gemini';
import { getImageModelConfig, getNsfwImageModel } from './config';
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

export function getTopImageModel(): string {
  return process.env.IMAGE_MODEL_TOP || 'gemini-3-pro-image-preview';
}

export function getNormalImageModel(): string {
  return process.env.IMAGE_MODEL_NORMAL || 'gpt-5';
}

/**
 * Result of image generation with fallback info
 */
export interface ImageGenerationResult {
  response: ImageResponse;
  usedFallback: boolean;
  actualTier: ImageTier;
  originalError?: ImageError;
}

/**
 * Load image as base64 from file path
 */
function loadImageAsBase64(path: string): string | null {
  try {
    const buffer = fs.readFileSync(path);
    return buffer.toString('base64');
  } catch (error) {
    console.error(`[Image] Failed to load image from ${path}:`, error);
    return null;
  }
}

/**
 * Prepare image data for provider
 * Returns multiTurnData if same provider, or base64 for cross-provider fallback
 */
function prepareImageForProvider(
  image: PreviousImage | undefined,
  targetProvider: string
): { multiTurnData?: any; imageBase64?: string } {
  if (!image) {
    return {};
  }

  // Same provider - use native multi-turn
  if (image.provider === targetProvider && image.multiTurnData) {
    console.log(`[Image] Same provider (${targetProvider}), using native multi-turn`);
    return { multiTurnData: image.multiTurnData };
  }

  // Different provider - load image as base64 fallback
  if (image.path) {
    console.log(`[Image] Provider mismatch (${image.provider} → ${targetProvider}), using base64 fallback`);
    const imageBase64 = loadImageAsBase64(image.path);
    if (imageBase64) {
      return { imageBase64 };
    }
  }

  console.log(`[Image] No multi-turn data available for ${targetProvider}`);
  return {};
}

/**
 * Generate image with tier-based model selection and fallback
 * 
 * Flow:
 * 1. Run content moderation
 * 2. If NSFW → use GetImg provider (no multi-turn)
 * 3. Generate with primary model (TOP or NORMAL based on tier)
 * 4. TOP tier only: fallback to NORMAL on retryable errors
 * 
 * Multi-turn handling:
 * - Same provider: use native multiTurnData (responseId for OpenAI, lastModelResponse for Gemini)
 * - Different provider: load previous image as base64 and send as image input
 */
export async function generateImageWithFallback(request: ImageRequest): Promise<ImageGenerationResult> {
  const { tier, image } = request;
  const topModel = getTopImageModel();
  const normalModel = getNormalImageModel();
  
  // Step 1: Content moderation
  const moderation = await moderateContent(request.prompt);
  console.log(moderation, 'moderation');
  
  // Step 2: NSFW content goes to dedicated provider (no multi-turn)
  if (moderation.flagged && moderation.scores.sexual > 0.85) {
    console.log('[Image] Content flagged, using NSFW provider');
    
    const nsfwModel = getNsfwImageModel();
    const nsfwConfig = getImageModelConfig(nsfwModel);
    const provider = getProvider(nsfwConfig.provider);
    
    const response = await provider.generate({
      prompt: request.prompt,
      size: request.size,
      quality: request.quality,
      model: nsfwModel
    });
    
    return { response, usedFallback: false, actualTier: tier };
  }
  
  // Step 3: Generate with primary model
  const primaryModel = tier === 'top' ? topModel : normalModel;
  const primaryConfig = getImageModelConfig(primaryModel);
  const primaryProvider = getProvider(primaryConfig.provider);
  const primaryImageData = prepareImageForProvider(image, primaryConfig.provider);
  
  console.log(`[Image] ${tier.toUpperCase()} tier, using: ${primaryModel}`);
  
  try {
    const response = await primaryProvider.generate({
      prompt: request.prompt,
      size: request.size,
      quality: request.quality,
      model: primaryModel,
      image: primaryImageData.multiTurnData ? { multiTurnData: primaryImageData.multiTurnData } : undefined,
      imageBase64: primaryImageData.imageBase64
    });
    
    return { response, usedFallback: false, actualTier: tier };
    
  } catch (error: any) {
    // NORMAL tier has no fallback
    if (tier === 'normal') {
      throw error;
    }
    
    // TOP tier - fallback to normal on retryable errors
    const isRetryable = error instanceof ImageError && error.isRetryable();
    if (!isRetryable) {
      throw error;
    }
    
    console.log(`[Image] TOP model failed: ${error.message}`);
    console.log(`[Image] Falling back to NORMAL: ${normalModel}`);
    
    const normalConfig = getImageModelConfig(normalModel);
    const normalProvider = getProvider(normalConfig.provider);
    const normalImageData = prepareImageForProvider(image, normalConfig.provider);
    
    const response = await normalProvider.generate({
      prompt: request.prompt,
      size: request.size,
      quality: request.quality,
      model: normalModel,
      image: normalImageData.multiTurnData ? { multiTurnData: normalImageData.multiTurnData } : undefined,
      imageBase64: normalImageData.imageBase64
    });
    
    return { 
      response, 
      usedFallback: true,
      actualTier: 'normal',
      originalError: error
    };
  }
}

// Re-export types
export * from './types';