import { IUser } from "../interfaces/users"
import { sendMessage } from "./sendMessage"
import TelegramBot from "node-telegram-bot-api"
import Dict from "../helpers/dict"
import { getTokenUsage } from "../controllers/users"

export async function tmplSettings(user: IUser, bot: TelegramBot, dict: Dict) {
  // Get token usage statistics
  const tokenUsage = await getTokenUsage(user);
  
  // Format token numbers with thousands separator and handle undefined values
  const formatNumber = (num: number | undefined) => {
    // Default to 0 if undefined
    const safeNum = num ?? 0;
    return safeNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  
  let text = `<b>${dict.getString('SETTINGS_TITLE')}</b>

<b>${dict.getString('SETTINGS_USAGE')}:</b>
${formatNumber(tokenUsage.monthly)} / ${formatNumber(tokenUsage.limit)}

ℹ️ <i>${dict.getString('SETTINGS_USAGE_ADVICE')}</i>
 
<b>${dict.getString('SETTINGS_FORMATS')}:</b>
${dict.getString('SETTINGS_FORMATS_STRING')}

<b>${dict.getString('SETTINGS_LANGUAGE')}:</b>
Русский`;

  // Add inline button for "New Chat"
  let buttons = [
    [
      { text: dict.getString('NEW_CHAT_BUTTON'), callback_data: '{"a":"new"}' }
    ]
  ];

  await sendMessage({ text, user, bot, buttons });
}