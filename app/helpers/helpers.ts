import moment from 'moment'
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