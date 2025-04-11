import { IUser } from "../interfaces/users"
import { sendMessage } from "./sendMessage"
import TelegramBot from "node-telegram-bot-api"
import Dict from "../helpers/dict"

export async function tmplSettings(user: IUser, bot: TelegramBot, dict: Dict) {
  // For now hardcoded as requested
  let text = `<b>${dict.getString('SETTINGS_TITLE')}</b>

<b>Использовано токенов:</b>
0 / 100к
 
<b>Доступные форматы общения:</b>
Текст, Фото, Голосовые сообщения`;

  // Add inline button for "New Chat"
  let buttons = [
    [
      { text: dict.getString('NEW_CHAT_BUTTON'), callback_data: '{"a":"new"}' }
    ]
  ];

  await sendMessage({ text, user, bot, buttons });
}