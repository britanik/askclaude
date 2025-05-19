import moment from 'moment'
import TelegramBot from "node-telegram-bot-api";
import { EditMessageTextOptions, InlineKeyboardButton, KeyboardButton, SendMessageOptions } from 'node-telegram-bot-api'
import { IUser } from '../interfaces/users'

export interface IGetOptionsParams {
  buttons?: InlineKeyboardButton[][],
  keyboard?: KeyboardButton[][],
  chat_id?: number,
  message_id?: number,
  placeholder?: string,
  force_reply?: boolean
}

export const getOptions = ( params?:IGetOptionsParams ) => {
  let { buttons = [], keyboard, chat_id, message_id, placeholder, force_reply } = params
  
  if( placeholder ){
    force_reply = true
  }

  let options:SendMessageOptions | EditMessageTextOptions = {
    chat_id: chat_id,
    message_id: message_id,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      resize_keyboard: true,
      inline_keyboard: buttons ?? [],
      keyboard: keyboard ?? [],
      // force_reply: false,
      // input_field_placeholder: '',
    }
  }

  // Теперь добавляем input_field_placeholder, если он задан
  if (placeholder) {
    options.reply_markup['input_field_placeholder'] = placeholder
  }
  
  // Теперь добавляем force_reply, если он задан
  if (force_reply) {
    options.reply_markup['force_reply'] = force_reply
  }

  // console.log(options, 'options')
  return options
}

export function getReadableId( now = moment() ){
  const getRandomArbitrary = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min; //Максимум не включается, минимум включается
  }

  let result = ''
  result += now.format('YYMMDD')
  result += '1'
  result += getRandomArbitrary(100000, 999999)
  
  return +result
}

export function isAdmin( user:IUser ){
  return (user.username == process.env.ADMIN_USERNAME)
}

export function formatUsername(user: IUser) {
  return user.name
}

export interface IManageChatActionParams {
  bot: TelegramBot,
  chatId: number,
  action: "typing" | "upload_photo" | "record_video" | "upload_video" | "record_voice" | "upload_voice" | "upload_document" | "find_location" | "record_video_note" | "upload_video_note",
  intervalMs?: number
}

export function manageChatAction( params: IManageChatActionParams ) {
  const { bot, chatId, action, intervalMs = 3000 } = params
  
  // Flag to track if the action is still ongoing
  let isActive = true;
  
  // Send initial action immediately
  bot.sendChatAction(chatId, action).catch(err => {
    console.error(`Error sending initial ${action} action:`, err);
  });
  
  // Start the interval to keep refreshing the action
  const actionInterval = setInterval(() => {
    if (isActive) {
      bot.sendChatAction(chatId, action).catch(err => {
        console.error(`Error sending ${action} action:`, err);
      });
    } else {
      clearInterval(actionInterval);
    }
  }, intervalMs);
  
  // Return methods to control the action
  return {
    // Method to stop the action
    stop: () => {
      isActive = false;
      clearInterval(actionInterval);
    },
    
    // Promise that resolves when action is stopped
    done: () => new Promise<void>(resolve => {
      // Create a one-time check to see if action is already stopped
      if (!isActive) {
        resolve();
        return;
      }
      
      // Otherwise set up a timer to check periodically
      const checkInterval = setInterval(() => {
        if (!isActive) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    })
  };
}