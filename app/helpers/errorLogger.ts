import fs from 'fs'
import path from 'path'
import moment from 'moment'

interface ErrorLog {
  timestamp: string
  service: 'anthropic' | 'openai' | 'llm'
  status?: number
  statusText?: string
  data?: any
  message?: string
  url?: string
  method?: string
}

export async function logApiError(
  service: 'anthropic' | 'openai' | 'llm',
  error: any,
  context?: string
): Promise<void> {
  try {
    // Create errors directory if it doesn't exist
    const errorsDir = path.join(__dirname, '../errors')
    if (!fs.existsSync(errorsDir)) {
      fs.mkdirSync(errorsDir, { recursive: true })
    }

    // Prepare error log object
    const errorLog: ErrorLog = {
      timestamp: moment().utc().format(),
      service,
    }

    // Extract error information
    if (error.response) {
      // API responded with an error status
      errorLog.status = error.response.status
      errorLog.statusText = error.response.statusText
      errorLog.data = error.response.data
      errorLog.url = error.config?.url
      errorLog.method = error.config?.method?.toUpperCase()
    } else if (error.request) {
      // Request was made but no response received
      errorLog.message = 'No response received from API'
      errorLog.url = error.config?.url
      errorLog.method = error.config?.method?.toUpperCase()
    } else {
      // Something else happened
      errorLog.message = error.message
    }

    // Add context if provided
    if (context) {
      errorLog['context'] = context
    }

    // Create filename with timestamp and service
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss-SSS')
    const filename = path.join(errorsDir, `${service}_${timestamp}.json`)

    // Write error log to file
    await fs.promises.writeFile(
      filename, 
      JSON.stringify(errorLog, null, 2), 
      'utf8'
    )

    console.log(`Error logged to: ${filename}`)
  } catch (logError) {
    console.error('Failed to log API error:', logError)
  }
}