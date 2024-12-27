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
connect(mongoString).then(() => { console.log('-- Connected to MongoDB') }).catch((error) => { console.log('DB CONNECT ERROR:', error) })

// Media groups - in memory store for number IDs of media groups. 
// Used in registerPhotoUpload and settingsPhotoUpload
let mediaGroups:number[] = []

const startNavigation = async (msg = null, callbackQuery = null) => {
  console.log(msg, 'msg')
  let chatId = (msg) ? msg.chat.id : callbackQuery.message.chat.id
  let user: IUser = await User.findOne({ chatId: chatId })
  
  if (!user) {
    user = await new User({
      ID: getReadableId(moment()),
      name: msg.from.first_name + ' ' + msg.from.last_name,
      chatId: chatId,
      username: msg.from.username || null,
      showUsername: (msg.from.username) ? true : false,
    }).save()
  } else if (msg && user.username !== msg.from.username) {
    console.log('Here')
    user.username = msg.from.username || null
    await user.save()
  }

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
      console.log(msg.photo[msg.photo.length-1].file_id,'file_id')
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
}