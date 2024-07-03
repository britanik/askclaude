import moment from 'moment'
import User from '../models/users'
import { sendMessage } from './sendMessage'
import TelegramBot from 'node-telegram-bot-api'
import { IUser } from '../interfaces/users'
import { isAdmin } from '../helpers/helpers'

export async function tmplAdmin( user:IUser, bot:TelegramBot ){
  if( !isAdmin(user) ) return
  
  const usersTotal = await User.find()
  const todayTotal = await User.find({ created: { $gte: moment().startOf('day') } })
  const yesterdayTotal = await User.find({ created: { $gte: moment().subtract(1, 'days').startOf('day'), $lte: moment().subtract(1, 'days').endOf('day') } })
  
  const getUsersPart = () => {
    let usersText = `<b>👩‍💼 Пользователи</b>
Всего: ${usersTotal.length}
Сегодня новых: ${todayTotal.length}
Вчера новых: ${yesterdayTotal.length}`
    return usersText
  }
  
  let text = `${getUsersPart()}
  `
  await sendMessage({ 
    text, 
    user, 
    bot
  })
}
