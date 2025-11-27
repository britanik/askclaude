import { LLMProvider, LLMRequest, LLMResponse } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { logApiError } from '../../helpers/errorLogger';

// Provider instances (lazy loaded)
let anthropicProvider: AnthropicProvider | null = null;
let openaiProvider: OpenAIProvider | null = null;

/**
 * Get provider instance by name
 */
function getProvider(name: string): LLMProvider {
  switch (name) {
    case 'anthropic':
      if (!anthropicProvider) {
        anthropicProvider = new AnthropicProvider();
      }
      return anthropicProvider;

    case 'openai':
      if (!openaiProvider) {
        openaiProvider = new OpenAIProvider();
      }
      return openaiProvider;

    default:
      throw new Error(`Unknown LLM provider: ${name}`);
  }
}

/**
 * Check if error is a server error (5xx) that should trigger fallback
 */
function isServerError(error: any): boolean {
  const status = error.response?.status;
  return status && status >= 500 && status < 600;
}

/**
 * Main function to call LLM with automatic fallback
 * 
 * Uses env variables:
 * - MODEL_NORMAL / MODEL_NORMAL_PROVIDER (primary)
 * - MODEL_NORMAL_BACKUP / MODEL_NORMAL_BACKUP_PROVIDER (fallback)
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  // Get primary config from env
  const primaryModel = request.model || process.env.MODEL_NORMAL || process.env.CLAUDE_MODEL;
  const primaryProviderName = (process.env.MODEL_NORMAL_PROVIDER || 'anthropic') as 'anthropic' | 'openai';

  // Get backup config from env
  const backupModel = process.env.MODEL_NORMAL_BACKUP;
  const backupProviderName = process.env.MODEL_NORMAL_BACKUP_PROVIDER as 'anthropic' | 'openai' | undefined;

  // Try primary provider
  const primaryProvider = getProvider(primaryProviderName);
  
  try {
    const response = await primaryProvider.call({
      ...request,
      model: primaryModel
    });
    return response;

  } catch (primaryError) {
    // Log primary error
    await logApiError(primaryProviderName, primaryError, `Primary model ${primaryModel} failed`);

    // Check if we should try backup
    if (isServerError(primaryError) && backupModel && backupProviderName) {
      console.log(`Primary model ${primaryModel} failed with server error, trying backup ${backupModel}...`);

      try {
        const backupProvider = getProvider(backupProviderName);
        const response = await backupProvider.call({
          ...request,
          model: backupModel
        });
        
        console.log(`Received response from backup model ${backupModel}`);
        return response;

      } catch (backupError) {
        await logApiError(backupProviderName, backupError, `Backup model ${backupModel} also failed`);
        throw backupError;
      }
    }

    // No fallback available or not a server error
    throw primaryError;
  }
}

// Re-export types for convenience
export * from './types';
export { isToolUse } from './types';