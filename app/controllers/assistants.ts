import TelegramBot from "node-telegram-bot-api"

import * as userController from './users'

import Thread from '../models/threads'
import { IThread } from "../interfaces/threads"
import { IUser } from "../interfaces/users"
// import { IChatComplitionResponse } from "../interfaces/chatCompletionResponse"

import { sendMessage } from "../templates/sendMessage"
import { claudeCall, formatMessagesWithImages } from "../services/ai"
import Dict from "../helpers/dict"
import { addLog } from "./log"

export async function startAssistant(user:IUser, firstMessage:string):Promise<IThread>{
  console.log('startAssistant')
  try {
    return await createNewThread({ user, messages: [
      { role: 'user', content: firstMessage }
    ] })
  } catch(e){
    console.log('Failed to startAssistant', e)
  }
}

export async function createNewThread(params):Promise<IThread>{
  console.log('createNewThread')
  try {
    const { user, messages } = params
    const thread:IThread = await new Thread({ owner: user, messages }).save()
    return thread
  } catch(e){
    console.log('Failed to createNewThread', e)
  }
}

export async function handleUserReply(
  user: IUser, 
  userReply: string, 
  bot: TelegramBot, 
  images: string[] = [], 
  mediaGroupId?: string
): Promise<IThread> {
  let thread: IThread = await getRecentThread(user);
  
  // If this is part of a media group and not the first message
  if (mediaGroupId && images.length > 0) {
    // Check if the last message already has some images and is from the same media group
    const lastMessage = thread.messages[thread.messages.length - 1];
    if (lastMessage.role === 'user' && lastMessage.images && lastMessage.images.length > 0) {
      // Add this image to the existing images array
      lastMessage.images.push(...images);
      return await thread.save();
    }
  }
  
  // Otherwise, add a new message
  thread = await addMessageToThread({ 
    thread, 
    message: { 
      role: 'user', 
      content: userReply || " ", // Ensure content is never empty
      images: images.length > 0 ? images : undefined 
    } 
  });

  return thread;
}

export async function handleAssistantReply(thread:IThread, bot:TelegramBot, dict):Promise<void>{
  // Show "Thinking" status while processing
  await bot.sendChatAction(thread.owner.chatId, "typing");
  
  let assistantReply:string = await sendThreadToChatGPT({ thread, bot }); // Pass the bot here
  console.log(assistantReply,'assistantReply');

  // Add the assistant's message to thread.messages
  thread = await addMessageToThread({ thread, message: { role: 'assistant', content: assistantReply }});

  if(assistantReply){
    await sendThreadToUser({ user: thread.owner, content: assistantReply, bot, dict });
  }
}

export async function getRecentThread(user:IUser):Promise<IThread>{
  try {
    let recentThread = await Thread.findOne({ owner: user }).sort({ created: -1 }).populate('owner')
    // console.log(recentThread,'recentThread')
    return recentThread
  } catch(e){
    console.log('Failed to getRecentThread', e)
  }
}

export async function sendThreadToChatGPT(params) {
  const { thread, bot } = params;
  try {
    // Format messages for Claude API with image support
    const formattedMessages = await formatMessagesWithImages(thread.messages, thread.owner, bot);
    
    const chatCompletion = await claudeCall({ 
      messages: formattedMessages, 
      temperature: 1 
    });
    
    return chatCompletion.content[0].text;
  } catch(e) {
    console.log('Failed to chatCall', e);
    throw e;
  }
}

export async function addMessageToThread(params){
  try {
    const { thread, message } = params
    thread.messages.push(message)
    return await thread.save()
  } catch(e){
    console.log('Failed to addMessageToThread')
  }
}

export async function sendThreadToUser( params:{user:IUser, content?:string, bot:TelegramBot, dict:Dict} ){
  const { user, content, bot, dict } = params
  console.log('sendThreadToUser')
  
  // let extract = extractAndClearJson(content)
  // let buttons = (extract.json && extract.json.buttons) ? generateAssistantsButtons({ buttons: extract.json.buttons, action: "settingsAboutAssistant", dict }) : null
  await sendMessage({ text: content, user, bot })
}
