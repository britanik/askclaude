import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import TelegramBot from 'node-telegram-bot-api'
import { connect } from 'mongoose'
import moment from 'moment'

import { IUser } from './app/interfaces/users'
import User from './app/models/users'
import { getReadableId } from './app/helpers/helpers'
import Dict from './app/helpers/dict'
import Navigation from './app/controllers/navigation'
import { extractReferralCode, isValidInviteCode, processReferral } from './app/controllers/invites'
import { processStory } from './app/controllers/bonus'
import { sendMessage } from './app/templates/sendMessage'
import { IInvite } from './app/models/invites'
import { abortIfSequence } from './app/helpers/messageBuffer'
import { logEvent } from './app/controllers/log'
import { isMenuClicked } from './app/controllers/menu'

// Load .env
if( fs.existsSync(path.join(__dirname, '.env')) ){
  dotenv.config({ path: path.join(__dirname, '.env') })
  console.log('-- .ENV loaded from .env')
} 

if( fs.existsSync(path.join(__dirname, '../.env')) ){
  dotenv.config({path: path.join(__dirname, "../.env")})
  console.log('-- .ENV loaded from ../.env')
}

const bot:TelegramBot = new TelegramBot(process.env.BOT_CLIENT_TOKEN, { polling: true})
const mongoString = process.env.MONGO_STRING
connect(mongoString).then(() => { 
  console.log('-- Connected to MongoDB')   
}).catch((error) => { console.log('DB CONNECT ERROR:', error) })

// Media groups - in memory store for number IDs of media groups. 
// Used in registerPhotoUpload and settingsPhotoUpload
let mediaGroups:number[] = []

const startNavigation = async (msg = null, callbackQuery = null) => {
  // console.log(msg, 'msg')
  let chatId = (msg) ? msg.chat.id : callbackQuery.message.chat.id
  let user: IUser = await User.findOne({ chatId: chatId })
  
  if (!user) {

    // new user, register
    const firstName = msg.from.first_name || '';
    const lastName = msg.from.last_name || '';
    const name = firstName + (lastName ? ' ' + lastName : '');
    user = await new User({
      ID: getReadableId(moment()),
      name,
      chatId: chatId,
      username: msg.from.username || null,
      step: 'assistant',
      prefs: {
        lang: 'rus',
      }
    }).save()

    const code = extractReferralCode(msg);
    if( code ){
      const isValid:IInvite = await isValidInviteCode(code);
      if( isValid ){
        await processReferral(user, isValid);
        await sendMessage({ text: `✅ Спасибо! Вы активировали код приглашения и получили +${+process.env.TOKENS_BONUS_REFERRAL} токенов в день`, user, bot });
        await sendMessage({ text: `✅ Ваш друг активировал код и Вы оба получили +${+process.env.TOKENS_BONUS_REFERRAL} к лимитам.`, user: isValid.owner, bot })
      }
    }

  } else if (msg && user.username !== msg.from.username) {

    user.username = msg.from.username || null
    await user.save()

  }

  // Log command or button
  try {
    if (msg) {
      const menuItem = isMenuClicked(msg)
      if (menuItem) {
        logEvent({ user, category: 'command', method: menuItem.method, text: msg.text })
      }
    }
    if (callbackQuery?.data) {
      const cbData = JSON.parse(callbackQuery.data)
      const buttonText = callbackQuery.message?.reply_markup?.inline_keyboard
        ?.flat()?.find(b => {
          try { return JSON.parse(b.callback_data)?.a === cbData.a } catch { return false }
        })?.text
      logEvent({ user, category: 'button', method: cbData.a, text: buttonText || cbData.a, data: cbData })
    }
  } catch {}

  let navigation = new Navigation({
    user,
    msg,
    dict: new Dict(user),
    callbackQuery,
    bot: bot,
    mediaGroups,
  })

  await navigation.build()
}

bot.on('message', async ( msg, param ) => {
  try{
    if( msg.photo && msg.photo.length > 0 ){
      // console.log(msg.photo[msg.photo.length-1].file_id,'file_id')
    }

    if ((msg as any).story) {
      const user = await User.findOne({ chatId: msg.chat.id });
      if (user) {
        await processStory(user, bot);
      }
      return;
    }

    // Handle web_app_data from Telegram Mini Apps
    if ((msg as any).web_app_data) {
      try {
        const data = JSON.parse((msg as any).web_app_data.data)
        const user = await User.findOne({ chatId: msg.chat.id })
        if (user && data.action === 'saveImageSettings') {
          const allowedRatios = ['1:1','1:4','1:8','2:3','3:2','3:4','4:1','4:3','4:5','5:4','8:1','9:16','16:9','21:9']
          const allowedQualities = ['low','standard','high']
          const allowedSizes = ['1k','2k']

          if (data.imageAspectRatio && allowedRatios.includes(data.imageAspectRatio))
            user.prefs.imageAspectRatio = data.imageAspectRatio
          if (data.imageQuality && allowedQualities.includes(data.imageQuality))
            user.prefs.imageQuality = data.imageQuality
          if (data.imageSize && allowedSizes.includes(data.imageSize))
            user.prefs.imageSize = data.imageSize

          await user.save()

          const dict = new Dict(user)
          await sendMessage({ text: dict.getString('IMAGES_SETTINGS_SAVED'), user, bot })
        }
      } catch (e) { console.log('web_app_data error:', e) }
      return
    }

    // If user sends a new message while previous is being processed — mark as aborted
    if ((msg.text && !msg.text.startsWith('/')) || msg.photo || msg.document || msg.voice) {
      abortIfSequence(msg.chat.id)
    }

    await startNavigation(msg, null)

    endCycle()
  } catch(e){ console.log(e,'e') }
})

bot.on('callback_query', async (callbackQuery) => {
  try{
    await startNavigation(null, callbackQuery)
    await bot.answerCallbackQuery(callbackQuery.id)
    endCycle();
  } catch(e) { console.log(e) }
})

const endCycle = () => {
  console.log('--- END CYCLE ---')
  console.log("\n");
}