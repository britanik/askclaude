import moment from 'moment'
import User from '../models/users'
import { sendMessage } from './sendMessage'
import TelegramBot from 'node-telegram-bot-api'
import { IUser } from '../interfaces/users'
import { isAdmin } from '../helpers/helpers'
import Thread from '../models/threads'
import { IThread } from "../interfaces/threads"
import users from '../models/users'

export async function tmplAdmin(user: IUser, bot: TelegramBot) {
  if (!isAdmin(user)) return

  const usersTotal = await User.find()
  const usersTodayTotal = await User.find({ created: { $gte: moment().startOf('day') } })
  const yesterdayTotal = await User.find({ created: { $gte: moment().subtract(1, 'days').startOf('day'), $lte: moment().subtract(1, 'days').endOf('day') } })

  // Calculate DAU for today
  const startOfToday = moment().startOf('day').toDate()
  const activeUserIdsToday = await Thread.distinct('owner', {
    created: { $gte: startOfToday }
  })
  const dauToday = activeUserIdsToday.length

  // Calculate DAU for yesterday
  const startOfYesterday = moment().subtract(1, 'days').startOf('day').toDate()
  const endOfYesterday = moment().subtract(1, 'days').endOf('day').toDate()
  const activeUserIdsYesterday = await Thread.distinct('owner', {
    created: { $gte: startOfYesterday, $lt: endOfYesterday }
  })
  const dauYesterday = activeUserIdsYesterday.length

  const getUsersPart = () => {
    let usersText = `<b>👩‍💼 Пользователи</b>
Всего: ${usersTotal.length}
Сегодня новых: ${usersTodayTotal.length}
Вчера новых: ${yesterdayTotal.length}
Активных за сегодня (DAU): ${dauToday}
Активных за вчера (DAU): ${dauYesterday}`
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