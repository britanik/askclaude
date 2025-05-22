import axios from 'axios'
import { promptsDict } from './prompts'

export async function escapeHtmlForTelegram(text: string): Promise<string> {
  try {
    // Prepare the API request
    const chatParams = {
      model: process.env.CLAUDE_MODEL_FAST || 'claude-3-5-haiku-20241022',
      system: promptsDict.escape(),
      messages: [
        {
          role: 'user',
          content: text
        }
      ],
      max_tokens: Math.max(text.length * 2, 1000), // Ensure enough tokens for the response
      stream: false,
      temperature: 0, // Use temperature 0 for consistent escaping
    }
    
    // Make API request
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages', 
      chatParams, 
      { 
        headers: {
          'x-api-key': process.env.CLAUDE_TOKEN, 
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: +(process.env.CLAUDE_TIMEOUT || 30000)
      }
    )

    // Extract the escaped text from the response
    const escapedText = response.data.content[0].text
    
    return escapedText
    
  } catch (error) {
    console.error('Error escaping HTML with Claude API:', error)
    
    // Fallback: basic HTML escaping if API fails
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
}