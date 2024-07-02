import { formatUsername, isAdmin } from "../helpers/helpers"
import { IUser } from '../interfaces/users'
import * as userController from '../controllers/users'
import { sendMessage, sendPhoto } from '../templates/sendMessage'
import TelegramBot from 'node-telegram-bot-api'
import { ILog } from "../interfaces/log"
import Log from "../models/log"

export const methods = {
  start: ({ msg }) => (msg) ? `👍 Start: ${msg?.text}` : `👍 Start`,
}

export interface IAddEventParams {
  user?: IUser,
  msg?: any,
  data?: any,
  photoId?: string,
  method?: string,
  template?: string,
  description?: string,
  bot: TelegramBot,
}

export async function addLog(params: IAddEventParams) {
  try {
    const { user, data, msg, photoId, method, template, bot } = params

    // Do not log admin
    if( user && isAdmin(user) ) return

    let log: ILog = new Log({
      user,
      method,
      template,
      data,
      msg,
    })

    if( photoId ){
      log.photoId = photoId
      await bot.sendPhoto( +process.env.ADMIN_CHATID, photoId )
    }

    await log.save()

    // Send message if env var LOG_ENABLED enabled
    if( +process.env.LOG_ENABLED == 1 ){
      let logText = getLogSimpleHeader(log)
      let chatId = +process.env.ADMIN_CHATID
      let userToSend = log.user ?? null
      await sendMessage({ 
        text: logText, 
        user: userToSend,
        chatId, 
        bot
      })
    }
  
  } catch (error) {
    console.error(error)
  }
}

export function getLogName(log:ILog){
  const { user, data, method, template, msg } = log
  const methodName = () => {
    return method || template
  }

  if( methods[method] ){
    return `<b>${methodName()}:</b> ${methods[method]({ user, data, msg })}`
  } else {
    return `${methodName()}`
  }
}

export function getLogSimpleHeader(log:ILog){
  const { user } = log

  return user 
    ? `${formatUsername(user)} \n${getLogName(log)}` 
    : `${getLogName(log)}`;
}