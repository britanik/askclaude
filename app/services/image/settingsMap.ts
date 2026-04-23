/**
 * Maps user image prefs → provider-specific formats.
 * GetImg excluded (NSFW-only, keeps defaults).
 */

const portraitRatios = ['1:2','6:11','9:16','2:3','3:4','4:5','5:6']
const landscapeRatios = ['6:5','5:4','4:3','3:2','16:9','11:6','2:1']

function getOrientation(ratio: string): 'portrait' | 'square' | 'landscape' {
  if (portraitRatios.includes(ratio)) return 'portrait'
  if (landscapeRatios.includes(ratio)) return 'landscape'
  return 'square'
}

function getOpenAISize(ratio: string, imageSize: string): string {
  const is2k = imageSize === '2k'
  const orientation = getOrientation(ratio)

  if (orientation === 'portrait') return is2k ? '2048x3072' : '1024x1536'
  if (orientation === 'landscape') return is2k ? '3072x2048' : '1536x1024'
  return is2k ? '2048x2048' : '1024x1024'
}

function getOpenAIQuality(quality: string): string {
  if (quality === 'low') return 'low'
  if (quality === 'standard') return 'medium'
  return 'high'
}

export interface ImageSettings {
  geminiRatio: string
  geminiImageSize: string
  openaiSize: string
  openaiQuality: string
}

export function getImageSettings(prefs: { imageAspectRatio?: string, imageQuality?: string, imageSize?: string }): ImageSettings {
  const ratio = prefs?.imageAspectRatio || '1:1'
  const quality = prefs?.imageQuality || 'standard'
  const size = prefs?.imageSize || '1k'

  return {
    geminiRatio: ratio,
    geminiImageSize: size === '2k' ? '2K' : '1K',
    openaiSize: getOpenAISize(ratio, size),
    openaiQuality: getOpenAIQuality(quality),
  }
}
