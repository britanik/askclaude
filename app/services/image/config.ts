// Image Generation Model Configuration

export interface ImageModelConfig {
  provider: 'openai' | 'getimg' | 'gemini';
  model?: string; // OpenAI specific
  style?: string; // GetImg specific
}

export const IMAGE_MODEL_CONFIG: Record<string, ImageModelConfig> = {
  // Nano Banana 2
  'gemini-3.1-flash-image-preview': {
    provider: 'gemini'
  },

  // Nano Banana Pro
  'gemini-3-pro-image-preview': {
    provider: 'gemini'
  },

  'gemini-imagen-4': {
    provider: 'gemini'
  },

  // OpenAI models
  'gpt-5': {
    provider: 'openai',
    model: 'gpt-5.4'
  },
  'gpt-5.4': {
    provider: 'openai',
    model: 'gpt-5.4'
  },

  // GetImg models
  'getimg-essential': {
    provider: 'getimg',
    style: 'photorealism'
  }
};

export function getImageModelConfig(modelName: string): ImageModelConfig {
  const config = IMAGE_MODEL_CONFIG[modelName];
  
  if (!config) {
    throw new Error(`Image model "${modelName}" not found in config`);
  }
  
  return config;
}

export function getModelForProvider(provider: string): string {
  if (provider === 'openai') return process.env.IMAGE_OPENAI_MODEL || 'gpt-5.4';
  return process.env.IMAGE_GEMINI_MODEL || 'gemini-3-pro-image-preview';
}

export function getDefaultImageModel(): string {
  return process.env.IMAGE_MODEL_DEFAULT || 'gemini-3-pro-image-preview';
}

export function getNsfwImageModel(): string {
  return process.env.IMAGE_MODEL_NSFW || 'getimg-essential';
}