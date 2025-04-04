import TelegramBot from "node-telegram-bot-api"

import * as userController from './users'

import Thread from '../models/threads'
import { IThread } from "../interfaces/threads"
import { IUser } from "../interfaces/users"
// import { IChatComplitionResponse } from "../interfaces/chatCompletionResponse"

import { sendMessage } from "../templates/sendMessage"
import { claudeCall } from "../services/ai"
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

export async function handleUserReply(user:IUser, userReply:string, bot):Promise<IThread>{
  let thread:IThread = await getRecentThread(user)
  
  thread = await addMessageToThread({ thread, message: { role: 'user', content: userReply } })

  // Добавляем сообщение пользователя в thread.messages
  // await addLog({ method: 'handleUserReply', data: { content: userReply }, user: user, bot })

  // Возвращаем thread
  return thread
}

export async function handleAssistantReply(thread:IThread, bot:TelegramBot, dict):Promise<void>{
  // Show "Thinking" status while processing
  await bot.sendChatAction(thread.owner.chatId, "typing");
  
  let assistantReply:string = await sendThreadToChatGPT({ thread })
  console.log(assistantReply,'assistantReply')

  // Добавляем сообщение ассистента в thread.messages
  thread = await addMessageToThread({ thread, message: { role: 'assistant', content: assistantReply }})

  if( assistantReply ){
    await sendThreadToUser({ user: thread.owner, content: assistantReply, bot, dict })
    // await addLog({ method: 'handleAssistantReply', data: { content: assistantReply }, user: thread.owner, bot })
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

export async function sendThreadToChatGPT(params){
  const { thread } = params
  try {
    const chatCompletion = await claudeCall({ messages: thread.messages, temperature: 1 })
    return chatCompletion.content[0].text

  } catch(e){
    console.log('Failed to chatCall')
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
