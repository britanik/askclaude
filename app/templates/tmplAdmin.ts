import moment from 'moment'
import User from '../models/users'
import Invite from '../models/invites'
import Usage from '../models/usage'
import { sendMessage } from './sendMessage'
import TelegramBot from 'node-telegram-bot-api'
import { IUser } from '../interfaces/users'
import { isAdmin } from '../helpers/helpers'
import Thread from '../models/threads'

export async function tmplAdmin(user: IUser, bot: TelegramBot) {
  if (!isAdmin(user)) return

  const usersTotal = await User.find()
  const usersTodayTotal = await User.find({ created: { $gte: moment().startOf('day').toDate() } })
  const yesterdayTotal = await User.find({ created: { $gte: moment().subtract(1, 'days').startOf('day').toDate(), $lte: moment().subtract(1, 'days').endOf('day').toDate() } })

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

  // Calculate Web Search usage - users who used web search today
  const webSearchUsersToday = await Usage.distinct('user', {
    type: 'web_search',
    created: { $gte: startOfToday }
  })
  const webSearchCountToday = webSearchUsersToday.length

  // Calculate Web Search usage - users who used web search yesterday
  const webSearchUsersYesterday = await Usage.distinct('user', {
    type: 'web_search',
    created: { $gte: startOfYesterday, $lt: endOfYesterday }
  })
  const webSearchCountYesterday = webSearchUsersYesterday.length

  // Get top users by token usage
  const topUsersByUsage = await Usage.aggregate([
    {
      $match: {
        type: { $in: ['prompt', 'completion'] }
      }
    },
    {
      $group: {
        _id: '$user',
        totalTokens: { $sum: '$amount' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userData'
      }
    },
    {
      $unwind: '$userData'
    },
    {
      $project: {
        username: '$userData.username',
        name: '$userData.name',
        totalTokens: 1
      }
    },
    {
      $sort: { totalTokens: -1 }
    },
    {
      $limit: 30 // Show top 30 users by usage
    }
  ])

  // Get top users by web search usage (all time)
  const topUsersByWebSearch = await Usage.aggregate([
    {
      $match: {
        type: 'web_search'
      }
    },
    {
      $group: {
        _id: '$user',
        totalSearches: { $sum: '$amount' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userData'
      }
    },
    {
      $unwind: '$userData'
    },
    {
      $project: {
        username: '$userData.username',
        name: '$userData.name',
        totalSearches: 1
      }
    },
    {
      $sort: { totalSearches: -1 }
    },
    {
      $limit: 15 // Show top 15 users by web search usage
    }
  ])

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
Активных за вчера (DAU): ${dauYesterday}
Веб-поиск сегодня: ${webSearchCountToday} польз.
Веб-поиск вчера: ${webSearchCountYesterday} польз.`
    return usersText
  }

  const getTopUsersByUsagePart = () => {
    if (topUsersByUsage.length === 0) {
      return `\n\n<b>Топ по токенам:</b>\nПока нет данных по использованию токенов`
    }

    let usageText = `\n\n<b>Топ по токенам (всего):</b>`
    
    topUsersByUsage.forEach((userUsage, index) => {
      const displayName = userUsage.username 
        ? `@${userUsage.username}` 
        : (userUsage.name || 'Неизвестный пользователь')
      
      // Format number with thousands separator
      const formattedTokens = userUsage.totalTokens.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
      
      usageText += `\n${index + 1}. ${displayName} - ${formattedTokens}`
    })

    return usageText
  }

  const getTopUsersByWebSearchPart = () => {
    if (topUsersByWebSearch.length === 0) {
      return `\n\n<b>Топ по веб-поиску:</b>\nПока нет данных по использованию веб-поиска`
    }

    let webSearchText = `\n\n<b>Топ по веб-поиску (всего):</b>`
    
    topUsersByWebSearch.forEach((userUsage, index) => {
      const displayName = userUsage.username 
        ? `@${userUsage.username}` 
        : (userUsage.name || 'Неизвестный пользователь')
      
      webSearchText += `\n${index + 1}. ${displayName} - ${userUsage.totalSearches}`
    })

    return webSearchText
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

  let text = `${getUsersPart()}${getTopReferrersPart()}${getTopUsersByWebSearchPart()}${getTopUsersByUsagePart()}`
  
  // Add buttons for admin actions
  let buttons = [
    [
      { text: "📢 Уведомление", callback_data: '{"a":"admin","v":"notifications"}' },
      { text: "📁 Загрузить файл", callback_data: '{"a":"admin","v":"adminUploadFile"}' },
    ]
  ]
  
  await sendMessage({
    text,
    user,
    bot,
    buttons
  })
}