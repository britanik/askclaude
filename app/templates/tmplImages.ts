import { IUser } from "../interfaces/users"
import { sendMessage } from "./sendMessage"
import TelegramBot from "node-telegram-bot-api"
import Dict from "../helpers/dict"

export async function tmplImages(user: IUser, bot: TelegramBot, dict: Dict) {
  const ratio = user.prefs?.imageAspectRatio || '1:1'
  const quality = user.prefs?.imageQuality || 'standard'
  const size = user.prefs?.imageSize || '1k'

  const text = `<b>${dict.getString('IMAGES_TITLE')}</b>

${dict.getString('IMAGES_CURRENT_SETTINGS', { ratio, quality, size })}`

  const buttons = [
    [
      {
        text: dict.getString('BUTTON_IMAGE_SETTINGS'),
        web_app: { url: `https://askclaude.ru/images?ratio=${ratio}&quality=${quality}&size=${size}` }
      } as any
    ]
  ]

  await sendMessage({ text, user, bot, buttons })
}
