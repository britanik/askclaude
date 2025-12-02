export interface ModelConfig {
  provider: 'anthropic' | 'openai';
  apiType?: 'completions' | 'responses';  // Only for OpenAI
  reasoning?: 'low' | 'medium' | 'high';
}

/**
 * Model configuration map
 * Add new models here with their provider settings
 */
export const MODEL_CONFIG: Record<string, ModelConfig> = {
  // Anthropic models
  'claude-sonnet-4-5': {
    provider: 'anthropic'
  },

  // OpenAI models - Completions API
  'gpt-5-nano': {
    provider: 'openai',
    apiType: 'completions',
    reasoning: 'low'
  },

  // OpenAI models - Responses API
  'gpt-5.1': {
    provider: 'openai',
    apiType: 'responses'
  }
};

/**
 * Get model configuration by name
 * @throws Error if model is not found in config
 */
export function getModelConfig(modelName: string): ModelConfig {
  const config = MODEL_CONFIG[modelName];
  
  if (!config) {
    throw new Error(`Model "${modelName}" not found in config. Add it to MODEL_CONFIG in services/llm/config.ts`);
  }
  
  return config;
}