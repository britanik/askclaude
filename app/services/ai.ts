import axios from "axios"
import { promptsDict } from "../helpers/prompts"
import TelegramBot from "node-telegram-bot-api"
import fs from 'fs';
import FormData from 'form-data';
import { getReadableId } from "../helpers/helpers";

export interface IThreadMessage {
  role: string,
  content?: string,
  tool_calls?: [],
}

export interface IChatCallParams {
  messages: IThreadMessage[],
  temperature?: number,
  response_format?: { type: 'text' | 'json_object' }
}

export async function claudeCall( params:IChatCallParams ){
  console.log('function: chatCall')
  let { messages, temperature = 0.1, response_format = { type: 'text' } } = params
  
  // sometime message.content can be null and ChatGPT crashes
  messages = messages.filter( m => m.content !== null )

  // delete params _id and created from every message
  const cleanMessages = []
  for( let message of messages ){
    let cleanMessage = { role: message.role, content: message.content }
    cleanMessages.push(cleanMessage)
  }

  try {

    let chatParams = {
      model: process.env.CLAUDE_MODEL,
      system: promptsDict.system(),
      messages: cleanMessages,
      max_tokens: +process.env.CLAUDE_MAX_OUTPUT,
      stream: false,
      temperature,
    }

    let request = await axios.post('https://api.anthropic.com/v1/messages', chatParams, { headers: {'x-api-key': process.env.CLAUDE_TOKEN, 'anthropic-version': '2023-06-01'} })
    return request.data

  } catch(e){ 
    console.log(e.response.data, 'e.config')
  }
}

export async function getTranscription(msg, bot:TelegramBot):Promise<string>{
  // console.log('function: getTranscription')
  const fileName = `audio/temp_audio_${getReadableId()}.oga`;

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
    // console.error('Error in getTranscription:', error);
    console.log(error.response.data, 'error.response.data')
    throw error;
  } finally {
    // Delete the temporary file
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName);
    }
  }
}
