import { IUser } from "../interfaces/users"
import { sendMessage } from "./sendMessage"
import TelegramBot from "node-telegram-bot-api"
import Dict from "../helpers/dict"
import { getPeriodTokenLimit, getPeriodTokenUsage, getDailyTokenLimit, getDailyTokenUsage } from "../controllers/tokens";
import { getPeriodImageLimit, getPeriodImageUsage } from "../controllers/images";
import Package from "../models/packages";
import moment from "moment";
import { canAccessPremium } from "../helpers/helpers";

export async function tmplSettings(user: IUser, bot: TelegramBot, dict: Dict) {
  const hourlyTokenUsage:number = await getPeriodTokenUsage(user);
  const hourlyTokenLimit:number = await getPeriodTokenLimit(user);
  const dailyTokenUsage:number = await getDailyTokenUsage(user);
  const dailyTokenLimit:number = await getDailyTokenLimit(user);
  const imageUsage:number = await getPeriodImageUsage(user);
  const imageLimit:number = await getPeriodImageLimit(user);

  // Check active premium (only for admins/testers or when PREMIUM_ENABLED=1)
  let premiumLine = '';
  if (canAccessPremium(user)) {
    const now = new Date();
    const activePackage = await Package.findOne({
      user: user._id,
      endDate: { $gt: now }
    });
    premiumLine = activePackage
      ? dict.getString('SETTINGS_PREMIUM_ACTIVE', { date: moment(activePackage.endDate).format('DD.MM, HH:mm') })
      : `<i>${dict.getString('SETTINGS_PREMIUM_HINT')}</i>`;
  }

  const formatNumber = (num: number | undefined) => {
    const safeNum = num ?? 0;
    return safeNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  let text = `<b>${dict.getString('SETTINGS_TITLE')}</b>

<b>${dict.getString('SETTINGS_FORMATS')}:</b>
${dict.getString('SETTINGS_FORMATS_STRING')}

<b>${dict.getString('SETTINGS_LANGUAGE')}:</b>
${user.prefs.lang === 'eng' ? 'English' : 'Русский'}

<b>${dict.getString('SETTINGS_TOKEN_LIMITS')}:</b>
${premiumLine ? premiumLine + '\n' : ''}${dict.getString('SETTINGS_LIMITS_HOURLY')}: ${formatNumber(hourlyTokenUsage)} / ${formatNumber(hourlyTokenLimit)}
${dict.getString('SETTINGS_LIMITS_DAILY')}: ${formatNumber(dailyTokenUsage)} / ${formatNumber(dailyTokenLimit)}
${dict.getString('SETTINGS_LIMITS_IMAGES')}: ${formatNumber(imageUsage)} / ${formatNumber(imageLimit)} ${dict.getString('SETTINGS_LIMITS_PER_DAY')}

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