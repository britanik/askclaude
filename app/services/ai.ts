import axios from "axios"
import { promptsDict } from "../helpers/prompts"
import TelegramBot from "node-telegram-bot-api"
import fs from 'fs';
import FormData from 'form-data';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getReadableId } from "../helpers/helpers";

export interface IThreadMessage {
  role: string,
  content?: string,
  tool_calls?: [],
}

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
  response_format?: { type: 'text' | 'json_object' }
}

export async function claudeCall(params: IChatCallParams) {
  // console.log('function: chatCall');
  let { messages, temperature = 0.1, response_format = { type: 'text' } } = params;
  
  try {    
    // Prepare API request
    const chatParams = {
      model: process.env.CLAUDE_MODEL, // Use primary model
      system: promptsDict.system(),
      messages: messages,
      max_tokens: +(process.env.CLAUDE_MAX_OUTPUT || 1000),
      stream: false,
      temperature,
    };
    
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
          timeout: 60000 // 60-second timeout for image processing
        }
      );

      return request.data;
      
    } catch (primaryError) {
      // Check if it's a 529 error or any server error (5xx)
      if (primaryError.response && (primaryError.response.status === 529 || 
          (primaryError.response.status >= 500 && primaryError.response.status < 600))) {
        
        console.log(`Primary model ${process.env.CLAUDE_MODEL} failed with status ${primaryError.response.status}, trying backup model...`);
        
        // Use backup model if primary fails
        const backupModel = process.env.CLAUDE_MODEL_BACKUP;
                
        // Update model in request
        chatParams.model = backupModel;
        
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
            timeout: 60000
          }
        );
        
        console.log(`Received response from backup model ${backupModel}`);
        return backupRequest.data;
      } else {
        // For other types of errors, rethrow
        throw primaryError;
      }
    }
  } catch(e) { 
    console.log('Claude API error:');
    
    if (e.response) {
      console.log('Status:', e.response.status);
      console.log('Data:', e.response.data);
    } else if (e.request) {
      console.log('No response received:', e.request);
    } else {
      console.log('Error:', e.message);
    }
    
    throw e;
  }
}

export async function getTranscription(msg, bot:TelegramBot):Promise<string>{
  // Create audio directory path
  const audioDir = path.join(__dirname, '../audio');
  
  // Ensure audio directory exists
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }

  const fileName = path.join(audioDir, `temp_audio_${getReadableId()}.oga`);

  try {

    const fileLink = await bot.getFileLink(msg.voice.file_id)
  
    // Download the file
    const response = await axios({
      method: 'get',
      url: fileLink,
      responseType: 'stream'
    });

    // Save the file locally (temporarily)
    const writer = fs.createWriteStream(fileName);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Prepare form data
    const form = new FormData();
    form.append('file', fs.createReadStream(fileName));
    form.append('model', 'whisper-1');

    // Send request to OpenAI
    const openaiResponse = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });

    return openaiResponse.data.text

  } catch (error) {
    // console.error('Error in getTranscription:', error.response);
    // console.log(error.response.data, 'error.response.data')
    throw error;
  } finally {
    // Delete the temporary file
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName);
    }
  }
}

export async function formatMessagesWithImages(messages, user, bot) {
  const formattedMessages = [];
  
  for (const message of messages) {
    // Skip empty messages
    if (!message.content && (!message.images || message.images.length === 0)) {
      continue;
    }
    
    // Initialize the basic message
    let formattedMessage;
    
    // If message has images, format it for Claude's vision API
    if (message.images && message.images.length > 0) {
      formattedMessage = {
        role: message.role,
        content: []
      };
      
      // Add text content if exists
      if (message.content && message.content.trim() !== '') {
        formattedMessage.content.push({
          type: "text",
          text: message.content
        });
      } else {
        // Claude requires at least some text content
        formattedMessage.content.push({
          type: "text",
          text: " " // Empty space as minimal content
        });
      }
      
      // Process images
      // console.log(`Processing ${message.images.length} images for user ${user.username || user.chatId}`);
      
      for (const imageId of message.images) {
        try {
          // Get file link from Telegram
          const fileLink = await bot.getFileLink(imageId);
          // console.log(`Got file link: ${fileLink} for image ${imageId}`);
          
          // Get image as base64
          const imageBase64 = await getImageAsBase64(fileLink);
          
          // Add image to content array
          formattedMessage.content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg", // Default to JPEG
              data: imageBase64
            }
          });
          
          // console.log(`Successfully processed image ${imageId}`);
        } catch (error) {
          console.error(`Error processing image ${imageId}:`, error);
        }
      }
    } else {
      // Regular text message
      formattedMessage = {
        role: message.role,
        content: message.content || " " // Ensure content is never empty
      };
    }
    
    // Add the formatted message
    formattedMessages.push(formattedMessage);
  }
  
  return formattedMessages;
}

export async function getImageAsBase64(url) {
  try {
    // console.log(`Downloading image from ${url}`);
    
    // Download the image
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      timeout: 30000 // 30 second timeout
    });
    
    // Convert to base64
    const base64 = Buffer.from(response.data).toString('base64');
    // console.log(`Successfully converted image to base64 (${base64.length} chars)`);
    
    return base64;
  } catch (error) {
    console.error('Error fetching image:', error.message);
    throw error;
  }
}

export async function saveImageTemporarily(url) {
  try {
    // Create a unique filename
    const tempDir = path.join(__dirname, '../temp');
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const fileName = path.join(tempDir, `${uuidv4()}${path.extname(url)}`);
    
    // Download and save the file
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(fileName);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(fileName));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('Error saving image:', error);
    throw error;
  }
}

export async function saveImagePermanently(url, imageId) {
  try {
    // Define a permanent directory for images
    const imageDir = path.join(__dirname, '../images');
    
    // Ensure directory exists
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }
    
    // Create a filename with timestamp to avoid conflicts
    const fileName = path.join(imageDir, `${Date.now()}_${imageId}${path.extname(url) || '.jpg'}`);
    
    // Download and save the file
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(fileName);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(fileName));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('Error saving image permanently:', error);
    throw error;
  }
}