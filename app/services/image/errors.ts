/**
 * Custom error class for image generation failures
 * Carries API response data for better debugging
 */
export class ImageError extends Error {
  public provider: string;
  public apiResponse?: any;
  public reason?: string;

  constructor(message: string, provider: string, apiResponse?: any, reason?: string) {
    super(message);
    this.name = 'ImageError';
    this.provider = provider;
    this.apiResponse = apiResponse;
    this.reason = reason;
  }
}