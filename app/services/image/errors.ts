/**
 * Custom error class for image generation failures
 * Carries API response data for better debugging
 */
export class ImageError extends Error {
  public provider: string;
  public apiResponse?: any;
  public reason?: string;
  public statusCode?: number;

  constructor(message: string, provider: string, apiResponse?: any, reason?: string, statusCode?: number) {
    super(message);
    this.name = 'ImageError';
    this.provider = provider;
    this.apiResponse = apiResponse;
    this.reason = reason;
    this.statusCode = statusCode;
  }

  /**
   * Check if this error is retryable (overload, rate limit, temporary failure)
   */
  isRetryable(): boolean {
    // 503 Service Unavailable (overload)
    // 429 Too Many Requests (rate limit)
    // 502 Bad Gateway
    // 504 Gateway Timeout
    const retryableStatusCodes = [502, 503, 504, 429];
    
    if (this.statusCode && retryableStatusCodes.includes(this.statusCode)) {
      return true;
    }

    // Check message for overload indicators
    const overloadIndicators = [
      'overload',
      'capacity',
      'unavailable',
      'rate limit',
      'too many requests',
      'temporarily',
      'try again'
    ];

    const messageLower = this.message.toLowerCase();
    return overloadIndicators.some(indicator => messageLower.includes(indicator));
  }
}