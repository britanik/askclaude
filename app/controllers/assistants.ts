import TelegramBot from "node-telegram-bot-api"

import Thread from '../models/threads'
import { IThread } from "../interfaces/threads"
import { IUser } from "../interfaces/users"
// import { IChatComplitionResponse } from "../interfaces/chatCompletionResponse"

import { sendMessage } from "../templates/sendMessage"
import { claudeCall, formatMessagesWithImages, saveImagePermanently } from "../services/ai"
import Dict from "../helpers/dict"

export async function startAssistant(user:IUser, firstMessage:string):Promise<IThread>{
  try {
    return await createNewThread({ user, messages: [
      { role: 'user', content: firstMessage }
    ] })
  } catch(e){
    console.log('Failed to startAssistant', e)
  }
}

export async function createNewThread(params):Promise<IThread>{
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
  const savedImagePaths = [];
  
  if (images.length > 0) {
    for (const imageId of images) {
      try {
        // Get file link from Telegram
        const fileLink = await bot.getFileLink(imageId);
        
        // Save image to a permanent location
        const savedPath = await saveImagePermanently(fileLink, imageId);
        
        // Store both the Telegram ID and local path
        savedImagePaths.push({
          telegramId: imageId,
          localPath: savedPath
        });
      } catch (error) {
        console.error(`Error saving image ${imageId}:`, error);
      }
    }
  }

  // If this is part of a media group
  if (mediaGroupId) {
    // Check if the last message already has some images and is from the same media group
    const lastMessage = thread.messages[thread.messages.length - 1];
    
    if (lastMessage.role === 'user' && 
        lastMessage.mediaGroupId === mediaGroupId) {
      // Add this image to the existing images array
      lastMessage.images = lastMessage.images || [];
      lastMessage.images.push(...images);
      
      // Update the content if provided and this message has content
      if (userReply && userReply.trim() !== " " && userReply.trim() !== "") {
        lastMessage.content = userReply;
      }
      
      return await thread.save();
    } else {
      // This is the first message in a new media group
      return await addMessageToThread({ 
        thread, 
        message: { 
          role: 'user', 
          content: userReply || " ", // Ensure content is never empty
          images: images.length > 0 ? images : undefined,
          mediaGroupId // Store the media group ID with the message
        } 
      });
    }
  } else {
    // Regular message without media group
    return await addMessageToThread({ 
      thread, 
      message: { 
        role: 'user', 
        content: userReply || " ", // Ensure content is never empty
        images: images.length > 0 ? images : undefined 
      } 
    });
  }
}

export async function handleAssistantReply(thread:IThread, bot:TelegramBot, dict):Promise<void>{
  // Show "Thinking" status while processing
  await bot.sendChatAction(thread.owner.chatId, "typing");
  
  let assistantReply:string = await sendThreadToChatGPT({ thread, bot }); // Pass the bot here

  // Add the assistant's message to thread.messages
  thread = await addMessageToThread({ thread, message: { role: 'assistant', content: assistantReply }});

  if(assistantReply){
    await sendThreadToUser({ user: thread.owner, content: assistantReply, bot, dict });
  }
}

export async function getRecentThread(user:IUser):Promise<IThread>{
  try {
    let recentThread = await Thread.findOne({ owner: user }).sort({ created: -1 }).populate('owner')
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
  
  // let extract = extractAndClearJson(content)
  // let buttons = (extract.json && extract.json.buttons) ? generateAssistantsButtons({ buttons: extract.json.buttons, action: "settingsAboutAssistant", dict }) : null
  await sendMessage({ text: content, user, bot })
}
