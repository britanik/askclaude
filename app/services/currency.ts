import axios from "axios"
import { logApiError } from "../helpers/errorLogger"

const CACHE_TTL = 60 * 60 * 1000 // 1 hour

let cache: { rates: Record<string, number>, fetchedAt: number } | null = null

async function getExchangeRates(): Promise<Record<string, number>> {
  // Return cached rates if fresh
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.rates
  }

  try {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY
    if (!apiKey) throw new Error('EXCHANGE_RATE_API_KEY not set')

    const response = await axios.get(
      `https://openexchangerates.org/api/latest.json?app_id=${apiKey}`,
      { timeout: 10000 }
    )

    cache = { rates: response.data.rates, fetchedAt: Date.now() }
    return cache.rates
  } catch (error) {
    await logApiError('currency', error, 'Failed to fetch exchange rates')

    // Fallback to stale cache
    if (cache) {
      console.warn('[Currency] API failed, using stale cache')
      return cache.rates
    }

    throw new Error('Currency conversion unavailable. Try again later or use USD.')
  }
}

export async function convertToUSD(amount: number, fromCurrency: string): Promise<{ amountUSD: number, exchangeRate: number }> {
  const currency = fromCurrency.toUpperCase()

  if (currency === 'USD') {
    return { amountUSD: amount, exchangeRate: 1 }
  }

  const rates = await getExchangeRates()
  const rate = rates[currency]

  if (!rate) {
    throw new Error(`Unknown currency: ${currency}`)
  }

  // rates are "1 USD = X foreign", so USD = amount / rate
  const amountUSD = Math.round((amount / rate) * 100) / 100
  const exchangeRate = Math.round((1 / rate) * 10000) / 10000 // how many USD per 1 unit

  return { amountUSD, exchangeRate }
}

export async function convertFromUSD(amountUSD: number, toCurrency: string): Promise<number> {
  const currency = toCurrency.toUpperCase()

  if (currency === 'USD') return amountUSD

  const rates = await getExchangeRates()
  const rate = rates[currency]

  if (!rate) throw new Error(`Unknown currency: ${currency}`)

  return Math.round(amountUSD * rate * 100) / 100
}
