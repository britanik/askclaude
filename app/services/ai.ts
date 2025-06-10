import axios from "axios"
import { promptsDict } from "../helpers/prompts"
import TelegramBot from "node-telegram-bot-api"
import fs from 'fs'
import FormData from 'form-data'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getReadableId } from "../helpers/helpers"
import { IMessage } from "../interfaces/messages"
import { logApiError } from "../helpers/errorLogger"
import { sendMessage } from "../templates/sendMessage"
import { handleImageGeneration } from "../controllers/images"
import { IUser } from "../interfaces/users"
import { isWebSearchLimit } from "../controllers/tokens"

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
  user?: IUser
}

export async function claudeCall(params: IChatCallParams) {
  let { messages, temperature = 0.1, response_format = { type: 'text' }, user } = params
  
  try {
    // Check if web search limit reached
    const searchLimitReached = user ? await isWebSearchLimit(user) : false;
    
    // Prepare tools array
    const tools = [];
    if (!searchLimitReached) {
      tools.push({
        type: "web_search_20250305",
        name: "web_search",
        max_uses: +(process.env.WEB_SEARCH_MAX_USES || 5)
      });
    }
    
    // Prepare API request
    const chatParams: any = {
      model: process.env.CLAUDE_MODEL, // Use primary model
      system: promptsDict.system(),
      messages: messages,
      max_tokens: +(process.env.CLAUDE_MAX_OUTPUT || 1000),
      stream: false,
      temperature,
    }
    
    // Only add tools if available
    if (tools.length > 0) {
      chatParams.tools = tools;
    }

    console.log(chatParams, 'chatParams')
    
    try {
      // Make API request with primary model
      const request = await axios.post(
        'https://api.anthropic.com/v1/messages', 
        chatParams, 
        { 
          headers: {
            'x-api-key': process.env.CLAUDE_TOKEN, 
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          timeout: +process.env.CLAUDE_TIMEOUT
        }
      )

      console.log(request.data,'request.data')

      return request.data
      
    } catch (primaryError) {
      // Log the primary error
      await logApiError('anthropic', primaryError, 'Primary model call failed')
      
      // Check if it's a 529 error or any server error (5xx)
      if (primaryError.response && (primaryError.response.status === 529 || 
          (primaryError.response.status >= 500 && primaryError.response.status < 600))) {
        
        console.log(`Primary model ${process.env.CLAUDE_MODEL} failed with status ${primaryError.response.status}, trying backup model...`)
        
        // Use backup model if primary fails
        const backupModel = process.env.CLAUDE_MODEL_BACKUP
                
        // Update model in request
        chatParams.model = backupModel
        
        try {
          // Try with backup model
          const backupRequest = await axios.post(
            'https://api.anthropic.com/v1/messages', 
            chatParams, 
            { 
              headers: {
                'x-api-key': process.env.CLAUDE_TOKEN, 
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
              },
              timeout: +process.env.CLAUDE_TIMEOUT
            }
          )
          
          console.log(`Received response from backup model ${backupModel}`)
          return backupRequest.data
        } catch (backupError) {
          // Log backup error as well
          logApiError('anthropic', backupError, 'Backup model call failed').catch(() => {})
          throw backupError
        }
      } else {
        // For other types of errors, rethrow
        throw primaryError
      }
    }
  } catch(e) { 
    console.log('Claude API error - details logged to file')
    
    // Log the final error if not already logged
    if (!e.logged) {
      await logApiError('anthropic', e, 'Claude API final error')
    }
    
    throw e
  }
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
      
      // Process images
      for (const imageId of message.images) {
        try {
          // Get file link from Telegram
          const fileLink = await bot.getFileLink(imageId)
          
          // Get image as base64
          const imageBase64 = await getImageAsBase64(fileLink)
          
          // Add image to content array
          formattedMessage.content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg", // Default to JPEG
              data: imageBase64
            }
          })
        } catch (error) {
          console.error(`Error processing image ${imageId}:`, error)
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
  action: 'new' | 'continue';
  reasoning?: string;
}

export async function analyzeConversation( 
  lastMessages: Array<{role: string, content: string}>, 
  currentMessage: string 
): Promise<IConversationAnalysisResult> {
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

    const messages = [
      ...formattedMessages,
      { role: 'user', content: currentMessage }
    ];

    // API request to the fast model
    const chatParams = {
      system: promptsDict.analyzeConversation(),
      model: process.env.CLAUDE_MODEL_FAST || 'claude-3-5-haiku-20241022',
      messages: messages,
      max_tokens: 150,
      temperature: 0,
    };

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      chatParams,
      {
        headers: {
          'x-api-key': process.env.CLAUDE_TOKEN,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10-second timeout for quick response
      }
    );

    const result = JSON.parse(response.data.content[0].text);
    
    // Validate the result
    if (result && (result.action === 'new' || result.action === 'continue')) {
      return { action: result.action };
    } else {
      console.log('Invalid analysis result, defaulting to continue:', result);
      return { action: 'continue' };
    }

  } catch (error) {
    console.error('Error in analyzeConversation:', error.message);
    
    // Log analysis error only if it's not a simple timeout or network issue
    if (error.response?.status) {
      logApiError('anthropic', error, 'Conversation analysis failed').catch(() => {});
    }
    
    // Always return 'continue' on any error to prevent crashes
    return { action: 'continue' };
  }
}

// Function to check content with OpenAI Moderation API
export async function moderateContent(prompt: string): Promise<{flagged: boolean, categories: any}> {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/moderations',
      {
        input: prompt
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );
    
    // Return the moderation result
    return {
      flagged: response.data.results[0].flagged,
      categories: response.data.results[0].categories
    };
  } catch (error) {
    console.error('Error calling moderation API - details logged to file');
    // Log the moderation error
    await logApiError('openai', error, 'Content moderation failed')
    
    // Default to flagged: false when API call fails
    return {
      flagged: false,
      categories: {}
    };
  }
}

// OpenAI image generation function
export async function generateOpenAIImage(prompt: string, user: IUser, bot: TelegramBot): Promise<void> {
  try {
    const generateImage = async (prompt: string): Promise<string> => {
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/images/generations',
          {
            model: "dall-e-3",
            style: 'vivid', // vivid or natural
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            response_format: "url"
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            timeout: 120000
          }
        );
        
        // Extract image URL from response
        return response.data.data[0].url;
      } catch (imageError) {
        // Log OpenAI image generation error
        await logApiError('openai', imageError, 'DALL-E image generation failed')
        throw imageError
      }
    };
    
    await handleImageGeneration(prompt, user, bot, generateImage, 'openai');

  } catch (error) {
    console.error('Error generating image - details logged to file');
    await sendMessage({
      text: 'Sorry, there was an error generating the image. Please try again later.',
      user,
      bot
    });
  }
}