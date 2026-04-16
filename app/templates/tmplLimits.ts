import { IUser } from "../interfaces/users";
import { sendMessage } from "./sendMessage";
import TelegramBot from "node-telegram-bot-api";
import Dict from "../helpers/dict";
import { getTimeToNextDay } from "../controllers/tokens";
import { canAccessPremium } from "../helpers/helpers";
import * as userController from "../controllers/users";
import { PLANS, PaymentPlan } from "../controllers/payments";

export async function tmplLimits(user: IUser, bot: TelegramBot, dict: Dict, showLimitMessage: boolean = true) {
  await userController.updateMessage(user, 'payConfirm', null);

  const time = getTimeToNextDay(dict);
  const exceededLine = showLimitMessage
    ? `${dict.getString('SETTINGS_DAILY_TOKEN_LIMIT_EXCEEDED', { time })}\n\n`
    : '';
  const limitMessage = `${exceededLine}<i>ℹ️ ${dict.getString('SETTINGS_DAILY_TOKEN_LIMIT_INFO')}</i>`;

  const showPackageButtons = canAccessPremium(user);

  const planButtons = Object.entries(PLANS).map(([plan, config]) => ({
    text: dict.getString('PAY_CONTINUE_BUTTON', { label: config.label, price: String(config.price) }),
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