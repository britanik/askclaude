import fs from 'fs'
import path from 'path'
import moment from 'moment'

export async function saveAIResponse(response: string, type: string): Promise<void> {
  try {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, '../text')
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }

    // Create a filename with timestamp and user ID
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss')
    const filename = path.join(logsDir, `${timestamp}-${type}.txt`)

    // Save the response to file
    await fs.promises.writeFile(filename, response, 'utf8')
  } catch (error) {
    console.error('Error saving AI response:', error)
  }
}