import axios from "axios"
import { promptsDict } from "../helpers/prompts"
import TelegramBot from "node-telegram-bot-api"
import fs from 'fs'
import FormData from 'form-data'
import path from 'path'
import { getReadableId } from "../helpers/helpers"
import { IMessage } from "../interfaces/messages"
import { logApiError } from "../helpers/errorLogger"
import { IUser } from "../interfaces/users"
import { callLLM, RESPONSE_FORMAT_ANALYZE } from "./llm"
import { IImage } from "../interfaces/image"

export interface IChatCallParams {
  messages: Array<{
    role: string,
    content: string | Array<{
      type: string,
      text?: string,
      source?: {
        type: string,
        media_type: string,
        data: string
      }
    }>
  }>,
  temperature?: number,
  response_format?: { type: 'text' | 'json_object' },
  user?: IUser,
  webSearch?: boolean
  assistantType: 'normal' | 'expense'
  bot: TelegramBot
}

export async function getTranscription(msg, bot: TelegramBot): Promise<string> {
  // Create audio directory path
  const audioDir = path.join(__dirname, '../audio')
  
  // Ensure audio directory exists
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true })
  }

  const fileName = path.join(audioDir, `temp_audio_${getReadableId()}.oga`)

  try {
    const fileLink = await bot.getFileLink(msg.voice.file_id)
  
    // Download the file
    const response = await axios({
      method: 'get',
      url: fileLink,
      responseType: 'stream'
    })

    // Save the file locally (temporarily)
    const writer = fs.createWriteStream(fileName)
    response.data.pipe(writer)

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve)
      writer.on('error', reject)
    })

    // Prepare form data
    const form = new FormData()
    form.append('file', fs.createReadStream(fileName))
    form.append('model', 'whisper-1')

    try {
      // Send request to OpenAI
      const openaiResponse = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      })

      return openaiResponse.data.text
    } catch (openaiError) {
      // Log OpenAI error
      await logApiError('openai', openaiError, 'Whisper transcription failed')
      throw openaiError
    }

  } catch (error) {
    throw error
  } finally {
    // Delete the temporary file
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName)
    }
  }
}

export async function formatMessagesWithImages(messages: IMessage[], user, bot) {
  const formattedMessages = []
  
  for (const message of messages) {
    // Skip empty messages
    if (!message.content && (!message.images || message.images.length === 0)) {
      continue
    }
    
    // Initialize the basic message
    let formattedMessage
    
    // If message has images, format it for Claude's vision API
    if (message.images && message.images.length > 0) {
      formattedMessage = {
        role: message.role,
        content: []
      }
      
      // Add text content if exists
      if (message.content && message.content.trim() !== '') {
        formattedMessage.content.push({
          type: "text",
          text: message.content
        })
      } else {
        // Claude requires at least some text content
        formattedMessage.content.push({
          type: "text",
          text: " " // Empty space as minimal content
        })
      }
      
      // Process images from Image documents
      for (const imageRef of message.images) {
        try {
          // imageRef is populated IImage document
          const image = imageRef as IImage
          
          if (image.localPath && fs.existsSync(image.localPath)) {
            // Read from local file
            const imageBuffer = fs.readFileSync(image.localPath)
            const imageBase64 = imageBuffer.toString('base64')
            
            formattedMessage.content.push({
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64
              }
            })
          } else {
            console.error(`Image file not found: ${image.localPath}`)
          }
        } catch (error) {
          console.error(`Error processing image:`, error)
        }
      }
    } else {
      // Regular text message
      formattedMessage = {
        role: message.role,
        content: message.content || " " // Ensure content is never empty
      }
    }
    
    // Add the formatted message
    formattedMessages.push(formattedMessage)
  }
  
  return formattedMessages
}

export async function getImageAsBase64(url) {
  try {    
    // Download the image
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      timeout: 30000 // 30 second timeout
    })
    
    // Convert to base64
    const base64 = Buffer.from(response.data).toString('base64')
    
    return base64
  } catch (error) {
    console.error('Error fetching image:', error.message)
    throw error
  }
}

export async function saveImagePermanently(url, imageId) {
  try {
    // Define a permanent directory for images
    const imageDir = path.join(__dirname, '../images')
    
    // Ensure directory exists
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true })
    }
    
    // Create a filename with timestamp to avoid conflicts
    const fileName = path.join(imageDir, `${Date.now()}_${imageId}${path.extname(url) || '.jpg'}`)
    
    // Download and save the file
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream'
    })
    
    const writer = fs.createWriteStream(fileName)
    response.data.pipe(writer)
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(fileName))
      writer.on('error', reject)
    })
  } catch (error) {
    console.error('Error saving image permanently:', error)
    throw error
  }
}

export interface IConversationAnalysisResult {
  action: 'new' | 'continue',
  assistant: 'normal' | 'finance' | 'websearch'
}

export async function analyzeConversation( lastMessages: Array<{role: string, content: string}>, currentMessage: string  ): Promise<IConversationAnalysisResult> {
  const startTime = Date.now();
  
  try {
    // Prepare context for the model
    // Truncate assistant messages to 200 characters to save on tokens
    const formattedMessages = lastMessages.map(msg => {
      if (msg.role === 'assistant' && msg.content && msg.content.length > 200) {
        return {
          role: msg.role,
          content: msg.content.substring(0, 200) + '...'
        };
      }
      return { role: msg.role, content: msg.content || '' };
    });

    // Build messages array (conversation + current message)
    const messages = [
      ...formattedMessages.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content })),
      { role: 'user' as const, content: currentMessage }
    ];

    // Call LLM with analyze model/provider
    const response = await callLLM({
      model: process.env.MODEL_ANALYZE || 'gpt-5-mini',
      system: promptsDict.analyzeConversation(),
      messages: messages,
      max_tokens: 3000,
      temperature: 1,
      response_format: RESPONSE_FORMAT_ANALYZE
    });

    console.log('response:', response);

    // Extract text from response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in response');
    }

    const result = JSON.parse(textContent.text);
        
    // Validate the result
    return { 
      action: result.action || 'continue', 
      assistant: result.assistant || 'normal',
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const durationSec = (duration / 1000).toFixed(2);
    console.error('Error in analyzeConversation:', error.message);
    
    // Log analysis error only if it's not a simple timeout or network issue
    if (error.response?.status) {
      logApiError('llm', error, `Conversation analysis failed after ${durationSec}s`).catch(() => {});
    }
    
    // Always return 'continue' on any error to prevent crashes
    return { action: 'continue', assistant: 'normal' };
  }
}