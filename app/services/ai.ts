import axios from "axios"
import { promptsDict } from "../helpers/prompts"

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

export async function chatCall( params:IChatCallParams ){
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
