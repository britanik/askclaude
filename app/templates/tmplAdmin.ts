import moment from 'moment'
import User from '../models/users'
import Invite from '../models/invites'
import { sendMessage } from './sendMessage'
import TelegramBot from 'node-telegram-bot-api'
import { IUser } from '../interfaces/users'
import { isAdmin } from '../helpers/helpers'
import Thread from '../models/threads'

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

  // Get top referrers
  const topReferrers = await Invite.aggregate([
    {
      $match: {
        $expr: { $gt: [{ $size: "$usedBy" }, 0] } // Only invites with at least 1 referral
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'owner',
        foreignField: '_id',
        as: 'ownerData'
      }
    },
    {
      $unwind: '$ownerData'
    },
    {
      $project: {
        username: '$ownerData.username',
        name: '$ownerData.name',
        referralCount: { $size: '$usedBy' }
      }
    },
    {
      $sort: { referralCount: -1 }
    },
    {
      $limit: 10 // Show top 10 referrers
    }
  ])

  const getUsersPart = () => {
    let usersText = `<b>👩‍💼 Пользователи</b>
Всего: ${usersTotal.length}
Сегодня новых: ${usersTodayTotal.length}
Вчера новых: ${yesterdayTotal.length}
Активных за сегодня (DAU): ${dauToday}
Активных за вчера (DAU): ${dauYesterday}`
    return usersText
  }

  const getTopReferrersPart = () => {
    if (topReferrers.length === 0) {
      return `\n\n<b>Топ по реферам:</b>\nПока нет пользователей с рефералами`
    }

    let referrersText = `\n\n<b>Топ по реферам:</b>`
    
    topReferrers.forEach((referrer, index) => {
      const displayName = referrer.username 
        ? `@${referrer.username}` 
        : (referrer.name || 'Неизвестный пользователь')
      
      referrersText += `\n${index + 1}. ${displayName} - ${referrer.referralCount}`
    })

    return referrersText
  }

  let text = `${getUsersPart()}${getTopReferrersPart()}`
  
  // Add buttons for admin actions
  let buttons = [
    [
      { text: "📢 Уведомление", callback_data: '{"a":"admin","v":"notifications"}' }
    ]
  ]
  
  await sendMessage({
    text,
    user,
    bot,
    buttons
  })
}