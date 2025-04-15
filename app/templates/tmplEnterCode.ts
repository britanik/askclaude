import { IUser } from "../interfaces/users"
import { sendMessage } from "./sendMessage"
import TelegramBot from "node-telegram-bot-api"
import Dict from "../helpers/dict"
import { getTokenUsage } from "../controllers/users";

export async function tmplSettings(user: IUser, bot: TelegramBot, dict: Dict) {
  // Get token usage statistics
  const tokenUsage = await getTokenUsage(user);
  console.log(tokenUsage,'tokenUsage')
  
  // Get user's token balance
  // const tokenBalance = await getTokenBalance(user);
  
  // Format token numbers with thousands separator and handle undefined values
  const formatNumber = (num: number | undefined) => {
    // Default to 0 if undefined
    const safeNum = num ?? 0;
    return safeNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  
  let text = `<b>${dict.getString('SETTINGS_TITLE')}</b>
 
<b>${dict.getString('SETTINGS_FORMATS')}:</b>
${dict.getString('SETTINGS_FORMATS_STRING')}

<b>${dict.getString('SETTINGS_LANGUAGE')}:</b>
${user.prefs.lang === 'eng' ? 'English' : 'Русский'}

<b>${dict.getString('SETTINGS_USAGE')}:</b>
${formatNumber(tokenUsage.total)} / ${formatNumber(tokenUsage.limit)}

ℹ️ <i>${dict.getString('SETTINGS_USAGE_ADVICE')}</i>

ℹ️ <i>${dict.getString('SETTINGS_USAGE_REFS')}</i>`;

  let buttons = [
    [
      { text: dict.getString('BUTTON_NEW_CHAT'), callback_data: '{"a":"new"}' },
    ],
    [
      { text: dict.getString('BUTTON_INVITE_FRIEND'), callback_data: '{"a":"invite"}' },
      { text: dict.getString('BUTTON_CODE'), callback_data: '{"a":"enterCode"}' },
    ]
  ];

  await sendMessage({ text, user, bot, buttons });
}