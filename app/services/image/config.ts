// Image Generation Model Configuration

export interface ImageModelConfig {
  provider: 'openai' | 'getimg' | 'gemini';
  model?: string; // OpenAI specific
  style?: string; // GetImg specific
}

export const IMAGE_MODEL_CONFIG: Record<string, ImageModelConfig> = {
  // Gemini models
  'gemini-3-pro-image-preview': {
    provider: 'gemini'
  },

  'gemini-imagen-4': {
    provider: 'gemini'
  },

  // OpenAI models
  'gpt-5': {
    provider: 'openai',
    model: 'gpt-5'
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

export function getDefaultImageModel(): string {
  return process.env.IMAGE_MODEL_DEFAULT || 'gemini-3-pro-image-preview';
}

export function getNsfwImageModel(): string {
  return process.env.IMAGE_MODEL_NSFW || 'getimg-photorealism';
}