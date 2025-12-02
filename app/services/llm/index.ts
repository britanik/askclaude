import { LLMProvider, LLMRequest, LLMResponse } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { logApiError } from '../../helpers/errorLogger';
import { getModelConfig, ModelConfig } from './config';

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
 * Uses env variables for model names only:
 * - MODEL_NORMAL (primary)
 * - MODEL_NORMAL_BACKUP (fallback)
 * 
 * Provider and API type are determined from config.ts
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  // Get primary model name
  const primaryModel = request.model || process.env.MODEL_NORMAL || process.env.CLAUDE_MODEL;
  
  // Get config for primary model
  const primaryConfig = getModelConfig(primaryModel);
  
  // Get backup model name from env
  const backupModel = process.env.MODEL_NORMAL_BACKUP;

  // Try primary provider
  const primaryProvider = getProvider(primaryConfig.provider);
  
  try {
    const response = await primaryProvider.call({
      ...request,
      model: primaryModel,
      // Pass config to provider for API type selection
      _modelConfig: primaryConfig,
      // Apply default reasoning from config if not specified in request
      reasoning_effort: request.reasoning_effort || primaryConfig.reasoning
    });
    return response;

  } catch (primaryError) {
    // Log primary error
    await logApiError(primaryConfig.provider, primaryError, `Primary model ${primaryModel} failed`);

    // Check if we should try backup
    if (isServerError(primaryError) && backupModel) {
      console.log(`Primary model ${primaryModel} failed with server error, trying backup ${backupModel}...`);

      try {
        // Get config for backup model
        const backupConfig = getModelConfig(backupModel);
        const backupProvider = getProvider(backupConfig.provider);
        
        const response = await backupProvider.call({
          ...request,
          model: backupModel,
          _modelConfig: backupConfig,
          reasoning_effort: request.reasoning_effort || backupConfig.reasoning
        });
        
        console.log(`Received response from backup model ${backupModel}`);
        return response;

      } catch (backupError) {
        const backupConfig = getModelConfig(backupModel);
        await logApiError(backupConfig.provider, backupError, `Backup model ${backupModel} also failed`);
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