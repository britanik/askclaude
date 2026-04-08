import { IUser } from "../interfaces/users"
import { sendMessage } from "./sendMessage"
import TelegramBot from "node-telegram-bot-api"
import Dict from "../helpers/dict"
import { getDailyTokenLimit, getDailyTokenUsage } from "../controllers/tokens";
import { getUserBonusTotal } from "../controllers/bonus";
import { getPeriodImageLimit, getPeriodImageUsage } from "../controllers/images";
import moment from "moment";
import { canAccessPremium, getActivePackagesSorted, getTodayExpiredPackages } from "../helpers/helpers";

export async function tmplSettings(user: IUser, bot: TelegramBot, dict: Dict) {
  const dailyTokenUsage:number = await getDailyTokenUsage(user);
  const dailyTokenLimit:number = await getDailyTokenLimit(user);
  const bonusTotal:number = await getUserBonusTotal(user);
  const imageUsage:number = await getPeriodImageUsage(user);
  const imageLimit:number = await getPeriodImageLimit(user);

  const formatNumber = (num: number | undefined) => {
    const safeNum = num ?? 0;
    return safeNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  // Build package lines
  let packageLines = '';
  const isRus = dict.lang === 'rus';

  if (canAccessPremium(user)) {
    const activePackages = await getActivePackagesSorted(user);
    const expiredTodayPackages = await getTodayExpiredPackages(user);

    for (const pkg of activePackages) {
      const used = pkg.tokensUsed || 0;
      const endMoment = moment(pkg.endDate);
      const now = moment();
      let timeLabel: string;
      if (endMoment.isSame(now, 'day')) {
        timeLabel = isRus ? `до ${endMoment.format('HH:mm')}` : `until ${endMoment.format('HH:mm')}`;
      } else if (endMoment.isSame(now.clone().add(1, 'day'), 'day')) {
        timeLabel = isRus ? `до завтра, ${endMoment.format('HH:mm')}` : `until tomorrow, ${endMoment.format('HH:mm')}`;
      } else {
        timeLabel = isRus ? `до ${endMoment.format('DD.MM, HH:mm')}` : `until ${endMoment.format('DD.MM, HH:mm')}`;
      }
      const label = isRus ? 'Доп. пакет' : 'Extra pack';
      packageLines += `\n🚀 ${label}: ${formatNumber(used)} / ${formatNumber(pkg.tokenLimit)} (${timeLabel})`;
    }

    for (const pkg of expiredTodayPackages) {
      const used = pkg.tokensUsed || 0;
      const endMoment = moment(pkg.endDate);
      const expiredLabel = isRus
        ? `истек сегодня, в ${endMoment.format('HH:mm')}`
        : `expired today at ${endMoment.format('HH:mm')}`;
      const label = isRus ? 'Доп. пакет' : 'Extra pack';
      packageLines += `\n🚀 ${label}: ${formatNumber(used)} / ${formatNumber(pkg.tokenLimit)} (${expiredLabel})`;
    }

    if (activePackages.length === 0 && expiredTodayPackages.length === 0) {
      packageLines = ` <i>${dict.getString('SETTINGS_PREMIUM_HINT')}</i>`;
    }
  }

  let text = `<b>${dict.getString('SETTINGS_TITLE')}</b>

<b>${dict.getString('SETTINGS_FORMATS')}:</b>
${dict.getString('SETTINGS_FORMATS_STRING')}

<b>${dict.getString('SETTINGS_LANGUAGE')}:</b>
${user.prefs.lang === 'eng' ? 'English' : 'Русский'}

<b>${dict.getString('SETTINGS_TOKEN_LIMITS')}:</b>
☀️ ${dict.getString('SETTINGS_LIMITS_DAILY')}: ${formatNumber(dailyTokenUsage)} / ${formatNumber(dailyTokenLimit)}${packageLines}${bonusTotal > 0 ? `\n🎁 ${isRus ? 'Бонусы' : 'Bonuses'}: +${formatNumber(bonusTotal)} ${isRus ? 'токенов/день' : 'tokens/day'}` : ''}
🏞️ ${dict.getString('SETTINGS_LIMITS_IMAGES')}: ${formatNumber(imageUsage)} / ${formatNumber(imageLimit)} ${dict.getString('SETTINGS_LIMITS_PER_DAY')}

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