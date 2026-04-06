import { IUser } from "../interfaces/users";
import { sendMessage } from "./sendMessage";
import TelegramBot from "node-telegram-bot-api";
import Dict from "../helpers/dict";
import { getTokenLimitMessage } from "../controllers/tokens";
import { canAccessPremium } from "../helpers/helpers";
import * as userController from "../controllers/users";
import { PLANS, PaymentPlan } from "../controllers/payments";

export async function tmplLimits(user: IUser, bot: TelegramBot, dict: Dict) {

  await userController.updateMessage(user, 'payConfirm', null);

  let limitMessage = `${await getTokenLimitMessage(user, dict)}\n
ℹ️ ${dict.getString('SETTINGS_DAILY_TOKEN_LIMIT_INFO')}`
  

  const showPackageButtons = canAccessPremium(user);

  const formatNumber = (n: number) => n.toLocaleString('ru-RU');
  const planButtons = Object.entries(PLANS).map(([plan, config]) => ({
    text: `+${formatNumber(config.tokenLimit)} / ${config.label} — ${config.price}₽`,
    callback_data: JSON.stringify({ a: 'payConfirm', plan: plan as PaymentPlan })
  }));

  const buttonRows = planButtons.map(btn => [btn]);

  await sendMessage({
    text: limitMessage,
    user,
    bot,
    buttons: showPackageButtons ? buttonRows : undefined
  });
}