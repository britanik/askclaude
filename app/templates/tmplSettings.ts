import { IUser } from "../interfaces/users"
import { sendMessage } from "./sendMessage"
import TelegramBot from "node-telegram-bot-api"
import Dict from "../helpers/dict"
import { getMinutesToNextHour, getTimeToNextDay, getPeriodTokenLimit, getPeriodTokenUsage, getDailyTokenLimit, getDailyTokenUsage, getDailyWebSearchUsage, getDailyWebSearchLimit } from "../controllers/tokens";
import { getPeriodImageLimit, getPeriodImageUsage } from "../controllers/images";

export async function tmplSettings(user: IUser, bot: TelegramBot, dict: Dict) {
  // Get hourly token usage statistics
  const hourlyTokenUsage:number = await getPeriodTokenUsage(user);
  const hourlyTokenLimit:number = await getPeriodTokenLimit(user);
  
  // Get daily token usage statistics
  const dailyTokenUsage:number = await getDailyTokenUsage(user);
  const dailyTokenLimit:number = await getDailyTokenLimit(user);
  
  // Get image usage statistics
  const imageUsage:number = await getPeriodImageUsage(user);
  const imageLimit:number = await getPeriodImageLimit(user);
  
  // Get web search usage statistics
  const webSearchUsage:number = await getDailyWebSearchUsage(user);
  const webSearchLimit:number = await getDailyWebSearchLimit(user);
  
  // Format token numbers with thousands separator and handle undefined values
  const formatNumber = (num: number | undefined) => {
    // Default to 0 if undefined
    const safeNum = num ?? 0;
    return safeNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const stringHourlyTokensRefresh = () => {
    if( hourlyTokenUsage >= hourlyTokenLimit ){
      return `Обновится через ${getMinutesToNextHour()} мин.`
    } else {
      return ''
    }
  }

  const stringDailyTokensRefresh = () => {
    if( dailyTokenUsage >= dailyTokenLimit ){
      return `Обновится через ${getTimeToNextDay()}`
    } else {
      return ''
    }
  }

  const stringImageRefresh = () => {
    if( imageUsage >= imageLimit ){
      return `${dict.getString('SETTINGS_IMAGE_LIMIT_RESET')}`
    } else {
      return ''
    }
  }

  const stringWebSearchRefresh = () => {
    if( webSearchUsage >= webSearchLimit ){
      return `Обновится через ${getTimeToNextDay()}.`
    } else {
      return ''
    }
  }
  
  let text = `<b>${dict.getString('SETTINGS_TITLE')}</b>
 
<b>${dict.getString('SETTINGS_FORMATS')}:</b>
${dict.getString('SETTINGS_FORMATS_STRING')}

<b>${dict.getString('SETTINGS_LANGUAGE')}:</b>
${user.prefs.lang === 'eng' ? 'English' : 'Русский'}

<b>Лимит токенов (час):</b>
${formatNumber(hourlyTokenUsage)} / ${formatNumber(hourlyTokenLimit)} в час. ${stringHourlyTokensRefresh()}

<b>Лимит токенов (день):</b>
${formatNumber(dailyTokenUsage)} / ${formatNumber(dailyTokenLimit)} в день. ${stringDailyTokensRefresh()}

<b>${dict.getString('SETTINGS_IMAGE_LIMIT')}:</b>
${formatNumber(imageUsage)} / ${formatNumber(imageLimit)} в день. ${stringImageRefresh()}

<b>${dict.getString('SETTINGS_WEB_SEARCH_DAILY_LIMIT')}:</b>
${formatNumber(webSearchUsage)} / ${formatNumber(webSearchLimit)} в день. ${stringWebSearchRefresh()}

ℹ️ <i>${dict.getString('SETTINGS_USAGE_ADVICE')}</i>

ℹ️ <i>${dict.getString('SETTINGS_USAGE_REFS')}</i>`;

  let buttons = [
    [
      { text: dict.getString('BUTTON_NEW_CHAT'), callback_data: '{"a":"new"}' },
      { text: dict.getString('BUTTON_PDF_MANUAL'), callback_data: '{"a":"settings","v":"manual"}' },
    ],
    [
      { text: dict.getString('BUTTON_INVITE_FRIEND'), callback_data: '{"a":"settings","v":"invite"}' },
      { text: dict.getString('BUTTON_CODE'), callback_data: '{"a":"settings","v":"code"}' },
    ]
  ];

  await sendMessage({ text, user, bot, buttons });
}